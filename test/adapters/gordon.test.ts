import { describe, expect, it } from 'vitest';
import { mkdir, mkdtemp, rm, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { GordonProvider } from '../../src/adapters/gatekeepers/gordon.js';
import type { Lobby } from '../../src/core/types.js';

const NOW = Date.parse('2026-10-16T14:02:30+02:00');

async function state() {
  const root = await mkdtemp(join(tmpdir(), 'shq-gordon-'));
  const dir = join(root, 'gordon');
  const limitsDir = join(root, 'claude-limits');
  const cgroupDir = join(root, 'claude.slice');
  await Promise.all([mkdir(dir), mkdir(limitsDir), mkdir(cgroupDir)]);
  await writeFile(join(dir, 'lobby.json'), JSON.stringify({
    updated_at: '2026-10-16T14:02:11+02:00',
    gate: { verdict: 'ASPETTA', text: "ASPETTA: slice delle sessioni al 84% del tetto (watchdog all'85%);" },
    waiting: [{ id: 'G-270', name: 'G-270 segnali a J', profile: 'leonardo', since: '2026-10-16T13:58:00+02:00', reason: 'slice delle sessioni al 84% del tetto' }],
    working: 6,
  }));
  await writeFile(join(dir, 'limits.json'), '{"sessions_max": 7}');
  await writeFile(join(dir, 'watchdog-stopgap.log'), "13:36 WATCHDOG: sessioni Claude all'88% → lanci fermati (sessions_max 0), pausa mandata a: wE:p1E wK:p2 \n");
  await writeFile(join(dir, 'seats-accounts.json'), JSON.stringify({ 'Jacopo Anselmi': { email: 'jacopo@example.com' }, 'Leonardo Davinci': { email: 'leonardo@example.com', profile: 'leonardo' }, 'Personale (J)': { email: 'j@gmail.example', profile: 'personal' } }));
  await writeFile(join(dir, 'seats.jsonl'), '{"ev":"set","seat":"Jacopo Anselmi"}\n');
  await writeFile(join(dir, 'seats-order.txt'), 'Leonardo Davinci\n');
  await writeFile(join(dir, 'tasks.jsonl'), JSON.stringify({ ev: 'update', id: 'G-268', sessions: [{ pane: 'wK:p2' }] }) + '\n');
  await writeFile(join(limitsDir, 'jacopo@example.com.json'), JSON.stringify({ email: 'jacopo@example.com', five_hour: { used_percentage: 6 }, seven_day: { used_percentage: 41 }, written_at: NOW / 1000 - 60 }));
  await writeFile(join(limitsDir, 'leonardo@example.com.json'), JSON.stringify({ email: 'leonardo@example.com', five_hour: { used_percentage: 9 }, seven_day: { used_percentage: 59 }, written_at: NOW / 1000 - 60 }));
  await writeFile(join(cgroupDir, 'memory.stat'), 'anon 17650155520\nshmem 0\n');
  await writeFile(join(cgroupDir, 'memory.max'), '48001552384\n');
  return { dir, limitsDir, cgroupDir };
}

function sink() {
  const lobbies: Lobby[] = [];
  const tasks: [string, string | null][] = [];
  return { lobbies, tasks, sink: { lobby: (l: Lobby) => void lobbies.push(l), task: (id: string, t: string | null) => void tasks.push([id, t]) } };
}

describe('GordonProvider', () => {
  it('reads every file into one Lobby, names tasks by pane, and reports only changes', async () => {
    const s = await state();
    const out = sink();
    const p = new GordonProvider({ ...s, panes: () => new Map([['S1', 'wK:p2'], ['S2', 'wB:p9']]), now: () => NOW });
    p.start(out.sink, 60_000);
    await p.poll();
    expect(out.lobbies).toHaveLength(1);
    const l = out.lobbies[0]!;
    expect(l.gate).toMatchObject({ go: false, reasons: [{ kind: 'slice' }] });
    expect(l.queue).toEqual([{ id: 'G-270', name: 'G-270 segnali a J', account: 'leonardo@example.com', since: Date.parse('2026-10-16T13:58:00+02:00'), reason: { kind: 'slice', text: 'slice delle sessioni al 84% del tetto' } }]);
    // The rota first, then the rest; the owner's seat takes turns, the personal account does not.
    expect(l.seats.map((x) => [x.name, x.current, x.turnable])).toEqual([['Leonardo', false, true], ['Jacopo', true, true], ['Personale', false, false]]);
    expect(l.turnTo).toBe('leonardo@example.com');
    expect(l.power).toEqual({ usedBytes: 17650155520, maxBytes: 48001552384, warnPct: 85, held: false, pausedPanes: ['wE:p1E', 'wK:p2'] });
    expect(l.cap).toEqual({ working: 6, max: 7 });
    expect(l.doorman).toEqual({ name: 'Gordon' });
    expect(l.updatedAt).toBe(Date.parse('2026-10-16T14:02:11+02:00'));
    expect(out.tasks).toEqual([['S1', 'G-268']]);
    await p.poll();
    expect(out.lobbies).toHaveLength(1);
    expect(out.tasks).toHaveLength(1);
    p.stop();
  });

  it('keeps the seats and the power when lobby.json is corrupt or gone, and empties the gate and the queue', async () => {
    const s = await state();
    const out = sink();
    const p = new GordonProvider({ ...s, panes: () => new Map(), now: () => NOW });
    p.start(out.sink, 60_000);
    await writeFile(join(s.dir, 'lobby.json'), '{"gate": {"verdict": "ASP');
    await p.poll();
    expect(out.lobbies[0]).toMatchObject({ gate: null, queue: [], cap: { working: null, max: 7 } });
    expect(out.lobbies[0]!.seats).toHaveLength(3);
    expect(out.lobbies[0]!.power).not.toBeNull();
    await rm(join(s.dir, 'lobby.json'));
    await p.poll();
    expect(out.lobbies).toHaveLength(1);
    p.stop();
  });

  it('without lobby.json reports once, dates the Lobby by the newest file read, and says nothing again while nothing changes', async () => {
    const s = await state();
    await rm(join(s.dir, 'lobby.json'));
    const out = sink();
    let now = NOW;
    const p = new GordonProvider({ ...s, panes: () => new Map(), now: () => now });
    p.start(out.sink, 60_000);
    await p.poll();
    now += 5000;
    await p.poll();
    now += 5000;
    await p.poll();
    expect(out.lobbies).toHaveLength(1);
    const newest = Math.max(...(await Promise.all(['limits.json', 'watchdog-stopgap.log', 'seats-accounts.json', 'seats.jsonl', 'seats-order.txt', 'tasks.jsonl'].map(async (f) => (await stat(join(s.dir, f))).mtimeMs))));
    expect(out.lobbies[0]!.updatedAt).toBe(Math.round(newest));
    p.stop();
  });

  it('skips an account entry that is not one, and keeps the other seats', async () => {
    const s = await state();
    await writeFile(join(s.dir, 'seats-accounts.json'), JSON.stringify({ Broken: null, 'Leonardo Davinci': { email: 'leonardo@example.com', profile: 'leonardo' } }));
    const out = sink();
    const p = new GordonProvider({ ...s, panes: () => new Map(), now: () => NOW });
    p.start(out.sink, 60_000);
    await p.poll();
    expect(out.lobbies[0]!.seats.map((x) => x.name)).toEqual(['Leonardo']);
    expect(out.lobbies[0]!.queue[0]!.account).toBe('leonardo@example.com');
    p.stop();
  });

  it('takes the hold from limits.json when it can be read, and from the watchdog log only when it cannot', async () => {
    const s = await state();
    const out = sink();
    const p = new GordonProvider({ ...s, panes: () => new Map(), now: () => NOW });
    p.start(out.sink, 60_000);
    // The log's last WATCHDOG line still says held; limits.json says 7: the cap was restored.
    await p.poll();
    expect(out.lobbies.at(-1)!.power!.held).toBe(false);
    await writeFile(join(s.dir, 'limits.json'), '{"sessions_max": 0}');
    await p.poll();
    expect(out.lobbies.at(-1)!.power!.held).toBe(true);
    await rm(join(s.dir, 'limits.json'));
    await p.poll();
    expect(out.lobbies.at(-1)!.power!.held).toBe(true);
    p.stop();
  });

  it('emits a Lobby with nothing read when the directory is missing, and polls on a timer until stopped', async () => {
    const out = sink();
    let polls = 0;
    const p = new GordonProvider({ dir: '/nonexistent/gordon', limitsDir: '/nonexistent/limits', cgroupDir: '/nonexistent/cg', panes: () => new Map(), now: () => NOW, log: () => {} });
    const orig = p.poll.bind(p);
    p.poll = async () => {
      polls++;
      await orig();
    };
    p.start(out.sink, 5);
    await new Promise((r) => setTimeout(r, 60));
    p.stop();
    const after = polls;
    await new Promise((r) => setTimeout(r, 30));
    expect(polls).toBe(after);
    expect(polls).toBeGreaterThanOrEqual(2);
    expect(out.lobbies).toHaveLength(1);
    expect(out.lobbies[0]).toMatchObject({ gate: null, queue: [], seats: [], turnTo: null, power: null, cap: null });
  });
});
