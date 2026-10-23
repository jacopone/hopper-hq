import { describe, expect, it } from 'vitest';
import type { Mesh, MeshBasicMaterial, MeshStandardMaterial } from 'three';
import type { SeatView, TaskCard } from '../../../src/scene/types';
import type { LobbyInput } from '../../renderer/lobby-layout';
import { lampOf, LobbyScene, signText } from '../../renderer/lobby-scene';
import { dayTheme } from '../../renderer/theme';

const task = (id: string, where: TaskCard['where'], extra: Partial<TaskCard> = {}): TaskCard => ({ id, title: id, tie: 3, org: 'amatino', body: 2, where, reason: null, since: 0, account: null, sessions: [], subagents: 0, ...extra });
const seat = (name: string, extra: Partial<SeatView> = {}): SeatView => ({
  account: `${name.toLowerCase()}@amatino.ai`, name, session: { usedPct: 10, resetsAt: null, readAt: 1 }, week: { usedPct: 40, resetsAt: null, readAt: 1 },
  current: false, full: false, stale: false, turnable: true, org: 'amatino', weekPace: null, weekTouched: true, readAgeMs: 0, ...extra,
});
const detail = (tasks: TaskCard[], seats: SeatView[]): LobbyInput => ({ tasks, seats, seatLimitPct: 80 });
const meshes = (s: LobbyScene) => {
  const out: Mesh[] = [];
  s.content.traverse((o) => {
    if ((o as Mesh).isMesh) out.push(o as Mesh);
  });
  return out;
};

describe('lampOf and signText', () => {
  it('lights a seat with no fresh reading as such first, then a full one, else one with room', () => {
    expect([lampOf({ full: true, stale: true }), lampOf({ full: true, stale: false }), lampOf({ full: false, stale: false })]).toEqual(['stale', 'full', 'free']);
  });

  it("writes the seat's name and its week over the doors, the seat in use marked", () => {
    expect(signText({ name: 'Luca', weekPct: 56.6, current: false })).toBe('Luca · 7d 57%');
    expect(signText({ name: 'Jacopo', weekPct: null, current: true })).toBe('▸ Jacopo · n/d');
  });
});

describe('LobbyScene', () => {
  it('puts a robot for the doorman, each refused launch in the line and each ready task on a couch', () => {
    const s = new LobbyScene(dayTheme());
    expect(s.setLobby(detail([task('G-1', 'refused'), task('G-2', 'refused'), task('G-3', 'waiting'), task('G-4', 'live')], [seat('Luca')]))).toBe(true);
    expect(s.robots.map((r) => r.sessionId)).toEqual(['doorman', 'G-1', 'G-2', 'G-3']);
    expect(s.robots.every((r) => s.content.children.includes(r.group))).toBe(true);
    // The line holds its briefs, standing; the ready sit.
    const [, g1, , g3] = s.robots;
    expect(g1!.rig.paper.visible).toBe(true);
    expect(g1!.group.position.y).toBe(0);
    expect(g3!.group.position.y).toBeGreaterThan(0);
    s.dispose();
  });

  it("frames each elevator in its organisation's colour, lights it by its seat's state, and fills its gauge with the week, red at the limit", () => {
    const theme = dayTheme();
    const s = new LobbyScene(theme);
    s.setLobby(detail([], [seat('Luca', { full: true, week: { usedPct: 86, resetsAt: null, readAt: 1 } }), seat('Pietro', { org: 'tenuta', stale: true, week: null, session: null })]));
    const ms = meshes(s);
    const colour = (m: Mesh) => `#${(m.material as MeshStandardMaterial | MeshBasicMaterial).color.getHexString()}`;
    expect(ms.filter((m) => m.material === s.mats.org('amatino'))).toHaveLength(1);
    expect(ms.filter((m) => m.material === s.mats.org('tenuta'))).toHaveLength(1);
    const lamps = ms.filter((m) => [theme.colors['s-done'], theme.colors['s-needs'], theme.colors['s-nosignal']].includes(colour(m)) && m.geometry.type === 'BoxGeometry');
    expect(lamps.map(colour)).toContain(theme.colors['s-needs']);
    expect(lamps.map(colour)).toContain(theme.colors['s-nosignal']);
    expect(ms.some((m) => m.name === 'sign Luca · 7d 86%')).toBe(true);
    expect(ms.some((m) => m.name === 'sign Pietro · n/d')).toBe(true);
    s.dispose();
  });

  it('rebuilds only when what it shows changes, and again for a new theme', () => {
    const s = new LobbyScene(dayTheme());
    const d = detail([task('G-1', 'refused')], [seat('Luca')]);
    expect(s.setLobby(d)).toBe(true);
    const first = s.robots[1]!.group;
    expect(s.setLobby({ ...d })).toBe(false);
    expect(s.robots[1]!.group).toBe(first);
    s.setTheme(dayTheme(true));
    expect(s.robots[1]!.group).not.toBe(first);
    expect(s.setLobby(detail([task('G-1', 'refused'), task('G-2', 'refused')], [seat('Luca')]))).toBe(true);
    expect(s.robots).toHaveLength(3);
    s.dispose();
  });

  it('counts the launches past the line and the ready past the couches on chips on the floor', () => {
    const s = new LobbyScene(dayTheme());
    s.setLobby(detail([...Array.from({ length: 9 }, (_, i) => task(`R-${i}`, 'refused')), ...Array.from({ length: 14 }, (_, i) => task(`W-${i}`, 'waiting'))], [seat('Luca')]));
    const names = meshes(s).map((m) => m.name).filter((n) => n.startsWith('sign +'));
    expect(names).toEqual(['sign +2 refused', 'sign +2 ready']);
    s.dispose();
  });
});
