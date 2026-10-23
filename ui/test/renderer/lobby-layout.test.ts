import { describe, expect, it } from 'vitest';
import type { SeatView, TaskCard } from '../../../src/scene/types';
import { COUNTER, ELEVATOR_END, ELEVATOR_GAP, HALL, LIFT, LINE_MAX, LINE_STEP, lobbyPlan, READY_MAX } from '../../renderer/lobby-layout';

const task = (id: string, where: TaskCard['where'], extra: Partial<TaskCard> = {}): TaskCard => ({ id, title: id, tie: 3, org: 'amatino', body: 2, where, reason: null, since: 0, account: null, sessions: [], subagents: 0, ...extra });
const seat = (name: string, extra: Partial<SeatView> = {}): SeatView => ({
  account: `${name.toLowerCase()}@amatino.ai`, name, session: { usedPct: 10, resetsAt: null, readAt: 1 }, week: { usedPct: 40, resetsAt: null, readAt: 1 },
  current: false, full: false, stale: false, turnable: true, org: 'amatino', weekPace: null, weekTouched: true, readAgeMs: 0, ...extra,
});
const plan = (tasks: TaskCard[], seats: SeatView[] = [seat('Luca')]) => lobbyPlan({ tasks, seats, seatLimitPct: 80 });

describe('lobbyPlan', () => {
  it('puts the doorman behind the counter in the middle of the hall, facing the door', () => {
    const p = plan([]);
    expect(p.size).toEqual({ w: HALL.w, h: HALL.h });
    expect(p.counter).toMatchObject({ x: HALL.w / 2, z: COUNTER.z });
    expect(p.doorman.x).toBe(HALL.w / 2);
    expect(p.doorman.z).toBeLessThan(COUNTER.z);
    expect(p.doorman.facing).toBe(0);
  });

  it('lines the refused up in front of the counter, the first nearest, facing it, and counts those past the line', () => {
    const refused = Array.from({ length: LINE_MAX + 2 }, (_, i) => task(`G-${i}`, 'refused'));
    const p = plan([...refused, task('G-99', 'live')]);
    expect(p.line.map((f) => f.id)).toEqual(refused.slice(0, LINE_MAX).map((t) => t.id));
    expect(p.lineMore).toBe(2);
    const zs = p.line.map((f) => f.spot.z);
    expect(zs[0]).toBeGreaterThan(COUNTER.z + COUNTER.d / 2);
    expect(zs[1]! - zs[0]!).toBeCloseTo(LINE_STEP, 9);
    expect(p.line.every((f) => f.spot.x === HALL.w / 2 && f.spot.facing === Math.PI && f.robot.pose === 'holding')).toBe(true);
    // The line stays inside the hall.
    expect(Math.max(...zs)).toBeLessThan(HALL.h);
  });

  it('seats the ready tasks on the couches along the side walls, each robot in its repository, tie and organisation, and counts those without a seat', () => {
    const ready = Array.from({ length: READY_MAX + 3 }, (_, i) => task(`R-${i}`, 'waiting', { body: i === 0 ? null : 1, tie: 5, org: i === 1 ? 'tenuta' : null }));
    const p = plan(ready);
    expect(p.ready).toHaveLength(READY_MAX);
    expect(p.readyMore).toBe(3);
    expect(p.ready[0]!.robot).toEqual({ pose: 'resting', badge: null, body: null, tie: 5, org: null });
    expect(p.ready[1]!.robot).toMatchObject({ body: 1, org: 'tenuta' });
    // Every seat is a different place, on a couch along the west or the east wall, facing into the hall.
    const keys = new Set(p.ready.map((f) => `${f.spot.x},${f.spot.z}`));
    expect(keys.size).toBe(READY_MAX);
    for (const f of p.ready) {
      const west = f.spot.x < HALL.w / 2;
      expect(f.spot.facing).toBe(west ? Math.PI / 2 : -Math.PI / 2);
      expect(f.spot.z).toBeGreaterThan(COUNTER.z - 1);
      expect(f.spot.z).toBeLessThan(HALL.h);
    }
  });

  it('gives every seat an elevator on the north wall, side by side and centred, with what its doors and its gauge show', () => {
    const seats = [seat('Luca', { full: true, week: { usedPct: 86, resetsAt: null, readAt: 1 } }), seat('Jacopo', { current: true, org: 'tenuta' }), seat('Pietro', { session: null, week: null, stale: true, org: null })];
    const p = plan([], seats);
    expect(p.elevators.map((e) => [e.name, e.org, e.full, e.current, e.stale, e.weekPct, e.weekOver, e.sessionPct])).toEqual([
      ['Luca', 'amatino', true, false, false, 86, true, 10],
      ['Jacopo', 'tenuta', false, true, false, 40, false, 10],
      ['Pietro', null, false, false, true, null, false, null],
    ]);
    const xs = p.elevators.map((e) => e.x);
    expect(xs[1]! - xs[0]!).toBeCloseTo(LIFT.w + ELEVATOR_GAP, 9);
    expect((xs[0]! + xs[2]!) / 2).toBeCloseTo(p.size.w / 2, 9);
  });

  it('widens the hall for more elevators than its width holds, keeping a wall at each end', () => {
    const many = Array.from({ length: 9 }, (_, i) => seat(`S${i}`));
    const p = plan([], many);
    expect(p.size.w).toBeCloseTo(2 * ELEVATOR_END + 9 * LIFT.w + 8 * ELEVATOR_GAP, 9);
    expect(p.elevators[0]!.x - LIFT.w / 2).toBeCloseTo(ELEVATOR_END, 9);
  });
});
