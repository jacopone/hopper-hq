/**
 * The building's façade as isometric SVG geometry: plain data, no DOM. Facade.svelte draws it.
 * Cells: x runs along the front (one window per desk), y is the depth, z is height in pixels.
 * Floors stack bottom-up on a lobby: floor number 1 sits on the lobby, and the scene lists floors top to bottom. Every
 * floor is as wide as the building; past the windows of its plan come the lit windows of its running agents, and past
 * those, plain wall, so that a floor shows its size.
 * Same projection and proportions as prototypes/building-mockup.html.
 */
import type { FloorSummary, ShownState } from '../../src/scene/types';

export const TW = 64;
export const TH = 32;
/** Depth of the building, in cells. */
export const DEPTH = 3;
export const FLOOR_H = 40;
export const LOBBY_H = 50;
/** The building is as wide as its busiest floor, never narrower than this. */
export const MIN_WIDTH = 6;
/** Room kept right of the label column for a floor's name and metadata. */
export const LABEL_W = 330;
/** The longest floor name that room holds, in characters: a longer one ends in '…', and shows whole on hover. */
export const NAME_MAX = 28;
export const PAD = 24;
/** The smallest scale the façade is drawn at: below it, floor names and counts get too small to read. */
export const MIN_SCALE = 0.8;

export type Point = [number, number];

/** Grid (x, y) at height z -> SVG pixels. */
export function project(x: number, y: number, z = 0): Point {
  return [((x - y) * TW) / 2, ((x + y) * TH) / 2 - z];
}

const r1 = (n: number) => Math.round(n * 10) / 10;

/** An SVG `points` attribute, at a tenth of a pixel. */
export function points(ps: Point[]): string {
  return ps.map(([x, y]) => `${r1(x)},${r1(y)}`).join(' ');
}

/** A box's three visible faces: top, front-left (constant y = y1) and front-right (constant x = x1). */
export interface Box {
  top: string;
  left: string;
  right: string;
}

export function box(x0: number, y0: number, x1: number, y1: number, z0: number, z1: number): Box {
  return {
    top: points([project(x0, y0, z1), project(x1, y0, z1), project(x1, y1, z1), project(x0, y1, z1)]),
    left: points([project(x0, y1, z1), project(x1, y1, z1), project(x1, y1, z0), project(x0, y1, z0)]),
    right: points([project(x1, y0, z1), project(x1, y1, z1), project(x1, y1, z0), project(x1, y0, z0)]),
  };
}

/** A quad on the front-left face (constant y), from x0 to x1 and z0 to z1. */
function onFront(y: number, x0: number, x1: number, z0: number, z1: number): Point[] {
  return [project(x0, y, z1), project(x1, y, z1), project(x1, y, z0), project(x0, y, z0)];
}

/** A quad on the front-right face (constant x). */
function onSide(x: number, y0: number, y1: number, z0: number, z1: number): Point[] {
  return [project(x, y0, z1), project(x, y1, z1), project(x, y1, z0), project(x, y0, z0)];
}

export type Line = [number, number, number, number];

/** A floor's label to the right of the building: a leader line, the number in a circle, the name and its metadata. */
export interface Label {
  leader: Line;
  circle: Point;
  nameAt: Point;
  metaAt: Point;
}

export interface WindowShape {
  /** Null: a free desk, a dark window that leads nowhere. */
  sessionId: string | null;
  state: ShownState | null;
  /** The orchestrator's task of the session at the desk; null when none. */
  task: string | null;
  points: string;
  /** Someone is at the desk and the screen is on. */
  lit: boolean;
}

/** A running subagent or workflow agent's window: lit in the meeting rooms' colour, it leads to its session's desk. */
export interface AgentWindowShape {
  sessionId: string;
  points: string;
}

export interface FacadeFloor {
  key: string;
  number: number;
  plate: Box;
  wall: Box;
  /** One per desk of the floor's plan, in desk index order, left to right. */
  windows: WindowShape[];
  /** Past the desks' windows, one per agent window of the floor. Past them, the floor is plain wall. */
  agents: AgentWindowShape[];
  /** The agents beyond `agents`, written in the cell after them: '+3'. Null when there are none. */
  agentsMore: { count: number; at: Point } | null;
  side: string;
  shutters: boolean;
  /** Slats across every window of the floor's plan when the shutters are down. */
  slats: Line[];
  /** The floor's silhouette, for hover, focus and selection. */
  outline: string;
  label: Label;
}

/** The gatekeeper's part of the façade: the apron before the doors with the line of robots on it, the doorman, and the tank on the roof. */
export interface GateModel {
  apron: Box;
  /** The line painted on the apron, from the doors outwards. */
  line: Line;
  /** Where the robots of the line stand (feet), the head of the line first, each further from the doors and nearer the viewer. */
  slots: Point[];
  /** Where the group beyond the line stands (feet); its counter is drawn to the right. */
  more: Point;
  /** Where the doorman stands (feet), beside the doors. */
  doorman: Point;
  /** The water tank: the centre of its base on the roof slab, the radii of its ellipses, its height on its legs. */
  tank: { cx: number; cy: number; rx: number; ry: number; h: number; legH: number };
}

/** The apron's robots stand this far apart along the depth axis, in cells. */
const GATE_STEP = 0.4;
/** A robot stands about this tall on the page, its badge included. */
const BOT_H = 34;
/** The group's counter hangs under the group: half its widest, and how far below the group's feet its bottom edge is. */
const CHIP_HALF = 24;
const CHIP_DROP = 22;
const TANK = { rx: 22, ry: 11, h: 34, legH: 11, cone: 13 } as const;

export interface FacadeModel {
  viewBox: string;
  /** The viewBox's width and height. */
  size: { width: number; height: number };
  /** Windows per floor. */
  width: number;
  shadow: { cx: number; cy: number; rx: number; ry: number };
  plinth: Box;
  lobby: { wall: Box; windows: string[]; doors: string[]; side: string; label: Label; outline: string };
  /** Bottom-up, the order they are drawn in. */
  floors: FacadeFloor[];
  roof: { slab: Box; units: Box[]; mast: Line };
  /** Null without a gatekeeper. */
  gate: GateModel | null;
}

/** The cells a floor's agents take past its desks: one window each, and one for the count of those beyond. */
function agentCells(f: FloorSummary): number {
  return f.agentWindows.length + (f.agents > f.agentWindows.length ? 1 : 0);
}

const LIT: ReadonlySet<ShownState> = new Set(['working', 'needs_you', 'done', 'in_meeting', 'no_signal']);

/** Grows a bounding box over everything drawn, so the viewBox frames the whole model. */
class Bounds {
  x0 = Infinity;
  y0 = Infinity;
  x1 = -Infinity;
  y1 = -Infinity;
  add([x, y]: Point): Point {
    this.x0 = Math.min(this.x0, x);
    this.y0 = Math.min(this.y0, y);
    this.x1 = Math.max(this.x1, x);
    this.y1 = Math.max(this.y1, y);
    return [x, y];
  }
  box(x0: number, y0: number, x1: number, y1: number, z0: number, z1: number): Box {
    for (const x of [x0, x1]) for (const y of [y0, y1]) for (const z of [z0, z1]) this.add(project(x, y, z));
    return box(x0, y0, x1, y1, z0, z1);
  }
}

function labelAt(b: Bounds, anchor: Point, labelX: number, hasMeta: boolean): Label {
  const [ax, ay] = anchor;
  b.add([labelX + LABEL_W, ay - 20]);
  b.add([labelX, ay + 20]);
  return {
    leader: [r1(ax + 4), r1(ay), r1(labelX - 6), r1(ay)],
    circle: [r1(labelX + 11), r1(ay)],
    nameAt: [r1(labelX + 32), r1(hasMeta ? ay - 2 : ay + 5)],
    metaAt: [r1(labelX + 32), r1(ay + 13)],
  };
}

/** The whole building for the scene's floors, listed top to bottom as the scene lists them. */
/** `lobbyMeta`: the Lobby's label carries a meta line (a gatekeeper's counts), so its name moves up as a floor's does. */
export function facadeOf(floors: readonly FloorSummary[], lobbyMeta = false, withGate = false): FacadeModel {
  const b = new Bounds();
  const W = Math.max(MIN_WIDTH, ...floors.map((f) => f.windows.length + agentCells(f)));
  const D = DEPTH;
  const labelX = (W * TW) / 2 + 40;

  const plinth = b.box(-0.4, -0.4, W + 0.4, D + 0.4, -6, 0);
  const lobbyWall = b.box(0, 0, W, D, 0, LOBBY_H);
  const doorAt = Math.floor(W / 2) - 1;
  const doors: string[] = [];
  const lobbyWindows: string[] = [];
  for (let i = 0; i < W; i++) {
    if (i === doorAt || i === doorAt + 1) doors.push(points(onFront(D, i + 0.08, i + 0.92, 0, LOBBY_H - 14)));
    else lobbyWindows.push(points(onFront(D, i + 0.15, i + 0.85, 14, LOBBY_H - 10)));
  }
  const lobby = {
    wall: lobbyWall,
    windows: lobbyWindows,
    doors,
    side: points(onSide(W, 0.3, D - 0.3, 14, LOBBY_H - 10)),
    label: labelAt(b, project(W, 0, LOBBY_H / 2), labelX, lobbyMeta),
    // The outline a floor has, over the lobby's front and side: what hover and focus light when the Lobby is a button.
    outline: points([project(0, D, LOBBY_H), project(0, D, 0), project(W, D, 0), project(W, 0, 0), project(W, 0, LOBBY_H), project(W, D, LOBBY_H)]),
  };

  const stacked: FacadeFloor[] = [];
  for (let j = 0; j < floors.length; j++) {
    const f = floors[floors.length - 1 - j]!;
    const z0 = LOBBY_H + j * FLOOR_H;
    const windows: WindowShape[] = [];
    const slats: Line[] = [];
    for (let i = 0; i < f.windows.length; i++) {
      const w = f.windows[i]!;
      windows.push({ sessionId: w.sessionId, state: w.state, task: w.task, points: points(onFront(D, i + 0.18, i + 0.82, z0 + 13, z0 + FLOOR_H - 6)), lit: w.state !== null && LIT.has(w.state) });
      if (f.shutters) {
        for (let k = 1; k < 4; k++) {
          const z = z0 + 13 + (k * (FLOOR_H - 19)) / 4;
          const [ax, ay] = project(i + 0.18, D, z);
          const [bx, by] = project(i + 0.82, D, z);
          slats.push([r1(ax), r1(ay), r1(bx), r1(by)]);
        }
      }
    }
    const first = f.windows.length;
    const agents = f.agentWindows.map((a, k): AgentWindowShape => ({ sessionId: a.sessionId, points: points(onFront(D, first + k + 0.18, first + k + 0.82, z0 + 13, z0 + FLOOR_H - 6)) }));
    const more = f.agents - f.agentWindows.length;
    const [mx, my] = project(first + f.agentWindows.length + 0.5, D, z0 + (FLOOR_H + 7) / 2);
    stacked.push({
      key: f.key,
      number: f.number,
      plate: b.box(-0.08, -0.08, W + 0.08, D + 0.08, z0, z0 + 4),
      wall: b.box(0, 0, W, D, z0 + 4, z0 + FLOOR_H),
      windows,
      agents,
      agentsMore: more > 0 ? { count: more, at: [r1(mx), r1(my)] } : null,
      side: points(onSide(W, 0.35, D - 0.35, z0 + 13, z0 + FLOOR_H - 6)),
      shutters: f.shutters,
      slats,
      outline: points([project(0, D, z0 + FLOOR_H), project(0, D, z0), project(W, D, z0), project(W, 0, z0), project(W, 0, z0 + FLOOR_H), project(W, D, z0 + FLOOR_H)]),
      label: labelAt(b, project(W, 0, z0 + FLOOR_H / 2 + 2), labelX, true),
    });
  }

  const zr = LOBBY_H + floors.length * FLOOR_H;
  const slab = b.box(-0.12, -0.12, W + 0.12, D + 0.12, zr, zr + 6);
  // With a gatekeeper the tank stands where the roof's first unit was.
  const units = [...(withGate ? [] : [b.box(0.6, 0.5, 1.9, 1.7, zr + 6, zr + 22)]), b.box(W - 2.3, 0.7, W - 1.1, 1.9, zr + 6, zr + 16)];
  let gate: GateModel | null = null;
  if (withGate) {
    const cx = doorAt + 1;
    const yEnd = D + 0.8 + GATE_STEP * 8 + 1.5;
    const apron = b.box(doorAt - 0.35, D + 0.4, doorAt + 2.35, yEnd, -6, 0);
    const stand = (x: number, y: number): Point => {
      const p = project(x, y, 0);
      b.add([p[0] - 14, p[1] - BOT_H]);
      b.add([p[0] + 14, p[1] + 3]);
      return p;
    };
    const slots = Array.from({ length: 8 }, (_, i) => stand(cx, D + 0.8 + GATE_STEP * i));
    const more = stand(cx, D + 0.8 + GATE_STEP * 8 + 0.2);
    b.add([more[0] - CHIP_HALF, more[1] + CHIP_DROP]);
    b.add([more[0] + CHIP_HALF, more[1] + CHIP_DROP]);
    const doorman = stand(doorAt + 2.25, D + 0.45);
    const [l0x, l0y] = project(cx, D + 0.55, 0);
    const [l1x, l1y] = project(cx, yEnd - 0.6, 0);
    const [tx, ty] = project(1.25, 1.1, zr + 6).map(r1) as Point;
    // The cone is wider than the lid by 2 px a side; the front legs stand a third of a radius ahead of the centre.
    b.add([tx - TANK.rx - 2, ty - TANK.legH - TANK.h - TANK.cone - 4]);
    b.add([tx + TANK.rx + 2, ty + 0.35 * TANK.ry + 1]);
    gate = {
      apron,
      line: [r1(l0x), r1(l0y), r1(l1x), r1(l1y)],
      slots: slots.map(([x, y]) => [r1(x), r1(y)] as Point),
      more: [r1(more[0]), r1(more[1])],
      doorman: [r1(doorman[0]), r1(doorman[1])],
      tank: { cx: tx, cy: ty, rx: TANK.rx, ry: TANK.ry, h: TANK.h, legH: TANK.legH },
    };
  }
  const [m0x, m0y] = b.add(project(W - 0.5, 0.5, zr + 6));
  const [m1x, m1y] = b.add(project(W - 0.5, 0.5, zr + 46));

  const [cx, cy] = project(W / 2, D / 2, -14);
  const shadow = { cx: r1(cx), cy: r1(cy + 10), rx: r1((W + D) * 19), ry: r1((W + D) * 8) };
  b.add([shadow.cx - shadow.rx, shadow.cy - shadow.ry]);
  b.add([shadow.cx + shadow.rx, shadow.cy + shadow.ry]);

  const [x, y, width, height] = [b.x0 - PAD, b.y0 - PAD, b.x1 - b.x0 + 2 * PAD, b.y1 - b.y0 + 2 * PAD].map(r1) as [number, number, number, number];
  return {
    viewBox: `${x} ${y} ${width} ${height}`,
    size: { width, height },
    width: W,
    shadow,
    plinth,
    lobby,
    floors: stacked,
    roof: { slab, units, mast: [r1(m0x), r1(m0y), r1(m1x), r1(m1y)] },
    gate,
  };
}
