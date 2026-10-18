import { afterEach, describe, expect, it, vi } from 'vitest';
import LobbyPanel from '../../components/LobbyPanel.svelte';
import type { LobbyDetail } from '../../../src/scene/types';
import { NOW } from '../helpers/fixtures';
import { cleanup, click, render, text } from '../helpers/render';

afterEach(cleanup);

const detail: LobbyDetail = {
  version: 8,
  doorman: { name: 'Gordon', sessionId: 'G0' },
  gate: { go: false, text: 'ASPETTA: slice al 84%; ultimo avvio 40 s fa;', reasons: [{ kind: 'slice', text: 'slice al 84%' }, { kind: 'pacing', text: 'ultimo avvio 40 s fa' }], at: NOW - 12_000 },
  queue: [
    { id: 'G-270', name: 'G-270 segnali a J', account: 'leonardo@example.com', since: NOW - 4 * 60_000, reason: { kind: 'slice', text: 'slice al 84%' }, kind: 'refused' },
    { id: 'G-155', name: 'G-155 rebuild', account: null, since: NOW - 3_600_000, reason: { kind: 'other', text: 'pronta: brief scritto' }, kind: 'ready' },
    { id: 'G-156', name: 'G-156 sblocco', account: null, since: NOW - 7_200_000, reason: { kind: 'other', text: 'pronta: brief scritto' }, kind: 'ready' },
  ],
  seats: [
    { account: 'jacopo@example.com', name: 'Jacopo', session: { usedPct: 6, resetsAt: null, readAt: NOW }, week: { usedPct: 41, resetsAt: null, readAt: NOW }, current: true, full: false, stale: false, turnable: true },
    { account: 'luca@example.com', name: 'Luca', session: { usedPct: 2, resetsAt: null, readAt: NOW }, week: { usedPct: 86, resetsAt: null, readAt: NOW }, current: false, full: true, stale: false, turnable: true },
    { account: 'pietro@example.com', name: 'Pietro', session: null, week: null, current: false, full: false, stale: true, turnable: true },
    { account: 'francesco@example.com', name: 'Francesco', session: null, week: { usedPct: 23, resetsAt: null, readAt: NOW }, current: false, full: false, stale: false, turnable: true },
  ],
  turnTo: 'francesco@example.com',
  power: { usedBytes: 34.6 * 2 ** 30, maxBytes: 44.7 * 2 ** 30, warnPct: 85, held: false, pausedPanes: ['wE:p1E'], paused: [{ pane: 'wE:p1E', sessionId: 'S1', name: 'G-256 e2e' }] },
  cap: { working: 6, max: 7 },
  machine: { memAvailableGb: 34, memTotalGb: 62, slicePct: 23, load: 1.5, threads: 24, diskBusyPct: 0, psiMemPct: 0, rebuild: false, cpuMhz: 1700, nproc: 24 },
  limits: { memMinGb: 20, loadPerThread: 0.75, diskBusyPct: 60, psiMemPct: 10, slicePct: 75, brakeMhz: 1000 },
  capacity: { plan: 'tetto 7, al lavoro 6, liberi 1 · macchina ASPETTA · in fila 3 (1 rifiutate, 2 pronte)', byCap: 1, bySeats: 0, slotsFree: 0, binds: 'seats', nextReset: { at: NOW + 2 * 3_600_000, seat: 'Luca' } },
  seatLimitPct: 80,
  updatedAt: NOW - 12_000,
};

const ready = (n: number) => Array.from({ length: n }, (_, i) => ({ id: `G-${300 + i}`, name: `G-${300 + i} task`, account: null, since: NOW - (i + 1) * 60_000, reason: null, kind: 'ready' as const }));

/** Mounts the panel; with no argument it shows `detail`, and `undefined` passed on purpose means loading. */
function panel(...args: [] | [LobbyDetail | null | undefined]) {
  const lobby = args.length === 0 ? detail : args[0];
  const onBack = vi.fn();
  const onDesk = vi.fn();
  const target = render(LobbyPanel, { lobby, now: NOW, onBack, onDesk });
  const section = (h: string) => [...target.querySelectorAll('section')].find((s) => text(s.querySelector('h3')) === h)!;
  return { target, onBack, onDesk, section };
}

describe('LobbyPanel', () => {
  it('heads the panel with the doorman, the age of the reading and the cap', () => {
    const { target } = panel();
    expect(text(target.querySelector('.eyebrow'))).toBe('Lobby');
    expect(text(target.querySelector('h2'))).toBe('The gate of Gordon');
    expect(text(target.querySelector('.p-sub'))).toBe('read 12s ago · 1 refused · 2 ready · 6 / 7 working');
  });

  it('shows the verdict with its reasons, red when it is a wait', () => {
    const { section } = panel();
    const gate = section('Gate');
    expect(gate.querySelector('.verdict')!.classList.contains('wait')).toBe(true);
    expect(text(gate.querySelector('.badge'))).toBe('ASPETTA');
    cleanup();
    const go = panel({ ...detail, gate: { go: true, text: 'VIA: memoria 34 GB', reasons: [], at: NOW } }).section('Gate');
    expect(text(go.querySelector('.badge'))).toBe('VIA');
    expect(go.querySelector('.badge')!.classList.contains('go')).toBe(true);
    expect([...gate.querySelectorAll('li')].map(text)).toEqual(['slice: slice al 84%', 'pacing: ultimo avvio 40 s fa']);
  });

  it('lists the queue with each reason and wait, the seats with both windows, the turn, and the power with the paused sessions', () => {
    const { section, onDesk } = panel();
    expect([...section('Waiting outside').querySelectorAll('.refused li')].map(text)).toEqual(['G-270 segnali a J · leonardo@example.com · 4m · slice al 84%']);
    expect([...section('Seats').querySelectorAll('li')].map(text)).toEqual(['▸ Jacopo 5h 6% · 7d 41%', 'Luca 5h 2% · 7d 86% · full', 'Pietro no fresh reading', 'Francesco 5h – · 7d 23%']);
    expect(text(section('Seats').querySelector('.turn'))).toBe('Turn → francesco@example.com');
    expect(text(section('Power').querySelector('.gauge-text'))).toBe('34.6 / 44.7 GiB (77%) · mark 85%');
    const paused = section('Power').querySelector('.paused button')!;
    expect(text(paused)).toBe('G-256 e2e (wE:p1E)');
    click(paused);
    expect(onDesk).toHaveBeenCalledWith('S1');
  });

  it('lists the tasks that are ready in the order given, without repeating their reason, apart from the refusals', () => {
    const { section } = panel();
    const wait = section('Waiting outside');
    expect(text(wait.querySelector('.refused h4'))).toBe('Turned away · 1');
    expect(text(wait.querySelector('.ready h4'))).toBe('Ready, waiting for a seat and a go · 2');
    expect([...wait.querySelectorAll('.ready li')].map(text)).toEqual(['G-155 rebuild · 1h', 'G-156 sblocco · 2h']);
  });

  it('shows eight ready tasks and counts the rest, which a button opens and closes', () => {
    const { section } = panel({ ...detail, queue: ready(11) });
    const wait = section('Waiting outside');
    expect([...wait.querySelectorAll('.ready li')]).toHaveLength(8);
    const more = wait.querySelector('.ready button.more')!;
    expect(text(more)).toBe('Show 3 more');
    click(more);
    expect([...wait.querySelectorAll('.ready li')]).toHaveLength(11);
    expect(text(wait.querySelector('.ready button.more'))).toBe('Show fewer');
    click(wait.querySelector('.ready button.more'));
    expect([...wait.querySelectorAll('.ready li')]).toHaveLength(8);
    cleanup();
    expect(panel({ ...detail, queue: ready(8) }).section('Waiting outside').querySelector('button.more')).toBeNull();
  });

  it("draws the capacity as one pip per place under the cap: working, free now, and held back by the seats", () => {
    const { section } = panel();
    const cap = section('Capacity');
    const pips = (c: string) => cap.querySelectorAll(`.pip.${c}`).length;
    expect([pips('working'), pips('free'), pips('held')]).toEqual([6, 0, 1]);
    expect(text(cap.querySelector('.cap-plan'))).toBe('tetto 7, al lavoro 6, liberi 1 · macchina ASPETTA · in fila 3 (1 rifiutate, 2 pronte)');
    expect(text(cap.querySelector('.cap-now'))).toBe('0 places free now · the cap leaves 1, the seats leave 0 · the seats bind');
    expect(text(cap.querySelector('.cap-next'))).toBe('Next seat opens in 2h: Luca');
    cleanup();
    const open = panel({ ...detail, capacity: { ...detail.capacity, byCap: 4, bySeats: 2, slotsFree: 2, binds: 'seats', nextReset: null }, cap: { working: 1, max: 7 } }).section('Capacity');
    expect([open.querySelectorAll('.pip.working').length, open.querySelectorAll('.pip.free').length, open.querySelectorAll('.pip.held').length]).toEqual([1, 2, 4]);
    expect(open.querySelector('.cap-next')).toBeNull();
    expect(text(open.querySelector('.cap-now'))).toBe('2 places free now · the cap leaves 4, the seats leave 2 · the seats bind');
  });

  it('says what it cannot tell about the capacity: n/d without a cap, no pips', () => {
    const cap = panel({ ...detail, cap: null, capacity: { plan: null, byCap: null, bySeats: 2, slotsFree: null, binds: null, nextReset: null } }).section('Capacity');
    expect(cap.querySelectorAll('.pip')).toHaveLength(0);
    expect(cap.querySelector('.cap-plan')).toBeNull();
    expect(text(cap.querySelector('.cap-now'))).toBe('Places free now: n/d · the seats leave 2');
  });

  it('draws the machine as gauges against the gate\'s limits, and marks the ones over', () => {
    const { section } = panel();
    const machine = section('Machine');
    expect([...machine.querySelectorAll('.gauge')].map(text)).toEqual([
      'Memory available 34 / 62 GB',
      'Load 1.5 / 24 threads',
      'Disk busy 0%',
      'Memory pressure 0%',
      'CPU 1700 MHz · 24 cores',
    ]);
    expect(machine.querySelectorAll('.gauge.over')).toHaveLength(0);
    // Each gauge with a limit draws it as a mark: memory floor, 0.75 × threads, disk 60, pressure 10, the firmware's brake.
    expect([...machine.querySelectorAll('.gauge')].map((g) => g.querySelectorAll('.mark').length)).toEqual([1, 1, 1, 1, 1]);
    expect(text(machine.querySelector('.p-sub, .measured'))).toBe('measured by the gate 12s ago');
  });

  it('marks a gauge over its limit, and the 600 MHz governor as throttled', () => {
    const sick = { ...detail.machine!, memAvailableGb: 12, load: 20, diskBusyPct: 75, psiMemPct: 14, cpuMhz: 600, rebuild: true };
    const machine = panel({ ...detail, machine: sick }).section('Machine');
    expect([...machine.querySelectorAll('.gauge')].map((g) => g.classList.contains('over'))).toEqual([true, true, true, true, true]);
    expect(text([...machine.querySelectorAll('.gauge')].at(-1))).toBe('CPU 600 MHz · 24 cores · throttled');
    expect(text(machine.querySelector('.chip'))).toBe('rebuild under way');
  });

  it('writes n/d for a figure the machine does not have, and says so when there is no reading at all', () => {
    const blank = { memAvailableGb: null, memTotalGb: null, slicePct: null, load: null, threads: null, diskBusyPct: null, psiMemPct: null, rebuild: null, cpuMhz: null, nproc: null };
    const machine = panel({ ...detail, machine: blank }).section('Machine');
    expect([...machine.querySelectorAll('.gauge')].map(text)).toEqual(['Memory available n/d', 'Load n/d', 'Disk busy n/d', 'Memory pressure n/d', 'CPU n/d']);
    expect(machine.querySelectorAll('.gauge.over')).toHaveLength(0);
    cleanup();
    expect(text(panel({ ...detail, machine: null }).section('Machine').querySelector('.p-note'))).toBe('No reading of the machine.');
  });

  it('draws the sessions\' memory as a bar with the gate\'s mark and the watchdog\'s', () => {
    const power = panel().section('Power');
    expect([...power.querySelectorAll('.bar .mark')].map((m) => (m as HTMLElement).style.left)).toEqual(['75%', '85%']);
    expect((power.querySelector('.bar .fill') as HTMLElement).style.width).toBe('77%');
  });

  it('draws each seat\'s two windows as bars', () => {
    const seats = panel().section('Seats');
    const first = seats.querySelector('li')!;
    expect([...first.querySelectorAll('.bar .fill')].map((f) => (f as HTMLElement).style.width)).toEqual(['6%', '41%']);
  });

  it('says when the gate has not spoken, when nothing waits, and when there is no gatekeeper or the Lobby is loading', () => {
    const { section } = panel({ ...detail, gate: null, queue: [] });
    expect(text(section('Gate').querySelector('.p-note'))).toBe('No word from the gate.');
    expect(text(section('Waiting outside').querySelector('.p-note'))).toBe('Nobody is waiting outside.');
    cleanup();
    expect(text(panel(null).target.querySelector('.p-text'))).toBe('No gatekeeper is configured: the Lobby is empty.');
    cleanup();
    expect(text(panel(undefined).target.querySelector('.p-note'))).toBe('Loading the Lobby…');
  });
});
