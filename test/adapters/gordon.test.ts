import { describe, expect, it } from 'vitest';
import { mkdir, mkdtemp, rm, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { GORDON_LIMITS } from '../../src/adapters/gatekeepers/gordon-files.js';
import { GordonProvider } from '../../src/adapters/gatekeepers/gordon.js';
import type { Lobby } from '../../src/core/types.js';

const NOW = Date.parse('2026-10-16T14:02:30+02:00');

async function state() {
  const root = await mkdtemp(join(tmpdir(), 'shq-gordon-'));
  const dir = join(root, 'gordon');
  const limitsDir = join(root, 'claude-limits');
  const cgroupDir = join(root, 'claude.slice');
  const procDir = join(root, 'proc');
  await Promise.all([mkdir(dir), mkdir(limitsDir), mkdir(cgroupDir), mkdir(procDir)]);
  await writeFile(join(procDir, 'loadavg'), '1.27 0.98 0.80 3/1893 3262771\n');
  await writeFile(join(procDir, 'cpuinfo'), 'processor\t: 0\ncpu MHz\t\t: 1713.000\nprocessor\t: 1\ncpu MHz\t\t: 1713.000\n');
  await writeFile(join(dir, 'lobby.json'), JSON.stringify({
    updated_at: '2026-10-16T14:02:11+02:00',
    gate: { verdict: 'ASPETTA', text: "ASPETTA: slice delle sessioni al 84% del tetto (watchdog all'85%);" },
    waiting: [{ id: 'G-270', name: 'G-270 segnali a J', profile: 'leonardo', since: '2026-10-16T13:58:00+02:00', reason: 'slice delle sessioni al 84% del tetto' }],
    working: 6,
    machine: { mem_gb: 34, mem_total_gb: 62, slice_pct: 23, load: 1, threads: 24, disk_busy_pct: 0, psi_mem_pct: 0, rebuild: false, cpu_mhz: 900, nproc: 24 },
    capacity: { sessions_max: 7, working: 6, slots_free: 1, plan: 'tetto 7, al lavoro 6, liberi 1 · macchina ASPETTA · in fila 1 (1 rifiutate, 0 pronte)' },
  }));
  await writeFile(join(dir, 'limits.json'), '{"sessions_max": 7}');
  await writeFile(join(dir, 'watchdog-stopgap.log'), "13:36 WATCHDOG: sessioni Claude all'88% → lanci fermati (sessions_max 0), pausa mandata a: wE:p1E wK:p2 \n");
  await writeFile(join(dir, 'seats-accounts.json'), JSON.stringify({ 'Jacopo Anselmi': { email: 'jacopo@example.com' }, 'Leonardo Davinci': { email: 'leonardo@example.com', profile: 'leonardo' }, 'Personale (J)': { email: 'j@gmail.example', profile: 'personal' } }));
  await writeFile(join(dir, 'seats.jsonl'), '{"ev":"set","seat":"Jacopo Anselmi"}\n');
  await writeFile(join(dir, 'seats-order.txt'), 'Leonardo Davinci\n');
  await writeFile(join(dir, 'tasks.jsonl'), JSON.stringify({ ev: 'update', id: 'G-268', sessions: [{ pane: 'wK:p2' }] }) + '\n' + JSON.stringify({ ev: 'add', id: 'G-270', repo: 'nixos' }) + '\n');
  await writeFile(join(limitsDir, 'jacopo@example.com.json'), JSON.stringify({ email: 'jacopo@example.com', five_hour: { used_percentage: 6 }, seven_day: { used_percentage: 41 }, written_at: NOW / 1000 - 60 }));
  await writeFile(join(limitsDir, 'leonardo@example.com.json'), JSON.stringify({ email: 'leonardo@example.com', five_hour: { used_percentage: 9 }, seven_day: { used_percentage: 59 }, written_at: NOW / 1000 - 60 }));
  await writeFile(join(cgroupDir, 'memory.stat'), 'anon 17650155520\nshmem 0\n');
  await writeFile(join(cgroupDir, 'memory.max'), '48001552384\n');
  return { dir, limitsDir, cgroupDir, procDir };
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
    expect(l.queue).toEqual([{ id: 'G-270', name: 'G-270 segnali a J', account: 'leonardo@example.com', since: Date.parse('2026-10-16T13:58:00+02:00'), reason: { kind: 'slice', text: 'slice delle sessioni al 84% del tetto' }, kind: 'refused', area: 'personali', repo: 'nixos' }]);
    // The rota first, then the rest; the owner's seat takes turns, the personal account does not.
    expect(l.seats.map((x) => [x.name, x.current, x.turnable])).toEqual([['Leonardo', false, true], ['Jacopo', true, true], ['Personale', false, false]]);
    expect(l.turnTo).toBe('leonardo@example.com');
    expect(l.power).toEqual({ usedBytes: 17650155520, maxBytes: 48001552384, warnPct: 85, held: false, pausedPanes: ['wE:p1E', 'wK:p2'] });
    expect(l.cap).toEqual({ working: 6, max: 7 });
    expect(l.doorman).toEqual({ name: 'Gordon' });
    expect(l.plan).toBe('tetto 7, al lavoro 6, liberi 1 · macchina ASPETTA · in fila 1 (1 rifiutate, 0 pronte)');
    expect(l.limits).toEqual(GORDON_LIMITS);
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
    const p = new GordonProvider({ dir: '/nonexistent/gordon', limitsDir: '/nonexistent/limits', cgroupDir: '/nonexistent/cg', procDir: '/nonexistent/proc', panes: () => new Map(), now: () => NOW, log: () => {} });
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
    expect(out.lobbies[0]).toMatchObject({ gate: null, queue: [], seats: [], turnTo: null, power: null, cap: null, machine: null, plan: null });
  });

  it("reads the machine as the gate measured it and the CPU live, and rounds the CPU so that noise is not news", async () => {
    const s = await state();
    const out = sink();
    let now = NOW;
    const p = new GordonProvider({ ...s, panes: () => new Map(), now: () => now });
    p.start(out.sink, 60_000);
    await p.poll();
    // The gate's figures stay; load, frequency and processors come from /proc now (1.27 → 1.0, as the gate floors it; 1713 MHz → 1700; 2 cores), not from the file's 1, 900 and 24.
    expect(out.lobbies[0]!.machine).toEqual({
      memAvailableGb: 34, memTotalGb: 62, slicePct: 23, load: 1, threads: 24, diskBusyPct: 0, psiMemPct: 0, rebuild: false, cpuMhz: 1700, cpuBraking: false, nproc: 2,
    });
    // Load and frequency that move inside their rounding step change nothing.
    await writeFile(join(s.procDir, 'loadavg'), '1.41 1.00 0.81 3/1893 3262772\n');
    await writeFile(join(s.procDir, 'cpuinfo'), 'processor\t: 0\ncpu MHz\t\t: 1690.000\nprocessor\t: 1\ncpu MHz\t\t: 1741.000\n');
    await p.poll();
    expect(out.lobbies).toHaveLength(1);
    // Nor does a frequency that jumps from reading to reading, as a real one does, inside the same minute.
    for (const mhz of [2800, 3500, 2300, 3200]) {
      await writeFile(join(s.procDir, 'cpuinfo'), `processor\t: 0\ncpu MHz\t\t: ${mhz}.000\nprocessor\t: 1\ncpu MHz\t\t: ${mhz}.000\n`);
      await p.poll();
    }
    expect(out.lobbies).toHaveLength(1);
    // The next minute carries the figures of the moment.
    now += 61_000;
    await p.poll();
    expect(out.lobbies).toHaveLength(2);
    expect(out.lobbies[1]!.machine).toMatchObject({ cpuMhz: 3200, load: 1, cpuBraking: false });
    // The firmware's brake is news at once: every core under 1 GHz.
    await writeFile(join(s.procDir, 'cpuinfo'), 'processor\t: 0\ncpu MHz\t\t: 600.000\nprocessor\t: 1\ncpu MHz\t\t: 600.000\n');
    await p.poll();
    expect(out.lobbies).toHaveLength(3);
    expect(out.lobbies[2]!.machine).toMatchObject({ cpuMhz: 600, cpuBraking: true });
    p.stop();
  });

  it('brakes only when the mean and the fastest core are both under 1 GHz, judged on the readings before they are rounded', async () => {
    const s = await state();
    const out = sink();
    const p = new GordonProvider({ ...s, panes: () => new Map(), now: () => NOW });
    p.start(out.sink, 60_000);
    // One core at 2400 MHz among slow ones: the mean is low, the machine is not braked.
    await writeFile(join(s.procDir, 'cpuinfo'), 'processor\t: 0\ncpu MHz\t\t: 2400.000\nprocessor\t: 1\ncpu MHz\t\t: 600.000\n');
    await p.poll();
    expect(out.lobbies.at(-1)!.machine).toMatchObject({ cpuMhz: 1500, cpuBraking: false });
    await writeFile(join(s.procDir, 'cpuinfo'), 'processor\t: 0\ncpu MHz\t\t: 990.000\nprocessor\t: 1\ncpu MHz\t\t: 960.000\n');
    await p.poll();
    // 975 MHz rounds to 1000, which is not under the brake, yet the readings are.
    expect(out.lobbies.at(-1)!.machine).toMatchObject({ cpuMhz: 1000, cpuBraking: true });
    p.stop();
  });

  it("falls back on the file's CPU when /proc cannot be read, and on the live CPU alone when the file has no machine", async () => {
    const s = await state();
    const out = sink();
    const p = new GordonProvider({ ...s, procDir: '/nonexistent/proc', panes: () => new Map(), now: () => NOW });
    p.start(out.sink, 60_000);
    await p.poll();
    expect(out.lobbies[0]!.machine).toMatchObject({ load: 1, cpuMhz: 900, cpuBraking: null, nproc: 24, memAvailableGb: 34 });
    p.stop();
    const out2 = sink();
    await writeFile(join(s.dir, 'lobby.json'), JSON.stringify({ updated_at: '2026-10-16T14:02:11+02:00' }));
    const q = new GordonProvider({ ...s, panes: () => new Map(), now: () => NOW });
    q.start(out2.sink, 60_000);
    await q.poll();
    expect(out2.lobbies[0]!.machine).toEqual({
      memAvailableGb: null, memTotalGb: null, slicePct: null, load: 1, threads: null, diskBusyPct: null, psiMemPct: null, rebuild: null, cpuMhz: 1700, cpuBraking: false, nproc: 2,
    });
    q.stop();
  });
});
