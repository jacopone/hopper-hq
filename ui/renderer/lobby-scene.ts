/**
 * The Lobby in 3D, in the floors' design system: the same slab, walls, couches, elevator doors and robots, from the
 * same materials and theme. lobbyPlan says where everything stands. The elevators stand along the north wall, one per
 * seat: the frame is in its account's organisation's colour, a lamp over the doors says whether the seat has margin,
 * is full or has no fresh reading, and a gauge beside the doors fills with the week used. The doorman (a cap, a
 * clipboard) stands behind the counter. The launches the gate turned away queue in front of it, each holding its
 * brief, and the ready tasks wait on the couches. Each robot has its repository's body, its task's tie and its
 * organisation's lanyard. The scene is rebuilt when what it shows changes; it does not animate.
 */
import { CanvasTexture, DirectionalLight, Group, HemisphereLight, Mesh, MeshBasicMaterial, MeshStandardMaterial, Scene, SRGBColorSpace, type Material } from 'three';
import { LIFT, lobbyPlan, type Couch, type Elevator, type Figure, type LobbyInput, type LobbyPlan } from './lobby-layout';
import { Materials } from './materials';
import { Geometries, part } from './props';
import { buildRobot, poseRobot, type RobotObject } from './robot';
import type { ThemeTokens } from './theme';
import { COUCH, COUCH_ARM, COUCH_BACK, floorCenter, shadowExtent, WALL_H, WALL_T } from './world';

/** The elevator's doors and frame: as tall as a floor's, the frame this much wider and taller than the doors. */
export const DOOR_H = 2.1;
export const FRAME_OVER = 0.16;
/** The frame's width: both doors and a jamb each side. */
export const FRAME_W = 2 * LIFT.door + 2 * FRAME_OVER;
/** The week's gauge: its centre this far east of the frame's edge, this tall and wide, from this high. */
export const GAUGE = { off: 0.2, h: 1.9, w: 0.26, y: 0.15 } as const;
/** The lamp over the doors, and the sign over it. */
export const LAMP = { y: DOOR_H + FRAME_OVER + 0.16, w: 0.7, h: 0.16 } as const;
export const SIGN = { y: LAMP.y + 0.36, w: LIFT.w + 0.3, h: 0.42 } as const;
const SIGN_PX = { w: 512, h: 96, font: 52 } as const;

export type LampState = 'free' | 'full' | 'stale';

/** What an elevator's lamp says: no fresh reading first, then full, else room to take a turn. */
export function lampOf(e: Pick<Elevator, 'full' | 'stale'>): LampState {
  return e.stale ? 'stale' : e.full ? 'full' : 'free';
}

/** The sign over an elevator: its seat's name and the week used, or no reading. */
export function signText(e: Pick<Elevator, 'name' | 'weekPct' | 'current'>): string {
  return `${e.current ? '▸ ' : ''}${e.name} · ${e.weekPct === null ? 'n/d' : `7d ${Math.round(e.weekPct)}%`}`;
}

/** What the scene is built from: when it is the same, nothing is rebuilt. */
export function planSignature(p: LobbyPlan): string {
  return JSON.stringify(p);
}

export class LobbyScene {
  readonly scene = new Scene();
  readonly geo = new Geometries();
  readonly mats: Materials;
  readonly hemi = new HemisphereLight();
  readonly sun = new DirectionalLight();
  /** Everything the plan builds; emptied at each rebuild. */
  readonly content = new Group();
  plan: LobbyPlan | null = null;
  private signature = '';
  private theme: ThemeTokens;
  /** Materials and textures of this scene's own, beyond the shared ones: lamps, gauges, the cap, the signs. */
  private readonly lamps: Record<LampState, MeshBasicMaterial>;
  private readonly fill: MeshStandardMaterial;
  private readonly fillOver: MeshStandardMaterial;
  private readonly cap: MeshStandardMaterial;
  private readonly signs: { texture: CanvasTexture | null; material: Material }[] = [];
  readonly robots: RobotObject[] = [];

  constructor(theme: ThemeTokens) {
    this.theme = theme;
    this.mats = new Materials(theme);
    this.lamps = { free: new MeshBasicMaterial(), full: new MeshBasicMaterial(), stale: new MeshBasicMaterial() };
    this.fill = new MeshStandardMaterial({ roughness: 0.5 });
    this.fillOver = new MeshStandardMaterial({ roughness: 0.5 });
    this.cap = new MeshStandardMaterial({ roughness: 0.6 });
    this.sun.castShadow = true;
    this.sun.shadow.mapSize.set(2048, 2048);
    this.sun.shadow.bias = -0.0004;
    this.sun.shadow.normalBias = 0.02;
    this.content.name = 'lobby';
    this.scene.add(this.hemi, this.sun, this.sun.target, this.content);
    this.setTheme(theme);
  }

  /** Rebuilds the hall when what it shows changed; says whether it did. */
  setLobby(detail: LobbyInput): boolean {
    const plan = lobbyPlan(detail);
    const signature = planSignature(plan);
    if (signature === this.signature) return false;
    this.signature = signature;
    this.plan = plan;
    this.rebuild(plan);
    return true;
  }

  setTheme(theme: ThemeTokens): void {
    this.theme = theme;
    this.mats.applyTheme(theme);
    this.lamps.free.color.set(theme.colors['s-done']);
    this.lamps.full.color.set(theme.colors['s-needs']);
    this.lamps.stale.color.set(theme.colors['s-nosignal']);
    this.fill.color.set(theme.colors.accent);
    this.fillOver.color.set(theme.colors['s-needs']);
    this.cap.color.set(theme.colors['scene-monitor']);
    this.hemi.color.set(theme.colors['hemi-sky']);
    this.hemi.groundColor.set(theme.colors['hemi-ground']);
    this.hemi.intensity = theme.numbers['hemi-int'];
    this.sun.color.set(theme.colors.sun);
    this.sun.intensity = theme.numbers['sun-int'];
    // The signs are drawn in the theme's colours: the hall is built again.
    if (this.plan) this.rebuild(this.plan);
  }

  dispose(): void {
    this.clear();
    this.sun.dispose();
    this.hemi.dispose();
    for (const m of [...Object.values(this.lamps), this.fill, this.fillOver, this.cap]) m.dispose();
    this.scene.clear();
    this.geo.dispose();
    this.mats.dispose();
  }

  private rebuild(plan: LobbyPlan): void {
    this.clear();
    this.build(plan);
    this.fitSun(plan.size);
  }

  private clear(): void {
    for (const s of this.signs) {
      s.texture?.dispose();
      s.material.dispose();
    }
    this.signs.length = 0;
    this.robots.length = 0;
    this.content.clear();
  }

  private build(p: LobbyPlan): void {
    const s = this.mats.surface;
    const g = this.geo;
    const root = this.content;
    const { w, h } = p.size;
    // The slab, and the north and west walls: the camera looks from the south-east, as on a floor.
    part(root, g.box(w + 0.4, 0.3, h + 0.4), s.base, w / 2, -0.16, h / 2, { cast: false });
    part(root, g.box(w, 0.02, h), s.lobby, w / 2, 0, h / 2, { cast: false });
    part(root, g.box(w, WALL_H, WALL_T), s.wall, w / 2, WALL_H / 2, -WALL_T / 2);
    part(root, g.box(WALL_T, WALL_H, h), s.wall, -WALL_T / 2, WALL_H / 2, h / 2);
    // The entrance: a mat at the south edge, under the line's tail.
    part(root, g.box(2.4, 0.02, 1.2), s.loungeRug, w / 2, 0.012, h - 0.7, { cast: false });
    for (const e of p.elevators) this.elevator(e);
    this.counter(p);
    for (const c of p.couches) this.couch(c);
    for (const f of [...p.line, ...p.ready]) this.figure(f);
    if (p.lineMore > 0) this.chip(`+${p.lineMore} refused`, p.counter.x + 1.1, (p.line.at(-1)?.spot.z ?? p.counter.z) + 0.3);
    if (p.readyMore > 0) this.chip(`+${p.readyMore} ready`, p.couches[0]!.x + 1.4, p.couches.at(-1)!.z + 1.8);
  }

  private elevator(e: Elevator): void {
    const s = this.mats.surface;
    const g = this.geo;
    const root = this.content;
    const frame = e.org ? this.mats.org(e.org) : s.frame;
    part(root, g.box(FRAME_W, DOOR_H + FRAME_OVER, 0.08), frame, e.x, (DOOR_H + FRAME_OVER) / 2, 0.04);
    for (const side of [-1, 1]) part(root, g.box(LIFT.door - 0.02, DOOR_H, 0.05), s.elevator, e.x + (side * LIFT.door) / 2, DOOR_H / 2, 0.11, { cast: false });
    part(root, g.box(LAMP.w, LAMP.h, 0.04), this.lamps[lampOf(e)], e.x, LAMP.y, 0.06, { cast: false });
    // The week's gauge: an empty tube, filled from the bottom with the week used, red at the seat's limit.
    const gx = e.x + FRAME_W / 2 + GAUGE.off;
    part(root, g.box(GAUGE.w, GAUGE.h, 0.05), s.base, gx, GAUGE.y + GAUGE.h / 2, 0.05, { cast: false });
    if (e.weekPct !== null && e.weekPct > 0) {
      const fh = (GAUGE.h * Math.min(100, e.weekPct)) / 100;
      part(root, g.box(GAUGE.w * 0.7, fh, 0.06), e.weekOver ? this.fillOver : this.fill, gx, GAUGE.y + fh / 2, 0.06, { cast: false });
    }
    // The seat the team uses now has a mat in front of its doors.
    if (e.current) part(root, g.box(FRAME_W, 0.02, 1.1), s.loungeRug, e.x, 0.014, 0.75, { cast: false });
    this.sign(signText(e), e.x, SIGN.y, 0.07, SIGN.w, SIGN.h);
  }

  private counter(p: LobbyPlan): void {
    const s = this.mats.surface;
    const c = p.counter;
    part(this.content, this.geo.rbox(c.w, c.h, c.d, 0.06), s.desk, c.x, c.h / 2, c.z);
    part(this.content, this.geo.box(c.w + 0.1, 0.05, c.d + 0.1), s.wood, c.x, c.h + 0.025, c.z);
    const doorman = buildRobot('doorman', { pose: 'holding', badge: null, body: 0, tie: null, org: null }, this.geo, this.mats);
    // The orchestrator's cap: a crown and a brim at the front, over the monitor head.
    part(doorman.rig.neck, this.geo.rod(0.2, 0.2, 0.08, 24), this.cap, 0, 0.38, 0);
    part(doorman.rig.neck, this.geo.box(0.36, 0.02, 0.16), this.cap, 0, 0.345, 0.17);
    greyRobot(doorman, this.mats);
    poseRobot(doorman, { pose: 'holding', badge: null }, p.doorman);
    this.content.add(doorman.group);
    this.robots.push(doorman);
    this.sign('Gordon', c.x, c.h + 0.32, c.z + c.d / 2 + 0.06, 1.4, 0.26);
  }

  private couch(c: Couch): void {
    const s = this.mats.surface;
    const g = this.geo;
    const grp = new Group();
    grp.position.set(c.x, 0, c.z);
    grp.rotation.y = c.facing;
    // Built facing south (+z), its back to the north, as a floor's lounge couch.
    part(grp, g.rbox(COUCH.w, 0.42, COUCH.d, 0.08), s.couch, 0, 0.21, 0);
    part(grp, g.rbox(COUCH.w, 0.62, COUCH_BACK, 0.08), s.couch, 0, 0.6, -(COUCH.d / 2 - COUCH_BACK / 2));
    for (const end of [-1, 1]) part(grp, g.rbox(COUCH_ARM, 0.56, COUCH.d, 0.08), s.couch, end * (COUCH.w / 2), 0.38, 0);
    this.content.add(grp);
  }

  private figure(f: Figure): void {
    const robot = buildRobot(f.id, { ...f.robot, body: f.robot.body ?? 0 }, this.geo, this.mats);
    if (f.robot.body === null) greyRobot(robot, this.mats);
    poseRobot(robot, f.robot, f.spot);
    this.content.add(robot.group);
    this.robots.push(robot);
  }

  /** A count on a stand, upright, facing the door. */
  private chip(text: string, x: number, z: number): void {
    part(this.content, this.geo.rod(0.03, 0.03, 0.9), this.mats.surface.leg, x, 0.45, z);
    this.sign(text, x, 1.05, z + 0.04, 1.3, 0.36);
  }

  /** A sign of text drawn on a canvas, upright, facing south. Without a 2D canvas (tests) it is a blank plate. */
  private sign(text: string, x: number, y: number, z: number, w: number, h: number): void {
    const canvas = typeof document === 'undefined' ? null : document.createElement('canvas');
    const ctx = canvas?.getContext('2d') ?? null;
    let material: Material;
    let texture: CanvasTexture | null = null;
    if (canvas && ctx) {
      canvas.width = SIGN_PX.w;
      canvas.height = SIGN_PX.h;
      ctx.fillStyle = this.theme.colors['scene-monitor'];
      ctx.fillRect(0, 0, SIGN_PX.w, SIGN_PX.h);
      ctx.fillStyle = this.theme.colors['scene-paper'];
      ctx.font = `600 ${SIGN_PX.font}px ui-monospace, monospace`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(text, SIGN_PX.w / 2, SIGN_PX.h / 2, SIGN_PX.w - 24);
      texture = new CanvasTexture(canvas);
      texture.colorSpace = SRGBColorSpace;
      material = new MeshBasicMaterial({ map: texture });
    } else {
      material = new MeshBasicMaterial({ color: this.theme.colors['scene-monitor'] });
    }
    const mesh = new Mesh(this.geo.plane(w, h), material);
    mesh.name = `sign ${text}`;
    mesh.position.set(x, y, z);
    this.content.add(mesh);
    this.signs.push({ texture, material });
  }

  private fitSun(size: { w: number; h: number }): void {
    const c = floorCenter(size);
    const e = shadowExtent(size);
    this.sun.position.set(c.x + 9, 20, c.z + 7);
    this.sun.target.position.set(c.x, 0, c.z);
    Object.assign(this.sun.shadow.camera, { left: -e, right: e, top: e, bottom: -e, near: 1, far: 24 + 3 * e });
    this.sun.shadow.camera.updateProjectionMatrix();
  }
}

/** A robot with no repository the building knows is grey: its body and joints take the slab's colours. */
function greyRobot(robot: RobotObject, mats: Materials): void {
  const body = mats.body(0);
  const joint = mats.joint(0);
  robot.group.traverse((o) => {
    const m = o as Mesh;
    if (!m.isMesh) return;
    if (m.material === body) m.material = mats.surface.leg;
    else if (m.material === joint) m.material = mats.surface.base;
  });
}
