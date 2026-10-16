import { describe, expect, it } from 'vitest';
import { HerdrAdapter, parsePaneList, probeHerdr } from '../../src/adapters/herdr.js';
import type { RawEvent } from '../../src/core/types.js';
import type { CommandRunner } from '../../src/server/focus.js';

const S1 = '508ee6c7-d5a1-437c-876c-40abbd82f32b';
const S2 = 'e77e1aad-d5f5-4f79-8ca6-d8396ef29e3c';

/** A listing shaped like `herdr pane list` 0.8: a session pane, a pane herdr does not know an agent for, a plain shell, a non-claude agent. */
function listing(panes: { pane_id: string; session?: string | null; agent?: string }[]): string {
  return JSON.stringify({
    id: 'cli:pane:list',
    result: {
      type: 'pane_list',
      panes: panes.map((p) => ({
        pane_id: p.pane_id,
        tab_id: p.pane_id.replace(':p', ':t'),
        workspace_id: p.pane_id.split(':')[0],
        cwd: '/w/shop',
        agent_status: p.session ? 'idle' : 'unknown',
        ...(p.session ? { agent_session: { agent: p.agent ?? 'claude', kind: 'id', source: 'herdr:claude', value: p.session } } : {}),
      })),
    },
  });
}

function fakeHerdr(answers: (() => { code: number; stdout: string })[]) {
  const calls: string[][] = [];
  let i = 0;
  const run: CommandRunner = async (args) => {
    calls.push(args);
    const a = answers[Math.min(i++, answers.length - 1)]!();
    return { ...a, stderr: '' };
  };
  return { run, calls };
}

describe('parsePaneList', () => {
  it('reads each pane with the claude session it shows', () => {
    const text = listing([{ pane_id: 'wK:p2', session: S1 }, { pane_id: 'wB:p28' }, { pane_id: 'w2:p19', session: 'not an id!' }, { pane_id: 'w2:p1A', session: S2, agent: 'codex' }]);
    expect(parsePaneList(text)).toEqual([
      { pane: 'wK:p2', sessionId: S1 },
      { pane: 'wB:p28', sessionId: null },
      { pane: 'w2:p19', sessionId: null },
      { pane: 'w2:p1A', sessionId: null },
    ]);
  });

  it('is null for anything that is not the listing', () => {
    for (const text of ['', 'not json', '{"result":{}}', '{"result":{"panes":{}}}', '[]']) expect(parsePaneList(text)).toBeNull();
    // A pane id that is not herdr's is skipped, not an error.
    expect(parsePaneList(JSON.stringify({ result: { panes: [{ pane_id: '%7' }, null, 'x'] } }))).toEqual([]);
  });
});

describe('HerdrAdapter', () => {
  it('reports each session\'s pane once, then only changes, and null when a pane stops showing it', async () => {
    const events: RawEvent[] = [];
    const reach: boolean[] = [];
    const h = fakeHerdr([
      () => ({ code: 0, stdout: listing([{ pane_id: 'wK:p2', session: S1 }, { pane_id: 'w2:p19', session: S2 }]) }),
      () => ({ code: 0, stdout: listing([{ pane_id: 'wK:p2', session: S1 }, { pane_id: 'w2:p19', session: S2 }]) }),
      () => ({ code: 0, stdout: listing([{ pane_id: 'wK:p3', session: S1 }]) }),
    ]);
    const a = new HerdrAdapter({ emit: (e) => events.push(e), run: h.run, onReachable: (v) => reach.push(v), now: () => 5000 });
    await a.poll();
    expect(events).toEqual([
      { type: 'pane', sessionId: S1, ts: 5000, source: 'terminal', pane: 'wK:p2' },
      { type: 'pane', sessionId: S2, ts: 5000, source: 'terminal', pane: 'w2:p19' },
    ]);
    events.length = 0;
    await a.poll();
    expect(events).toEqual([]);
    await a.poll();
    expect(events).toEqual([
      { type: 'pane', sessionId: S1, ts: 5000, source: 'terminal', pane: 'wK:p3' },
      { type: 'pane', sessionId: S2, ts: 5000, source: 'terminal', pane: null },
    ]);
    expect(h.calls.every((c) => c.join(' ') === 'pane list')).toBe(true);
    expect(reach).toEqual([true]);
  });

  it('says when herdr stops answering, changes no pane meanwhile, and says when it is back', async () => {
    const events: RawEvent[] = [];
    const reach: boolean[] = [];
    let down = false;
    const h = fakeHerdr([() => (down ? { code: 1, stdout: '' } : { code: 0, stdout: listing([{ pane_id: 'wK:p2', session: S1 }]) })]);
    const a = new HerdrAdapter({ emit: (e) => events.push(e), run: h.run, onReachable: (v) => reach.push(v) });
    await a.poll();
    down = true;
    await a.poll();
    await a.poll();
    down = false;
    await a.poll();
    expect(events.map((e) => e.type === 'pane' && e.pane)).toEqual(['wK:p2']);
    expect(reach).toEqual([true, false, true]);
  });

  it('polls on a timer until stopped, skipping a poll while one runs', async () => {
    let calls = 0;
    let release!: () => void;
    const gate = new Promise<void>((r) => (release = r));
    const run: CommandRunner = async () => {
      calls++;
      await gate;
      return { code: 0, stdout: listing([]), stderr: '' };
    };
    const a = new HerdrAdapter({ emit: () => {}, run });
    a.start(1);
    await new Promise((r) => setTimeout(r, 15));
    a.stop();
    release();
    await new Promise((r) => setTimeout(r, 5));
    expect(calls).toBe(1);
  });
});

describe('probeHerdr', () => {
  it('is true when herdr lists its panes, false when it does not run or answers otherwise', async () => {
    expect(await probeHerdr(async () => ({ code: 0, stdout: listing([]), stderr: '' }))).toBe(true);
    expect(await probeHerdr(async () => ({ code: 127, stdout: '', stderr: 'not found' }))).toBe(false);
    expect(await probeHerdr(async () => ({ code: 0, stdout: 'herdr 0.8.0', stderr: '' }))).toBe(false);
    expect(await probeHerdr(async () => { throw new Error('boom'); })).toBe(false);
  });
});
