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
