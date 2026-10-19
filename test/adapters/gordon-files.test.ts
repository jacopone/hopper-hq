import { describe, expect, it } from 'vitest';
import { mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  buildSeats, parseLimitDoc, parseLimits, parseLobbyFile, parseSeatsLog, parseTaskInfo, parseTaskPanes, parseWatchdogTail, readCpu, readPower, timeOf,
} from '../../src/adapters/gatekeepers/gordon-files.js';

const NOW = Date.parse('2026-10-16T14:02:30+02:00');

describe('timeOf', () => {
  it('reads ISO strings and epoch seconds, and nothing else', () => {
    expect(timeOf('2026-10-16T14:02:11+02:00')).toBe(Date.parse('2026-10-16T14:02:11+02:00'));
    expect(timeOf(1792150178)).toBe(1792150178_000);
    for (const v of ['soon', '', null, undefined, {}, -1]) expect(timeOf(v)).toBeNull();
  });

  it("reads Gordon's registry dates ('2026-10-06 10:06', no offset) in the machine's own time zone", () => {
    const tz = process.env.TZ;
    try {
      process.env.TZ = 'Europe/Rome';
      expect(timeOf('2026-10-06 10:06')).toBe(Date.parse('2026-10-06T10:06:00+02:00'));
      process.env.TZ = 'UTC';
      expect(timeOf('2026-10-06 10:06')).toBe(Date.parse('2026-10-06T10:06:00Z'));
    } finally {
      if (tz === undefined) delete process.env.TZ;
      else process.env.TZ = tz;
    }
  });
});

describe('parseLobbyFile', () => {
  const text = JSON.stringify({
    updated_at: '2026-10-16T14:02:11+02:00',
    gate: { verdict: 'ASPETTA', text: "ASPETTA: slice delle sessioni al 84% del tetto (watchdog all'85%); ultimo avvio 40 s fa (uno ogni 120 s);", at: '2026-10-16T14:02:11+02:00' },
    waiting: [
      { id: 'G-270', name: 'G-270 segnali a J', profile: 'leonardo', since: '2026-10-16T13:58:00+02:00', reason: "slice delle sessioni al 84% del tetto (watchdog all'85%)" },
      { id: 'G-271', name: 'G-271 medic v2', since: 1792150000 },
      { name: 'no id: skipped' },
    ],
    working: 6,
  });

  it('reads the gate, the queue and the working count', () => {
    const l = parseLobbyFile(text)!;
    expect(l.updatedAt).toBe(Date.parse('2026-10-16T14:02:11+02:00'));
    expect(l.gate).toEqual({
      go: false,
      text: "ASPETTA: slice delle sessioni al 84% del tetto (watchdog all'85%); ultimo avvio 40 s fa (uno ogni 120 s);",
      reasons: [
        { kind: 'slice', text: "slice delle sessioni al 84% del tetto (watchdog all'85%)" },
        { kind: 'pacing', text: 'ultimo avvio 40 s fa (uno ogni 120 s)' },
      ],
      at: Date.parse('2026-10-16T14:02:11+02:00'),
    });
    expect(l.queue).toEqual([
      { id: 'G-270', name: 'G-270 segnali a J', profile: 'leonardo', since: Date.parse('2026-10-16T13:58:00+02:00'), reason: { kind: 'slice', text: "slice delle sessioni al 84% del tetto (watchdog all'85%)" }, kind: 'refused', area: null, repo: null },
      { id: 'G-271', name: 'G-271 medic v2', profile: null, since: 1792150000_000, reason: null, kind: 'refused', area: null, repo: null },
    ]);
    expect(l.working).toBe(6);
  });

  it('reads a VIA verdict as go with no reasons, and is null for anything that is not the file', () => {
    expect(parseLobbyFile(JSON.stringify({ gate: { verdict: 'VIA', text: 'VIA: memoria 34 GB, slice 72%' } }))).toMatchObject({ gate: { go: true, reasons: [] }, queue: [], working: null, updatedAt: null });
    for (const bad of ['', '{', '[]', 'null', '"x"']) expect(parseLobbyFile(bad)).toBeNull();
    expect(parseLobbyFile('{}')).toEqual({ gate: null, queue: [], working: null, updatedAt: null, machine: null, plan: null });
  });

  it('tells a refused launch from a ready task, keeps the file order, and takes an entry with no kind for a refusal', () => {
    const l = parseLobbyFile(JSON.stringify({
      waiting: [
        { id: 'G-1', name: 'a', reason: 'carico 49 > 0,75×24 thread', kind: 'rifiutata' },
        { id: 'G-3', name: 'c', reason: 'pronta: brief scritto', kind: 'pronta' },
        { id: 'G-2', name: 'b', reason: 'pronta: brief scritto', kind: 'pronta' },
        { id: 'G-4', name: 'd' },
        { id: 'G-5', name: 'e', kind: 'altro' },
      ],
    }))!;
    expect(l.queue.map((w) => [w.id, w.kind])).toEqual([['G-1', 'refused'], ['G-3', 'ready'], ['G-2', 'ready'], ['G-4', 'refused'], ['G-5', 'refused']]);
  });

  it("reads the area and the repository the orchestrator gives a waiting task, and none when it gives none or something that is not text", () => {
    const l = parseLobbyFile(JSON.stringify({
      waiting: [
        { id: 'G-1', name: 'a', kind: 'pronta', area: 'tenuta', repo: 'nixos' },
        { id: 'G-2', name: 'b', kind: 'pronta' },
        { id: 'G-3', name: 'c', kind: 'pronta', area: 7, repo: ['x'] },
      ],
    }))!;
    expect(l.queue.map((w) => [w.id, w.area, w.repo])).toEqual([['G-1', 'tenuta', 'nixos'], ['G-2', null, null], ['G-3', null, null]]);
  });

  it("reads the machine as the doorman measured it, and the capacity plan line; what is not a number, or a count of zero, is null", () => {
    const l = parseLobbyFile(JSON.stringify({
      updated_at: '2026-10-18T15:27:10+02:00',
      machine: { mem_gb: 34, mem_total_gb: 62, slice_pct: 23, load: 1, threads: 24, disk_busy_pct: 0, psi_mem_pct: 0, rebuild: false, cpu_mhz: 1713, nproc: 24 },
      capacity: { sessions_max: 7, working: 1, slots_free: 6, plan: 'tetto 7, al lavoro 1, liberi 6 · macchina VIA · in fila 18 (0 rifiutate, 18 pronte)' },
    }))!;
    expect(l.machine).toEqual({
      memAvailableGb: 34, memTotalGb: 62, slicePct: 23, load: 1, threads: 24, diskBusyPct: 0, psiMemPct: 0, rebuild: false, cpuMhz: 1713, cpuBraking: null, nproc: 24,
    });
    expect(l.plan).toBe('tetto 7, al lavoro 1, liberi 6 · macchina VIA · in fila 18 (0 rifiutate, 18 pronte)');
    const odd = parseLobbyFile(JSON.stringify({ machine: { mem_gb: '34', mem_total_gb: 0, slice_pct: -1, load: null, threads: 0, nproc: 0, rebuild: 'no' }, capacity: { plan: 7 } }))!;
    expect(odd.machine).toEqual({
      memAvailableGb: null, memTotalGb: null, slicePct: null, load: null, threads: null, diskBusyPct: null, psiMemPct: null, rebuild: null, cpuMhz: null, cpuBraking: null, nproc: null,
    });
    expect(odd.plan).toBeNull();
    for (const bad of [{ machine: [] }, { machine: 'x' }, { machine: null }, {}]) expect(parseLobbyFile(JSON.stringify(bad))!.machine).toBeNull();
  });
});

describe('readCpu', () => {
  it('reads the load, the mean MHz and the processors from a /proc directory', async () => {
    const proc = await mkdtemp(join(tmpdir(), 'shq-proc-'));
    await writeFile(join(proc, 'loadavg'), '1.27 0.98 0.80 3/1893 3262771\n');
    await writeFile(join(proc, 'cpuinfo'), ['processor\t: 0', 'cpu MHz\t\t: 600.000', '', 'processor\t: 1', 'cpu MHz\t\t: 1800.000', ''].join('\n'));
    expect(await readCpu(proc)).toEqual({ load: 1.27, mhz: 1200, mhzMax: 1800, nproc: 2 });
  });

  it('gives null for what it cannot read', async () => {
    const proc = await mkdtemp(join(tmpdir(), 'shq-proc-'));
    expect(await readCpu(proc)).toEqual({ load: null, mhz: null, mhzMax: null, nproc: null });
    await writeFile(join(proc, 'loadavg'), 'busy\n');
    await writeFile(join(proc, 'cpuinfo'), 'model name\t: x\n');
    expect(await readCpu(proc)).toEqual({ load: null, mhz: null, mhzMax: null, nproc: null });
  });
});

describe('parseLimits and parseWatchdogTail', () => {
  it('reads the working cap', () => {
    expect(parseLimits('{"sessions_max": 7, "heavy_slots": 1}')).toEqual({ max: 7 });
    expect(parseLimits('{"sessions_max": 0}')).toEqual({ max: 0 });
    for (const bad of ['', '{', '{"sessions_max":"7"}']) expect(parseLimits(bad)).toEqual({ max: null });
  });

  it('reads the paused panes and the hold from the last WATCHDOG line', () => {
    const log = [
      '11:42 battito: mem full 0.00% · sessioni 58% del tetto',
      "11:48 WATCHDOG: sessioni Claude all'87% del loro tetto di memoria → lanci fermati (sessions_max 0), pausa mandata a: wE:p1E wG:p8 ",
      '12:06 battito: mem full 0.00%',
    ].join('\n');
    expect(parseWatchdogTail(log)).toEqual({ pausedPanes: ['wE:p1E', 'wG:p8'], held: true });
    expect(parseWatchdogTail(log + '\n13:51 WATCHDOG: pressione passata (sessioni 34% del tetto) → tetto ripristinato a 7')).toEqual({ pausedPanes: [], held: false });
    expect(parseWatchdogTail("13:36 WATCHDOG: sessioni Claude all'88% → lanci fermati (sessions_max 0), pausa mandata a: ")).toEqual({ pausedPanes: [], held: true });
    expect(parseWatchdogTail('')).toEqual({ pausedPanes: [], held: false });
    // The watchdog started again after its last word: what it held and paused is forgotten.
    expect(parseWatchdogTail(log + '\n16:48 avvio: soglie mem full avg10 ≥15% per 1\'')).toEqual({ pausedPanes: [], held: false });
    // A pane that is not herdr's is not a pane.
    expect(parseWatchdogTail('WATCHDOG: x → lanci fermati, pausa mandata a: wE:p1E %7 rm;-rf')).toEqual({ pausedPanes: ['wE:p1E'], held: true });
  });
});

describe('parseTaskInfo', () => {
  it("folds the registry's events into each task's repository and area, the last word winning, and takes the area of a repository as the registry does when none is written", () => {
    const text = [
      { ev: 'add', id: 'G-1', repo: 'nixos', title: 'x' },
      { ev: 'add', id: 'G-2', repo: 'app', area: 'tenuta' },
      { ev: 'update', id: 'G-2', note: 'later, without a word on either' },
      { ev: 'add', id: 'G-3', repo: 'vari' },
      { ev: 'update', id: 'G-3', repo: 'lf' },
      { ev: 'add', id: 'G-4', repo: 'unknown' },
      { ev: 'add', id: 'G-5' },
      { ev: 'add', id: 'G-6', repo: 'app', area: 'elsewhere' },
    ].map((e) => JSON.stringify(e)).join('\n') + '\nnot json\n';
    const info = parseTaskInfo(text);
    expect([...info]).toEqual([
      ['G-1', { repo: 'nixos', area: 'personali' }],
      ['G-2', { repo: 'app', area: 'tenuta' }],
      ['G-3', { repo: 'lf', area: 'amatino' }],
      ['G-4', { repo: 'unknown', area: null }],
      ['G-5', { repo: null, area: null }],
      ['G-6', { repo: 'app', area: 'amatino' }],
    ]);
  });
});

describe('parseTaskPanes and parseSeatsLog', () => {
  it('maps each pane to the last task that named it', () => {
    const text = [
      JSON.stringify({ ev: 'add', id: 'G-268', title: 'hopper' }),
      JSON.stringify({ ev: 'update', id: 'G-268', sessions: [{ pane: 'wK:p2', profile: 'leonardo' }] }),
      JSON.stringify({ ev: 'update', id: 'G-178', sessions: [{ pane: 'wE:p1M' }, { pane: 'wE:p1N' }] }),
      'not json',
      JSON.stringify({ ev: 'update', id: 'G-269', sessions: [{ pane: 'wE:p1N' }] }),
    ].join('\n');
    expect([...parseTaskPanes(text)]).toEqual([['wK:p2', 'G-268'], ['wE:p1M', 'G-178'], ['wE:p1N', 'G-269']]);
  });

  it('reads the current seat from the last set', () => {
    expect(parseSeatsLog('{"ev":"set","seat":"Francesco Datini"}\nbad\n{"ev":"set","seat":"Jacopo Anselmi","ts":"x"}\n{"ev":"note","seat":"Luca"}')).toBe('Jacopo Anselmi');
    expect(parseSeatsLog('')).toBeNull();
  });
});

describe('buildSeats', () => {
  const accounts = {
    'Jacopo Anselmi': { email: 'jacopo@example.com' },
    'Leonardo Davinci': { email: 'leonardo@example.com', profile: 'leonardo' },
    'Luca Pacioli': { email: 'luca@example.com' },
    'Pietro Fusar Poli': { email: 'pietro@example.com' },
    'Personale (J)': { email: 'j@gmail.example', profile: 'personal' },
  };
  const order = ['Pietro Fusar Poli', 'Luca Pacioli', 'Leonardo Davinci'];
  const doc = (email: string, session: number, week: number, writtenAt = NOW / 1000 - 60) =>
    parseLimitDoc(JSON.stringify({ email, five_hour: { used_percentage: session, resets_at: 1792166400 }, seven_day: { used_percentage: week, resets_at: 1792242000 }, written_at: writtenAt }))!;

  it('builds one seat per account in the accounts file, in seat order then the rest, with full, stale and turnable', () => {
    const docs = [doc('jacopo@example.com', 6, 41), doc('leonardo@example.com', 9, 59), doc('luca@example.com', 2, 86), doc('j@gmail.example', 37, 16, NOW / 1000 - 7 * 3600)];
    const seats = buildSeats(docs, accounts, order, 'Jacopo Anselmi', NOW);
    expect(seats.map((s) => [s.name, s.current, s.full, s.stale, s.turnable, s.week?.usedPct ?? null])).toEqual([
      ['Pietro', false, false, true, true, null],
      ['Luca', false, true, false, true, 86],
      ['Leonardo', false, false, false, true, 59],
      ['Jacopo', true, false, false, true, 41],
      ['Personale', false, false, true, false, 16],
    ]);
    expect(seats[3]!.session).toEqual({ usedPct: 6, resetsAt: 1792166400_000, readAt: (NOW / 1000 - 60) * 1000 });
  });

  it('reads a window whose reset has passed as empty, for the percentage shown and for full', () => {
    const past = NOW / 1000 - 60;
    const docs = [parseLimitDoc(JSON.stringify({ email: 'jacopo@example.com', five_hour: { used_percentage: 99, resets_at: past }, seven_day: { used_percentage: 56, resets_at: past + 86_400 }, written_at: NOW / 1000 - 120 }))!];
    const [jacopo] = buildSeats(docs, { 'Jacopo Anselmi': { email: 'jacopo@example.com' } }, [], 'Jacopo Anselmi', NOW);
    expect(jacopo!.session).toMatchObject({ usedPct: 0, resetsAt: past * 1000 });
    expect(jacopo!.full).toBe(false);
  });

  it('takes staleness from the week alone: a reading without a five-hour window is fresh, and its five hours are empty', () => {
    const docs = [parseLimitDoc(JSON.stringify({ email: 'francesco@example.com', seven_day: { used_percentage: 23 }, written_at: NOW / 1000 - 60 }))!];
    const [francesco] = buildSeats(docs, { 'Francesco Datini': { email: 'francesco@example.com' } }, ['Francesco Datini'], null, NOW);
    expect([francesco!.stale, francesco!.full, francesco!.session, francesco!.week?.usedPct]).toEqual([false, false, null, 23]);
  });

  it('is null for a reading that is not one', () => {
    for (const bad of ['', '{', '{"five_hour":{}}', JSON.stringify({ email: 7 })]) expect(parseLimitDoc(bad)).toBeNull();
  });
});

describe('readPower', () => {
  it('reads anon + shmem against memory.max, and no cap as null', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'shq-cg-'));
    await writeFile(join(dir, 'memory.stat'), 'anon 17650155520\nfile 11080888320\nshmem 1024\n');
    await writeFile(join(dir, 'memory.max'), '48001552384\n');
    expect(await readPower(dir)).toEqual({ usedBytes: 17650156544, maxBytes: 48001552384, warnPct: 85 });
    await writeFile(join(dir, 'memory.max'), 'max\n');
    expect(await readPower(dir)).toEqual({ usedBytes: 17650156544, maxBytes: null, warnPct: 85 });
    expect(await readPower(join(dir, 'missing'))).toBeNull();
  });
});
