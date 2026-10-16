import { afterEach, describe, expect, it, vi } from 'vitest';
import LobbyPanel from '../../components/LobbyPanel.svelte';
import type { LobbyDetail } from '../../../src/scene/types';
import { NOW } from '../helpers/fixtures';
import { cleanup, click, render, text } from '../helpers/render';

afterEach(cleanup);

const detail: LobbyDetail = {
  version: 7,
  doorman: { name: 'Gordon', sessionId: 'G0' },
  gate: { go: false, text: 'ASPETTA: slice al 84%; ultimo avvio 40 s fa;', reasons: [{ kind: 'slice', text: 'slice al 84%' }, { kind: 'pacing', text: 'ultimo avvio 40 s fa' }], at: NOW - 12_000 },
  queue: [{ id: 'G-270', name: 'G-270 segnali a J', account: 'leonardo@example.com', since: NOW - 4 * 60_000, reason: { kind: 'slice', text: 'slice al 84%' } }],
  seats: [
    { account: 'jacopo@example.com', name: 'Jacopo', session: { usedPct: 6, resetsAt: null, readAt: NOW }, week: { usedPct: 41, resetsAt: null, readAt: NOW }, current: true, full: false, stale: false, turnable: true },
    { account: 'luca@example.com', name: 'Luca', session: { usedPct: 2, resetsAt: null, readAt: NOW }, week: { usedPct: 86, resetsAt: null, readAt: NOW }, current: false, full: true, stale: false, turnable: true },
    { account: 'pietro@example.com', name: 'Pietro', session: null, week: null, current: false, full: false, stale: true, turnable: true },
    { account: 'francesco@example.com', name: 'Francesco', session: null, week: { usedPct: 23, resetsAt: null, readAt: NOW }, current: false, full: false, stale: false, turnable: true },
  ],
  turnTo: 'francesco@example.com',
  power: { usedBytes: 34.6 * 2 ** 30, maxBytes: 44.7 * 2 ** 30, warnPct: 85, held: false, pausedPanes: ['wE:p1E'], paused: [{ pane: 'wE:p1E', sessionId: 'S1', name: 'G-256 e2e' }] },
  cap: { working: 6, max: 7 },
  updatedAt: NOW - 12_000,
};

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
    expect(text(target.querySelector('.p-sub'))).toBe('read 12s ago · 1 waiting · 6 / 7 working');
  });

  it('shows the verdict with its reasons, red when it is a wait', () => {
    const { section } = panel();
    const gate = section('Gate');
    expect(gate.querySelector('.verdict')!.classList.contains('wait')).toBe(true);
    expect([...gate.querySelectorAll('li')].map(text)).toEqual(['slice: slice al 84%', 'pacing: ultimo avvio 40 s fa']);
  });

  it('lists the queue with each reason and wait, the seats with both windows, the turn, and the power with the paused sessions', () => {
    const { section, onDesk } = panel();
    expect([...section('Waiting outside').querySelectorAll('li')].map(text)).toEqual(['G-270 segnali a J · leonardo@example.com · 4m · slice al 84%']);
    expect([...section('Seats').querySelectorAll('li')].map(text)).toEqual(['▸ Jacopo 5h 6% · 7d 41%', 'Luca 5h 2% · 7d 86% · full', 'Pietro no fresh reading', 'Francesco 5h – · 7d 23%']);
    expect(text(section('Seats').querySelector('.turn'))).toBe('Turn → francesco@example.com');
    expect(text(section('Power').querySelector('.gauge-text'))).toBe('34.6 / 44.7 GiB (77%) · mark 85%');
    const paused = section('Power').querySelector('.paused button')!;
    expect(text(paused)).toBe('G-256 e2e (wE:p1E)');
    click(paused);
    expect(onDesk).toHaveBeenCalledWith('S1');
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
