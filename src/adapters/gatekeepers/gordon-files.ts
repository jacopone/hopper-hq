import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { allowanceStale, classifyReason, SEAT_LIMIT_PCT, splitReasons } from '../../core/lobby.js';
import { isPaneOf } from '../../core/terminal.js';
import type { Allowance, GateReason, GateVerdict, Power, Seat } from '../../core/types.js';

/** Reads what Gordon writes. Every function is tolerant: a shape that is not the one expected gives null or empty, never a throw. */

type Obj = Record<string, unknown>;
const obj = (v: unknown): Obj | null => (v && typeof v === 'object' && !Array.isArray(v) ? (v as Obj) : null);
const str = (v: unknown): string | null => (typeof v === 'string' && v.trim() ? v.trim() : null);
const int = (v: unknown): number | null => (typeof v === 'number' && Number.isInteger(v) && v >= 0 ? v : null);

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
  queue: { id: string; name: string; profile: string | null; since: number; reason: GateReason | null }[];
  working: number | null;
  updatedAt: number | null;
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
    queue.push({ id, name: str(o.name) ?? id, profile: str(o.profile), since: timeOf(o.since) ?? updatedAt ?? 0, reason: reason ? classifyReason(reason) : null });
  }
  return { gate, queue, working: int(d.working), updatedAt };
}

/** limits.json: the working cap. */
export function parseLimits(text: string): { max: number | null } {
  return { max: int(obj(json(text))?.sessions_max) };
}

const WATCHDOG = /WATCHDOG:/;
const PAUSED = /pausa mandata a:\s*(.*)$/;
const RELEASED = /pressione passata/;

/** The watchdog's log: its last WATCHDOG line says whether launches are held and which panes it paused. */
export function parseWatchdogTail(text: string): { pausedPanes: string[]; held: boolean } {
  const last = text.split('\n').filter((l) => WATCHDOG.test(l)).at(-1);
  if (!last || RELEASED.test(last)) return { pausedPanes: [], held: false };
  const panes = (PAUSED.exec(last)?.[1] ?? '').split(/\s+/).filter((p) => isPaneOf('herdr', p));
  return { pausedPanes: panes, held: /lanci fermati/.test(last) };
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
 * either window is at the limit, stale when a window has no fresh reading. Every seat takes turns but the personal
 * account (profile 'personal'): the rota is an order of preference among colleagues, and the owner's own seat, which it
 * leaves out, is still a seat the team turns to.
 */
export function buildSeats(docs: readonly LimitDoc[], accounts: Record<string, { email?: string; profile?: string }>, order: readonly string[], current: string | null, now: number): Seat[] {
  const byEmail = new Map(docs.map((d) => [d.email, d]));
  const names = [...order.filter((n) => n in accounts), ...Object.keys(accounts).filter((n) => !order.includes(n))];
  return names.flatMap((name): Seat[] => {
    const email = accounts[name]?.email;
    if (!email) return [];
    const doc = byEmail.get(email);
    const session = doc?.session ?? null;
    const week = doc?.week ?? null;
    return [{
      account: email,
      name: shortName(name),
      session,
      week,
      current: name === current,
      full: (session?.usedPct ?? 0) >= SEAT_LIMIT_PCT || (week?.usedPct ?? 0) >= SEAT_LIMIT_PCT,
      stale: allowanceStale(session, now) || allowanceStale(week, now),
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
