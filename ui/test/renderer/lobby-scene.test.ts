import { describe, expect, it } from 'vitest';
import { Box3, OrthographicCamera, Vector3, type Camera, type Mesh, type MeshBasicMaterial, type MeshStandardMaterial, type Object3D } from 'three';
import type { SeatView, TaskCard } from '../../../src/scene/types';
import { lobbyPlan, type LobbyInput } from '../../renderer/lobby-layout';
import { lampOf, LobbyScene, SIGN_CHARS, signLines } from '../../renderer/lobby-scene';
import { createLobbyView, LOBBY_ROOM_SHARE, lobbyFrustum } from '../../renderer/lobby-view';
import { dayTheme } from '../../renderer/theme';
import type { RendererLike, ViewEnv } from '../../renderer/view';
import { cameraOffset, floorCenter, HOME_AZIMUTH } from '../../renderer/world';

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

describe('lampOf and signLines', () => {
  it('lights a seat with no fresh reading as such first, then a full one, else one with room', () => {
    expect([lampOf({ full: true, stale: true }), lampOf({ full: true, stale: false }), lampOf({ full: false, stale: false })]).toEqual(['stale', 'full', 'free']);
  });

  it("writes the seat's name over the doors and its week under it, the seat in use marked", () => {
    expect(signLines({ name: 'Luca', weekPct: 56.6, current: false })).toEqual(['Luca', '7d 57%']);
    expect(signLines({ name: 'Jacopo', weekPct: null, current: true })).toEqual(['▸ Jacopo', 'n/d']);
  });

  it('cuts a name too long for the sign short with an ellipsis, never squeezing it', () => {
    const whole = 'n'.repeat(SIGN_CHARS);
    expect(signLines({ name: whole, weekPct: 3, current: false })).toEqual([whole, '7d 3%']);
    expect(signLines({ name: whole + 'n', weekPct: 3, current: false })[0]).toBe('n'.repeat(SIGN_CHARS - 1) + '\u2026');
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

  it("filters every sign's texture with the anisotropy it is given, so that it reads at a slant", () => {
    const s = new LobbyScene(dayTheme());
    s.anisotropy = 8;
    s.setLobby(detail([...Array.from({ length: 9 }, (_, i) => task(`R-${i}`, 'refused')), ...Array.from({ length: 14 }, (_, i) => task(`W-${i}`, 'waiting'))], [seat('Luca'), seat('Leonardo')]));
    const signs = meshes(s).filter((m) => m.name.startsWith('sign '));
    expect(signs.map((m) => m.name)).toEqual(['sign Luca · 7d 40%', 'sign Leonardo · 7d 40%', 'sign Gordon', 'sign +2 refused', 'sign +2 ready']);
    expect(signs.map((m) => (m.material as MeshBasicMaterial).map?.anisotropy)).toEqual([8, 8, 8, 8, 8]);
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

/** A renderer that keeps what it was last asked to draw, and says the GPU filters at most 8 times. */
function recorder() {
  const seen: { scene: Object3D | null; camera: Camera | null } = { scene: null, camera: null };
  const renderer: RendererLike = {
    shadowMap: { enabled: false, type: 0 as RendererLike['shadowMap']['type'], autoUpdate: true, needsUpdate: false },
    setPixelRatio() {},
    setSize() {},
    setClearColor() {},
    render(scene, camera) {
      seen.scene = scene;
      seen.camera = camera;
    },
    dispose() {},
    capabilities: { getMaxAnisotropy: () => 8 },
  };
  return { renderer, seen };
}

function stage(width: number, height: number): { canvas: HTMLCanvasElement; frames: Array<(now: number) => void>; env: ViewEnv } {
  const canvas = document.body.appendChild(document.createElement('canvas'));
  Object.defineProperty(canvas, 'clientWidth', { get: () => width });
  Object.defineProperty(canvas, 'clientHeight', { get: () => height });
  const frames: Array<(now: number) => void> = [];
  const env: ViewEnv = {
    requestFrame: (draw) => frames.push(draw),
    cancelFrame() {},
    now: () => 0,
    hidden: () => false,
    pixelRatio: () => 1,
    watchPixelRatio: () => () => {},
    observeResize: () => () => {},
    later: () => () => {},
  };
  return { canvas, frames, env };
}

/** Where a point lands in normalised device coordinates. */
const ndc = (camera: Camera, x: number, y: number, z: number) => new Vector3(x, y, z).project(camera);

describe('createLobbyView', () => {
  it("hands the renderer's sharpest filtering to every sign", () => {
    const { renderer, seen } = recorder();
    const { canvas, frames, env } = stage(1600, 800);
    const view = createLobbyView({ canvas }, dayTheme(), renderer, env);
    view.setLobby(detail([task('G-1', 'refused')], [seat('Luca'), seat('Leonardo')]));
    while (frames.length) frames.shift()!(0);
    const signs: Mesh[] = [];
    seen.scene!.traverse((o) => {
      if ((o as Mesh).isMesh && o.name.startsWith('sign ')) signs.push(o as Mesh);
    });
    expect(signs.length).toBeGreaterThanOrEqual(3);
    expect(signs.every((m) => (m.material as MeshBasicMaterial).map?.anisotropy === 8)).toBe(true);
    view.dispose();
  });
});

describe('lobbyFrustum', () => {
  const six = detail([], ['Giovanni', 'Luca', 'Leonardo', 'Francesco', 'Jacopo', 'Personale'].map((n) => seat(n)));
  const camera = (size: { w: number; h: number }, aspect: number) => {
    const f = lobbyFrustum(size, aspect);
    const cam = new OrthographicCamera(f.left, f.right, f.top, f.bottom, 0.1, 300);
    const c = floorCenter(size);
    const o = cameraOffset(HOME_AZIMUTH);
    cam.position.set(c.x + o.x, o.y, c.z + o.z);
    cam.lookAt(c.x, 0, c.z);
    cam.updateMatrixWorld();
    cam.updateProjectionMatrix();
    return cam;
  };

  it.each([2154 / 1114, 1600 / 800, 1100 / 760])('frames the hall from home at %f across most of the stage, every sign in view', (aspect) => {
    const size = lobbyPlan(six).size;
    const cam = camera(size, aspect);
    const xs = [0, size.w].flatMap((x) => [0, size.h].map((z) => ndc(cam, x, 0, z).x));
    expect((Math.max(...xs) - Math.min(...xs)) / 2).toBeCloseTo(LOBBY_ROOM_SHARE, 9);
    expect(LOBBY_ROOM_SHARE).toBeGreaterThanOrEqual(0.85);
    const s = new LobbyScene(dayTheme());
    s.setLobby(six);
    s.scene.updateMatrixWorld(true);
    for (const m of s.content.children.filter((o) => o.name.startsWith('sign '))) {
      const b = new Box3().setFromObject(m);
      for (const x of [b.min.x, b.max.x]) for (const y of [b.min.y, b.max.y]) {
        const p = ndc(cam, x, y, b.max.z);
        expect(Math.abs(p.x) <= 1 && Math.abs(p.y) <= 1, `${m.name} at ${p.x.toFixed(2)}, ${p.y.toFixed(2)}`).toBe(true);
      }
    }
    s.dispose();
  });
});
