import { capacityOf, SEAT_LIMIT_PCT } from '../core/lobby.js';
import { repoRootOf } from '../core/view.js';
import type { Capacity, GateVerdict, Lobby, Seat, Waiting } from '../core/types.js';
import type { SessionView } from '../core/view.js';
import { FEATURE_SLOTS, orgOfAccount, orgOfArea, REPO_SLOTS, slotOf } from './palette.js';
import { cleanOrNull, cleanText, taskTitle } from './text.js';
import { QUEUE_MAX, SCENE_VERSION, type LobbyDetail, type LobbySummary, type PausedSession, type QueueSlot, type SeatView, type ShownState, type TaskCard } from './types.js';

/**
 * The colour slot of each repository the building has a floor for (a live session works in it), by its lower-case name.
 * Two repositories that share a name, or differ only by case, are ambiguous: neither is named, so that the colour does
 * not depend on the order of the views, which the scene's JSON text must not.
 */
function repoSlots(views: readonly SessionView[]): Map<string, number | null> {
  const roots = new Map<string, Set<string>>();
  for (const v of views) {
    if (v.effectiveState === 'ended') continue;
    const name = v.workspace.repoName.toLowerCase();
    const set = roots.get(name);
    if (set) set.add(repoRootOf(v));
    else roots.set(name, new Set([repoRootOf(v)]));
  }
  return new Map([...roots].map(([name, set]) => [name, set.size === 1 ? slotOf([...set][0]!, REPO_SLOTS) : null]));
}

/**
 * The repository a waiting task's name begins with ('nixos-config: il rebuild…', 'app: #3247…'): its own name, or else
 * the one repository whose name ends in '-' and that word ('app' for 'amatino-app'). A name that begins with neither,
 * or with a word that fits several, names no repository the building knows.
 */
function slotOfName(name: string, repos: ReadonlyMap<string, number | null>): number | null {
  const first = /^[A-Za-z0-9._-]+/.exec(name.trim())?.[0]?.replace(/\.+$/, '').toLowerCase();
  if (!first) return null;
  if (repos.has(first)) return repos.get(first) ?? null;
  const ends = [...repos].filter(([repo]) => repo.endsWith(`-${first}`));
  return ends.length === 1 ? (ends[0]![1] ?? null) : null;
}

/** What the façade's Lobby label counts, the line outside its doors and the tank on its roof. */
export function buildLobbySummary(l: Lobby, views: readonly SessionView[] = []): LobbySummary {
  const p = l.power;
  const repos = repoSlots(views);
  // The turned away stand at the head of the line; each kind keeps the gatekeeper's order.
  const line = [...l.queue.filter((w) => w.kind === 'refused'), ...l.queue.filter((w) => w.kind === 'ready')];
  const queue: QueueSlot[] = line.slice(0, QUEUE_MAX).map((w) => ({
    id: cleanText(w.id, 64),
    name: cleanText(w.name, 80),
    kind: w.kind,
    slot: slotOfName(w.name, repos),
    tie: slotOf(cleanText(w.id, 64), FEATURE_SLOTS),
    org: waitingOrg(w),
  }));
  return {
    doorman: cleanText(l.doorman.name, 40),
    refused: l.queue.filter((w) => w.kind === 'refused').length,
    ready: l.queue.filter((w) => w.kind === 'ready').length,
    seatsFull: l.seats.filter((s) => s.full).length,
    memory: p && p.maxBytes ? { pct: Math.max(0, Math.min(100, Math.round((p.usedBytes / p.maxBytes) * 100))), gatePct: l.limits?.slicePct ?? null, warnPct: p.warnPct } : null,
    held: p?.held ?? false,
    paused: p?.pausedPanes.length ?? 0,
    queue,
    queueMore: Math.max(0, line.length - QUEUE_MAX),
    updatedAt: l.updatedAt,
  };
}

/** A waiting launch's organisation: its task's area when the orchestrator names one, else the account of the profile it asked for. */
const waitingOrg = (w: Waiting) => orgOfArea(w.area) ?? orgOfAccount(w.account);

const gateOf = (g: GateVerdict | null): GateVerdict | null =>
  g && { go: g.go, text: cleanText(g.text, 400), reasons: g.reasons.map((r) => ({ kind: r.kind, text: cleanText(r.text) })), at: g.at };

const waitingOf = (w: Waiting): Waiting => ({
  id: cleanText(w.id, 64),
  name: cleanText(w.name),
  account: cleanOrNull(w.account),
  since: w.since,
  reason: w.reason && { kind: w.reason.kind, text: cleanText(w.reason.text) },
  kind: w.kind,
  area: cleanOrNull(w.area, 20),
  repo: cleanOrNull(w.repo, 40),
});

const capacityDetail = (c: Capacity): Capacity => ({
  ...c,
  plan: cleanOrNull(c.plan, 300),
  nextReset: c.nextReset && { at: c.nextReset.at, seat: cleanText(c.nextReset.seat, 40) },
});

const seatOf = (s: Seat): SeatView => ({ ...s, account: cleanText(s.account), name: cleanText(s.name, 40), org: orgOfAccount(s.account) });

/** The paused panes, each with the live session in it when the building knows one. */
function pausedOf(panes: readonly string[], views: readonly SessionView[]): PausedSession[] {
  return panes.map((pane) => {
    const v = views.find((x) => x.effectiveState !== 'ended' && x.tmuxPane === pane);
    return { pane: cleanText(pane, 32), sessionId: v?.id ?? null, name: v ? cleanOrNull(v.name) : null };
  });
}

/**
 * The board: the line outside (the refused first, then the ready, as the gatekeeper gave them), then the tasks that have
 * a session in the building, the one with most sessions first. A task that waits and already has a session is only live.
 */
function boardOf(l: Lobby, views: readonly SessionView[]): TaskCard[] {
  const groups = new Map<string, SessionView[]>();
  for (const v of views) {
    const id = cleanOrNull(v.task, 64);
    if (id === null || v.effectiveState === 'ended') continue;
    groups.set(id, [...(groups.get(id) ?? []), v]);
  }
  const waiting = [...l.queue.filter((w) => w.kind === 'refused'), ...l.queue.filter((w) => w.kind === 'ready')]
    .filter((w) => !groups.has(cleanText(w.id, 64)))
    .map((w): TaskCard => ({
      id: cleanText(w.id, 64),
      title: cleanOrNull(w.name, 120),
      tie: slotOf(cleanText(w.id, 64), FEATURE_SLOTS),
      org: waitingOrg(w),
      where: w.kind === 'refused' ? 'refused' : 'waiting',
      reason: w.reason ? cleanText(w.reason.text) : null,
      since: w.since,
      account: cleanOrNull(w.account),
      sessions: [],
      subagents: 0,
    }));
  const live = [...groups]
    .map(([id, vs]): TaskCard => ({
      id,
      title: taskTitle(vs[0]!),
      tie: slotOf(id, FEATURE_SLOTS),
      org: vs.map((v) => orgOfAccount(v.account)).find((o) => o !== null) ?? null,
      where: 'live',
      reason: null,
      since: null,
      account: null,
      sessions: vs.map((v) => ({
        sessionId: v.id,
        name: cleanOrNull(v.name, 60) ?? v.id.slice(0, 8),
        state: v.effectiveState as ShownState,
        org: orgOfAccount(v.account),
        body: slotOf(repoRootOf(v), REPO_SLOTS),
        badge: null,
      })),
      subagents: vs.reduce((n, v) => n + v.children.filter((c) => c.running).length + v.runs.reduce((m, r) => m + r.agents.filter((a) => a.running).length, 0), 0),
    }))
    .sort((a, b) => b.sessions.length - a.sessions.length || (a.id < b.id ? -1 : 1));
  return [...waiting, ...live];
}

/** The Lobby in detail, every string cleaned, the doorman's own session found by its name. */
export function buildLobbyDetail(l: Lobby, views: readonly SessionView[], now = Date.now()): LobbyDetail {
  const doorman = views.find((v) => v.effectiveState !== 'ended' && v.name?.toLowerCase() === l.doorman.name.toLowerCase());
  return {
    version: SCENE_VERSION,
    doorman: { name: cleanText(l.doorman.name, 40), sessionId: doorman?.id ?? null },
    gate: gateOf(l.gate),
    queue: l.queue.map(waitingOf),
    tasks: boardOf(l, views),
    seats: l.seats.map(seatOf),
    turnTo: cleanOrNull(l.turnTo),
    power: l.power && { ...l.power, pausedPanes: l.power.pausedPanes.map((p) => cleanText(p, 32)), paused: pausedOf(l.power.pausedPanes, views) },
    cap: l.cap,
    machine: l.machine,
    limits: l.limits,
    capacity: capacityDetail(capacityOf(l, now)),
    seatLimitPct: SEAT_LIMIT_PCT,
    updatedAt: l.updatedAt,
  };
}
