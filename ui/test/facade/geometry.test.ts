import { describe, expect, it } from 'vitest';
import type { FloorSummary } from '../../../src/scene/types';
import { FLOOR_H, LABEL_W, LOBBY_H, TW, box, facadeOf, points, project, type FacadeModel } from '../../facade/geometry';
import { makeScene } from '../helpers/fixtures';

/** Every x,y pair the model draws, from points strings and lines. */
function everyPoint(m: FacadeModel): Array<[number, number]> {
  const out: Array<[number, number]> = [];
  const walk = (v: unknown): void => {
    if (typeof v === 'string' && /^-?\d/.test(v)) for (const p of v.split(' ')) out.push(p.split(',').map(Number) as [number, number]);
    else if (Array.isArray(v) && v.length === 4 && v.every((n) => typeof n === 'number')) {
      const [x1, y1, x2, y2] = v as [number, number, number, number];
      out.push([x1, y1], [x2, y2]);
    }
    else if (v && typeof v === 'object') for (const x of Object.values(v)) walk(x);
  };
  walk({ plinth: m.plinth, lobby: m.lobby, floors: m.floors, roof: m.roof });
  return out;
}

function floorWith(n: number, overrides: Partial<FloorSummary> = {}): FloorSummary {
  const f = makeScene().floors[0]!;
  return { ...f, windows: Array.from({ length: n }, (_, i) => ({ sessionId: `s${i}`, state: 'working' as const })), ...overrides };
}

describe('façade geometry', () => {
  it('projects the grid isometrically, height going up the page', () => {
    expect(project(0, 0)).toEqual([0, 0]);
    expect(project(1, 0)).toEqual([32, 16]);
    expect(project(0, 1)).toEqual([-32, 16]);
    expect(project(0, 0, 10)).toEqual([0, -10]);
  });

  it('writes points to a tenth of a pixel', () => {
    expect(points([[1.234, -5.678], [0, 0.05]])).toBe('1.2,-5.7 0,0.1');
  });

  it('draws a box as its top and two front faces', () => {
    expect(box(0, 0, 1, 1, 0, 10)).toEqual({
      top: '0,-10 32,6 0,22 -32,6',
      left: '-32,6 0,22 0,32 -32,16',
      right: '32,6 0,22 0,32 32,16',
    });
  });

  it('stacks the floors bottom-up on the lobby: the scene lists them top-down', () => {
    const scene = makeScene();
    const m = facadeOf(scene.floors);
    expect(m.floors.map((f) => f.number)).toEqual([1, 2, 3, 4]);
    expect(m.floors.map((f) => f.key)).toEqual([...scene.floors].reverse().map((f) => f.key));
    const nameY = m.floors.map((f) => f.label.nameAt[1]);
    for (let j = 1; j < nameY.length; j++) expect(nameY[j]! - nameY[j - 1]!).toBeCloseTo(-FLOOR_H, 5);
    expect(m.lobby.label.circle[1]).toBeGreaterThan(m.floors[0]!.label.circle[1]);
  });

  it('lifts the Lobby\'s name when its label carries a meta line, as a floor\'s does', () => {
    const floors = makeScene().floors;
    const plain = facadeOf(floors).lobby.label;
    const withMeta = facadeOf(floors, true).lobby.label;
    expect(withMeta.circle).toEqual(plain.circle);
    expect(withMeta.nameAt[1]).toBeLessThan(plain.nameAt[1]);
    expect(withMeta.metaAt[1]).toBeGreaterThan(withMeta.nameAt[1]);
  });

  it('gives each desk of a floor\'s plan a window, in desk order, dark where it is free, and leaves the row past its plan to the wall', () => {
    const m = facadeOf(makeScene().floors);
    expect(m.width).toBe(16);
    const checkout = m.floors[3]!;
    const free = (n: number) => Array<string>(n).fill('null:null:false');
    expect(checkout.windows.map((w) => `${w.sessionId}:${w.state}:${w.lit}`)).toEqual([
      'oa-c3:needs_you:true',
      ...free(3),
      'ps-d4:in_meeting:true',
      ...free(3),
      'sw-a1:working:true',
      'sw-b2:done:true',
      ...free(6),
    ]);
    const orders = m.floors[1]!;
    expect(orders.windows.map((w) => w.lit)).toEqual([true, true, true, false, true, false, false, false]);
    expect(orders).not.toHaveProperty('blanks');
    const xs = checkout.windows.map((w) => Number(w.points.split(' ')[0]!.split(',')[0]));
    expect(xs).toEqual([...xs].sort((a, b) => a - b));
  });

  it('is as wide as the busiest floor, and never narrower than six windows', () => {
    expect(facadeOf([floorWith(9)]).width).toBe(9);
    expect(facadeOf([floorWith(2)]).width).toBe(6);
    expect(facadeOf([]).width).toBe(6);
  });

  it('lowers the shutters with three slats per window of its plan on a dormant floor only', () => {
    const m = facadeOf(makeScene().floors);
    expect(m.floors.map((f) => f.shutters)).toEqual([true, false, false, false]);
    expect([m.width, m.floors[0]!.windows.length]).toEqual([16, 8]);
    expect(m.floors[0]!.slats).toHaveLength(8 * 3);
    expect(m.floors[1]!.slats).toHaveLength(0);
  });

  it('frames the whole model and the label column in the viewBox', () => {
    for (const floors of [makeScene().floors, [floorWith(12)], []]) {
      const m = facadeOf(floors);
      const [x, y, w, h] = m.viewBox.split(' ').map(Number) as [number, number, number, number];
      for (const [px, py] of everyPoint(m)) {
        expect(px).toBeGreaterThanOrEqual(x);
        expect(px).toBeLessThanOrEqual(x + w);
        expect(py).toBeGreaterThanOrEqual(y);
        expect(py).toBeLessThanOrEqual(y + h);
      }
      expect(x + w).toBeGreaterThanOrEqual((m.width * TW) / 2 + 40 + LABEL_W);
    }
  });

  it('draws no apron, queue or tank without a gatekeeper', () => {
    const m = facadeOf(makeScene().floors);
    expect(m.gate).toBeNull();
    expect(m.roof.units).toHaveLength(2);
  });

  it('lays an apron before the two doors with eight places in a line going away from them, one for the group beyond and one for the doorman', () => {
    const m = facadeOf(makeScene().floors, true, true);
    const g = m.gate!;
    expect(g.slots).toHaveLength(8);
    // The line leaves the door towards the viewer: every place is lower on the page and further left than the one before.
    for (let i = 1; i < g.slots.length; i++) {
      expect(g.slots[i]![1]).toBeGreaterThan(g.slots[i - 1]![1]);
      expect(g.slots[i]![0]).toBeLessThan(g.slots[i - 1]![0]);
    }
    expect(g.more[1]).toBeGreaterThan(g.slots[7]![1]);
    expect(g.more[0]).toBeLessThan(g.slots[7]![0]);
    // The head of the line stands at the doors, the doorman beside them.
    const doorXs = m.lobby.doors.flatMap((d) => d.split(' ').map((p) => Number(p.split(',')[0])));
    const [from, to] = [Math.min(...doorXs), Math.max(...doorXs)];
    expect(g.slots[0]![0]).toBeGreaterThanOrEqual(from - TW / 2);
    expect(g.slots[0]![0]).toBeLessThanOrEqual(to + TW / 2);
    expect(g.doorman[1]).toBeLessThan(g.slots[7]![1]);
    // The apron is a slab at the plinth's height, in front of the plinth.
    expect(g.apron.top).not.toBe(m.plinth.top);
  });

  it("swaps the roof's first unit for the water tank, which stands on the slab", () => {
    const m = facadeOf(makeScene().floors, true, true);
    expect(m.roof.units).toHaveLength(1);
    expect(m.gate!.tank).toMatchObject({ rx: 22, ry: 11, h: 34, legH: 11 });
    const zr = LOBBY_H + m.floors.length * FLOOR_H;
    expect([m.gate!.tank.cx, m.gate!.tank.cy]).toEqual(project(1.25, 1.1, zr + 6).map((n) => Math.round(n * 10) / 10));
  });

  it('frames the apron, the robots standing on it, the doorman and the tank in the viewBox', () => {
    for (const floors of [makeScene().floors, [floorWith(12)], []]) {
      const m = facadeOf(floors, true, true);
      const g = m.gate!;
      const [x, y, w, h] = m.viewBox.split(' ').map(Number) as [number, number, number, number];
      const inside = (px: number, py: number) => {
        expect(px).toBeGreaterThanOrEqual(x);
        expect(px).toBeLessThanOrEqual(x + w);
        expect(py).toBeGreaterThanOrEqual(y);
        expect(py).toBeLessThanOrEqual(y + h);
      };
      for (const face of [g.apron.top, g.apron.left, g.apron.right]) for (const p of face.split(' ')) inside(...(p.split(',').map(Number) as [number, number]));
      // A robot is about 30 px tall, and its group's counter stands to the right.
      for (const [px, py] of [...g.slots, g.more, g.doorman]) { inside(px, py); inside(px, py - 34); }
      // The counter hangs under the group, 36 px wide at the most and 20 px below its feet.
      inside(g.more[0] - 18, g.more[1] + 20);
      inside(g.more[0] + 18, g.more[1] + 20);
      // The tank: its cone is 2 px wider a side than the lid and 13 px over it; its front legs reach a third of a radius below the base.
      inside(g.tank.cx - g.tank.rx - 2, g.tank.cy - g.tank.legH - g.tank.h - 13);
      inside(g.tank.cx + g.tank.rx + 2, g.tank.cy + 0.35 * g.tank.ry);
    }
  });

  it("hangs the group's counter clear of the last robot of the line", () => {
    const g = facadeOf(makeScene().floors, true, true).gate!;
    const last = g.slots[7]!;
    // The counter spans 18 px either side of the group and from 6 to 20 px below its feet; a robot spans 14 px either side of its feet and 34 up to 3 down.
    const chip = { x0: g.more[0] - 18, x1: g.more[0] + 18, y0: g.more[1] + 6, y1: g.more[1] + 20 };
    const bot = { x0: last[0] - 14, x1: last[0] + 14, y0: last[1] - 34, y1: last[1] + 3 };
    const overlap = chip.x0 < bot.x1 && bot.x0 < chip.x1 && chip.y0 < bot.y1 && bot.y0 < chip.y1;
    expect(overlap).toBe(false);
  });

  it('keeps an empty building to its lobby and roof', () => {
    const m = facadeOf([]);
    expect(m.floors).toEqual([]);
    expect(m.lobby.doors).toHaveLength(2);
    expect(m.lobby.windows).toHaveLength(4);
    expect(m.roof.units).toHaveLength(2);
    expect(m.roof.slab.top).toBe(box(-0.12, -0.12, 6.12, 3.12, LOBBY_H, LOBBY_H + 6).top);
  });
});
