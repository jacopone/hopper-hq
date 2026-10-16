import type { Allowance, GateReason, GateReasonKind, Seat } from './types.js';

/** A task id at the start of a name: a short upper-case prefix, a dash, digits, then the end or a non-word character. */
const TASK_ID = /^([A-Z][A-Z0-9]{0,4}-\d+)(?![\w-])/;

export function taskIdOf(name: string | null): string | null {
  return name?.match(TASK_ID)?.[1] ?? null;
}

/** A seat is full at this percentage of either window, as the `turni` band says. */
export const SEAT_LIMIT_PCT = 80;
/** A reading older than this is stale: it says nothing about now. */
export const SEAT_STALE_MS = 360 * 60_000;

export function allowanceStale(a: Allowance | null, now: number): boolean {
  return a === null || now - a.readAt > SEAT_STALE_MS;
}

/** Keywords of the gate's reasons, Italian (Gordon's) and English; pressure before memory, since 'memoria sotto pressione' is pressure. */
const REASON_KINDS: [GateReasonKind, RegExp][] = [
  ['pressure', /pression|pressure/i],
  ['memory', /memoria|memory/i],
  ['load', /carico|load/i],
  ['disk', /disco|disk/i],
  ['slice', /slice/i],
  ['pacing', /ultimo avvio|pacing|last launch/i],
  ['rebuild', /rebuild/i],
  ['cap', /sessions_max|tetto|\bcap\b/i],
];

export function classifyReason(text: string): GateReason {
  const t = text.trim();
  for (const [kind, re] of REASON_KINDS) if (re.test(t)) return { kind, text: t };
  return { kind: 'other', text: t };
}

/** The reasons of an `ASPETTA:` line, split on ';'. A `VIA:` line has none: what follows it is a reading, not a reason. */
export function splitReasons(line: string): GateReason[] {
  const m = /^\s*(VIA|ASPETTA|GO|WAIT)\s*:\s*(.*)$/s.exec(line);
  if (!m) return [];
  if (m[1] === 'VIA' || m[1] === 'GO') return [];
  return m[2]!.split(';').map((p) => p.trim()).filter(Boolean).map(classifyReason);
}

/** The first seat in order that takes turns, is not the current one, is not full and has fresh readings; null when none. */
export function seatTurn(seats: readonly Seat[]): string | null {
  return seats.find((s) => s.turnable && !s.current && !s.full && !s.stale)?.account ?? null;
}
