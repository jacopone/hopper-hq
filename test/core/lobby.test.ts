import { describe, expect, it } from 'vitest';
import { allowanceStale, capacityOf, classifyReason, seatTurn, splitReasons, taskIdOf } from '../../src/core/lobby.js';
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

describe('capacityOf', () => {
  const at = (min: number) => NOW + min * 60_000;
  const full = (name: string, session: number, week: number, sessionReset: number | null, weekReset: number | null, extra: Partial<Seat> = {}): Seat => ({
    ...seat(name, week, extra),
    session: { usedPct: session, resetsAt: sessionReset, readAt: NOW },
    week: { usedPct: week, resetsAt: weekReset, readAt: NOW },
    full: session >= 80 || week >= 80,
  });
  const cap = (working: number | null, max: number | null) => ({ working, max });

  it('is the cap minus the working sessions or the seats with margin, whichever is smaller, and says which binds', () => {
    const seats = [seat('Jacopo', 41, { current: true }), seat('Leonardo', 59), seat('Luca', 86), seat('Pietro', null)];
    // 7 − 1 = 6 by the cap; two seats are open (Luca is full, Pietro has no fresh reading).
    expect(capacityOf({ cap: cap(1, 7), seats, plan: 'tetto 7' }, NOW)).toMatchObject({ plan: 'tetto 7', byCap: 6, bySeats: 2, slotsFree: 2, binds: 'seats' });
    // Six sessions at work under a cap of seven: one place by the cap, two seats open.
    expect(capacityOf({ cap: cap(6, 7), seats, plan: null }, NOW)).toMatchObject({ plan: null, byCap: 1, bySeats: 2, slotsFree: 1, binds: 'cap' });
  });

  it('is never below zero, and zero when the watchdog holds the cap at 0', () => {
    const seats = [seat('Jacopo', 10)];
    expect(capacityOf({ cap: cap(9, 7), seats, plan: null }, NOW)).toMatchObject({ byCap: 0, slotsFree: 0, binds: 'cap' });
    expect(capacityOf({ cap: cap(0, 0), seats, plan: null }, NOW)).toMatchObject({ byCap: 0, slotsFree: 0 });
  });

  it('does not know the places left when the cap or the working count is unknown, but still counts the seats', () => {
    const seats = [seat('Jacopo', 10), seat('Leonardo', 20)];
    for (const c of [cap(null, 7), cap(1, null), null]) {
      expect(capacityOf({ cap: c, seats, plan: null }, NOW)).toMatchObject({ byCap: null, bySeats: 2, slotsFree: null, binds: null });
    }
  });

  it('does not count a seat outside the rota, and counts none when every seat is full', () => {
    expect(capacityOf({ cap: cap(1, 7), seats: [seat('Giovanni', 21, { turnable: false }), seat('Luca', 86)], plan: null }, NOW)).toMatchObject({ bySeats: 0, slotsFree: 0, binds: 'seats' });
  });

  it('names the earliest moment a full seat opens again: when its last full window resets', () => {
    const seats = [
      // Both windows over the limit: it opens when the later one resets.
      full('Luca', 85, 90, at(30), at(60 * 48)),
      // Only the five-hour window is over: it opens at that reset.
      full('Pietro', 82, 41, at(90), at(60 * 24)),
      // A full seat with an unknown reset opens at no known time.
      full('Giovanni', 10, 95, null, null),
      // Outside the rota: its reset gives the team nothing.
      full('Jacopo', 85, 10, at(5), null, { turnable: false }),
      seat('Leonardo', 20),
    ];
    expect(capacityOf({ cap: cap(1, 7), seats, plan: null }, NOW).nextReset).toEqual({ at: at(90), seat: 'Pietro' });
  });

  it('has no next reset when no full seat has a reset ahead of now', () => {
    const seats = [full('Luca', 85, 10, at(-5), null), seat('Leonardo', 20)];
    expect(capacityOf({ cap: cap(1, 7), seats, plan: null }, NOW).nextReset).toBeNull();
    expect(capacityOf({ cap: cap(1, 7), seats: [seat('Leonardo', 20)], plan: null }, NOW).nextReset).toBeNull();
  });
});
