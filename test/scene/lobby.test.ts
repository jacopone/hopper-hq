import { describe, expect, it } from 'vitest';
import { newSession } from '../../src/core/reducer.js';
import { FEATURE_SLOTS, REPO_SLOTS, slotOf } from '../../src/scene/palette.js';
import type { Lobby } from '../../src/core/types.js';
import { toView } from '../../src/core/view.js';
import { buildLobbyDetail, buildLobbySummary } from '../../src/scene/lobby.js';
import { QUEUE_MAX, SCENE_VERSION } from '../../src/scene/types.js';

const NOW = 1_792_150_000_000;
const lobby: Lobby = {
  doorman: { name: 'Gordon' },
  gate: { go: false, text: 'ASPETTA: slice al 84%;\u202e', reasons: [{ kind: 'slice', text: 'slice al 84%' }], at: NOW - 1000 },
  queue: [
    { id: 'G-270', name: 'G-270 segnali\u0007 a J', account: 'leonardo@example.com', since: NOW - 60_000, reason: null, kind: 'refused', area: null, repo: null },
    { id: 'G-155', name: 'G-155 rebuild', account: null, since: NOW - 3_600_000, reason: { kind: 'other', text: 'pronta: brief scritto' }, kind: 'ready', area: null, repo: null },
    { id: 'G-156', name: 'G-156 sblocco', account: null, since: NOW - 3_000_000, reason: { kind: 'other', text: 'pronta: brief scritto' }, kind: 'ready', area: null, repo: null },
  ],
  seats: [
    { account: 'luca@example.com', name: 'Luca', session: { usedPct: 2, resetsAt: null, readAt: NOW }, week: { usedPct: 86, resetsAt: NOW + 7_200_000, readAt: NOW }, current: false, full: true, stale: false, turnable: true },
    { account: 'jacopo@example.com', name: 'Jacopo', session: null, week: null, current: true, full: false, stale: true, turnable: true },
  ],
  turnTo: null,
  power: { usedBytes: 36_000_000_000, maxBytes: 48_000_000_000, warnPct: 85, held: true, pausedPanes: ['wE:p1E', 'wZ:p9'] },
  cap: { working: 6, max: 7 },
  machine: { memAvailableGb: 34, memTotalGb: 62, slicePct: 23, load: 1.5, threads: 24, diskBusyPct: 0, psiMemPct: 0, rebuild: false, cpuMhz: 1700, cpuBraking: false, nproc: 24 },
  limits: { memMinGb: 20, loadPerThread: 0.75, diskBusyPct: 60, psiMemPct: 10, slicePct: 75, brakeMhz: 1000 },
  plan: 'tetto 7, al lavoro 6, liberi 1\u202e · macchina ASPETTA',
  updatedAt: NOW - 500,
};
const ws = { cwd: '/w/app', repoRoot: '/w/app', repoName: 'app', worktree: false, branch: 'main', root: '/w/app' };
const views = [
  toView({ ...newSession('S1', NOW, ws), name: 'G-256 e2e', tmuxPane: 'wE:p1E' }, NOW),
  toView({ ...newSession('G0', NOW, ws), name: 'gordon', tmuxPane: null }, NOW),
];

describe('buildLobbySummary', () => {
  it('counts what the façade shows', () => {
    expect(buildLobbySummary(lobby, views)).toMatchObject({ doorman: 'Gordon', refused: 1, ready: 2, seatsFull: 1, held: true, paused: 2, queueMore: 0, updatedAt: NOW - 500 });
    expect(buildLobbySummary(lobby, views).memory).toEqual({ pct: 75, gatePct: 75, warnPct: 85 });
    expect(buildLobbySummary({ ...lobby, limits: null }, views).memory).toEqual({ pct: 75, gatePct: null, warnPct: 85 });
    expect(buildLobbySummary({ ...lobby, power: null }, views).memory).toBeNull();
    expect(buildLobbySummary({ ...lobby, power: { ...lobby.power!, maxBytes: null } }, views).memory).toBeNull();
  });

  it('lists the first places of the queue, the refused first and the ready in the order given, and counts the rest', () => {
    const ready = Array.from({ length: 10 }, (_, i) => ({ id: `G-${200 + i}`, name: `G-${200 + i} task`, account: null, since: NOW, reason: null, kind: 'ready' as const, area: null, repo: null }));
    const s = buildLobbySummary({ ...lobby, queue: [ready[0]!, lobby.queue[0]!, ...ready.slice(1)] }, views);
    expect(QUEUE_MAX).toBe(8);
    expect(s.queue).toHaveLength(8);
    expect(s.queue.map((q) => [q.id, q.kind])).toEqual([['G-270', 'refused'], ['G-200', 'ready'], ['G-201', 'ready'], ['G-202', 'ready'], ['G-203', 'ready'], ['G-204', 'ready'], ['G-205', 'ready'], ['G-206', 'ready']]);
    expect([s.refused, s.ready, s.queueMore]).toEqual([1, 10, 3]);
  });

  it("colours a waiting task's robot with its repository's slot when its name begins with the repository, and leaves it grey otherwise", () => {
    const repoView = (root: string, repoName: string, id: string) => toView({ ...newSession(id, NOW, { ...ws, repoRoot: root, repoName, root, cwd: root }), name: id }, NOW);
    const known = [repoView('/w/nixos-config', 'nixos-config', 'R1'), repoView('/w/amatino-app', 'amatino-app', 'R2')];
    const w = (id: string, name: string) => ({ id, name, account: null, since: NOW, reason: null, kind: 'ready' as const, area: null, repo: null });
    const s = buildLobbySummary({ ...lobby, queue: [w('G-1', 'nixos-config: il rebuild si ferma'), w('G-2', 'app: #3247 in conflitto'), w('G-3', 'Wi-Fi del portatile'), w('G-4', 'NIXOS-CONFIG segnali')] }, known);
    expect(s.queue.map((q) => q.slot)).toEqual([slotOf('/w/nixos-config', REPO_SLOTS), slotOf('/w/amatino-app', REPO_SLOTS), null, slotOf('/w/nixos-config', REPO_SLOTS)]);
  });

  describe('the tie and the organisation of a waiting task', () => {
    const waiting = (id: string, extra: Record<string, unknown> = {}) => ({ id, name: `${id} task`, account: null, since: NOW, reason: null, kind: 'ready' as const, area: null, repo: null, ...extra });
    const first = (w: ReturnType<typeof waiting>) => buildLobbySummary({ ...lobby, queue: [w] }, views).queue[0]!;

    it("wears its id's feature slot as its tie, the one its robot keeps when it is admitted", () => {
      expect(first(waiting('G-155')).tie).toBe(slotOf('G-155', FEATURE_SLOTS));
    });

    it("takes its organisation from the area the registry gives it, else from the account of the profile it asked for, else none", () => {
      expect(first(waiting('G-1', { area: 'tenuta' })).org).toBe('tenuta');
      expect(first(waiting('G-2', { area: 'personali' })).org).toBe('personal');
      expect(first(waiting('G-3', { account: 'leonardo@amatino.ai' })).org).toBe('amatino');
      expect(first(waiting('G-4', { area: 'amatino', account: 'j@gmail.com' })).org).toBe('amatino');
      expect(first(waiting('G-5')).org).toBeNull();
      expect(first(waiting('G-6', { account: 'leonardo' })).org).toBeNull();
    });
  });

  describe('the colour of a waiting task', () => {
    const repoView = (root: string, repoName: string, id: string, state: 'ended' | null = null) =>
      toView({ ...newSession(id, NOW, { ...ws, repoRoot: root, repoName, root, cwd: root }), name: id, ...(state ? { state } : {}) }, NOW);
    const ready = (name: string) => ({ id: 'G-1', name, account: null, since: NOW, reason: null, kind: 'ready' as const, area: null, repo: null });
    const slots = (name: string, vs: ReturnType<typeof repoView>[]) => buildLobbySummary({ ...lobby, queue: [ready(name)] }, vs).queue[0]!.slot;

    it('is none when two repositories share the name the task begins with, whatever the order of the views', () => {
      const a = repoView('/w/a/api', 'api', 'A1');
      const b = repoView('/w/b/api', 'api', 'A2');
      expect(slots('api: fix', [a, b])).toBeNull();
      expect(slots('api: fix', [b, a])).toBeNull();
      expect(slots('api: fix', [a])).toBe(slotOf('/w/a/api', REPO_SLOTS));
      const upper = repoView('/w/x/App', 'App', 'A3');
      const lower = repoView('/w/y/app', 'app', 'A4');
      expect(slots('app: fix', [upper, lower])).toEqual(slots('app: fix', [lower, upper]));
    });

    it('is none for a repository whose sessions have all ended: the building has no floor for it', () => {
      expect(slots('api: fix', [repoView('/w/api', 'api', 'E1', 'ended')])).toBeNull();
    });

    it("reads a dotted repository name whole, and takes a word for the one repository whose name ends in it, and for no more than one", () => {
      const foo = repoView('/w/foo', 'foo', 'D1');
      const dotted = repoView('/w/foo.bar', 'foo.bar', 'D2');
      expect(slots('foo.bar: x', [foo, dotted])).toBe(slotOf('/w/foo.bar', REPO_SLOTS));
      expect(slots('foo: x', [foo, dotted])).toBe(slotOf('/w/foo', REPO_SLOTS));
      const app = repoView('/w/amatino-app', 'amatino-app', 'S1');
      const crm = repoView('/w/amatino-crm', 'amatino-crm', 'S2');
      const other = repoView('/w/other-app', 'other-app', 'S3');
      expect(slots('crm: x', [app, crm, other])).toBe(slotOf('/w/amatino-crm', REPO_SLOTS));
      expect(slots('app: x', [app, crm, other])).toBeNull();
    });
  });

  it("gives each seat its organisation in the detail", () => {
    const d = buildLobbyDetail({ ...lobby, seats: [{ ...lobby.seats[0]!, account: 'luca@amatino.ai' }, { ...lobby.seats[1]!, account: 'jacopo@tenutalarnianone.com' }, { ...lobby.seats[1]!, account: 'someone' }] }, views, NOW);
    expect(d.seats.map((s) => s.org)).toEqual(['amatino', 'tenuta', null]);
  });

  it('keeps the memory percentage within 0 and 100', () => {
    expect(buildLobbySummary({ ...lobby, power: { ...lobby.power!, usedBytes: 80_000_000_000 } }, views).memory!.pct).toBe(100);
  });

  it('cleans the names of the queue it lists', () => {
    expect(buildLobbySummary(lobby, views).queue[0]!.name).toBe('G-270 segnali a J');
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

  it('carries the kind of each waiting launch in the order the gatekeeper gave, the machine, and its limits', () => {
    const d = buildLobbyDetail(lobby, views);
    expect(d.queue.map((w) => [w.id, w.kind])).toEqual([['G-270', 'refused'], ['G-155', 'ready'], ['G-156', 'ready']]);
    expect(d.machine).toEqual(lobby.machine);
    expect(d.limits).toEqual(lobby.limits);
    // The percentage at which a seat is full, so that the panel draws the same line the gatekeeper's rule uses.
    expect(d.seatLimitPct).toBe(80);
    expect(buildLobbyDetail({ ...lobby, machine: null, limits: null }, views)).toMatchObject({ machine: null, limits: null });
  });

  it("states the capacity: the gatekeeper's line cleaned, the places by the cap and by the seats, and the next seat to open", () => {
    // Cap 7 − 6 working = 1; seats with margin: Jacopo has no fresh reading and Luca is full, so none: the seats bind.
    expect(buildLobbyDetail(lobby, views, NOW).capacity).toEqual({
      plan: 'tetto 7, al lavoro 6, liberi 1 · macchina ASPETTA',
      byCap: 1,
      bySeats: 0,
      slotsFree: 0,
      binds: 'seats',
      nextReset: { at: NOW + 7_200_000, seat: 'Luca' },
    });
  });
});

describe("the board of Gordon's tasks", () => {
  const repoWs = { ...ws, repoRoot: '/w/app', repoName: 'app', root: '/w/app', cwd: '/w/app' };
  const session = (id: string, extra: Record<string, unknown> = {}) => toView({ ...newSession(id, NOW, repoWs), name: `${id} name`, ...extra }, NOW);
  const wait = (id: string, kind: 'ready' | 'refused', extra: Record<string, unknown> = {}) => ({ id, name: `${id} waiting`, account: null, since: NOW, reason: kind === 'refused' ? { kind: 'slice' as const, text: 'slice al 84%' } : null, kind, area: null, repo: null, ...extra });

  it('lists the waiting tasks in the order of the line, each with its tie, its organisation and what keeps it out', () => {
    const d = buildLobbyDetail({ ...lobby, queue: [wait('G-9', 'ready', { area: 'tenuta' }), wait('G-8', 'refused')] }, [], NOW);
    expect(d.tasks.map((t) => [t.id, t.where, t.org, t.reason])).toEqual([['G-8', 'refused', null, 'slice al 84%'], ['G-9', 'waiting', 'tenuta', null]]);
    expect(d.tasks.map((t) => [t.since, t.account])).toEqual([[NOW, null], [NOW, null]]);
    expect(d.tasks.map((t) => t.tie)).toEqual([slotOf('G-8', FEATURE_SLOTS), slotOf('G-9', FEATURE_SLOTS)]);
  });

  it("lists the tasks with a session in the building, the one with most sessions first, each session with its state, organisation and body, and the subagents running under them", () => {
    const views = [
      session('S1', { task: 'G-5', account: 'luca@amatino.ai', state: 'working', children: [{ id: 'c1', type: 'Explore', description: null, running: true, lastAction: null, updatedAt: NOW }] }),
      session('S2', { task: 'G-5', account: 'jacopo@tenutalarnianone.com', state: 'idle' }),
      session('S3', { task: 'G-7', account: 'j@gmail.com', state: 'working' }),
      session('S4', { account: 'luca@amatino.ai', state: 'working' }),
      session('S5', { task: 'G-6', state: 'ended' }),
    ];
    const live = buildLobbyDetail(lobby, views, NOW).tasks.filter((t) => t.where === 'live');
    expect(live.map((t) => [t.id, t.sessions.length, t.subagents])).toEqual([['G-5', 2, 1], ['G-7', 1, 0]]);
    expect(live[0]!.sessions.map((s) => [s.sessionId, s.org, s.state])).toEqual([['S1', 'amatino', 'working'], ['S2', 'tenuta', 'idle']]);
    expect(live[0]!.sessions[0]!.body).toBe(slotOf('/w/app', REPO_SLOTS));
    expect(live[0]!.tie).toBe(slotOf('G-5', FEATURE_SLOTS));
    expect(live[0]!.org).toBe('amatino');
  });

  it('puts a task that waits and has a session in the building under the live ones only, once', () => {
    const d = buildLobbyDetail({ ...lobby, queue: [wait('G-5', 'ready')] }, [session('S1', { task: 'G-5', state: 'working' })], NOW);
    expect(d.tasks.map((t) => [t.id, t.where])).toEqual([['G-5', 'live']]);
  });

  it('cleans what it shows', () => {
    const d = buildLobbyDetail({ ...lobby, queue: [wait('G-1\u202e', 'ready', { name: 'x\u0007y' })] }, [], NOW);
    expect(d.tasks[0]!.id).toBe('G-1');
    expect(d.tasks[0]!.title).toBe('xy');
  });
});
