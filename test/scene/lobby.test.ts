import { describe, expect, it } from 'vitest';
import { newSession } from '../../src/core/reducer.js';
import type { Lobby } from '../../src/core/types.js';
import { toView } from '../../src/core/view.js';
import { buildLobbyDetail, buildLobbySummary } from '../../src/scene/lobby.js';
import { SCENE_VERSION } from '../../src/scene/types.js';

const NOW = 1_792_150_000_000;
const lobby: Lobby = {
  doorman: { name: 'Gordon' },
  gate: { go: false, text: 'ASPETTA: slice al 84%;\u202e', reasons: [{ kind: 'slice', text: 'slice al 84%' }], at: NOW - 1000 },
  queue: [{ id: 'G-270', name: 'G-270 segnali\u0007 a J', account: 'leonardo@example.com', since: NOW - 60_000, reason: null }],
  seats: [
    { account: 'luca@example.com', name: 'Luca', session: { usedPct: 2, resetsAt: null, readAt: NOW }, week: { usedPct: 86, resetsAt: null, readAt: NOW }, current: false, full: true, stale: false, turnable: true },
    { account: 'jacopo@example.com', name: 'Jacopo', session: null, week: null, current: true, full: false, stale: true, turnable: true },
  ],
  turnTo: null,
  power: { usedBytes: 36_000_000_000, maxBytes: 48_000_000_000, warnPct: 85, held: true, pausedPanes: ['wE:p1E', 'wZ:p9'] },
  cap: { working: 6, max: 7 },
  updatedAt: NOW - 500,
};
const ws = { cwd: '/w/app', repoRoot: '/w/app', repoName: 'app', worktree: false, branch: 'main', root: '/w/app' };
const views = [
  toView({ ...newSession('S1', NOW, ws), name: 'G-256 e2e', tmuxPane: 'wE:p1E' }, NOW),
  toView({ ...newSession('G0', NOW, ws), name: 'gordon', tmuxPane: null }, NOW),
];

describe('buildLobbySummary', () => {
  it('counts what the façade shows', () => {
    expect(buildLobbySummary(lobby)).toEqual({ waiting: 1, seatsFull: 1, powerPct: 75, held: true, paused: 2, updatedAt: NOW - 500 });
    expect(buildLobbySummary({ ...lobby, power: null }).powerPct).toBeNull();
    expect(buildLobbySummary({ ...lobby, power: { ...lobby.power!, maxBytes: null } }).powerPct).toBeNull();
  });
});

describe('buildLobbyDetail', () => {
  it('cleans every string, resolves paused panes to sessions, and finds the doorman by name', () => {
    const d = buildLobbyDetail(lobby, views);
    expect(d.version).toBe(SCENE_VERSION);
    expect(d.gate!.text).toBe('ASPETTA: slice al 84%;');
    expect(d.queue[0]!.name).toBe('G-270 segnali a J');
    expect(d.power!.paused).toEqual([{ pane: 'wE:p1E', sessionId: 'S1', name: 'G-256 e2e' }, { pane: 'wZ:p9', sessionId: null, name: null }]);
    expect(d.doorman).toEqual({ name: 'Gordon', sessionId: 'G0' });
    expect(d.seats.map((s) => s.name)).toEqual(['Luca', 'Jacopo']);
  });
});
