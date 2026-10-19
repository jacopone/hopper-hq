import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { allowanceStale, classifyReason, SEAT_LIMIT_PCT, splitReasons } from '../../core/lobby.js';
import { isPaneOf } from '../../core/terminal.js';
import type { Allowance, GateReason, GateVerdict, Machine, MachineLimits, Power, Seat, WaitingKind } from '../../core/types.js';

/** Reads what Gordon writes. Every function is tolerant: a shape that is not the one expected gives null or empty, never a throw. */

type Obj = Record<string, unknown>;
const obj = (v: unknown): Obj | null => (v && typeof v === 'object' && !Array.isArray(v) ? (v as Obj) : null);
const str = (v: unknown): string | null => (typeof v === 'string' && v.trim() ? v.trim() : null);
const int = (v: unknown): number | null => (typeof v === 'number' && Number.isInteger(v) && v >= 0 ? v : null);
const num = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) && v >= 0 ? v : null);
/** A count that is a divisor somewhere: zero is not a count. */
const pos = (v: unknown): number | null => {
  const n = num(v);
  return n !== null && n > 0 ? n : null;
};

/**
 * Where Gordon's gate refuses: the defaults of tools/admit.sh (ADMIT_MEM_MIN 20, load ≤ 0.75 × threads, disk < 60 %,
 * memory pressure < 10 %, slice < 75 %), and the brake of tools/heavy.sh (every core under 1 GHz). They are copied, not
 * read: lobby.json does not carry them. A change in admit.sh needs the same change here.
 */
export const GORDON_LIMITS: MachineLimits = { memMinGb: 20, loadPerThread: 0.75, diskBusyPct: 60, psiMemPct: 10, slicePct: 75, brakeMhz: 1000 };

function json(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return undefined;
  }
}

/** An ISO date string, or epoch seconds, as ms. */
export function timeOf(value: unknown): number | null {
  if (typeof value === 'number') return Number.isFinite(value) && value > 0 ? Math.round(value * 1000) : null;
  if (typeof value !== 'string' || !value) return null;
  const ms = Date.parse(value);
  return Number.isFinite(ms) ? ms : null;
}

export interface LobbyFile {
  gate: GateVerdict | null;
  queue: { id: string; name: string; profile: string | null; since: number; reason: GateReason | null; kind: WaitingKind; area: string | null; repo: string | null }[];
  working: number | null;
  /** The machine as the gate measured it; null when the file has none. The CPU is read live, not from here. */
  machine: Machine | null;
  /** Gordon's one-line capacity verdict. */
  plan: string | null;
  updatedAt: number | null;
}

/** machine{} of lobby.json: every figure that is not a number is null. */
function parseMachine(v: unknown): Machine | null {
  const m = obj(v);
  if (!m) return null;
  return {
    memAvailableGb: num(m.mem_gb),
    memTotalGb: pos(m.mem_total_gb),
    slicePct: num(m.slice_pct),
    load: num(m.load),
    threads: pos(m.threads),
    diskBusyPct: num(m.disk_busy_pct),
    psiMemPct: num(m.psi_mem_pct),
    rebuild: typeof m.rebuild === 'boolean' ? m.rebuild : null,
    cpuMhz: num(m.cpu_mhz),
    cpuBraking: null,
    nproc: pos(m.nproc),
  };
}

/** lobby.json: the gate's last verdict, the launches waiting, how many sessions work (design §5). */
export function parseLobbyFile(text: string): LobbyFile | null {
  const d = obj(json(text));
  if (!d) return null;
  const updatedAt = timeOf(d.updated_at);
  const g = obj(d.gate);
  let gate: GateVerdict | null = null;
  if (g) {
    const verdict = str(g.verdict);
    const line = str(g.text) ?? (verdict ? `${verdict}:` : null);
    if (verdict && line) gate = { go: verdict === 'VIA' || verdict === 'GO', text: line, reasons: splitReasons(line), at: timeOf(g.at) ?? updatedAt ?? 0 };
  }
  const queue: LobbyFile['queue'] = [];
  const seen = new Set<string>();
  for (const w of Array.isArray(d.waiting) ? d.waiting : []) {
    const o = obj(w);
    const id = o && str(o.id);
    if (!o || !id || seen.has(id)) continue;
    seen.add(id);
    const reason = str(o.reason);
    // 'pronta': a registry task with its brief written, waiting for a seat and a go. Anything else is a refusal, which is all the L1 file said.
    const kind: WaitingKind = str(o.kind) === 'pronta' ? 'ready' : 'refused';
    queue.push({ id, name: str(o.name) ?? id, profile: str(o.profile), since: timeOf(o.since) ?? updatedAt ?? 0, reason: reason ? classifyReason(reason) : null, kind, area: str(o.area), repo: str(o.repo) });
  }
  return { gate, queue, working: int(d.working), machine: parseMachine(d.machine), plan: str(obj(d.capacity)?.plan), updatedAt };
}

/** limits.json: the working cap. */
export function parseLimits(text: string): { max: number | null } {
  return { max: int(obj(json(text))?.sessions_max) };
}

const WATCHDOG = /WATCHDOG:/;
const PAUSED = /pausa mandata a:\s*(.*)$/;
const RELEASED = /pressione passata/;

const STARTED = /\bavvio:/;

/**
 * The watchdog's log: its last WATCHDOG line says whether launches are held and which panes it paused. A start line
 * after it means the watchdog came back with nothing held: what it paused before is forgotten.
 */
export function parseWatchdogTail(text: string): { pausedPanes: string[]; held: boolean } {
  const lines = text.split('\n');
  let at = -1;
  for (let i = lines.length - 1; i >= 0 && at === -1; i--) if (WATCHDOG.test(lines[i]!)) at = i;
  const last = at === -1 ? undefined : lines[at];
  if (!last || RELEASED.test(last) || lines.slice(at + 1).some((l) => STARTED.test(l))) return { pausedPanes: [], held: false };
  const panes = (PAUSED.exec(last)?.[1] ?? '').split(/\s+/).filter((p) => isPaneOf('herdr', p));
  return { pausedPanes: panes, held: /lanci fermati/.test(last) };
}

/** The area of a repository when the registry writes none (tools/task.py REPO_AREA, which area_of reads); an unknown repository has none. */
const REPO_AREA: Readonly<Record<string, string>> = { app: 'amatino', crm: 'amatino', lf: 'amatino', vari: 'amatino', nixos: 'personali', bimby: 'personali', gordon: 'personali' };
/** The areas the registry knows. */
const AREAS: ReadonlySet<string> = new Set(['amatino', 'tenuta', 'personali']);

/**
 * tasks.jsonl: each task's repository and area. The registry folds its events with the last scalar winning; an area
 * that is not one of its three, or none, is the repository's.
 */
export function parseTaskInfo(text: string): Map<string, { repo: string | null; area: string | null }> {
  const raw = new Map<string, { repo: string | null; area: string | null }>();
  for (const line of text.split('\n')) {
    const e = obj(json(line));
    const id = e && str(e.id);
    if (!e || !id) continue;
    const t = raw.get(id) ?? { repo: null, area: null };
    t.repo = str(e.repo) ?? t.repo;
    t.area = str(e.area) ?? t.area;
    raw.set(id, t);
  }
  return new Map([...raw].map(([id, t]) => [id, { repo: t.repo, area: t.area !== null && AREAS.has(t.area) ? t.area : t.repo !== null ? (REPO_AREA[t.repo] ?? null) : null }]));
}

/** tasks.jsonl: the last task that named each pane. */
export function parseTaskPanes(text: string): Map<string, string> {
  const out = new Map<string, string>();
  for (const line of text.split('\n')) {
    const e = obj(json(line));
    const id = e && str(e.id);
    if (!e || !id || !Array.isArray(e.sessions)) continue;
    for (const s of e.sessions) {
      const pane = str(obj(s)?.pane);
      if (pane) out.set(pane, id);
    }
  }
  return out;
}

/** seats.jsonl: the seat the team uses now, the last `set`. */
export function parseSeatsLog(text: string): string | null {
  let current: string | null = null;
  for (const line of text.split('\n')) {
    const e = obj(json(line));
    if (e?.ev === 'set') current = str(e.seat) ?? current;
  }
  return current;
}

export interface LimitDoc {
  email: string;
  session: Allowance | null;
  week: Allowance | null;
}

function allowance(v: unknown, readAt: number): Allowance | null {
  const w = obj(v);
  const pct = w && typeof w.used_percentage === 'number' ? w.used_percentage : null;
  return pct === null ? null : { usedPct: Math.max(0, Math.min(100, pct)), resetsAt: timeOf(w!.resets_at), readAt };
}

/** One ~/.local/state/claude-limits/<email>.json, as the status line writes it. */
export function parseLimitDoc(text: string): LimitDoc | null {
  const d = obj(json(text));
  const email = d && str(d.email);
  if (!d || !email) return null;
  const readAt = timeOf(d.written_at) ?? 0;
  return { email, session: allowance(d.five_hour, readAt), week: allowance(d.seven_day, readAt) };
}

/** 'Leonardo Davinci' → 'Leonardo'; 'Personale (J)' → 'Personale'. */
function shortName(seat: string): string {
  return seat.split(/[\s(]/)[0] || seat;
}

/**
 * One seat per account in the accounts file: those in the rota first, in its order, then the rest. A seat is full when
 * either window is at the limit, stale when its week has no fresh reading. Every seat takes turns but the personal
 * account (profile 'personal'): the rota is an order of preference among colleagues, and the owner's own seat, which it
 * leaves out, is still a seat the team turns to.
 */
export function buildSeats(docs: readonly LimitDoc[], accounts: Record<string, { email?: string; profile?: string }>, order: readonly string[], current: string | null, now: number): Seat[] {
  const byEmail = new Map(docs.map((d) => [d.email, d]));
  const names = [...order.filter((n) => n in accounts), ...Object.keys(accounts).filter((n) => !order.includes(n))];
  // A window whose reset has passed is empty now, whatever its last reading said (the `turni` band reads it so too).
  const asOfNow = (a: Allowance | null): Allowance | null => (a && a.resetsAt !== null && a.resetsAt <= now ? { ...a, usedPct: 0 } : a);
  return names.flatMap((name): Seat[] => {
    const email = accounts[name]?.email;
    if (!email) return [];
    const doc = byEmail.get(email);
    const session = asOfNow(doc?.session ?? null);
    const week = asOfNow(doc?.week ?? null);
    return [{
      account: email,
      name: shortName(name),
      session,
      week,
      current: name === current,
      full: (session?.usedPct ?? 0) >= SEAT_LIMIT_PCT || (week?.usedPct ?? 0) >= SEAT_LIMIT_PCT,
      // The status line writes only the windows the API returns: no five-hour window means no usage, not no reading.
      stale: allowanceStale(week, now),
      turnable: accounts[name]?.profile !== 'personal',
    }];
  });
}

/** The sessions' memory: anon + shmem of their cgroup (what the gate counts; file cache is dropped by the kernel) against memory.max. */
export async function readPower(cgroupDir: string, warnPct = 85): Promise<Pick<Power, 'usedBytes' | 'maxBytes' | 'warnPct'> | null> {
  let stat: string;
  let max: string;
  try {
    [stat, max] = await Promise.all([readFile(join(cgroupDir, 'memory.stat'), 'utf8'), readFile(join(cgroupDir, 'memory.max'), 'utf8')]);
  } catch {
    return null;
  }
  let used = 0;
  for (const line of stat.split('\n')) {
    const m = /^(anon|shmem) (\d+)$/.exec(line.trim());
    if (m) used += Number(m[2]);
  }
  const cap = max.trim();
  return { usedBytes: used, maxBytes: /^\d+$/.test(cap) ? Number(cap) : null, warnPct };
}

export interface Cpu {
  load: number | null;
  /** The mean frequency of the cores (MHz). */
  mhz: number | null;
  /** The frequency of the fastest core (MHz). */
  mhzMax: number | null;
  nproc: number | null;
}

/** The CPU now, from a /proc directory: the one-minute load, the mean and the highest MHz of the cores, and the processors. Null for what cannot be read. */
export async function readCpu(procDir = '/proc'): Promise<Cpu> {
  const [load, info] = await Promise.all([
    readFile(join(procDir, 'loadavg'), 'utf8').catch(() => ''),
    readFile(join(procDir, 'cpuinfo'), 'utf8').catch(() => ''),
  ]);
  const one = Number(load.split(/\s+/)[0]);
  const mhz = [...info.matchAll(/^cpu MHz\s*:\s*([\d.]+)/gm)].map((m) => Number(m[1]));
  const nproc = [...info.matchAll(/^processor\s*:/gm)].length;
  return {
    load: load.trim() !== '' && Number.isFinite(one) && one >= 0 ? one : null,
    mhz: mhz.length ? Math.round(mhz.reduce((a, b) => a + b, 0) / mhz.length) : null,
    mhzMax: mhz.length ? Math.round(Math.max(...mhz)) : null,
    nproc: nproc > 0 ? nproc : null,
  };
}

/**
 * The gate's machine with the CPU read now laid over it. The live figures are rounded (load down to the half, as the
 * gate takes its whole part; frequency to 100 MHz) so that the jitter of a reading is not news; what is left is what a
 * person would notice. The brake is judged on the readings before they are rounded, as the gate judges it: the mean
 * and the fastest core both under `brakeMhz`. Without a live reading the gate's own figures stay; with neither, there
 * is no machine.
 */
export function withCpu(machine: Machine | null, cpu: Cpu, brakeMhz: number): Machine | null {
  const live = cpu.load !== null || cpu.mhz !== null || cpu.nproc !== null;
  if (!machine && !live) return null;
  const m: Machine = machine ?? { memAvailableGb: null, memTotalGb: null, slicePct: null, load: null, threads: null, diskBusyPct: null, psiMemPct: null, rebuild: null, cpuMhz: null, cpuBraking: null, nproc: null };
  return {
    ...m,
    load: cpu.load === null ? m.load : Math.floor(cpu.load * 2) / 2,
    cpuMhz: cpu.mhz === null ? m.cpuMhz : Math.round(cpu.mhz / 100) * 100,
    cpuBraking: cpu.mhz === null || cpu.mhzMax === null ? m.cpuBraking : cpu.mhz < brakeMhz && cpu.mhzMax < brakeMhz,
    nproc: cpu.nproc ?? m.nproc,
  };
}
