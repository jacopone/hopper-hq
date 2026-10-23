/**
 * Where everything of the Lobby in 3D stands (design: docs/plans/2026-10-19-task-account-grammar.md and the Lobby's L2
 * line in 2026-10-16-lobby-design.md): the elevators along the north wall, one per seat, in the colour of its
 * account's organisation; the doorman behind the counter in the middle of the hall, facing the door; the launches the
 * gate turned away in a line in front of the counter; the tasks that are ready on the couches along the side walls.
 * Pure: the scene builds from it, and the tests read it.
 */
import type { Org } from '../../src/scene/palette';
import type { LobbyDetail, Robot } from '../../src/scene/types';
import type { Spot } from './world';

/** The hall's least size, in metres; it widens for more elevators. */
export const HALL = { w: 14, h: 10 } as const;
/** A Lobby elevator: narrower than a floor's, so that a row of seats fits the hall: a door panel, the width it takes on the wall with its frame and gauge. */
export const LIFT = { door: 0.55, w: 1.5 } as const;
/** The gap between two elevators, and the wall each end keeps. */
export const ELEVATOR_GAP = 0.5;
export const ELEVATOR_END = 1;
/** The counter: its centre this far from the north wall, its size. */
export const COUNTER = { z: 4, w: 3.4, d: 0.75, h: 0.85 } as const;
/** The doorman stands this far behind the counter's centre. */
export const DOORMAN_BACK = 0.75;
/** The line: its head this far in front of the counter's centre, a robot every LINE_STEP, at most LINE_MAX. */
export const LINE_HEAD = 1.1;
export const LINE_STEP = 0.7;
export const LINE_MAX = 7;
/** A couch's seats; the couches stand along the west and east walls, this far in, from this far south of the north wall. */
export const COUCH_SEATS = 3;
export const COUCH_IN = 1.1;
export const COUCH_FROM = 4.3;
export const COUCH_STEP = 3.1;
/** Two couches a side. */
export const COUCHES_PER_SIDE = 2;
export const READY_MAX = 2 * COUCHES_PER_SIDE * COUCH_SEATS;
/** The gap between two seats of a couch. */
export const SEAT_STEP = 0.8;

export interface Figure {
  id: string;
  /** Its robot: a waiting task's repository colour, its task's tie and its organisation's lanyard. Null body: grey. */
  robot: Omit<Robot, 'body'> & { body: number | null };
  spot: Spot;
}

export interface Elevator {
  account: string;
  name: string;
  org: Org | null;
  /** The centre of its doors on the north wall. */
  x: number;
  full: boolean;
  stale: boolean;
  current: boolean;
  /** The used share of the week, 0..100; null without a reading. */
  weekPct: number | null;
  /** The week is at the share where a seat is full. */
  weekOver: boolean;
  /** The used share of the five hours, 0..100; null without a reading. */
  sessionPct: number | null;
}

export interface Couch {
  /** Its centre, and the way its seats face. */
  x: number;
  z: number;
  facing: number;
}

export interface LobbyPlan {
  size: { w: number; h: number };
  counter: { x: number; z: number; w: number; d: number; h: number };
  doorman: Spot;
  line: Figure[];
  lineMore: number;
  couches: Couch[];
  ready: Figure[];
  readyMore: number;
  elevators: Elevator[];
}

/** Facing as the floor reads it: 0 looks south (+z), π north. */
/** What the hall is drawn from. */
export type LobbyInput = Pick<LobbyDetail, 'tasks' | 'seats' | 'seatLimitPct'>;

const SOUTH = 0;
const NORTH = Math.PI;
const EAST = Math.PI / 2;
const WEST = -Math.PI / 2;

export function lobbyPlan(d: LobbyInput): LobbyPlan {
  const n = d.seats.length;
  const w = Math.max(HALL.w, 2 * ELEVATOR_END + n * LIFT.w + Math.max(0, n - 1) * ELEVATOR_GAP);
  const h = HALL.h;
  const cx = w / 2;
  const row = n * LIFT.w + Math.max(0, n - 1) * ELEVATOR_GAP;
  const elevators = d.seats.map((s, i): Elevator => ({
    account: s.account,
    name: s.name,
    org: s.org,
    x: cx - row / 2 + LIFT.w / 2 + i * (LIFT.w + ELEVATOR_GAP),
    full: s.full,
    stale: s.stale,
    current: s.current,
    weekPct: s.week ? s.week.usedPct : null,
    weekOver: s.week !== null && s.week.usedPct >= d.seatLimitPct,
    sessionPct: s.session ? s.session.usedPct : null,
  }));
  const figure = (t: LobbyDetail['tasks'][number], spot: Spot, pose: Robot['pose']): Figure => ({
    id: t.id,
    robot: { pose, badge: null, body: t.body ?? null, tie: t.tie, org: t.org },
    spot,
  });
  const refused = d.tasks.filter((t) => t.where === 'refused');
  const waiting = d.tasks.filter((t) => t.where === 'waiting');
  const line = refused.slice(0, LINE_MAX).map((t, i) => figure(t, { x: cx, z: COUNTER.z + LINE_HEAD + i * LINE_STEP, facing: NORTH }, 'holding'));
  const couches: Couch[] = [];
  for (let k = 0; k < COUCHES_PER_SIDE; k++) {
    const z = COUCH_FROM + k * COUCH_STEP;
    couches.push({ x: COUCH_IN, z, facing: EAST }, { x: w - COUCH_IN, z, facing: WEST });
  }
  // The couches fill west, east, west, east, a couch at a time; its seats run from north to south.
  const seats: Spot[] = couches.flatMap((c) => Array.from({ length: COUCH_SEATS }, (_, i) => ({ x: c.x, z: c.z + (i - (COUCH_SEATS - 1) / 2) * SEAT_STEP, facing: c.facing })));
  const ready = waiting.slice(0, READY_MAX).map((t, i) => figure(t, seats[i]!, 'resting'));
  return {
    size: { w, h },
    counter: { x: cx, z: COUNTER.z, w: COUNTER.w, d: COUNTER.d, h: COUNTER.h },
    doorman: { x: cx, z: COUNTER.z - DOORMAN_BACK, facing: SOUTH },
    line,
    lineMore: Math.max(0, refused.length - LINE_MAX),
    couches,
    ready,
    readyMore: Math.max(0, waiting.length - READY_MAX),
    elevators,
  };
}
