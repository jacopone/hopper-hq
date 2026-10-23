import { capacityOf, SEAT_LIMIT_PCT } from '../core/lobby.js';
import { byCodeUnit, repoRootOf } from '../core/view.js';
import type { Allowance, Capacity, GateVerdict, Lobby, Seat, Tokens, Waiting } from '../core/types.js';
import type { SessionUsage, Tally } from '../usage/meter.js';
import { modelKey, PRICES } from '../usage/prices.js';
import { INTERNS_MAX } from './layout.js';
import type { SessionView } from '../core/view.js';
import { FEATURE_SLOTS, orgOfAccount, orgOfArea, REPO_SLOTS, slotOf } from './palette.js';
import { cleanOrNull, cleanText, KEY_MAX, taskTitle } from './text.js';
import { QUEUE_MAX, SCENE_VERSION, type LobbyDetail, type LobbySummary, type PausedSession, type QueueSlot, type SeatView, type ShownState, type TaskCard, type UsageDetail, type UsageTally, type WeekPace } from './types.js';

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
  // The one repository whose name ends in '-word' ('app' for 'amatino-app'), starts with 'word-' ('nixos' for
  // 'nixos-config') or is made of words with these initials ('lf' for 'legal-finance').
  const fits = [...repos].filter(([repo]) => repo.endsWith(`-${first}`) || repo.startsWith(`${first}-`) || repo.split('-').map((w) => w[0]).join('') === first);
  return fits.length === 1 ? (fits[0]![1] ?? null) : null;
}

/** The colour slot of a waiting launch's robot: the repository the orchestrator gives it, else the one its name begins with. */
const slotOfWaiting = (w: Waiting, repos: ReadonlyMap<string, number | null>): number | null => (w.repo ? slotOfName(w.repo, repos) : null) ?? slotOfName(w.name, repos);

/** What the façade's Lobby label counts, the line outside its doors and the tank on its roof. */
export function buildLobbySummary(l: Lobby, views: readonly SessionView[] = []): LobbySummary {
  const p = l.power;
  const repos = repoSlots(views);
  // The turned away stand at the head of the line; each kind keeps the gatekeeper's order.
  const live = liveTaskIds(views);
  const outside = l.queue.filter((w) => !live.has(cleanText(w.id, 64)));
  const line = [...outside.filter((w) => w.kind === 'refused'), ...outside.filter((w) => w.kind === 'ready')];
  const queue: QueueSlot[] = line.slice(0, QUEUE_MAX).map((w) => ({
    id: cleanText(w.id, 64),
    name: cleanText(w.name, 80),
    kind: w.kind,
    slot: slotOfWaiting(w, repos),
    tie: slotOf(cleanText(w.id, 64), FEATURE_SLOTS),
    org: waitingOrg(w),
  }));
  return {
    doorman: cleanText(l.doorman.name, 40),
    refused: outside.filter((w) => w.kind === 'refused').length,
    ready: outside.filter((w) => w.kind === 'ready').length,
    seatsFull: l.seats.filter((s) => s.full).length,
    memory: p && p.maxBytes ? { pct: Math.max(0, Math.min(100, Math.round((p.usedBytes / p.maxBytes) * 100))), gatePct: l.limits?.slicePct ?? null, warnPct: p.warnPct } : null,
    held: p?.held ?? false,
    paused: p?.pausedPanes.length ?? 0,
    queue,
    queueMore: Math.max(0, line.length - QUEUE_MAX),
    updatedAt: l.updatedAt,
  };
}

/** A waiting launch's organisation: its task's area when the orchestrator names one, else the account of the profile it asked for, as it is shown. */
const waitingOrg = (w: Waiting) => orgOfArea(w.area) ?? orgOfAccount(cleanOrNull(w.account));

/** The ids of the tasks that have a session in the building: a task that waits and is among them is drawn as live only. */
function liveTaskIds(views: readonly SessionView[]): Set<string> {
  const ids = new Set<string>();
  for (const v of views) {
    const id = cleanOrNull(v.task, 64);
    if (id !== null && v.effectiveState !== 'ended') ids.add(id);
  }
  return ids;
}

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

const WEEK_MS = 7 * 86_400_000;

/** The week's use against a straight line from its opening, seven days before its reset, to the reset. */
function weekPaceOf(week: Allowance | null, now: number): WeekPace | null {
  if (!week || week.resetsAt === null || week.resetsAt <= now) return null;
  const elapsed = Math.max(0, Math.min(100, ((WEEK_MS - (week.resetsAt - now)) / WEEK_MS) * 100));
  return { elapsedPct: Math.round(elapsed), aheadPct: Math.round(week.usedPct - elapsed) };
}

/** The age of the newest reading of either window; a reading written at 0 does not date itself. */
function readAgeOf(s: Seat, now: number): number | null {
  const at = Math.max(s.session?.readAt ?? 0, s.week?.readAt ?? 0);
  return at > 0 ? Math.max(0, now - at) : null;
}

const seatOf = (s: Seat, now: number): SeatView => ({
  ...s,
  account: cleanText(s.account),
  name: cleanText(s.name, 40),
  org: orgOfAccount(cleanText(s.account)),
  weekPace: weekPaceOf(s.week, now),
  weekTouched: (s.week?.usedPct ?? 0) > 0,
  readAgeMs: readAgeOf(s, now),
});

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
  // The sessions of a task in the order they started, so that the same views in any order give the same board.
  for (const vs of groups.values()) vs.sort((a, b) => a.startedAt - b.startedAt || byCodeUnit(a.id, b.id));
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
      org: vs.map((v) => orgOfAccount(cleanOrNull(v.account))).find((o) => o !== null) ?? null,
      where: 'live',
      reason: null,
      since: null,
      account: null,
      sessions: vs.map((v) => ({
        sessionId: cleanText(v.id, KEY_MAX),
        name: cleanOrNull(v.name, 60) ?? cleanText(v.id.slice(0, 8)),
        state: v.effectiveState as ShownState,
        org: orgOfAccount(cleanOrNull(v.account)),
        body: slotOf(repoRootOf(v), REPO_SLOTS),
      })),
      subagents: vs.reduce((n, v) => n + v.children.filter((c) => c.running).length + v.runs.reduce((m, r) => m + r.agents.filter((a) => a.running).length, 0), 0),
    }))
    .sort((a, b) => b.sessions.length - a.sessions.length || (a.id < b.id ? -1 : 1));
  return [...waiting, ...live];
}

const NO_TOKENS: Tokens = { input: 0, cacheWrite: 0, cacheRead: 0, output: 0 };
const tallyOf = (t: Tally & { done: boolean }): UsageTally => ({ tokens: { ...t.tokens }, costUsd: t.costUsd, unpricedTokens: t.unpricedTokens, counting: !t.done });
function sumTallies(ts: readonly UsageTally[]): UsageTally {
  return ts.reduce<UsageTally>(
    (a, t) => ({
      tokens: { input: a.tokens.input + t.tokens.input, cacheWrite: a.tokens.cacheWrite + t.tokens.cacheWrite, cacheRead: a.tokens.cacheRead + t.tokens.cacheRead, output: a.tokens.output + t.tokens.output },
      costUsd: a.costUsd + t.costUsd,
      unpricedTokens: a.unpricedTokens + t.unpricedTokens,
      counting: a.counting || t.counting,
    }),
    { tokens: NO_TOKENS, costUsd: 0, unpricedTokens: 0, counting: false },
  );
}

/** The metered sessions in the building, the dearest first, summed by account and in all; the rates of the models they use. */
function usageDetail(views: readonly SessionView[], usage: ReadonlyMap<string, SessionUsage>): UsageDetail {
  const sessions = views
    .filter((v) => v.effectiveState !== 'ended' && usage.has(v.id))
    .map((v) => {
      const u = usage.get(v.id)!;
      const account = cleanOrNull(v.account);
      const agents = u.subagents
        .map((a) => ({ ...tallyOf(a), agentId: cleanText(a.agentId, KEY_MAX), type: cleanOrNull(a.type, 40), label: cleanOrNull(a.label, 80), runId: cleanOrNull(a.runId, 64) }))
        .sort((a, b) => b.costUsd - a.costUsd || byCodeUnit(a.agentId, b.agentId));
      const subagentsTally = sumTallies(agents);
      const models = [...new Set([u.main, ...u.subagents].flatMap((t) => t.models))].sort().map((m) => cleanText(m, 60));
      return {
        ...sumTallies([tallyOf(u.main), subagentsTally]),
        sessionId: cleanText(v.id, KEY_MAX),
        name: cleanOrNull(v.name, 60) ?? cleanText(v.id.slice(0, 8)),
        account,
        org: orgOfAccount(account),
        task: cleanOrNull(v.task, 64),
        models,
        subagents: agents.slice(0, INTERNS_MAX),
        subagentsCount: agents.length,
        subagentsMore: Math.max(0, agents.length - INTERNS_MAX),
        subagentsTally,
      };
    })
    .sort((a, b) => b.costUsd - a.costUsd || byCodeUnit(a.sessionId, b.sessionId));
  const byAccount = new Map<string, typeof sessions>();
  for (const s of sessions) byAccount.set(s.account ?? 'unknown', [...(byAccount.get(s.account ?? 'unknown') ?? []), s]);
  const seats = [...byAccount]
    .map(([account, ss]) => ({ ...sumTallies(ss), account, org: account === 'unknown' ? null : orgOfAccount(account), sessions: ss.length }))
    .sort((a, b) => b.costUsd - a.costUsd || byCodeUnit(a.account, b.account));
  const keys = [...new Set(sessions.flatMap((s) => s.models.map((m) => modelKey(m)).filter((k): k is string => k !== null)))].sort();
  const rates = keys.map((model) => {
    const p = PRICES.models[model]!;
    return { model, label: p.label, input: p.input, cacheWrite5m: p.cacheWrite5m, cacheWrite1h: p.cacheWrite1h, cacheRead: p.cacheRead, output: p.output };
  });
  return { prices: { source: PRICES.source, readAt: PRICES.readAt, currency: PRICES.currency, unit: PRICES.unit, rates }, sessions, seats, total: sumTallies(sessions) };
}

/** The Lobby in detail, every string cleaned, the doorman's own session found by its name. */
export function buildLobbyDetail(l: Lobby, views: readonly SessionView[], now = Date.now(), usage: ReadonlyMap<string, SessionUsage> | null = null): LobbyDetail {
  const doorman = views.find((v) => v.effectiveState !== 'ended' && v.name?.toLowerCase() === l.doorman.name.toLowerCase());
  return {
    version: SCENE_VERSION,
    doorman: { name: cleanText(l.doorman.name, 40), sessionId: doorman?.id ?? null },
    gate: gateOf(l.gate),
    queue: l.queue.map(waitingOf),
    tasks: boardOf(l, views),
    seats: l.seats.map((s) => seatOf(s, now)),
    turnTo: cleanOrNull(l.turnTo),
    power: l.power && { ...l.power, pausedPanes: l.power.pausedPanes.map((p) => cleanText(p, 32)), paused: pausedOf(l.power.pausedPanes, views) },
    cap: l.cap,
    machine: l.machine,
    limits: l.limits,
    capacity: capacityDetail(capacityOf(l, now)),
    seatLimitPct: SEAT_LIMIT_PCT,
    usage: usage && usageDetail(views, usage),
    updatedAt: l.updatedAt,
  };
}
