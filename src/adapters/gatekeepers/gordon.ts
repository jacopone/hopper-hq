import { open, readdir, readFile, stat } from 'node:fs/promises';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { seatTurn } from '../../core/lobby.js';
import type { Lobby } from '../../core/types.js';
import { buildSeats, parseLimitDoc, parseLimits, parseLobbyFile, parseSeatsLog, parseTaskPanes, parseWatchdogTail, readPower, type LimitDoc } from './gordon-files.js';
import type { GatekeeperProvider, GatekeeperSink } from './types.js';

export interface GordonOptions {
  /** Gordon's state directory (lobby.json, limits.json, watchdog-stopgap.log, seats-accounts.json, seats.jsonl, seats-order.txt, tasks.jsonl). */
  dir: string;
  /** Where every account's status line writes its allowance readings (default ~/.local/state/claude-limits). */
  limitsDir?: string;
  /** The sessions' cgroup (default: the user's claude.slice). */
  cgroupDir?: string;
  /** Each local session's pane, as the collector knows them, asked at every poll. */
  panes: () => ReadonlyMap<string, string>;
  now?: () => number;
  log?: (line: string) => void;
}

/** The most of a file read: a log is read from its tail. */
const FILE_MAX = 1024 * 1024;

export const DEFAULT_GORDON_DIR = join(homedir(), '.local/state/alfred/gordon');
export const DEFAULT_LIMITS_DIR = join(homedir(), '.local/state/claude-limits');
const UID = process.getuid?.() ?? 1000;
export const DEFAULT_CGROUP_DIR = `/sys/fs/cgroup/user.slice/user-${UID}.slice/user@${UID}.service/claude.slice`;

interface Read {
  /** The text, its last FILE_MAX bytes when the file is longer; '' when it cannot be read. */
  text: string;
  /** When the file was last written (ms); null when it cannot be read. */
  mtime: number | null;
}

async function tail(path: string): Promise<Read> {
  try {
    const st = await stat(path);
    const mtime = Math.round(st.mtimeMs);
    if (st.size <= FILE_MAX) return { text: await readFile(path, 'utf8'), mtime };
    const fh = await open(path, 'r');
    try {
      const buf = Buffer.alloc(FILE_MAX);
      await fh.read(buf, 0, FILE_MAX, st.size - FILE_MAX);
      return { text: buf.toString('utf8'), mtime };
    } finally {
      await fh.close();
    }
  } catch {
    return { text: '', mtime: null };
  }
}

type Account = { email?: string; profile?: string };
type Accounts = Record<string, Account>;

/** An accounts entry that is one: an object. A null or a string is skipped. */
const account = (v: unknown): Account | null => (v && typeof v === 'object' && !Array.isArray(v) ? (v as Account) : null);

/** The Lobby without its date: what a change is judged by, so that a date alone never counts as news. */
const contentOf = ({ updatedAt: _at, ...rest }: Lobby): string => JSON.stringify(rest);

/**
 * Reads Gordon's files every few seconds into one Lobby, and hands it on when it differs from the last. Read-only: it
 * runs nothing of Gordon's. A file that cannot be read empties its section; the provider never throws.
 */
export class GordonProvider implements GatekeeperProvider {
  private sink: GatekeeperSink | null = null;
  private timer: NodeJS.Timeout | null = null;
  /** The poll under way, so that a poll asked for meanwhile waits for it instead of reading twice. */
  private inflight: Promise<void> | null = null;
  private last: string | null = null;
  /** The task each session was last given, so that only changes are told. */
  private readonly tasks = new Map<string, string>();
  private readonly limitsDir: string;
  private readonly cgroupDir: string;
  private readonly now: () => number;
  private readonly log: (line: string) => void;
  private readonly logged = new Set<string>();

  constructor(private readonly o: GordonOptions) {
    this.limitsDir = o.limitsDir ?? DEFAULT_LIMITS_DIR;
    this.cgroupDir = o.cgroupDir ?? DEFAULT_CGROUP_DIR;
    this.now = o.now ?? Date.now;
    this.log = o.log ?? ((line) => process.stderr.write(line + '\n'));
  }

  start(sink: GatekeeperSink, intervalMs = 5000): void {
    this.sink = sink;
    if (this.timer) return;
    void this.poll();
    this.timer = setInterval(() => void this.poll(), intervalMs);
  }

  stop(): void {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
  }

  poll(): Promise<void> {
    if (!this.sink) return Promise.resolve();
    if (!this.inflight) this.inflight = this.once().finally(() => (this.inflight = null));
    return this.inflight;
  }

  private async once(): Promise<void> {
    try {
      const lobby = await this.read();
      const text = contentOf(lobby);
      if (text !== this.last) {
        this.last = text;
        this.sink?.lobby(lobby);
      }
    } catch (err) {
      // Once per cause: a file that stays unreadable would otherwise fill the log at every poll.
      const msg = err instanceof Error ? err.message : String(err);
      if (!this.logged.has(msg)) {
        this.logged.add(msg);
        this.log(`hopper-hq could not read the gatekeeper's files: ${msg}`);
      }
    }
  }

  private file(name: string): Promise<Read> {
    return tail(join(this.o.dir, name));
  }

  private async limitDocs(): Promise<LimitDoc[]> {
    let names: string[];
    try {
      names = (await readdir(this.limitsDir)).filter((n) => n.endsWith('.json'));
    } catch {
      return [];
    }
    const docs = await Promise.all(names.map(async (n) => parseLimitDoc((await tail(join(this.limitsDir, n))).text)));
    return docs.filter((d): d is LimitDoc => d !== null);
  }

  private async read(): Promise<Lobby> {
    const now = this.now();
    const reads = await Promise.all([
      this.file('lobby.json'),
      this.file('limits.json'),
      this.file('watchdog-stopgap.log'),
      this.file('seats-accounts.json'),
      this.file('seats.jsonl'),
      this.file('seats-order.txt'),
      this.file('tasks.jsonl'),
    ]);
    const [lobbyText, limitsText, watchdogText, accountsText, seatsLogText, orderText, tasksText] = reads.map((r) => r.text) as [string, string, string, string, string, string, string];
    const [docs, power] = await Promise.all([this.limitDocs(), readPower(this.cgroupDir)]);
    const file = parseLobbyFile(lobbyText);
    const limits = parseLimits(limitsText);
    const watchdog = parseWatchdogTail(watchdogText);
    let accounts: Accounts = {};
    try {
      const parsed: unknown = JSON.parse(accountsText);
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
        for (const [name, v] of Object.entries(parsed as Record<string, unknown>)) {
          const a = account(v);
          if (a) accounts[name] = a;
        }
      }
    } catch {
      // no accounts file: no seats
    }
    const order = orderText.split('\n').map((l) => l.trim()).filter(Boolean);
    const seats = buildSeats(docs, accounts, order, parseSeatsLog(seatsLogText), now);
    // A waiting launch names its profile; the accounts file maps a profile to its email.
    const emailOfProfile = new Map(Object.values(accounts).flatMap((a) => (a.profile && a.email ? [[a.profile, a.email] as const] : [])));
    const queue = (file?.queue ?? []).map(({ profile, ...w }) => ({ ...w, account: profile ? (emailOfProfile.get(profile) ?? profile) : null }));
    this.announceTasks(parseTaskPanes(tasksText));
    // The watchdog writes the cap it holds into limits.json: that file is the word on the hold, the log only when it cannot be read.
    const held = limits.max !== null ? limits.max === 0 : watchdog.held;
    // The Lobby is as old as the newest file read, unless lobby.json dates itself.
    const newest = reads.map((r) => r.mtime).filter((m): m is number => m !== null);
    return {
      doorman: { name: 'Gordon' },
      gate: file?.gate ?? null,
      queue,
      seats,
      turnTo: seatTurn(seats),
      power: power ? { ...power, held, pausedPanes: watchdog.pausedPanes } : null,
      cap: file || limits.max !== null ? { working: file?.working ?? null, max: limits.max } : null,
      updatedAt: file?.updatedAt ?? (newest.length ? Math.max(...newest) : now),
    };
  }

  /** The task of each session whose pane the registry names, told once per change; a session whose pane left the registry loses its task. */
  private announceTasks(byPane: ReadonlyMap<string, string>): void {
    const next = new Map<string, string>();
    for (const [sessionId, pane] of this.o.panes()) {
      const task = byPane.get(pane);
      if (task) next.set(sessionId, task);
    }
    for (const [sessionId, task] of next) if (this.tasks.get(sessionId) !== task) this.sink?.task(sessionId, task);
    for (const sessionId of this.tasks.keys()) if (!next.has(sessionId)) this.sink?.task(sessionId, null);
    this.tasks.clear();
    for (const [k, v] of next) this.tasks.set(k, v);
  }
}
