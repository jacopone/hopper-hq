import { afterEach, describe, expect, it, vi } from 'vitest';
import LobbyPanel from '../../components/LobbyPanel.svelte';
import type { LobbyDetail, TaskCard } from '../../../src/scene/types';
import { NOW } from '../helpers/fixtures';
import { cleanup, click, render, text } from '../helpers/render';

afterEach(cleanup);

const detail: LobbyDetail = {
  version: 9,
  doorman: { name: 'Gordon', sessionId: 'G0' },
  gate: { go: false, text: 'ASPETTA: slice al 84%; ultimo avvio 40 s fa;', reasons: [{ kind: 'slice', text: 'slice al 84%' }, { kind: 'pacing', text: 'ultimo avvio 40 s fa' }], at: NOW - 12_000 },
  queue: [
    { id: 'G-270', name: 'G-270 segnali a J', account: 'leonardo@example.com', since: NOW - 4 * 60_000, reason: { kind: 'slice', text: 'slice al 84%' }, kind: 'refused', area: null, repo: null },
    { id: 'G-155', name: 'G-155 rebuild', account: null, since: NOW - 3_600_000, reason: { kind: 'other', text: 'pronta: brief scritto' }, kind: 'ready', area: null, repo: null },
    { id: 'G-156', name: 'G-156 sblocco', account: null, since: NOW - 7_200_000, reason: { kind: 'other', text: 'pronta: brief scritto' }, kind: 'ready', area: null, repo: null },
  ],
  tasks: [
    { id: 'G-270', title: 'G-270 segnali a J', tie: 4, org: 'amatino', body: 2, where: 'refused', reason: 'slice al 84%', since: NOW - 4 * 60_000, account: 'leonardo@example.com', sessions: [], subagents: 0 },
    { id: 'G-155', title: 'G-155 rebuild', tie: 1, org: 'personal', body: null, where: 'waiting', reason: null, since: NOW - 3_600_000, account: null, sessions: [], subagents: 0 },
    { id: 'G-156', title: 'G-156 sblocco', tie: 2, org: null, body: null, where: 'waiting', reason: null, since: NOW - 7_200_000, account: null, sessions: [], subagents: 0 },
    {
      id: 'G-178', title: 'pr-medic-app', tie: 5, org: 'amatino', body: 3, where: 'live', reason: null, since: null, account: null, subagents: 2,
      sessions: [
        { sessionId: 'S1', name: 'pr-medic 1', state: 'working', org: 'amatino', body: 3 },
        { sessionId: 'S2', name: 'pr-medic 2', state: 'needs_you', org: 'tenuta', body: 3 },
      ],
    },
  ],
  seats: [
    { account: 'jacopo@example.com', name: 'Jacopo', session: { usedPct: 6, resetsAt: null, readAt: NOW }, week: { usedPct: 41, resetsAt: null, readAt: NOW }, current: true, full: false, stale: false, turnable: true, org: 'amatino', weekPace: { elapsedPct: 50, aheadPct: -9 }, weekTouched: true, readAgeMs: 60_000 },
    { account: 'luca@example.com', name: 'Luca', session: { usedPct: 2, resetsAt: null, readAt: NOW }, week: { usedPct: 86, resetsAt: null, readAt: NOW }, current: false, full: true, stale: false, turnable: true, org: 'amatino', weekPace: null, weekTouched: true, readAgeMs: 0 },
    { account: 'pietro@example.com', name: 'Pietro', session: null, week: null, current: false, full: false, stale: true, turnable: true, org: null, weekPace: null, weekTouched: false, readAgeMs: null },
    { account: 'francesco@example.com', name: 'Francesco', session: null, week: { usedPct: 23, resetsAt: null, readAt: NOW }, current: false, full: false, stale: false, turnable: true, org: 'tenuta', weekPace: { elapsedPct: 20, aheadPct: 3 }, weekTouched: true, readAgeMs: 4 * 86_400_000 },
  ],
  turnTo: 'francesco@example.com',
  power: { usedBytes: 34.6 * 2 ** 30, maxBytes: 44.7 * 2 ** 30, warnPct: 85, held: false, pausedPanes: ['wE:p1E'], paused: [{ pane: 'wE:p1E', sessionId: 'S1', name: 'G-256 e2e' }] },
  cap: { working: 6, max: 7 },
  machine: { memAvailableGb: 34, memTotalGb: 62, slicePct: 23, load: 1.5, threads: 24, diskBusyPct: 0, psiMemPct: 0, rebuild: false, cpuMhz: 1700, cpuBraking: false, nproc: 24 },
  limits: { memMinGb: 20, loadPerThread: 0.75, diskBusyPct: 60, psiMemPct: 10, slicePct: 75, brakeMhz: 1000 },
  capacity: { plan: 'tetto 7, al lavoro 6, liberi 1 · macchina ASPETTA · in fila 3 (1 rifiutate, 2 pronte)', byCap: 1, bySeats: 0, slotsFree: 0, binds: 'seats', nextReset: { at: NOW + 2 * 3_600_000, seat: 'Luca' } },
  seatLimitPct: 80,
  usage: {
    prices: { source: 'https://platform.claude.com/docs/en/about-claude/pricing', readAt: '2026-10-23', currency: 'USD', unit: 'per million tokens', rates: [{ model: 'claude-opus-5-5', label: 'Claude Opus 5.5', input: 4, cacheWrite5m: 5, cacheWrite1h: 8, cacheRead: 0.2, output: 20 }] },
    sessions: [
      { sessionId: 'S1', name: 'pr-medic 1', account: 'luca@amatino.ai', org: 'amatino', task: 'G-178', models: ['claude-opus-5-5'], tokens: { input: 1200, cacheWrite: 340_000, cacheRead: 4_560_000, output: 98_000 }, costUsd: 7.81, unpricedTokens: 0, counting: false,
        subagents: [
          { agentId: 'a1', type: 'Explore', label: 'Find the callers', runId: null, tokens: { input: 10, cacheWrite: 20_000, cacheRead: 100_000, output: 3000 }, costUsd: 0.18, unpricedTokens: 0, counting: false },
          { agentId: 'w1', type: null, label: null, runId: 'wf_1', tokens: { input: 5, cacheWrite: 0, cacheRead: 0, output: 400 }, costUsd: 0.01, unpricedTokens: 0, counting: true },
        ],
        subagentsCount: 6, subagentsMore: 4, subagentsTally: { tokens: { input: 40, cacheWrite: 60_000, cacheRead: 300_000, output: 9000 }, costUsd: 0.55, unpricedTokens: 0, counting: true } },
      { sessionId: 'S2', name: 'pr-medic 2', account: null, org: null, task: null, models: ['claude-opus-5-5'], tokens: { input: 12, cacheWrite: 0, cacheRead: 0, output: 900 }, costUsd: 0.004, unpricedTokens: 0, counting: true, subagents: [], subagentsCount: 0, subagentsMore: 0, subagentsTally: { tokens: { input: 0, cacheWrite: 0, cacheRead: 0, output: 0 }, costUsd: 0, unpricedTokens: 0, counting: false } },
    ],
    seats: [
      { account: 'luca@amatino.ai', org: 'amatino', sessions: 1, tokens: { input: 1200, cacheWrite: 340_000, cacheRead: 4_560_000, output: 98_000 }, costUsd: 7.81, unpricedTokens: 0, counting: false },
      { account: 'unknown', org: null, sessions: 1, tokens: { input: 12, cacheWrite: 0, cacheRead: 0, output: 900 }, costUsd: 0.004, unpricedTokens: 0, counting: true },
    ],
    total: { tokens: { input: 1212, cacheWrite: 340_000, cacheRead: 4_560_000, output: 98_900 }, costUsd: 7.814, unpricedTokens: 3400, counting: true },
  },
  updatedAt: NOW - 12_000,
};

const ready = (n: number): TaskCard[] => Array.from({ length: n }, (_, i) => ({ id: `G-${300 + i}`, title: `G-${300 + i} task`, tie: i % 8, org: null, body: null, where: 'waiting' as const, reason: null, since: NOW - (i + 1) * 60_000, account: null, sessions: [], subagents: 0 }));

/** Mounts the panel; with no argument it shows `detail`, and `undefined` passed on purpose means loading. */
function panel(...args: [] | [LobbyDetail | null | undefined]) {
  const lobby = args.length === 0 ? detail : args[0];
  const onBack = vi.fn();
  const onDesk = vi.fn();
  const target = render(LobbyPanel, { lobby, now: NOW, onBack, onDesk });
  const section = (h: string) => [...target.querySelectorAll('section')].find((s) => text(s.querySelector('h3')) === h)!;
  return { target, onBack, onDesk, section };
}

const section0 = (h: string) => panel().section(h);

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
    expect([...section('Seats').querySelectorAll('li .seat-line')].map(text)).toEqual(['▸ Jacopo 5h 6% · 7d 41%', 'Luca 5h 2% · 7d 86% · full', 'Pietro no fresh reading', 'Francesco 5h – · 7d 23%']);
    expect(text(section('Seats').querySelector('.turn'))).toBe('Turn → francesco@example.com');
    expect(text(section('Session memory').querySelector('.gauge-text'))).toBe('34.6 / 44.7 GiB (77%) · mark 85%');
    const paused = section('Session memory').querySelector('.paused button')!;
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

  it("marks each waiting task with the colour of its tie and of its organisation, as colour and not as text", () => {
    const { section } = panel();
    const wait = section('Waiting outside');
    const rows = [...wait.querySelectorAll('li')];
    expect(rows.map((li) => li.querySelector('.swatch')!.classList.contains(`tie-${[4, 1, 2][rows.indexOf(li)]}`))).toEqual([true, true, true]);
    expect(rows.map((li) => [...(li.querySelector('.stripe')?.classList ?? [])].find((c) => c.startsWith('org-')) ?? null)).toEqual(['org-amatino', 'org-personal', null]);
    // The organisation is named for a screen reader and on hover; its letter is drawn by the style, so it is not in the row's text.
    expect(rows[0]!.querySelector('.stripe')!.getAttribute('title')).toBe('Amatino');
    expect(text(rows[0]!)).toBe('G-270 segnali a J · leonardo@example.com · 4m · slice al 84%');
  });

  it("shows the tasks with a session in the building as cards: the task, its sessions as robots in its tie, its subagents", () => {
    const { section, onDesk } = panel();
    const building = section('In the building');
    const card = building.querySelector('.card')!;
    expect(text(card.querySelector('.card-head'))).toBe('G-178 pr-medic-app');
    expect(text(card.querySelector('.card-count'))).toBe('2 sessions · 2 subagents');
    const bots = [...card.querySelectorAll('.bot')];
    expect(bots).toHaveLength(2);
    expect(bots.every((b) => b.classList.contains('tie-5') && b.classList.contains('repo-3'))).toBe(true);
    expect(bots.map((b) => [...b.classList].find((c) => c.startsWith('org-')))).toEqual(['org-amatino', 'org-tenuta']);
    expect(bots[1]!.classList.contains('badge-needs')).toBe(true);
    // A robot is a button to its desk.
    bots[0]!.closest('[role="button"]')!.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    expect(onDesk).toHaveBeenCalledWith('S1');
    cleanup();
    expect(text(panel({ ...detail, tasks: [] }).section('In the building').querySelector('.p-note'))).toBe('No task has a session in the building.');
  });

  it("draws every card and row even when two tasks carry the same id once cleaned", () => {
    const twin = (title: string): TaskCard => ({ id: 'G-1', title, tie: 0, org: null, body: null, where: 'refused', reason: null, since: NOW, account: null, sessions: [], subagents: 0 });
    const wait = panel({ ...detail, tasks: [twin('first'), twin('second')] }).section('Waiting outside');
    expect([...wait.querySelectorAll('li')].map((li) => text(li).split(' · ')[0])).toEqual(['first', 'second']);
  });

  it("gives each seat the chip of its organisation", () => {
    const { section } = panel();
    const chips = [...section('Seats').querySelectorAll('li')].map((li) => [...(li.querySelector('.chip')?.classList ?? [])].find((c) => c.startsWith('org-')) ?? null);
    expect(chips).toEqual(['org-amatino', 'org-amatino', null, 'org-tenuta']);
  });

  it('shows eight ready tasks and counts the rest, which a button opens and closes', () => {
    const { section } = panel({ ...detail, tasks: ready(11) });
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
    expect(panel({ ...detail, tasks: ready(8) }).section('Waiting outside').querySelector('button.more')).toBeNull();
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
    expect(text(machine.querySelector('.measured'))).toBe("the gate's figures read 12s ago · load and CPU live");
  });

  it('marks a gauge over its limit, and the 600 MHz governor as throttled', () => {
    const sick = { ...detail.machine!, memAvailableGb: 12, load: 19, diskBusyPct: 75, psiMemPct: 14, cpuMhz: 600, cpuBraking: true, rebuild: true };
    const machine = panel({ ...detail, machine: sick }).section('Machine');
    expect([...machine.querySelectorAll('.gauge')].map((g) => g.classList.contains('over'))).toEqual([true, true, true, true, true]);
    expect(text([...machine.querySelectorAll('.gauge')].at(-1))).toBe('CPU 600 MHz · 24 cores · throttled');
    expect(text(machine.querySelector('.rebuild'))).toBe('rebuild under way');
    // The organisation's chip is its own class: a second '.chip' rule in the panel once painted every chip grey.
    expect(machine.querySelector('.chip')).toBeNull();
  });

  it("agrees with the gate on the load, which it floors, and on the brake, which the machine's own flag decides", () => {
    const gauges = (m: Partial<NonNullable<LobbyDetail['machine']>>) => [...panel({ ...detail, machine: { ...detail.machine!, ...m } }).section('Machine').querySelectorAll('.gauge')];
    // The gate refuses when floor(load) x 4 > threads x 3: 18 of 24 threads is still let in, 19 is not.
    expect(gauges({ load: 18.5 })[1]!.classList.contains('over')).toBe(false);
    cleanup();
    expect(gauges({ load: 19 })[1]!.classList.contains('over')).toBe(true);
    cleanup();
    // A low mean with one fast core is not the brake; the flag says so, whatever the mean.
    const slow = gauges({ cpuMhz: 700, cpuBraking: false }).at(-1)!;
    expect([slow.classList.contains('over'), text(slow)]).toEqual([false, 'CPU 700 MHz · 24 cores']);
    cleanup();
    const braked = gauges({ cpuMhz: 1000, cpuBraking: true }).at(-1)!;
    expect([braked.classList.contains('over'), text(braked)]).toEqual([true, 'CPU 1000 MHz · 24 cores · throttled']);
  });

  it('draws no pips when the number at work is not known, and says the seats are n/d when none are listed', () => {
    const noPips = panel({ ...detail, cap: { working: null, max: 7 }, capacity: { ...detail.capacity, byCap: null, slotsFree: null, binds: null } }).section('Capacity');
    expect(noPips.querySelectorAll('.pip')).toHaveLength(0);
    cleanup();
    const cap = panel({ ...detail, capacity: { ...detail.capacity, byCap: 6, bySeats: null, slotsFree: 6, binds: null, nextReset: null } }).section('Capacity');
    expect(text(cap.querySelector('.cap-now'))).toBe('6 places free now · the cap leaves 6, the seats leave n/d');
  });

  it('writes n/d for a figure the machine does not have, and says so when there is no reading at all', () => {
    const blank = { memAvailableGb: null, memTotalGb: null, slicePct: null, load: null, threads: null, diskBusyPct: null, psiMemPct: null, rebuild: null, cpuMhz: null, cpuBraking: null, nproc: null };
    const machine = panel({ ...detail, machine: blank }).section('Machine');
    expect([...machine.querySelectorAll('.gauge')].map(text)).toEqual(['Memory available n/d', 'Load n/d', 'Disk busy n/d', 'Memory pressure n/d', 'CPU n/d']);
    expect(machine.querySelectorAll('.gauge.over')).toHaveLength(0);
    cleanup();
    expect(text(panel({ ...detail, machine: null }).section('Machine').querySelector('.p-note'))).toBe('No reading of the machine.');
  });

  it('draws the sessions\' memory as a bar with the gate\'s mark and the watchdog\'s', () => {
    const power = panel().section('Session memory');
    expect([...power.querySelectorAll('.bar .mark')].map((m) => (m as HTMLElement).style.left)).toEqual(['75%', '85%']);
    expect((power.querySelector('.bar .fill') as HTMLElement).style.width).toBe('77%');
  });

  it("sets each seat's week against a straight line to its reset, says whether it is touched, and always says how old the reading is", () => {
    const seats = section0('Seats');
    expect([...seats.querySelectorAll('li .seat-week')].map(text)).toEqual([
      'week touched · 50% of it gone · 9 points under the line · read 1m ago',
      'week touched · reset not known · read 0s ago',
      'no reading',
      'week touched · 20% of it gone · 3 points over the line · read 4d ago',
    ]);
    // A reading older than the gatekeeper's staleness window is drawn as old, never as the truth of now.
    cleanup();
    const old = panel({ ...detail, seats: [{ ...detail.seats[0]!, stale: true, readAgeMs: 3 * 86_400_000 }] }).section('Seats');
    expect(text(old.querySelector('.seat-week'))).toBe('week touched · 50% of it gone · 9 points under the line · read 3d ago, stale');
    expect(old.querySelector('.seat-week')!.classList.contains('old')).toBe(true);
    cleanup();
    const untouched = panel({ ...detail, seats: [{ ...detail.seats[0]!, week: { usedPct: 0, resetsAt: null, readAt: NOW }, weekPace: { elapsedPct: 10, aheadPct: -10 }, weekTouched: false }] }).section('Seats');
    expect(text(untouched.querySelector('.seat-week'))).toBe('week untouched · 10% of it gone · 10 points under the line · read 1m ago');
  });

  it('rounds token counts without a 100.0k, a 1000k or a 1000M, and puts a week at its pace on the line', () => {
    const at = (n: number) => panel({ ...detail, usage: { ...detail.usage!, total: { ...detail.usage!.total, tokens: { input: n, cacheWrite: 0, cacheRead: 0, output: 0 }, unpricedTokens: 0, counting: false } } }).section('Tokens at list price');
    const shown = (n: number) => {
      const t = text(at(n).querySelector('.usage-total'));
      cleanup();
      return t;
    };
    expect([99_949, 99_950, 999_499, 999_500, 999_994_999, 1_857_120_000].map(shown)).toEqual([
      'In the building: 99.9k tokens · $7.81',
      'In the building: 100k tokens · $7.81',
      'In the building: 999k tokens · $7.81',
      'In the building: 1.00M tokens · $7.81',
      'In the building: 999.99M tokens · $7.81',
      'In the building: 1.86B tokens · $7.81',
    ]);
    const level = panel({ ...detail, seats: [{ ...detail.seats[0]!, weekPace: { elapsedPct: 41, aheadPct: 0 } }] }).section('Seats');
    expect(text(level.querySelector('.seat-week'))).toBe('week touched · 41% of it gone · on the line · read 1m ago');
  });

  it('names the weekly limits it reads: all models, and Fable, which no reading carries', () => {
    const seats = section0('Seats');
    expect(text(seats.querySelector('.week-limits'))).toBe('Bars: 5h, then 7d all models · Fable: not read');
  });

  it("prices the sessions' tokens at list price, says it is not billed, and names the page, the day and the unit of the rates", () => {
    const u = section0('Tokens at list price');
    expect(text(u.querySelector('.usage-note'))).toBe('List price, not billed: the seats are subscriptions. Rates read 2026-10-23 from platform.claude.com, USD per million tokens.');
    expect(text(u.querySelector('.usage-total'))).toBe('In the building: 5.00M tokens · $7.81 · 3.4k tokens of a model with no price · counting…');
    expect([...u.querySelectorAll('.usage-seats li')].map(text)).toEqual(['luca@amatino.ai · 1 session · 5.00M tokens · $7.81', 'unknown · 1 session · 912 tokens · <$0.01 · counting…']);
    expect([...u.querySelectorAll('.usage-sessions > li > .line')].map(text)).toEqual([
      'pr-medic 1 · G-178 · in 1.2k · write 340k · read 4.56M · out 98.0k · $7.81',
      'pr-medic 2 · in 12 · write 0 · read 0 · out 900 · <$0.01 · counting…',
    ]);
    // A name that begins with its task says it once.
    cleanup();
    const named = panel({ ...detail, usage: { ...detail.usage!, sessions: [{ ...detail.usage!.sessions[0]!, name: 'G-178 pr-medic' }] } }).section('Tokens at list price');
    expect(text(named.querySelector('.usage-sessions > li > .line'))).toBe('G-178 pr-medic · in 1.2k · write 340k · read 4.56M · out 98.0k · $7.81');
    // A session's subagents: the dearest INTERNS_MAX listed under it, the rest counted with what they cost together.
    const subs = u.querySelector('.usage-sessions > li')!;
    expect(text(subs.querySelector('.subs-head'))).toBe('6 subagents · 369k tokens · $0.55 · counting…');
    expect([...subs.querySelectorAll('.subs li')].map(text)).toEqual(['Explore · Find the callers · 123k tokens · $0.18', 'agent · wf_1 · 405 tokens · $0.01 · counting…', '+4 more']);
    expect(u.querySelectorAll('.usage-sessions > li')[1]!.querySelector('.subs-head')).toBeNull();
    expect([...u.querySelectorAll('.rates li')].map(text)).toEqual(['Claude Opus 5.5 · in $4 · 5m write $5 · 1h write $8 · read $0.2 · out $20']);
    cleanup();
    expect(text(panel({ ...detail, usage: null }).section('Tokens at list price').querySelector('.p-note'))).toBe('The building does not meter its sessions.');
  });

  it("names the watchdog's mark only against a cap: without one there is no mark to reach", () => {
    const m = panel({ ...detail, power: { ...detail.power!, maxBytes: null } }).section('Session memory');
    expect(text(m.querySelector('.gauge-text'))).toBe('34.6 GiB used · no cap');
    expect(m.querySelectorAll('.bar .mark')).toHaveLength(0);
  });

  it('draws each seat\'s two windows as bars', () => {
    const seats = panel().section('Seats');
    const first = seats.querySelector('li')!;
    expect([...first.querySelectorAll('.bar .fill')].map((f) => (f as HTMLElement).style.width)).toEqual(['6%', '41%']);
  });

  it('says when the gate has not spoken, when nothing waits, and when there is no gatekeeper or the Lobby is loading', () => {
    const { section } = panel({ ...detail, gate: null, tasks: [] });
    expect(text(section('Gate').querySelector('.p-note'))).toBe('No word from the gate.');
    expect(text(section('Waiting outside').querySelector('.p-note'))).toBe('Nobody is waiting outside.');
    cleanup();
    expect(text(panel(null).target.querySelector('.p-text'))).toBe('No gatekeeper is configured: the Lobby is empty.');
    cleanup();
    expect(text(panel(undefined).target.querySelector('.p-note'))).toBe('Loading the Lobby…');
  });
});
