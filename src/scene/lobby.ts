import type { GateVerdict, Lobby, Seat, Waiting } from '../core/types.js';
import type { SessionView } from '../core/view.js';
import { cleanOrNull, cleanText } from './text.js';
import { SCENE_VERSION, type LobbyDetail, type LobbySummary, type PausedSession } from './types.js';

/** What the façade's Lobby label counts. */
export function buildLobbySummary(l: Lobby): LobbySummary {
  const p = l.power;
  return {
    waiting: l.queue.length,
    seatsFull: l.seats.filter((s) => s.full).length,
    powerPct: p && p.maxBytes ? Math.round((p.usedBytes / p.maxBytes) * 100) : null,
    held: p?.held ?? false,
    paused: p?.pausedPanes.length ?? 0,
    updatedAt: l.updatedAt,
  };
}

const gateOf = (g: GateVerdict | null): GateVerdict | null =>
  g && { go: g.go, text: cleanText(g.text, 400), reasons: g.reasons.map((r) => ({ kind: r.kind, text: cleanText(r.text) })), at: g.at };

const waitingOf = (w: Waiting): Waiting => ({
  id: cleanText(w.id, 64),
  name: cleanText(w.name),
  account: cleanOrNull(w.account),
  since: w.since,
  reason: w.reason && { kind: w.reason.kind, text: cleanText(w.reason.text) },
});

const seatOf = (s: Seat): Seat => ({ ...s, account: cleanText(s.account), name: cleanText(s.name, 40) });

/** The paused panes, each with the live session in it when the building knows one. */
function pausedOf(panes: readonly string[], views: readonly SessionView[]): PausedSession[] {
  return panes.map((pane) => {
    const v = views.find((x) => x.effectiveState !== 'ended' && x.tmuxPane === pane);
    return { pane: cleanText(pane, 32), sessionId: v?.id ?? null, name: v ? cleanOrNull(v.name) : null };
  });
}

/** The Lobby in detail, every string cleaned, the doorman's own session found by its name. */
export function buildLobbyDetail(l: Lobby, views: readonly SessionView[]): LobbyDetail {
  const doorman = views.find((v) => v.effectiveState !== 'ended' && v.name?.toLowerCase() === l.doorman.name.toLowerCase());
  return {
    version: SCENE_VERSION,
    doorman: { name: cleanText(l.doorman.name, 40), sessionId: doorman?.id ?? null },
    gate: gateOf(l.gate),
    queue: l.queue.map(waitingOf),
    seats: l.seats.map(seatOf),
    turnTo: cleanOrNull(l.turnTo),
    power: l.power && { ...l.power, pausedPanes: l.power.pausedPanes.map((p) => cleanText(p, 32)), paused: pausedOf(l.power.pausedPanes, views) },
    cap: l.cap,
    updatedAt: l.updatedAt,
  };
}
