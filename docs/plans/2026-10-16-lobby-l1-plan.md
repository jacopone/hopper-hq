# The Lobby, L1 — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Show the gatekeeper's queue, seats and power in the building: data from Gordon's files through a read-only provider, served at `/api/lobby`, reached from the façade's Lobby button, listed in a Lobby panel, with each desk naming its task id.

**Architecture:** A `GatekeeperProvider` (adapter) polls the orchestrator's files and hands the collector a whole `Lobby` each time it changes, plus `task` events for sessions it can name. The collector keeps the latest `Lobby`, puts a summary in the scene and serves the detail on request. The browser gets a `#/lobby` route, a button on the façade's ground floor and a panel; the 3D floor is L2.

**Tech Stack:** TypeScript (Node 22, `node:fs/promises`), Svelte 5, vitest, happy-dom for UI tests.

**Spec:** `docs/plans/2026-10-16-lobby-design.md`

## Global Constraints

- Read-only towards every file the provider reads; the provider never runs a script and never writes outside hopper-hq's data directory.
- Every string shown comes through `cleanText` / `cleanOrNull` (`src/scene/text.ts`); the scene stays JSON-serializable and browser-safe (`test/scene/boundary.test.ts`).
- A missing, empty or corrupt file empties its section and nothing else; a provider error is logged once per cause and keeps the last reading.
- No new runtime dependency. Comments say why, in English. Commit messages are a sentence that says what the change does.
- `SCENE_VERSION` goes 6 → 7 once, in Task 5; the snapshot `test/scene/__snapshots__/build.test.ts.snap` is updated on purpose and its diff read.
- Checks before every commit: `npx tsc -p tsconfig.json --noEmit` and the task's tests; before the last commit `npm run typecheck && npx vitest run && npm run build` (the one known red test, `test/cli-open.test.ts`, is NixOS-only and pre-existing).

## Review Focus

1. `lobby.json` half-written or corrupt (Gordon crashes mid-write): the gate and the queue go empty, the seats and the power stay; no throw. Pinned in Task 3 (`parseLobbyFile` returns null on bad JSON) and Task 4 (a provider poll with a corrupt file still emits a Lobby).
2. A watchdog line that pauses nobody (`pausa mandata a: ` with nothing after): no paused panes, `held` true. Pinned in Task 3.
3. A seat whose readings are older than 360 minutes: shown as stale, never offered as a turn; a seat without any reading: listed, `stale`, never a turn. Pinned in Task 2.
4. `memory.max` reading `max` (no cap): `maxBytes` null, no percentage, no warning mark. Pinned in Task 3.
5. A session name that only looks like a task id (`G-268b`, `g-1`, `MyG-12`): no task. Pinned in Task 2.

---

### Task 1: The Lobby in the domain, and the task id on a session

**Files:**
- Modify: `src/core/types.ts` (after `TerminalKind`, and in `Session`, and in the event union)
- Modify: `src/core/reducer.ts` (`newSession`, the order-free switch, `normalizeSession`)
- Test: `test/collector.test.ts`

**Interfaces:**
- Produces: the types below, `Session.task: string | null`, and the event `{ type: 'task'; task: string | null }` with source `'gatekeeper'`.

- [ ] **Step 1: Write the failing test** — append to `test/collector.test.ts`, after the terminal describe block:

```ts
describe("the gatekeeper's task events", () => {
  it('names a known session\'s task, and drops a task for a session it does not know', async () => {
    const c = collector();
    await c.ingest(hook({ type: 'session.seen', workspace: { cwd: '/w/orders-api', repoRoot: '/w/orders-api', repoName: 'orders-api', worktree: false, branch: 'main' } }));
    await c.ingest({ type: 'task', sessionId: 'S1', ts: NOW, source: 'gatekeeper', task: 'G-268' });
    await c.ingest({ type: 'task', sessionId: 'S9', ts: NOW, source: 'gatekeeper', task: 'G-1' });
    expect(c.session('S1')?.task).toBe('G-268');
    expect(c.session('S9')).toBeNull();
    await c.ingest({ type: 'task', sessionId: 'S1', ts: NOW, source: 'gatekeeper', task: null });
    expect(c.session('S1')?.task).toBeNull();
  });
});
```

- [ ] **Step 2: Run it** — `npx vitest run test/collector.test.ts -t gatekeeper` → FAIL (type error on `'task'`, or `task` undefined).

- [ ] **Step 3: Add the types** to `src/core/types.ts`:

Under `TerminalKind`:

```ts
/** One reading of an account's allowance window. */
export interface Allowance {
  usedPct: number;
  resetsAt: number | null;
  /** When the reading was written (ms). */
  readAt: number;
}

/** An account the team can work under: an elevator in the Lobby. */
export interface Seat {
  /** The account: an email, or the label its gatekeeper gives it. */
  account: string;
  /** A short name for its sign ('Leonardo'). */
  name: string;
  /** The five-hour window. */
  session: Allowance | null;
  /** The seven-day window. */
  week: Allowance | null;
  /** The seat the team uses now. */
  current: boolean;
  /** Over the gatekeeper's limit: the cabin is full. */
  full: boolean;
  /** No reading, or one older than the gatekeeper's staleness window. */
  stale: boolean;
  /** Takes turns: a seat outside the rota (a personal account) is shown but never offered. */
  turnable: boolean;
}

export type GateReasonKind = 'memory' | 'load' | 'disk' | 'pressure' | 'slice' | 'pacing' | 'rebuild' | 'cap' | 'other';
export interface GateReason {
  kind: GateReasonKind;
  text: string;
}

/** The gate's last word. */
export interface GateVerdict {
  go: boolean;
  text: string;
  reasons: GateReason[];
  at: number;
}

/** A launch waiting outside. */
export interface Waiting {
  /** The orchestrator's id for it ('G-270'); unique in the queue. */
  id: string;
  name: string;
  account: string | null;
  since: number;
  reason: GateReason | null;
}

/** The sessions' memory against their cap. */
export interface Power {
  usedBytes: number;
  /** Null when there is no cap. */
  maxBytes: number | null;
  /** The watchdog's mark, as a percentage of maxBytes. */
  warnPct: number;
  /** The watchdog holds every launch. */
  held: boolean;
  /** Panes of the sessions the watchdog paused and has not released. */
  pausedPanes: string[];
}

/** What a gatekeeper shows in the Lobby (design 2026-10-16 §3). */
export interface Lobby {
  doorman: { name: string };
  gate: GateVerdict | null;
  queue: Waiting[];
  seats: Seat[];
  /** The account to take next when the current seat is full; null when none has margin. */
  turnTo: string | null;
  power: Power | null;
  cap: { working: number | null; max: number | null } | null;
  updatedAt: number;
}
```

In `Session`, after `account`:

```ts
  /** The orchestrator's task id ('G-268'): from the session's name, else from the gatekeeper. Null when none. */
  task: string | null;
```

In `EventSourceKind`: `'hook' | 'fs' | 'demo' | 'terminal' | 'gatekeeper'`, with the comment `'gatekeeper': the orchestrator's files, which name each session's task.`

In the event union, after `pane`:

```ts
    /** The task the gatekeeper's registry gives the session; null when it lists none. Only a known session takes it. */
    | { type: 'task'; task: string | null }
```

- [ ] **Step 4: Apply it in the reducer** (`src/core/reducer.ts`): in `newSession` add `task: null,` after `account: null,`; in the order-free switch, after `case 'pane'`:

```ts
    case 'task':
      return s.task === e.task ? s : { ...s, task: e.task };
```

In `normalizeSession`, after `account: raw.account ?? null,`: `task: raw.task ?? null,`.

- [ ] **Step 5: Run** — `npx vitest run test/collector.test.ts` → PASS. `npx tsc -p tsconfig.json --noEmit` → clean.

- [ ] **Step 6: Commit** — `git add src/core/types.ts src/core/reducer.ts test/collector.test.ts && git commit -m "Give sessions a task id, and the domain a Lobby: seats, gate, queue and power"`

---

### Task 2: The Lobby's rules, browser-safe

**Files:**
- Create: `src/core/lobby.ts`
- Test: `test/core/lobby.test.ts`

**Interfaces:**
- Produces: `taskIdOf(name: string | null): string | null`, `classifyReason(text: string): GateReason`, `splitReasons(text: string): GateReason[]`, `SEAT_LIMIT_PCT = 80`, `SEAT_STALE_MS = 360 * 60_000`, `seatTurn(seats: readonly Seat[]): string | null`, `allowanceStale(a: Allowance | null, now: number): boolean`.

- [ ] **Step 1: Write the failing tests** — `test/core/lobby.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { allowanceStale, classifyReason, seatTurn, splitReasons, taskIdOf } from '../../src/core/lobby.js';
import type { Seat } from '../../src/core/types.js';

const NOW = 1_792_150_000_000;
const seat = (name: string, week: number | null, extra: Partial<Seat> = {}): Seat => ({
  account: `${name.toLowerCase()}@example.com`,
  name,
  session: week === null ? null : { usedPct: 5, resetsAt: null, readAt: NOW },
  week: week === null ? null : { usedPct: week, resetsAt: null, readAt: NOW },
  current: false,
  full: week !== null && week >= 80,
  stale: week === null,
  turnable: true,
  ...extra,
});

describe('taskIdOf', () => {
  it('reads a task id at the start of a name, and nothing that only looks like one', () => {
    expect(taskIdOf('G-268 hopper-hq fleet-building (J) [OPEN]-W42')).toBe('G-268');
    expect(taskIdOf('PROJ-12: fix')).toBe('PROJ-12');
    for (const name of ['G-268b', 'g-1', 'MyG-12 x', 'hopper G-268', '', null]) expect(taskIdOf(name)).toBeNull();
  });
});

describe('reasons', () => {
  it("classifies the gate's reasons by keyword, in Italian and in English", () => {
    expect(classifyReason('memoria 18 GB < 20').kind).toBe('memory');
    expect(classifyReason('carico 49 > 0,75×24 thread').kind).toBe('load');
    expect(classifyReason('disco occupato al 88%').kind).toBe('disk');
    expect(classifyReason('memoria sotto pressione (12%)').kind).toBe('pressure');
    expect(classifyReason("slice delle sessioni al 84% del tetto (watchdog all'85%)").kind).toBe('slice');
    expect(classifyReason('ultimo avvio 40 s fa (uno ogni 120 s)').kind).toBe('pacing');
    expect(classifyReason('rebuild in corso').kind).toBe('rebuild');
    expect(classifyReason('sessions_max reached').kind).toBe('cap');
    expect(classifyReason('something else')).toEqual({ kind: 'other', text: 'something else' });
  });

  it('splits a verdict line into its reasons, dropping the verdict word and empty parts', () => {
    expect(splitReasons("ASPETTA: slice delle sessioni al 84% del tetto (watchdog all'85%); ultimo avvio 40 s fa (uno ogni 120 s);")).toEqual([
      { kind: 'slice', text: "slice delle sessioni al 84% del tetto (watchdog all'85%)" },
      { kind: 'pacing', text: 'ultimo avvio 40 s fa (uno ogni 120 s)' },
    ]);
    expect(splitReasons('VIA: memoria 34 GB, slice 72%')).toEqual([]);
  });
});

describe('seats', () => {
  it('marks a reading stale after 360 minutes, and no reading as stale', () => {
    expect(allowanceStale({ usedPct: 1, resetsAt: null, readAt: NOW - 359 * 60_000 }, NOW)).toBe(false);
    expect(allowanceStale({ usedPct: 1, resetsAt: null, readAt: NOW - 361 * 60_000 }, NOW)).toBe(true);
    expect(allowanceStale(null, NOW)).toBe(true);
  });

  it('offers the first seat in order under the limit with fresh readings, skipping the current one, full ones, stale ones and those outside the rota', () => {
    const seats = [
      seat('Jacopo', 41, { current: true }),
      seat('Pietro', null),
      seat('Luca', 86),
      seat('Leonardo', 59),
      seat('Giovanni', 21, { turnable: false }),
      seat('Francesco', 23),
    ];
    expect(seatTurn(seats)).toBe('leonardo@example.com');
    expect(seatTurn(seats.filter((s) => s.name !== 'Leonardo' && s.name !== 'Francesco'))).toBeNull();
    // The current seat is never the turn, even with margin.
    expect(seatTurn([seat('Jacopo', 10, { current: true })])).toBeNull();
  });
});
```

- [ ] **Step 2: Run** — `npx vitest run test/core/lobby.test.ts` → FAIL (module not found).

- [ ] **Step 3: Write `src/core/lobby.ts`**:

```ts
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

/** Keywords of the gate's reasons, Italian (Gordon's) and English, first match wins. */
const REASON_KINDS: [GateReasonKind, RegExp][] = [
  ['pressure', /pression|pressure/i],
  ['memory', /memoria|memory/i],
  ['load', /carico|load/i],
  ['disk', /disco|disk/i],
  ['slice', /slice/i],
  ['pacing', /ultimo avvio|pacing|last launch/i],
  ['rebuild', /rebuild/i],
  ['cap', /sessions_max|tetto|cap\b/i],
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
```

Note the memory/pressure order: `memoria sotto pressione` must be `pressure`, so pressure is tested first.

- [ ] **Step 4: Run** — `npx vitest run test/core/lobby.test.ts test/scene/boundary.test.ts` → PASS (the boundary test does not cover `src/core`, but `lobby.ts` must still import nothing from Node: it does not).

- [ ] **Step 5: Read the task id from the session's name.** Add to `test/collector.test.ts`, in the gatekeeper describe block:

```ts
  it('reads the task id from a session\'s name, and keeps the gatekeeper\'s when the name has none', async () => {
    const c = collector();
    await c.ingest(hook({ type: 'session.seen', name: 'G-268 hopper-hq fleet-building', workspace: { cwd: '/w/orders-api', repoRoot: '/w/orders-api', repoName: 'orders-api', worktree: false, branch: 'main' } }));
    expect(c.session('S1')?.task).toBe('G-268');
    await c.ingest(hook({ type: 'session.seen', sessionId: 'S2', name: 'orders-api-a1', workspace: { cwd: '/w/orders-api', repoRoot: '/w/orders-api', repoName: 'orders-api', worktree: false, branch: 'main' } }));
    await c.ingest({ type: 'task', sessionId: 'S2', ts: NOW, source: 'gatekeeper', task: 'G-9' });
    await c.ingest(hook({ type: 'session.seen', sessionId: 'S2', name: 'orders-api-a1', workspace: { cwd: '/w/orders-api', repoRoot: '/w/orders-api', repoName: 'orders-api', worktree: false, branch: 'main' } }));
    expect(c.session('S2')?.task).toBe('G-9');
  });
```

Run it → FAIL. Then in `src/core/reducer.ts` import `taskIdOf` from `./lobby.js` and, in the `session.seen` case, after `account:`: `task: (e.name ? taskIdOf(e.name) : null) ?? s.task,`. Run `npx vitest run test/collector.test.ts` → PASS.

- [ ] **Step 6: Commit** — `git add src/core/lobby.ts src/core/reducer.ts test/core/lobby.test.ts test/collector.test.ts && git commit -m "Add the Lobby's rules: task ids, the gate's reasons and the turn between seats"`

---

### Task 3: Reading Gordon's files

**Files:**
- Create: `src/adapters/gatekeepers/gordon-files.ts`
- Test: `test/adapters/gordon-files.test.ts`

**Interfaces:**
- Consumes: Task 1 types, Task 2 rules.
- Produces, all pure except `readPower`:
  - `parseLobbyFile(text: string): { gate: GateVerdict | null; queue: Omit<Waiting, 'account'>[] & { profile: string | null }[]; working: number | null; updatedAt: number | null } | null`
  - `parseLimits(text: string): { max: number | null }`
  - `parseWatchdogTail(text: string): { pausedPanes: string[]; held: boolean }`
  - `parseTaskPanes(text: string): Map<string, string>` (pane → task id)
  - `parseSeatsLog(text: string): string | null` (the current seat's name)
  - `parseLimitDoc(text: string): LimitDoc | null` and `buildSeats(docs: LimitDoc[], accounts: Record<string, { email?: string; profile?: string }>, order: string[], current: string | null, now: number): Seat[]`
  - `readPower(cgroupDir: string, warnPct?: number): Promise<Pick<Power, 'usedBytes' | 'maxBytes' | 'warnPct'> | null>`
  - `timeOf(value: unknown): number | null` (ISO string or epoch seconds → ms)

- [ ] **Step 1: Write the failing tests** — `test/adapters/gordon-files.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  buildSeats, parseLimitDoc, parseLimits, parseLobbyFile, parseSeatsLog, parseTaskPanes, parseWatchdogTail, readPower, timeOf,
} from '../../src/adapters/gatekeepers/gordon-files.js';

const NOW = Date.parse('2026-10-16T14:02:30+02:00');

describe('timeOf', () => {
  it('reads ISO strings and epoch seconds, and nothing else', () => {
    expect(timeOf('2026-10-16T14:02:11+02:00')).toBe(Date.parse('2026-10-16T14:02:11+02:00'));
    expect(timeOf(1792150178)).toBe(1792150178_000);
    for (const v of ['soon', '', null, undefined, {}, -1]) expect(timeOf(v)).toBeNull();
  });
});

describe('parseLobbyFile', () => {
  const text = JSON.stringify({
    updated_at: '2026-10-16T14:02:11+02:00',
    gate: { verdict: 'ASPETTA', text: "ASPETTA: slice delle sessioni al 84% del tetto (watchdog all'85%); ultimo avvio 40 s fa (uno ogni 120 s);", at: '2026-10-16T14:02:11+02:00' },
    waiting: [
      { id: 'G-270', name: 'G-270 segnali a J', profile: 'leonardo', since: '2026-10-16T13:58:00+02:00', reason: "slice delle sessioni al 84% del tetto (watchdog all'85%)" },
      { id: 'G-271', name: 'G-271 medic v2', since: 1792150000 },
      { name: 'no id: skipped' },
    ],
    working: 6,
  });

  it('reads the gate, the queue and the working count', () => {
    const l = parseLobbyFile(text)!;
    expect(l.updatedAt).toBe(Date.parse('2026-10-16T14:02:11+02:00'));
    expect(l.gate).toEqual({
      go: false,
      text: "ASPETTA: slice delle sessioni al 84% del tetto (watchdog all'85%); ultimo avvio 40 s fa (uno ogni 120 s);",
      reasons: [
        { kind: 'slice', text: "slice delle sessioni al 84% del tetto (watchdog all'85%)" },
        { kind: 'pacing', text: 'ultimo avvio 40 s fa (uno ogni 120 s)' },
      ],
      at: Date.parse('2026-10-16T14:02:11+02:00'),
    });
    expect(l.queue).toEqual([
      { id: 'G-270', name: 'G-270 segnali a J', profile: 'leonardo', since: Date.parse('2026-10-16T13:58:00+02:00'), reason: { kind: 'slice', text: "slice delle sessioni al 84% del tetto (watchdog all'85%)" } },
      { id: 'G-271', name: 'G-271 medic v2', profile: null, since: 1792150000_000, reason: null },
    ]);
    expect(l.working).toBe(6);
  });

  it('reads a VIA verdict as go with no reasons, and is null for anything that is not the file', () => {
    expect(parseLobbyFile(JSON.stringify({ gate: { verdict: 'VIA', text: 'VIA: memoria 34 GB, slice 72%' } }))).toMatchObject({ gate: { go: true, reasons: [] }, queue: [], working: null, updatedAt: null });
    for (const bad of ['', '{', '[]', 'null', '"x"']) expect(parseLobbyFile(bad)).toBeNull();
    expect(parseLobbyFile('{}')).toEqual({ gate: null, queue: [], working: null, updatedAt: null });
  });
});

describe('parseLimits and parseWatchdogTail', () => {
  it('reads the working cap', () => {
    expect(parseLimits('{"sessions_max": 7, "heavy_slots": 1}')).toEqual({ max: 7 });
    expect(parseLimits('{"sessions_max": 0}')).toEqual({ max: 0 });
    for (const bad of ['', '{', '{"sessions_max":"7"}']) expect(parseLimits(bad)).toEqual({ max: null });
  });

  it('reads the paused panes and the hold from the last WATCHDOG line', () => {
    const log = [
      "11:42 battito: mem full 0.00% · sessioni 58% del tetto",
      "11:48 WATCHDOG: sessioni Claude all'87% del loro tetto di memoria → lanci fermati (sessions_max 0), pausa mandata a: wE:p1E wG:p8 ",
      '12:06 battito: mem full 0.00%',
    ].join('\n');
    expect(parseWatchdogTail(log)).toEqual({ pausedPanes: ['wE:p1E', 'wG:p8'], held: true });
    expect(parseWatchdogTail(log + "\n13:51 WATCHDOG: pressione passata (sessioni 34% del tetto) → tetto ripristinato a 7")).toEqual({ pausedPanes: [], held: false });
    expect(parseWatchdogTail("13:36 WATCHDOG: sessioni Claude all'88% → lanci fermati (sessions_max 0), pausa mandata a: ")).toEqual({ pausedPanes: [], held: true });
    expect(parseWatchdogTail('')).toEqual({ pausedPanes: [], held: false });
    // A pane that is not herdr's is not a pane.
    expect(parseWatchdogTail('WATCHDOG: x → lanci fermati, pausa mandata a: wE:p1E %7 rm;-rf')).toEqual({ pausedPanes: ['wE:p1E'], held: true });
  });
});

describe('parseTaskPanes and parseSeatsLog', () => {
  it('maps each pane to the last task that named it', () => {
    const text = [
      JSON.stringify({ ev: 'add', id: 'G-268', title: 'hopper' }),
      JSON.stringify({ ev: 'update', id: 'G-268', sessions: [{ pane: 'wK:p2', profile: 'leonardo' }] }),
      JSON.stringify({ ev: 'update', id: 'G-178', sessions: [{ pane: 'wE:p1M' }, { pane: 'wE:p1N' }] }),
      'not json',
      JSON.stringify({ ev: 'update', id: 'G-269', sessions: [{ pane: 'wE:p1N' }] }),
    ].join('\n');
    expect([...parseTaskPanes(text)]).toEqual([['wK:p2', 'G-268'], ['wE:p1M', 'G-178'], ['wE:p1N', 'G-269']]);
  });

  it('reads the current seat from the last set', () => {
    expect(parseSeatsLog('{"ev":"set","seat":"Francesco Datini"}\nbad\n{"ev":"set","seat":"Jacopo Anselmi","ts":"x"}\n{"ev":"note","seat":"Luca"}')).toBe('Jacopo Anselmi');
    expect(parseSeatsLog('')).toBeNull();
  });
});

describe('buildSeats', () => {
  const accounts = {
    'Jacopo Anselmi': { email: 'jacopo@example.com' },
    'Leonardo Davinci': { email: 'leonardo@example.com', profile: 'leonardo' },
    'Luca Pacioli': { email: 'luca@example.com' },
    'Pietro Fusar Poli': { email: 'pietro@example.com' },
    'Personale (J)': { email: 'j@gmail.example', profile: 'personal' },
  };
  const order = ['Pietro Fusar Poli', 'Luca Pacioli', 'Leonardo Davinci'];
  const doc = (email: string, session: number, week: number, writtenAt = NOW / 1000 - 60) =>
    parseLimitDoc(JSON.stringify({ email, five_hour: { used_percentage: session, resets_at: 1792166400 }, seven_day: { used_percentage: week, resets_at: 1792242000 }, written_at: writtenAt }))!;

  it('builds one seat per account in the accounts file, in seat order then the rest, with full, stale and turnable', () => {
    const docs = [doc('jacopo@example.com', 6, 41), doc('leonardo@example.com', 9, 59), doc('luca@example.com', 2, 86), doc('j@gmail.example', 37, 16, NOW / 1000 - 7 * 3600)];
    const seats = buildSeats(docs, accounts, order, 'Jacopo Anselmi', NOW);
    expect(seats.map((s) => [s.name, s.current, s.full, s.stale, s.turnable, s.week?.usedPct ?? null])).toEqual([
      ['Pietro', false, false, true, true, null],
      ['Luca', false, true, false, true, 86],
      ['Leonardo', false, false, false, true, 59],
      ['Jacopo', true, false, false, true, 41],
      ['Personale', false, false, true, false, 16],
    ]);
    expect(seats[3]!.session).toEqual({ usedPct: 6, resetsAt: 1792166400_000, readAt: (NOW / 1000 - 60) * 1000 });
  });

  it('is null for a reading that is not one', () => {
    for (const bad of ['', '{', '{"five_hour":{}}', JSON.stringify({ email: 7 })]) expect(parseLimitDoc(bad)).toBeNull();
  });
});

describe('readPower', () => {
  it('reads anon + shmem against memory.max, and no cap as null', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'shq-cg-'));
    await writeFile(join(dir, 'memory.stat'), 'anon 17650155520\nfile 11080888320\nshmem 1024\n');
    await writeFile(join(dir, 'memory.max'), '48001552384\n');
    expect(await readPower(dir)).toEqual({ usedBytes: 17650156544, maxBytes: 48001552384, warnPct: 85 });
    await writeFile(join(dir, 'memory.max'), 'max\n');
    expect(await readPower(dir)).toEqual({ usedBytes: 17650156544, maxBytes: null, warnPct: 85 });
    expect(await readPower(join(dir, 'missing'))).toBeNull();
  });
});
```

- [ ] **Step 2: Run** — `npx vitest run test/adapters/gordon-files.test.ts` → FAIL (module not found).

- [ ] **Step 3: Write `src/adapters/gatekeepers/gordon-files.ts`**:

```ts
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
  const lines = text.split('\n').filter((l) => WATCHDOG.test(l));
  const last = lines.at(-1);
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
 * either window is at the limit, stale when a window has no fresh reading, and takes turns only when the rota names it.
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
    const stale = allowanceStale(session, now) || allowanceStale(week, now);
    return [{
      account: email,
      name: shortName(name),
      session,
      week,
      current: name === current,
      full: (session?.usedPct ?? 0) >= SEAT_LIMIT_PCT || (week?.usedPct ?? 0) >= SEAT_LIMIT_PCT,
      stale,
      turnable: order.includes(name),
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
```

- [ ] **Step 4: Run** — `npx vitest run test/adapters/gordon-files.test.ts` → PASS. Fix the `seats[3].session` expectation if `readAt` rounding differs: `timeOf` rounds seconds to ms, so `(NOW / 1000 - 60) * 1000` must be an integer; `NOW` is one.

- [ ] **Step 5: Commit** — `git add src/adapters/gatekeepers/gordon-files.ts test/adapters/gordon-files.test.ts && git commit -m "Read Gordon's files: the gate, the queue, the cap, the watchdog, the seats, the power and the task registry"`

---

### Task 4: The Gordon provider

**Files:**
- Create: `src/adapters/gatekeepers/types.ts`, `src/adapters/gatekeepers/gordon.ts`
- Test: `test/adapters/gordon.test.ts`

**Interfaces:**
- Consumes: Task 3 parsers; Task 2 `seatTurn`.
- Produces:

```ts
// src/adapters/gatekeepers/types.ts
import type { Lobby } from '../../core/types.js';
export interface GatekeeperSink {
  /** A whole Lobby, each time something in it changed. */
  lobby(l: Lobby): void;
  /** The task of a session the gatekeeper can name; null when it names none any more. */
  task(sessionId: string, task: string | null): void;
}
export interface GatekeeperProvider {
  start(sink: GatekeeperSink): void;
  stop(): void;
  /** One reading now (tests). */
  poll(): Promise<void>;
}
```

```ts
// src/adapters/gatekeepers/gordon.ts
export interface GordonOptions {
  /** Gordon's state directory (lobby.json, limits.json, watchdog-stopgap.log, seats-accounts.json, seats.jsonl, seats-order.txt, tasks.jsonl). */
  dir: string;
  /** The claude-limits directory (default: ~/.local/state/claude-limits). */
  limitsDir?: string;
  /** The sessions' cgroup (default: the user's claude.slice). */
  cgroupDir?: string;
  /** Each local session's pane, as the collector knows them, asked at every poll. */
  panes: () => ReadonlyMap<string, string>;
  now?: () => number;
  log?: (line: string) => void;
}
export class GordonProvider implements GatekeeperProvider { constructor(o: GordonOptions); start(sink, intervalMs = 5000); stop(); poll() }
```

- [ ] **Step 1: Write the failing test** — `test/adapters/gordon.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { GordonProvider } from '../../src/adapters/gatekeepers/gordon.js';
import type { Lobby } from '../../src/core/types.js';

const NOW = Date.parse('2026-10-16T14:02:30+02:00');

async function state() {
  const root = await mkdtemp(join(tmpdir(), 'shq-gordon-'));
  const dir = join(root, 'gordon');
  const limitsDir = join(root, 'claude-limits');
  const cgroupDir = join(root, 'claude.slice');
  await Promise.all([mkdir(dir), mkdir(limitsDir), mkdir(cgroupDir)]);
  await writeFile(join(dir, 'lobby.json'), JSON.stringify({
    updated_at: '2026-10-16T14:02:11+02:00',
    gate: { verdict: 'ASPETTA', text: 'ASPETTA: slice delle sessioni al 84% del tetto (watchdog all\'85%);' },
    waiting: [{ id: 'G-270', name: 'G-270 segnali a J', profile: 'leonardo', since: '2026-10-16T13:58:00+02:00', reason: 'slice delle sessioni al 84% del tetto' }],
    working: 6,
  }));
  await writeFile(join(dir, 'limits.json'), '{"sessions_max": 7}');
  await writeFile(join(dir, 'watchdog-stopgap.log'), "13:36 WATCHDOG: sessioni Claude all'88% → lanci fermati (sessions_max 0), pausa mandata a: wE:p1E wK:p2 \n");
  await writeFile(join(dir, 'seats-accounts.json'), JSON.stringify({ 'Jacopo Anselmi': { email: 'jacopo@example.com' }, 'Leonardo Davinci': { email: 'leonardo@example.com', profile: 'leonardo' } }));
  await writeFile(join(dir, 'seats.jsonl'), '{"ev":"set","seat":"Jacopo Anselmi"}\n');
  await writeFile(join(dir, 'seats-order.txt'), 'Leonardo Davinci\n');
  await writeFile(join(dir, 'tasks.jsonl'), JSON.stringify({ ev: 'update', id: 'G-268', sessions: [{ pane: 'wK:p2' }] }) + '\n');
  await writeFile(join(limitsDir, 'jacopo@example.com.json'), JSON.stringify({ email: 'jacopo@example.com', five_hour: { used_percentage: 6 }, seven_day: { used_percentage: 41 }, written_at: NOW / 1000 - 60 }));
  await writeFile(join(limitsDir, 'leonardo@example.com.json'), JSON.stringify({ email: 'leonardo@example.com', five_hour: { used_percentage: 9 }, seven_day: { used_percentage: 59 }, written_at: NOW / 1000 - 60 }));
  await writeFile(join(cgroupDir, 'memory.stat'), 'anon 17650155520\nshmem 0\n');
  await writeFile(join(cgroupDir, 'memory.max'), '48001552384\n');
  return { dir, limitsDir, cgroupDir };
}

function sink() {
  const lobbies: Lobby[] = [];
  const tasks: [string, string | null][] = [];
  return { lobbies, tasks, sink: { lobby: (l: Lobby) => void lobbies.push(l), task: (id: string, t: string | null) => void tasks.push([id, t]) } };
}

describe('GordonProvider', () => {
  it('reads every file into one Lobby, names tasks by pane, and reports only changes', async () => {
    const s = await state();
    const out = sink();
    const p = new GordonProvider({ ...s, panes: () => new Map([['S1', 'wK:p2'], ['S2', 'wB:p9']]), now: () => NOW });
    p.start(out.sink, 60_000);
    await p.poll();
    expect(out.lobbies).toHaveLength(1);
    const l = out.lobbies[0]!;
    expect(l.gate).toMatchObject({ go: false, reasons: [{ kind: 'slice' }] });
    expect(l.queue).toEqual([{ id: 'G-270', name: 'G-270 segnali a J', account: 'leonardo@example.com', since: Date.parse('2026-10-16T13:58:00+02:00'), reason: { kind: 'slice', text: 'slice delle sessioni al 84% del tetto' } }]);
    expect(l.seats.map((x) => [x.name, x.current, x.turnable])).toEqual([['Leonardo', false, true], ['Jacopo', true, false]]);
    expect(l.turnTo).toBe('leonardo@example.com');
    expect(l.power).toEqual({ usedBytes: 17650155520, maxBytes: 48001552384, warnPct: 85, held: true, pausedPanes: ['wE:p1E', 'wK:p2'] });
    expect(l.cap).toEqual({ working: 6, max: 7 });
    expect(l.doorman).toEqual({ name: 'Gordon' });
    expect(l.updatedAt).toBe(Date.parse('2026-10-16T14:02:11+02:00'));
    expect(out.tasks).toEqual([['S1', 'G-268']]);
    await p.poll();
    expect(out.lobbies).toHaveLength(1);
    expect(out.tasks).toHaveLength(1);
    p.stop();
  });

  it('keeps the seats and the power when lobby.json is corrupt or gone, and empties the gate and the queue', async () => {
    const s = await state();
    const out = sink();
    const p = new GordonProvider({ ...s, panes: () => new Map(), now: () => NOW });
    await writeFile(join(s.dir, 'lobby.json'), '{"gate": {"verdict": "ASP');
    await p.poll();
    expect(out.lobbies[0]).toMatchObject({ gate: null, queue: [], cap: { working: null, max: 7 } });
    expect(out.lobbies[0]!.seats).toHaveLength(2);
    expect(out.lobbies[0]!.power).not.toBeNull();
    await rm(join(s.dir, 'lobby.json'));
    await p.poll();
    expect(out.lobbies).toHaveLength(1);
  });

  it('emits a Lobby with nothing read when the directory is missing, and polls on a timer until stopped', async () => {
    const out = sink();
    let polls = 0;
    const p = new GordonProvider({ dir: '/nonexistent/gordon', limitsDir: '/nonexistent/limits', cgroupDir: '/nonexistent/cg', panes: () => new Map(), now: () => NOW, log: () => {} });
    const orig = p.poll.bind(p);
    p.poll = async () => { polls++; await orig(); };
    p.start(out.sink, 5);
    await new Promise((r) => setTimeout(r, 30));
    p.stop();
    const after = polls;
    await new Promise((r) => setTimeout(r, 15));
    expect(polls).toBe(after);
    expect(polls).toBeGreaterThanOrEqual(2);
    expect(out.lobbies).toHaveLength(1);
    expect(out.lobbies[0]).toMatchObject({ gate: null, queue: [], seats: [], turnTo: null, power: null, cap: null });
  });
});
```

- [ ] **Step 2: Run** — `npx vitest run test/adapters/gordon.test.ts` → FAIL (module not found).

- [ ] **Step 3: Write the interface** (`src/adapters/gatekeepers/types.ts`, as in Interfaces above) **and the provider** (`src/adapters/gatekeepers/gordon.ts`):

```ts
import { readdir, readFile, stat } from 'node:fs/promises';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { seatTurn } from '../../core/lobby.js';
import type { Lobby } from '../../core/types.js';
import { buildSeats, parseLimitDoc, parseLimits, parseLobbyFile, parseSeatsLog, parseTaskPanes, parseWatchdogTail, readPower, type LimitDoc } from './gordon-files.js';
import type { GatekeeperProvider, GatekeeperSink } from './types.js';

export interface GordonOptions {
  /** Gordon's state directory. */
  dir: string;
  /** Where every account's status line writes its allowance readings (default ~/.local/state/claude-limits). */
  limitsDir?: string;
  /** The sessions' cgroup (default: the user's claude.slice). */
  cgroupDir?: string;
  /** Each local session's pane, as the collector knows them. */
  panes: () => ReadonlyMap<string, string>;
  now?: () => number;
  log?: (line: string) => void;
}

/** The most of a file read: the watchdog log is read from its tail. */
const FILE_MAX = 1024 * 1024;

export const DEFAULT_GORDON_DIR = join(homedir(), '.local/state/alfred/gordon');
export const DEFAULT_LIMITS_DIR = join(homedir(), '.local/state/claude-limits');
export const DEFAULT_CGROUP_DIR = `/sys/fs/cgroup/user.slice/user-${process.getuid?.() ?? 1000}.slice/user@${process.getuid?.() ?? 1000}.service/claude.slice`;

/** The text of a file, its last FILE_MAX bytes when it is longer; '' when it cannot be read. */
async function tail(path: string): Promise<string> {
  try {
    const size = (await stat(path)).size;
    if (size <= FILE_MAX) return await readFile(path, 'utf8');
    const { open } = await import('node:fs/promises');
    const fh = await open(path, 'r');
    try {
      const buf = Buffer.alloc(FILE_MAX);
      await fh.read(buf, 0, FILE_MAX, size - FILE_MAX);
      return buf.toString('utf8');
    } finally {
      await fh.close();
    }
  } catch {
    return '';
  }
}

/**
 * Reads Gordon's files every few seconds into one Lobby, and hands it on when it differs from the last. Read-only: it
 * runs nothing of Gordon's. A file that cannot be read empties its section; the provider never throws.
 */
export class GordonProvider implements GatekeeperProvider {
  private sink: GatekeeperSink | null = null;
  private timer: NodeJS.Timeout | null = null;
  private busy = false;
  private last: string | null = null;
  private readonly tasks = new Map<string, string>();
  private readonly limitsDir: string;
  private readonly cgroupDir: string;
  private readonly now: () => number;
  private readonly log: (line: string) => void;
  private logged = new Set<string>();

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

  async poll(): Promise<void> {
    if (this.busy || !this.sink) return;
    this.busy = true;
    try {
      const lobby = await this.read();
      const text = JSON.stringify(lobby);
      if (text !== this.last) {
        this.last = text;
        this.sink.lobby(lobby);
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      if (!this.logged.has(msg)) {
        this.logged.add(msg);
        this.log(`hopper-hq could not read the gatekeeper's files: ${msg}`);
      }
    } finally {
      this.busy = false;
    }
  }

  private file(name: string): Promise<string> {
    return tail(join(this.o.dir, name));
  }

  private async limitDocs(): Promise<LimitDoc[]> {
    let names: string[];
    try {
      names = (await readdir(this.limitsDir)).filter((n) => n.endsWith('.json'));
    } catch {
      return [];
    }
    const docs = await Promise.all(names.map(async (n) => parseLimitDoc(await tail(join(this.limitsDir, n)))));
    return docs.filter((d): d is LimitDoc => d !== null);
  }

  private async read(): Promise<Lobby> {
    const now = this.now();
    const [lobbyText, limitsText, watchdogText, accountsText, seatsLogText, orderText, tasksText, docs, power] = await Promise.all([
      this.file('lobby.json'), this.file('limits.json'), this.file('watchdog-stopgap.log'), this.file('seats-accounts.json'),
      this.file('seats.jsonl'), this.file('seats-order.txt'), this.file('tasks.jsonl'), this.limitDocs(), readPower(this.cgroupDir),
    ]);
    const file = parseLobbyFile(lobbyText);
    const limits = parseLimits(limitsText);
    const watchdog = parseWatchdogTail(watchdogText);
    let accounts: Record<string, { email?: string; profile?: string }> = {};
    try {
      const parsed: unknown = JSON.parse(accountsText);
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) accounts = parsed as typeof accounts;
    } catch {
      // no accounts file: no seats
    }
    const order = orderText.split('\n').map((l) => l.trim()).filter(Boolean);
    const seats = buildSeats(docs, accounts, order, parseSeatsLog(seatsLogText), now);
    // A waiting launch names its profile; the accounts file maps a profile to its email.
    const emailOfProfile = new Map(Object.values(accounts).flatMap((a) => (a.profile && a.email ? [[a.profile, a.email] as const] : [])));
    const queue = (file?.queue ?? []).map(({ profile, ...w }) => ({ ...w, account: profile ? (emailOfProfile.get(profile) ?? profile) : null }));
    this.announceTasks(parseTaskPanes(tasksText));
    return {
      doorman: { name: 'Gordon' },
      gate: file?.gate ?? null,
      queue,
      seats,
      turnTo: seatTurn(seats),
      power: power ? { ...power, held: watchdog.held || limits.max === 0, pausedPanes: watchdog.pausedPanes } : null,
      cap: file || limits.max !== null ? { working: file?.working ?? null, max: limits.max } : null,
      updatedAt: file?.updatedAt ?? now,
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
```

- [ ] **Step 4: Run** — `npx vitest run test/adapters/gordon.test.ts` → PASS. If the third test's timer assertion is flaky on a slow machine, raise the waits to 60 ms and 30 ms.

- [ ] **Step 5: Commit** — `git add src/adapters/gatekeepers && git commit -m "Add the Gordon gatekeeper provider: one Lobby from his files, and each session's task by pane"`

---

### Task 5: The Lobby in the collector and the scene

**Files:**
- Modify: `src/collector.ts` (fields, `setLobby`, `lobby`, `localPanes`, `scene()`, `render()`, `lobbyDetail()`)
- Modify: `src/scene/types.ts` (`SCENE_VERSION = 7`, `LobbySummary`, `LobbyDetail`, `BuildingScene.lobby`, `Occupant.task`, `AttentionEntry.task`)
- Create: `src/scene/lobby.ts` (server-only sibling, like `build.ts`)
- Modify: `src/scene/build.ts` (`task` on occupant and entry; `buildScene` takes `lobby`)
- Test: `test/scene/lobby.test.ts`, `test/scene/build.test.ts` (version 7 test, snapshot), `test/collector.test.ts`

**Interfaces:**
- Produces: `Collector.setLobby(l: Lobby | null)`, `Collector.lobby(): Lobby | null`, `Collector.localPanes(): Map<string, string>`, `Collector.lobbyDetail(): LobbyDetail | null`; `buildLobbySummary(l: Lobby): LobbySummary`, `buildLobbyDetail(l: Lobby, views: readonly SessionView[]): LobbyDetail`.

- [ ] **Step 1: Add the scene types** to `src/scene/types.ts` (import `type Lobby, type Seat, type GateVerdict, type Waiting, type Power` from `../core/types.js` as `import type`):

```ts
/** What the façade says of the Lobby. */
export interface LobbySummary {
  waiting: number;
  seatsFull: number;
  /** Used memory as a percentage of the cap; null without a cap or a reading. */
  powerPct: number | null;
  held: boolean;
  paused: number;
  updatedAt: number;
}

/** A paused session, by the pane the watchdog named. */
export interface PausedSession {
  pane: string;
  sessionId: string | null;
  name: string | null;
}

/** The Lobby in detail: the gatekeeper's Lobby, cleaned, with the paused panes resolved to sessions. */
export interface LobbyDetail {
  version: typeof SCENE_VERSION;
  doorman: { name: string; sessionId: string | null };
  gate: GateVerdict | null;
  queue: Waiting[];
  seats: Seat[];
  turnTo: string | null;
  power: (Power & { paused: PausedSession[] }) | null;
  cap: { working: number | null; max: number | null } | null;
  updatedAt: number;
}
```

Set `SCENE_VERSION = 7`. In `BuildingScene`, after `terminal`: `/** The gatekeeper's Lobby; null when none is configured. */ lobby: LobbySummary | null;`. In `AttentionEntry`, after `account`: `/** The orchestrator's task id; null when none. */ task: string | null;`. In `Occupant`, after `account`: `task: string | null;`.

- [ ] **Step 2: Write the failing scene test** — `test/scene/lobby.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { newSession } from '../../src/core/reducer.js';
import type { Lobby } from '../../src/core/types.js';
import { toView } from '../../src/core/view.js';
import { buildLobbyDetail, buildLobbySummary } from '../../src/scene/lobby.js';
import { SCENE_VERSION } from '../../src/scene/types.js';

const NOW = 1_792_150_000_000;
const lobby: Lobby = {
  doorman: { name: 'Gordon' },
  gate: { go: false, text: 'ASPETTA: slice al 84%;\u202e', reasons: [{ kind: 'slice', text: 'slice al 84%' }], at: NOW - 1000 },
  queue: [{ id: 'G-270', name: 'G-270 segnali\u0007 a J', account: 'leonardo@example.com', since: NOW - 60_000, reason: null }],
  seats: [
    { account: 'luca@example.com', name: 'Luca', session: { usedPct: 2, resetsAt: null, readAt: NOW }, week: { usedPct: 86, resetsAt: null, readAt: NOW }, current: false, full: true, stale: false, turnable: true },
    { account: 'jacopo@example.com', name: 'Jacopo', session: null, week: null, current: true, full: false, stale: true, turnable: true },
  ],
  turnTo: null,
  power: { usedBytes: 36_000_000_000, maxBytes: 48_000_000_000, warnPct: 85, held: true, pausedPanes: ['wE:p1E', 'wZ:p9'] },
  cap: { working: 6, max: 7 },
  updatedAt: NOW - 500,
};
const ws = { cwd: '/w/app', repoRoot: '/w/app', repoName: 'app', worktree: false, branch: 'main', root: '/w/app' };
const views = [
  toView({ ...newSession('S1', NOW, ws), name: 'G-256 e2e', tmuxPane: 'wE:p1E' }, NOW),
  toView({ ...newSession('G0', NOW, ws), name: 'gordon', tmuxPane: null }, NOW),
];

describe('buildLobbySummary', () => {
  it('counts what the façade shows', () => {
    expect(buildLobbySummary(lobby)).toEqual({ waiting: 1, seatsFull: 1, powerPct: 75, held: true, paused: 2, updatedAt: NOW - 500 });
    expect(buildLobbySummary({ ...lobby, power: null }).powerPct).toBeNull();
    expect(buildLobbySummary({ ...lobby, power: { ...lobby.power!, maxBytes: null } }).powerPct).toBeNull();
  });
});

describe('buildLobbyDetail', () => {
  it('cleans every string, resolves paused panes to sessions, and finds the doorman by name', () => {
    const d = buildLobbyDetail(lobby, views);
    expect(d.version).toBe(SCENE_VERSION);
    expect(d.gate!.text).toBe('ASPETTA: slice al 84%;');
    expect(d.queue[0]!.name).toBe('G-270 segnali a J');
    expect(d.power!.paused).toEqual([{ pane: 'wE:p1E', sessionId: 'S1', name: 'G-256 e2e' }, { pane: 'wZ:p9', sessionId: null, name: null }]);
    expect(d.doorman).toEqual({ name: 'Gordon', sessionId: 'G0' });
    expect(d.seats.map((s) => s.name)).toEqual(['Luca', 'Jacopo']);
  });
});
```

Add to `test/scene/build.test.ts`, in the desks describe:

```ts
  it('carries a session\'s task to its desk and its attention entry', () => {
    const views = [view('a', ws('/w/api', 'main'), 'needs_you', { task: 'G-268' }), view('b', ws('/w/api', 'main'), 'working')];
    const { scene, floors } = render(views);
    expect(occupants(floors[0]!).map((o) => [o.sessionId, o.task])).toEqual([['a', 'G-268'], ['b', null]]);
    expect(scene.attention.needsYou[0]!.task).toBe('G-268');
    expect(scene.lobby).toBeNull();
  });
```

and change the version test to `describe('version 7'` with `expect(SCENE_VERSION).toBe(7)`, `[7, [], 0, [], [], 'tmux']`, and `desk.task` / `done.task` null added to its tuples.

- [ ] **Step 3: Run** — `npx vitest run test/scene/lobby.test.ts test/scene/build.test.ts` → FAIL.

- [ ] **Step 4: Write `src/scene/lobby.ts`**:

```ts
import type { SessionView } from '../core/view.js';
import type { GateVerdict, Lobby, Seat, Waiting } from '../core/types.js';
import { cleanOrNull, cleanText } from './text.js';
import { SCENE_VERSION, type LobbyDetail, type LobbySummary, type PausedSession } from './types.js';

/** What the façade's Lobby label counts. */
export function buildLobbySummary(l: Lobby): LobbySummary {
  const p = l.power;
  return {
    waiting: l.queue.length,
    seatsFull: l.seats.filter((s) => s.full).length,
    powerPct: p && p.maxBytes ? Math.round((p.usedBytes / p.maxBytes) * 100) : null,
    held: p?.held ?? false,
    paused: p?.pausedPanes.length ?? 0,
    updatedAt: l.updatedAt,
  };
}

const gateOf = (g: GateVerdict | null): GateVerdict | null =>
  g && { go: g.go, text: cleanText(g.text, 400), reasons: g.reasons.map((r) => ({ kind: r.kind, text: cleanText(r.text) })), at: g.at };

const waitingOf = (w: Waiting): Waiting => ({
  id: cleanText(w.id, 64),
  name: cleanText(w.name),
  account: cleanOrNull(w.account),
  since: w.since,
  reason: w.reason && { kind: w.reason.kind, text: cleanText(w.reason.text) },
});

const seatOf = (s: Seat): Seat => ({ ...s, account: cleanText(s.account), name: cleanText(s.name, 40) });

/** The paused panes, each with the live session in it when the building knows one. */
function pausedOf(panes: readonly string[], views: readonly SessionView[]): PausedSession[] {
  return panes.map((pane) => {
    const v = views.find((x) => x.effectiveState !== 'ended' && x.tmuxPane === pane);
    return { pane: cleanText(pane, 32), sessionId: v?.id ?? null, name: v ? cleanOrNull(v.name) : null };
  });
}

/** The Lobby in detail, every string cleaned, the doorman's own session found by its name. */
export function buildLobbyDetail(l: Lobby, views: readonly SessionView[]): LobbyDetail {
  const doorman = views.find((v) => v.effectiveState !== 'ended' && v.name?.toLowerCase() === l.doorman.name.toLowerCase());
  return {
    version: SCENE_VERSION,
    doorman: { name: cleanText(l.doorman.name, 40), sessionId: doorman?.id ?? null },
    gate: gateOf(l.gate),
    queue: l.queue.map(waitingOf),
    seats: l.seats.map(seatOf),
    turnTo: cleanOrNull(l.turnTo),
    power: l.power && { ...l.power, pausedPanes: l.power.pausedPanes.map((p) => cleanText(p, 32)), paused: pausedOf(l.power.pausedPanes, views) },
    cap: l.cap,
    updatedAt: l.updatedAt,
  };
}
```

In `src/scene/build.ts`: add `task: cleanOrNull(v.task, 64),` after `account:` in both `occupantOf` and `entryOf`; import `buildLobbySummary` from `./lobby.js` and `type Lobby` from `../core/types.js`; give `buildScene` a fifth parameter `lobby: Lobby | null = null` and set `lobby: lobby && buildLobbySummary(lobby),` in the returned scene.

In `src/collector.ts`: field `private lobbyState: Lobby | null = null;` and

```ts
  /** The gatekeeper's Lobby, as its provider last gave it; null without one. A change is news to every browser. */
  setLobby(lobby: Lobby | null): void {
    if (JSON.stringify(lobby) === JSON.stringify(this.lobbyState)) return;
    this.lobbyState = lobby;
    for (const fn of this.listeners) fn();
  }

  lobby(): Lobby | null {
    return this.lobbyState;
  }

  /** Each local live session's pane: what a gatekeeper names sessions by. */
  localPanes(): Map<string, string> {
    const out = new Map<string, string>();
    for (const s of this.sessions.values()) if (s.state !== 'ended' && s.location === 'local' && s.tmuxPane) out.set(s.id, s.tmuxPane);
    return out;
  }

  /** The Lobby in detail for the browser; null without a gatekeeper. */
  lobbyDetail(): LobbyDetail | null {
    return this.lobbyState && buildLobbyDetail(this.lobbyState, this.liveViews());
  }
```

and pass `this.lobbyState` as the fifth argument in both `buildScene` calls (`scene()` and `render()`). Import `buildLobbyDetail` from `./scene/lobby.js`, `type Lobby` from `./core/types.js`, `type LobbyDetail` from `./scene/types.js`.

Add to `test/collector.test.ts`:

```ts
describe('the Lobby', () => {
  it('keeps the gatekeeper\'s Lobby, tells the listeners of a change only, and serves its detail', async () => {
    const c = collector();
    let told = 0;
    c.onChange(() => told++);
    const lobby = { doorman: { name: 'Gordon' }, gate: null, queue: [], seats: [], turnTo: null, power: null, cap: { working: 1, max: 7 }, updatedAt: NOW };
    expect(c.scene().lobby).toBeNull();
    c.setLobby(lobby);
    c.setLobby({ ...lobby });
    expect(told).toBe(1);
    expect(c.scene().lobby).toEqual({ waiting: 0, seatsFull: 0, powerPct: null, held: false, paused: 0, updatedAt: NOW });
    expect(c.lobbyDetail()).toMatchObject({ version: 7, doorman: { name: 'Gordon', sessionId: null }, cap: { working: 1, max: 7 } });
    await c.ingest(hook({ type: 'session.seen', workspace: { cwd: '/w/orders-api', repoRoot: '/w/orders-api', repoName: 'orders-api', worktree: false, branch: 'main' }, tmuxPane: 'wK:p2' }));
    expect([...c.localPanes()]).toEqual([['S1', 'wK:p2']]);
  });
});
```

- [ ] **Step 5: Run** — `npx vitest run test/scene test/collector.test.ts -u`, read the snapshot diff: only `"version": 7`, `"lobby": null`, `"task": null` lines. `npx tsc -p tsconfig.json --noEmit` → clean (the UI fixtures break in Task 8; `tsc -p tsconfig.json` does not cover `ui/`).

- [ ] **Step 6: Commit** — `git add src/collector.ts src/scene test/scene test/collector.test.ts && git commit -m "Put the gatekeeper's Lobby in the scene, and each session's task on its desk"`

---

### Task 6: `GET /api/lobby`

**Files:**
- Modify: `src/server/http.ts` (routes, `getLobby`)
- Test: `test/server/scene-api.test.ts`

- [ ] **Step 1: Write the failing test** — append to `test/server/scene-api.test.ts`:

```ts
describe('GET /api/lobby', () => {
  it('answers 404 without a gatekeeper, and the detail with one, to the token and the cookie', async () => {
    expect((await call(port, { path: '/api/lobby', headers: bearer(TOKEN) })).status).toBe(404);
    collector.setLobby({ doorman: { name: 'Gordon' }, gate: null, queue: [], seats: [], turnTo: null, power: null, cap: null, updatedAt: NOW });
    try {
      for (const headers of [bearer(TOKEN), { cookie }]) {
        const r = await call(port, { path: '/api/lobby', headers });
        expect(r.status).toBe(200);
        expect(r.json).toEqual(collector.lobbyDetail());
      }
      expect((await call(port, { path: '/api/lobby' })).status).toBe(401);
    } finally {
      collector.setLobby(null);
    }
  });
});
```

- [ ] **Step 2: Run** — `npx vitest run test/server/scene-api.test.ts -t lobby` → FAIL (404 for every call, or 404 route).

- [ ] **Step 3: Add the route** in `routes()` after `/api/floor`:

```ts
    { methods: GET, path: '/api/lobby', auth: 'read', run: ({ res }) => getLobby(d, res) },
```

and

```ts
/** The gatekeeper's Lobby in detail; 404 when no gatekeeper is configured. */
function getLobby(d: Deps, res: ServerResponse): void {
  const lobby = d.collector.lobbyDetail();
  if (!lobby) return send(res, 404, { error: 'No gatekeeper is configured' });
  send(res, 200, lobby);
}
```

- [ ] **Step 4: Run** — `npx vitest run test/server` → PASS.

- [ ] **Step 5: Commit** — `git add src/server/http.ts test/server/scene-api.test.ts && git commit -m "Serve the Lobby in detail at /api/lobby"`

---

### Task 7: Choosing the gatekeeper: config, daemon, CLI

**Files:**
- Modify: `src/config.ts` (`resolveGatekeeper`), `src/daemon.ts`, `src/cli.ts`
- Test: `test/config.test.ts`, `test/cli-up.test.ts`, `test/daemon.test.ts`

**Interfaces:**
- Produces: `type GatekeeperChoice = { kind: 'none' } | { kind: 'gordon'; dir: string | null }`, `resolveGatekeeper(value: string | undefined, env): GatekeeperChoice`; `DaemonOptions.gatekeeper?: GatekeeperChoice`; `--gatekeeper none|gordon[=DIR]` on `up` and `start`; `HOPPER_HQ_GATEKEEPER`.

- [ ] **Step 1: Write the failing tests.** In `test/config.test.ts`:

```ts
describe('resolveGatekeeper', () => {
  it('takes the option, else HOPPER_HQ_GATEKEEPER, else none; gordon with an optional directory', () => {
    expect(resolveGatekeeper(undefined, {})).toEqual({ kind: 'none' });
    expect(resolveGatekeeper('none', { HOPPER_HQ_GATEKEEPER: 'gordon' })).toEqual({ kind: 'none' });
    expect(resolveGatekeeper(undefined, { HOPPER_HQ_GATEKEEPER: 'gordon' })).toEqual({ kind: 'gordon', dir: null });
    expect(resolveGatekeeper('gordon=/srv/gordon', {})).toEqual({ kind: 'gordon', dir: '/srv/gordon' });
    expect(() => resolveGatekeeper('alfred', {})).toThrow(/Unknown gatekeeper: alfred/);
    expect(() => resolveGatekeeper('gordon=', {})).toThrow(/Unknown gatekeeper/);
  });
});
```

(import `resolveGatekeeper` from `../src/config.js`). In `test/cli-up.test.ts`, extend the first test's `main([...])` with `'--gatekeeper', 'gordon=/srv/g'` and the expected `bg.calls` args with `'--gatekeeper', 'gordon=/srv/g'` right after the `--terminal` pair; and the help assertion to contain `[--gatekeeper none|gordon[=DIR]]`. In `test/daemon.test.ts` add:

```ts
  it('serves the Lobby when a gatekeeper is configured, reading its directory', async () => {
    const gordon = await tmp('shq-gordon-');
    await writeFile(join(gordon, 'limits.json'), '{"sessions_max": 3}');
    const d = await startDaemon({ port: 0, dataDir: await tmp('shq-data-'), claudeDir: await tmp('shq-claude-'), watchFiles: false, log: quiet, gatekeeper: { kind: 'gordon', dir: gordon } });
    try {
      const deadline = Date.now() + 3000;
      let lobby: { cap?: { max?: number } } | null = null;
      while (Date.now() < deadline && lobby?.cap?.max !== 3) {
        lobby = await callDaemon(d.dataDir, 'GET', '/api/lobby', 500);
        await new Promise((r) => setTimeout(r, 50));
      }
      expect(lobby?.cap?.max).toBe(3);
    } finally {
      await d.stop();
    }
  });
```

(`callDaemon` is already imported in that file or import it from `../src/client.js`; `tmp`, `quiet`, `writeFile`, `join` exist there).

- [ ] **Step 2: Run** — `npx vitest run test/config.test.ts test/cli-up.test.ts test/daemon.test.ts` → FAIL.

- [ ] **Step 3: Implement.** `src/config.ts`:

```ts
export type GatekeeperChoice = { kind: 'none' } | { kind: 'gordon'; dir: string | null };

/** The gatekeeper named by an option or HOPPER_HQ_GATEKEEPER ('none', 'gordon', 'gordon=DIR'); none when neither says. */
export function resolveGatekeeper(value: string | undefined, env: NodeJS.ProcessEnv = process.env): GatekeeperChoice {
  const word = value ?? env.HOPPER_HQ_GATEKEEPER ?? 'none';
  if (word === 'none') return { kind: 'none' };
  const m = /^gordon(?:=(.+))?$/.exec(word);
  if (!m) throw new Error(`Unknown gatekeeper: ${word} (none, gordon or gordon=DIR)`);
  return { kind: 'gordon', dir: m[1] ?? null };
}
```

`src/daemon.ts`: `DaemonOptions.gatekeeper?: GatekeeperChoice` (doc: `/** The orchestrator whose Lobby the building shows (default none). */`); after the herdr adapter:

```ts
  const gate = opts.gatekeeper ?? resolveGatekeeper(undefined);
  const gatekeeper = opts.demo || gate.kind === 'none' ? null : new GordonProvider({ dir: gate.dir ?? DEFAULT_GORDON_DIR, panes: () => collector.localPanes(), log });
  gatekeeper?.start({ lobby: (l) => collector.setLobby(l), task: (sessionId, task) => void collector.ingest({ type: 'task', sessionId, ts: Date.now(), source: 'gatekeeper', task }) });
  if (gatekeeper) log(`hopper-hq shows the Lobby of ${gate.kind} (${gate.dir ?? DEFAULT_GORDON_DIR})`);
```

Add `'gatekeeper'` to the collector's `acceptSources` (`['hook', 'fs', 'terminal', 'gatekeeper']`), and `gatekeeper?.stop();` in `stop` after `herdr?.stop()`. Imports: `GordonProvider, DEFAULT_GORDON_DIR` from `./adapters/gatekeepers/gordon.js`, `resolveGatekeeper, type GatekeeperChoice` from `./config.js`.

`src/cli.ts`: in HELP add `[--gatekeeper none|gordon[=DIR]]` after `[--terminal auto|tmux|herdr]` on `up` and `start`; add `gatekeeper: { type: 'string' }` to both option sets; in `cmdUp`, after the terminal line: `if (values.gatekeeper !== undefined) startArgs.push('--gatekeeper', gatekeeperOption(values.gatekeeper));` where

```ts
/** The --gatekeeper value, checked: the word is passed on as given. */
function gatekeeperOption(value: string): string {
  try {
    resolveGatekeeper(value, {});
    return value;
  } catch (err) {
    throw new UsageError((err as Error).message);
  }
}
```

and in `cmdStart` pass `gatekeeper: values.gatekeeper === undefined ? undefined : resolveGatekeeper(gatekeeperOption(values.gatekeeper), {})`.

- [ ] **Step 4: Run** — `npx vitest run test/config.test.ts test/cli-up.test.ts test/daemon.test.ts test/cli.test.ts` → PASS; `npx tsc -p tsconfig.json --noEmit` → clean.

- [ ] **Step 5: Commit** — `git add src/config.ts src/daemon.ts src/cli.ts test/config.test.ts test/cli-up.test.ts test/daemon.test.ts && git commit -m "Choose the gatekeeper with --gatekeeper none|gordon[=DIR]"`

---

### Task 8: The Lobby in the browser: route, façade button, panel, task on the desk

**Files:**
- Modify: `ui/lib/route.ts` (`Route.lobby`), `ui/lib/api.ts` (`fetchLobby`), `ui/components/Facade.svelte` (the Lobby group), `ui/App.svelte`, `ui/components/DeskPanel.svelte` (Task fact), `ui/components/TopBar.svelte` (no change), `ui/lib/words.ts` (`lobbyMeta`)
- Create: `ui/components/LobbyPanel.svelte`
- Modify fixtures: `ui/test/helpers/fixtures.ts`, `ui/test/renderer/fixtures.ts` (add `task: null` to occupants and entries, `lobby: null` to the scene)
- Test: `ui/test/lib/route.test.ts`, `ui/test/lib/api.test.ts`, `ui/test/components/Facade.test.ts`, `ui/test/components/LobbyPanel.test.ts`, `ui/test/components/DeskPanel.test.ts`, `ui/test/app.test.ts`

**Interfaces:**
- `Route` gains `lobby: boolean`; `parseHash('#/lobby')` → `{ floor: null, desk: null, run: null, lobby: true }`; `toHash({ lobby: true })` → `'#/lobby'`. Every existing `{ floor, desk, run }` literal gains `lobby: false` (the type makes the compiler list them).
- `fetchLobby(fetchFn = fetch): Promise<{ ok: true; lobby: LobbyDetail } | { ok: false; status: number; error: string }>`.
- `lobbyMeta(l: LobbySummary): Meta[]` → `[{ text: '3 waiting', tone: 'needs' }, { text: '1 seat full', tone: 'nosignal' }, { text: 'power 75%', tone: null }, { text: 'launches held', tone: 'needs' }]`, each only when non-zero / true; `'power 75%'` gets tone `'needs'` at or over the mark.
- `Facade` gets `lobby: LobbySummary | null` and `onLobby: () => void`; with a lobby the `<g class="lobby">` becomes `role="button" tabindex="0"` with `aria-label="Lobby: 3 waiting, 1 seat full, power 75%"` and the label's metas; without, as today.
- `LobbyPanel` props: `{ lobby: LobbyDetail | null | undefined; now: number; onBack: () => void; onDesk: (sessionId: string) => void }` (undefined: loading; null: no gatekeeper).

- [ ] **Step 1: Write the failing tests.**

`ui/test/lib/route.test.ts`, add:

```ts
  it('reads and writes the lobby', () => {
    expect(parseHash('#/lobby')).toEqual({ floor: null, desk: null, run: null, lobby: true });
    expect(toHash({ floor: null, lobby: true })).toBe('#/lobby');
    expect(toHash({ floor: 'repo:/w', lobby: true })).toBe('#/floor/repo%3A%2Fw');
  });
```

`ui/test/lib/api.test.ts`, add (mirroring the file's existing fake-fetch style):

```ts
describe('fetchLobby', () => {
  it('returns the detail, says when there is no gatekeeper, and never rejects', async () => {
    const detail = { version: 7, doorman: { name: 'Gordon', sessionId: null }, gate: null, queue: [], seats: [], turnTo: null, power: null, cap: null, updatedAt: 1 };
    expect(await fetchLobby(async () => new Response(JSON.stringify(detail), { status: 200 }))).toEqual({ ok: true, lobby: detail });
    expect(await fetchLobby(async () => new Response('{"error":"No gatekeeper is configured"}', { status: 404 }))).toEqual({ ok: false, status: 404, error: 'No gatekeeper is configured' });
    expect(await fetchLobby(async () => new Response('', { status: 401 }))).toEqual({ ok: false, status: 401, error: SIGNED_OUT });
    expect(await fetchLobby(async () => { throw new Error('down'); })).toEqual({ ok: false, status: 0, error: 'The daemon is not answering' });
  });
});
```

`ui/test/components/LobbyPanel.test.ts`:

```ts
import { afterEach, describe, expect, it, vi } from 'vitest';
import LobbyPanel from '../../components/LobbyPanel.svelte';
import type { LobbyDetail } from '../../../src/scene/types';
import { NOW } from '../helpers/fixtures';
import { cleanup, click, render, text } from '../helpers/render';

afterEach(cleanup);

const detail: LobbyDetail = {
  version: 7,
  doorman: { name: 'Gordon', sessionId: 'G0' },
  gate: { go: false, text: 'ASPETTA: slice al 84%; ultimo avvio 40 s fa;', reasons: [{ kind: 'slice', text: 'slice al 84%' }, { kind: 'pacing', text: 'ultimo avvio 40 s fa' }], at: NOW - 12_000 },
  queue: [{ id: 'G-270', name: 'G-270 segnali a J', account: 'leonardo@example.com', since: NOW - 4 * 60_000, reason: { kind: 'slice', text: 'slice al 84%' } }],
  seats: [
    { account: 'jacopo@example.com', name: 'Jacopo', session: { usedPct: 6, resetsAt: null, readAt: NOW }, week: { usedPct: 41, resetsAt: null, readAt: NOW }, current: true, full: false, stale: false, turnable: true },
    { account: 'luca@example.com', name: 'Luca', session: { usedPct: 2, resetsAt: null, readAt: NOW }, week: { usedPct: 86, resetsAt: null, readAt: NOW }, current: false, full: true, stale: false, turnable: true },
    { account: 'pietro@example.com', name: 'Pietro', session: null, week: null, current: false, full: false, stale: true, turnable: true },
  ],
  turnTo: 'francesco@example.com',
  power: { usedBytes: 34.6 * 2 ** 30, maxBytes: 44.7 * 2 ** 30, warnPct: 85, held: false, pausedPanes: ['wE:p1E'], paused: [{ pane: 'wE:p1E', sessionId: 'S1', name: 'G-256 e2e' }] },
  cap: { working: 6, max: 7 },
  updatedAt: NOW - 12_000,
};

function panel(lobby: LobbyDetail | null | undefined = detail) {
  const onBack = vi.fn();
  const onDesk = vi.fn();
  const target = render(LobbyPanel, { lobby, now: NOW, onBack, onDesk });
  const section = (h: string) => [...target.querySelectorAll('section')].find((s) => text(s.querySelector('h3')) === h)!;
  return { target, onBack, onDesk, section };
}

describe('LobbyPanel', () => {
  it('heads the panel with the doorman, the age of the reading and the cap', () => {
    const { target } = panel();
    expect(text(target.querySelector('.eyebrow'))).toBe('Lobby');
    expect(text(target.querySelector('h2'))).toBe('The gate of Gordon');
    expect(text(target.querySelector('.p-sub'))).toBe('read 12s ago · 1 waiting · 6 / 7 working');
  });

  it('shows the verdict with its reasons, red when it is a wait', () => {
    const { section } = panel();
    const gate = section('Gate');
    expect(gate.querySelector('.verdict')!.classList.contains('wait')).toBe(true);
    expect([...gate.querySelectorAll('li')].map(text)).toEqual(['slice: slice al 84%', 'pacing: ultimo avvio 40 s fa']);
  });

  it('lists the queue with each reason and wait, the seats with both windows, the turn, and the power with the paused sessions', () => {
    const { section, onDesk } = panel();
    expect([...section('Waiting outside').querySelectorAll('li')].map(text)).toEqual(['G-270 segnali a J · leonardo@example.com · 4m · slice al 84%']);
    expect([...section('Seats').querySelectorAll('li')].map(text)).toEqual([
      '▸ Jacopo 5h 6% · 7d 41%',
      'Luca 5h 2% · 7d 86% · full',
      'Pietro no fresh reading',
    ]);
    expect(text(section('Seats').querySelector('.turn'))).toBe('Turn → francesco@example.com');
    expect(text(section('Power').querySelector('.gauge-text'))).toBe('34.6 / 44.7 GiB (77%) · mark 85%');
    const paused = section('Power').querySelector('.paused button')!;
    expect(text(paused)).toBe('G-256 e2e (wE:p1E)');
    click(paused);
    expect(onDesk).toHaveBeenCalledWith('S1');
  });

  it('says when the gate has not spoken, when nothing waits, and when there is no gatekeeper or the Lobby is loading', () => {
    const { section } = panel({ ...detail, gate: null, queue: [] });
    expect(text(section('Gate').querySelector('.p-note'))).toBe('No word from the gate.');
    expect(text(section('Waiting outside').querySelector('.p-note'))).toBe('Nobody is waiting outside.');
    cleanup();
    expect(text(panel(null).target.querySelector('.p-text'))).toBe('No gatekeeper is configured: the Lobby is empty.');
    cleanup();
    expect(text(panel(undefined).target.querySelector('.p-note'))).toBe('Loading the Lobby…');
  });
});
```

`ui/test/components/Facade.test.ts`, add:

```ts
  it('makes the Lobby a button with its counts when a gatekeeper is configured, and leaves it as decor without', () => {
    const onLobby = vi.fn();
    const target = render(Facade, { floors: makeScene().floors, selected: null, lobby: { waiting: 3, seatsFull: 1, powerPct: 75, held: true, paused: 2, updatedAt: NOW }, onFloor: vi.fn(), onDesk: vi.fn(), onLobby });
    const lobby = target.querySelector('g.lobby')!;
    expect(lobby.getAttribute('role')).toBe('button');
    expect(lobby.getAttribute('aria-label')).toBe('Lobby: 3 waiting, 1 seat full, power 75%, launches held');
    expect(text(lobby.querySelector('.t-meta'))).toBe('3 waiting 1 seat full power 75% launches held');
    click(lobby);
    expect(onLobby).toHaveBeenCalled();
    cleanup();
    const plain = render(Facade, { floors: makeScene().floors, selected: null, lobby: null, onFloor: vi.fn(), onDesk: vi.fn(), onLobby });
    expect(plain.querySelector('g.lobby')!.getAttribute('role')).toBeNull();
  });
```

(`Facade.test.ts` already imports `render`, `text`, `click`, `cleanup`, `vi`, `makeScene`, `NOW`; add what is missing.)

`ui/test/components/DeskPanel.test.ts`, add:

```ts
  it('names the task the desk works on, when it has one', () => {
    const { facts } = panel(CHECKOUT, 'oa-c3', NOW, (d) => (d.task = 'G-268'));
    expect(facts().Task).toBe('G-268');
    cleanup();
    expect(panel(CHECKOUT, 'oa-c3').facts().Task).toBeUndefined();
  });
```

`ui/test/app.test.ts`, add:

```ts
  it('opens the Lobby from its route, with a crumb, and asks the daemon for its detail', async () => {
    location.hash = '#/lobby';
    const fetchLobby = vi.fn(async () => ({ ok: true as const, lobby: { version: 7, doorman: { name: 'Gordon', sessionId: null }, gate: null, queue: [], seats: [], turnTo: null, power: null, cap: null, updatedAt: NOW } }));
    const scene = makeScene();
    scene.lobby = { waiting: 0, seatsFull: 0, powerPct: null, held: false, paused: 0, updatedAt: NOW };
    const { target, crumbs } = app(fakeStore({ scene }), { api: { focusSession: vi.fn(), markSeen: vi.fn(), fetchLobby } });
    await settle();
    expect(crumbs()).toBe('Building / Lobby');
    expect(fetchLobby).toHaveBeenCalled();
    expect(text(target.querySelector('.panel h2'))).toBe('The gate of Gordon');
  });
```

- [ ] **Step 2: Run** — `npx vitest run ui/test` → FAIL (types and modules).

- [ ] **Step 3: Implement.**

`ui/lib/route.ts`: add `lobby: boolean` to `Route`; `BUILDING` gets `lobby: false`; `parseHash`: `if (/^#?\/lobby$/.test(hash)) return { ...BUILDING, lobby: true };` before the floor match, and every returned route gets `lobby: false`; `toHash`: `if (!r.floor) return r.lobby ? '#/lobby' : '#/';` with `lobby?: boolean` on its parameter.

`ui/lib/api.ts`:

```ts
import type { LobbyDetail } from '../../src/scene/types';
export type LobbyResult = { ok: true; lobby: LobbyDetail } | { ok: false; status: number; error: string };

/** The Lobby in detail. 404 means no gatekeeper; the panel says so. Never rejects. */
export async function fetchLobby(fetchFn: Fetch = fetch): Promise<LobbyResult> {
  let res: Response;
  try {
    res = await fetchFn('/api/lobby', { credentials: 'same-origin' });
  } catch {
    return { ok: false, status: 0, error: 'The daemon is not answering' };
  }
  if (res.status === 401) return { ok: false, status: 401, error: SIGNED_OUT };
  const body = (await res.json().catch(() => null)) as (LobbyDetail & { error?: unknown }) | null;
  if (res.ok && body && typeof body.updatedAt === 'number' && Array.isArray(body.seats)) return { ok: true, lobby: body };
  const error = typeof body?.error === 'string' ? cleanText(body.error) : '';
  return { ok: false, status: res.status, error: error || `The daemon answered ${res.status}` };
}
```

`ui/lib/words.ts`:

```ts
/** What the façade's Lobby label says: the counts worth a glance, nothing when all is quiet. */
export function lobbyMeta(l: LobbySummary): Meta[] {
  const metas: Meta[] = [];
  if (l.waiting) metas.push({ text: `${l.waiting} waiting`, tone: 'needs' });
  if (l.seatsFull) metas.push({ text: `${plural(l.seatsFull, 'seat full', 'seats full')}`, tone: 'nosignal' });
  if (l.powerPct !== null) metas.push({ text: `power ${l.powerPct}%`, tone: l.powerPct >= 85 ? 'needs' : null });
  if (l.held) metas.push({ text: 'launches held', tone: 'needs' });
  return metas;
}

/** The Lobby for a screen reader: 'Lobby: 3 waiting, 1 seat full, power 75%, launches held'. */
export function lobbyLabel(l: LobbySummary): string {
  const parts = lobbyMeta(l).map((m) => m.text);
  return parts.length ? `Lobby: ${parts.join(', ')}` : 'Lobby';
}
```

(import `LobbySummary` with the other scene types; `plural` is in the file).

`ui/components/Facade.svelte`: props `lobby: LobbySummary | null` and `onLobby: () => void`; replace the lobby group:

```svelte
  {#if lobby}
    <g class="lobby floor" role="button" tabindex="0" aria-label={lobbyLabel(lobby)} onclick={() => onLobby()} onkeydown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onLobby(); } }}>
      <title>Lobby</title>
      {@render solid(model.lobby.wall, 'wall')}
      {#each model.lobby.windows as quad, i (i)}<polygon class="sfill st-empty" points={quad} />{/each}
      {#each model.lobby.doors as quad, i (i)}<polygon class="door" points={quad} />{/each}
      <polygon class="sfill st-empty" points={model.lobby.side} />
      {@render label(model.lobby.label, 'L', 'Lobby', lobbyMeta(lobby))}
    </g>
  {:else}
    <g class="lobby">
      …the group as it is today…
    </g>
  {/if}
```

(import `lobbyLabel, lobbyMeta` from `../lib/words`; the `.floor` class gives it the cursor and the hover ring. The label snippet already renders metas.)

`ui/components/LobbyPanel.svelte`:

```svelte
<script lang="ts">
  import { formatAgo } from '../../src/scene/text';
  import type { LobbyDetail, PausedSession } from '../../src/scene/types';
  import { singleClick } from '../lib/click';
  import { plural } from '../lib/words';

  /**
   * The gatekeeper's Lobby in words: the gate's last verdict, the launches waiting outside, the seats with their two
   * allowances and the turn to take, the power against its cap with the sessions the watchdog paused. It is also what a
   * browser without WebGL gets of the Lobby.
   */
  interface Props {
    /** undefined while loading, null when no gatekeeper is configured. */
    lobby: LobbyDetail | null | undefined;
    now: number;
    onBack: () => void;
    onDesk: (sessionId: string) => void;
  }
  let { lobby, now, onBack, onDesk }: Props = $props();

  const GIB = 2 ** 30;
  const gib = (bytes: number) => (bytes / GIB).toFixed(1);
  const pct = (used: number, max: number | null) => (max ? Math.round((used / max) * 100) : null);
  const sub = $derived.by(() => {
    if (!lobby) return '';
    const parts = [`read ${formatAgo(now - lobby.updatedAt)} ago`, plural(lobby.queue.length, 'waiting', 'waiting')];
    if (lobby.cap) parts.push(`${lobby.cap.working ?? '?'} / ${lobby.cap.max ?? '?'} working`);
    return parts.join(' · ');
  });
  const seatLine = (s: LobbyDetail['seats'][number]) =>
    s.stale && !s.session && !s.week ? `${s.name} no fresh reading` : `${s.name} 5h ${Math.round(s.session?.usedPct ?? 0)}% · 7d ${Math.round(s.week?.usedPct ?? 0)}%${s.full ? ' · full' : ''}${s.stale ? ' · stale' : ''}`;
  const pausedLabel = (p: PausedSession) => `${p.name ?? 'a session'} (${p.pane})`;
</script>

<button type="button" class="linkbtn back" onclick={singleClick(onBack)}>← Building</button>
<div>
  <p class="eyebrow">Lobby</p>
  <h2 tabindex="-1" class="p-title">{lobby ? `The gate of ${lobby.doorman.name}` : 'The Lobby'}</h2>
  {#if lobby}<p class="p-sub">{sub}</p>{/if}
</div>
{#if lobby === undefined}
  <p class="p-note">Loading the Lobby…</p>
{:else if lobby === null}
  <p class="p-text">No gatekeeper is configured: the Lobby is empty.</p>
{:else}
  <section>
    <h3 class="p-h3">Gate</h3>
    {#if lobby.gate}
      <p class="verdict" class:wait={!lobby.gate.go}>{lobby.gate.text}</p>
      {#if lobby.gate.reasons.length > 0}
        <ul class="list">{#each lobby.gate.reasons as r, i (i)}<li>{r.kind}: {r.text}</li>{/each}</ul>
      {/if}
    {:else}
      <p class="p-note">No word from the gate.</p>
    {/if}
  </section>
  <section>
    <h3 class="p-h3">Waiting outside</h3>
    {#if lobby.queue.length > 0}
      <ul class="list">
        {#each lobby.queue as w (w.id)}
          <li>{w.name}{w.account ? ` · ${w.account}` : ''} · {formatAgo(now - w.since)}{w.reason ? ` · ${w.reason.text}` : ''}</li>
        {/each}
      </ul>
    {:else}
      <p class="p-note">Nobody is waiting outside.</p>
    {/if}
  </section>
  <section>
    <h3 class="p-h3">Seats</h3>
    <ul class="list">
      {#each lobby.seats as s (s.account)}
        <li class:full={s.full} class:stale={s.stale} class:current={s.current}>{s.current ? '▸ ' : ''}{seatLine(s)}</li>
      {/each}
    </ul>
    {#if lobby.turnTo}<p class="turn">Turn → {lobby.turnTo}</p>{/if}
  </section>
  <section>
    <h3 class="p-h3">Power</h3>
    {#if lobby.power}
      <p class="gauge-text">{gib(lobby.power.usedBytes)} / {lobby.power.maxBytes === null ? 'no cap' : `${gib(lobby.power.maxBytes)} GiB (${pct(lobby.power.usedBytes, lobby.power.maxBytes)}%)`} · mark {lobby.power.warnPct}%</p>
      {#if lobby.power.held}<p class="p-note warn">Launches held by the watchdog.</p>{/if}
      {#if lobby.power.paused.length > 0}
        <ul class="list paused">
          {#each lobby.power.paused as p (p.pane)}
            <li>
              {#if p.sessionId}<button type="button" class="linkbtn" onclick={singleClick(() => onDesk(p.sessionId!))}>{pausedLabel(p)}</button>{:else}{pausedLabel(p)}{/if}
            </li>
          {/each}
        </ul>
      {/if}
    {:else}
      <p class="p-note">No reading of the sessions' memory.</p>
    {/if}
  </section>
{/if}

<style>
  .back { align-self: flex-start; }
  .list { list-style: none; margin: 0; padding: 0; display: grid; gap: 6px; font-family: var(--font-mono); font-size: 12.5px; }
  .verdict { margin: 0; font-family: var(--font-mono); font-size: 12.5px; overflow-wrap: anywhere; }
  .verdict.wait, .warn { color: var(--needs-ink); font-weight: 500; }
  .full { color: var(--needs-ink); }
  .stale { color: var(--muted); }
  .turn { margin: 0; color: var(--done-ink); font-weight: 600; }
  .gauge-text { margin: 0; font-family: var(--font-mono); font-size: 12.5px; }
</style>
```

Note `gauge-text` for a cap: `34.6 / 44.7 GiB (77%) · mark 85%`; adjust the template so the text reads exactly that (the `GiB` word follows the max).

`ui/components/DeskPanel.svelte`: before the `Repo` fact: `{#if desk.task}<dt>Task</dt><dd>{desk.task}</dd>{/if}`.

`ui/App.svelte`: `api` gains `fetchLobby`; state `let lobbyDetail = $state<LobbyDetail | null | undefined>(undefined);`; an effect that, while `route.lobby`, calls `api.fetchLobby()` now and every 5 s and sets `lobbyDetail` (`null` on a 404, the detail on ok, unchanged on other errors with a toast once); crumbs: when `route.lobby`, `[Building, { label: 'Lobby', route }]`; the stage shows the façade (as for the building) with `lobby={scene?.lobby ?? null}` and `onLobby={() => navigate({ floor: null, desk: null, run: null, lobby: true })}`; the panel shows `<LobbyPanel lobby={lobbyDetail} now={clock} onBack={() => navigate({ floor: null, desk: null, run: null, lobby: false })} onDesk={(id) => { const key = floorOfSession(id); if (key) navigate({ floor: key, desk: id, run: null, lobby: false }); }} />` where `floorOfSession` finds the floor whose `windows` name the session (`scene.floors.find((f) => f.windows.some((w) => w.sessionId === id))?.key ?? null`). `navigate` keeps `lobby` (`const to = next.floor === null ? { floor: null, desk: null, run: null, lobby: next.lobby ?? false } : { ...next, lobby: false }`) and `moved` compares `lobby` too; `onHashChange` compares it too.

Fixtures: `ui/test/helpers/fixtures.ts` occupant and entry get `task: d.task ?? null` (add `task?: string` to `DeskSpec`), `makeScene` gets `lobby: null`; `ui/test/renderer/fixtures.ts` occupant gets `task: null`.

- [ ] **Step 4: Run** — `npm run typecheck` → clean; `npx vitest run` → all green but the known `cli-open` one. Fix any string mismatch in the LobbyPanel tests by changing the template, not the test, unless the test's wording is wrong.

- [ ] **Step 5: Commit** — `git add ui && git commit -m "Open the Lobby from the façade: its route, its panel, and the task on each desk"`

---

### Task 9: Documentation, a run with real data, and the report line for Gordon

**Files:**
- Modify: `README.md` (a `## The Lobby` section before `## The Claude Code mod`, and the `start` row of the commands table)

- [ ] **Step 1: Write the README section:**

```markdown
## The Lobby

On a machine that several accounts and an orchestrator share, the ground floor shows what happens outside the building: the orchestrator's gate and the launches it keeps waiting, each with its reason; one elevator per account with its five-hour and seven-day allowances, and the turn to take when the one in use is full; the sessions' memory against their cap, with the watchdog's mark and the sessions it paused. Every desk also names its task id.

It needs a gatekeeper: a provider that reads what the orchestrator writes. `--gatekeeper gordon[=DIR]` reads Gordon's state directory (default `~/.local/state/alfred/gordon`); `HOPPER_HQ_GATEKEEPER` says the same for a service. The provider reads files only, never runs anything, and a file it cannot read empties its section. Without a gatekeeper the Lobby stays decor. The design is in [docs/plans/2026-10-16-lobby-design.md](docs/plans/2026-10-16-lobby-design.md).
```

Commands table, `start` row: add `; \`--gatekeeper gordon\` shows [the Lobby](#the-lobby)`.

- [ ] **Step 2: Build and run with real data** — `npm run build`, then `node dist/bin.js down` and `node dist/bin.js up --no-open --floors repo --gatekeeper gordon --claude-dir … (the eight directories as before)`. Check `tail -3 ~/.hopper-hq/daemon.log` says `hopper-hq shows the Lobby of gordon (…)`, and `curl -s -H "Authorization: Bearer $(cat ~/.hopper-hq/token)" http://127.0.0.1:7337/api/lobby | python3 -m json.tool | head -60` shows seats with today's percentages, the cap from `limits.json`, the power from the cgroup, and `gate: null` until Gordon writes `lobby.json`. Open the UI, click `L · Lobby`, screenshot the panel to `.playwright-mcp/09-lobby-panel.png`.

- [ ] **Step 3: Commit** — `git add README.md && git commit -m "Document the Lobby and the gatekeeper option"`

- [ ] **Step 4: Tell Gordon the contract** — one line to Gordon (allowed on an orchestrator prompt), pointing at the `lobby.json` schema in `docs/plans/2026-10-16-lobby-design.md` §5, and the same in `~/.local/state/alfred/gordon/report-G-268.txt` at the end of G-268.

---

## Self-review

- Spec coverage: §3 model → Task 1; §4 provider interface, collector, scene, route, `/api/lobby`, choice → Tasks 4, 5, 6, 7, 8; §5 every table row → Tasks 3 and 4 (`doorman` by name → Task 5; `task` from the name → Task 2 step 5, by pane → Task 4); §6 3D floor → L2; §7 error handling → Tasks 3, 4 (log once), 5 (cleaning), 8 (loading and 404 states); §8 tests → each task; §9 L1 → this plan.
- Placeholders: the Facade step says "…the group as it is today…" for the unchanged branch, which is the existing markup to copy verbatim from the file; no other ellipsis.
- Types: `Lobby`, `LobbyDetail`, `LobbySummary`, `GatekeeperSink`, `GordonOptions.panes`, `Collector.localPanes()` are used with the same names throughout; `fetchLobby` returns `{ ok, lobby }`.
- Review Focus 1–5: pinned in Tasks 3, 3, 2, 3, 2 as listed.
