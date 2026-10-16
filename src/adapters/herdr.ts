import type { RawEvent } from '../core/types.js';
import { isPaneOf } from '../core/terminal.js';
import { isSessionId } from '../scene/text.js';
import { execRunner, type CommandRunner } from '../server/focus.js';

/** One pane of `herdr pane list` that hopper-hq cares about: where it is, and the Claude Code session it shows, if any. */
export interface HerdrPane {
  pane: string;
  sessionId: string | null;
}

/**
 * Reads `herdr pane list`: {"result": {"panes": [{"pane_id": "wK:p2", "agent_session": {"agent": "claude", "value": "<id>"}, …}]}}.
 * Null when the text is not that listing. A pane whose id is not herdr's, or whose session id is not one, is skipped.
 */
export function parsePaneList(text: string): HerdrPane[] | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    return null;
  }
  const panes = (parsed as { result?: { panes?: unknown } } | null)?.result?.panes;
  if (!Array.isArray(panes)) return null;
  const out: HerdrPane[] = [];
  for (const p of panes as { pane_id?: unknown; agent_session?: { agent?: unknown; value?: unknown } | null }[]) {
    if (!p || typeof p !== 'object' || typeof p.pane_id !== 'string' || !isPaneOf('herdr', p.pane_id)) continue;
    const s = p.agent_session;
    const sessionId = s && s.agent === 'claude' && isSessionId(s.value) ? s.value : null;
    out.push({ pane: p.pane_id, sessionId });
  }
  return out;
}

export interface HerdrAdapterOptions {
  emit: (e: RawEvent) => void;
  /** Runs herdr; default: the `herdr` command with a timeout. */
  run?: CommandRunner;
  /** Told whether herdr answered, each time that changes, and once after the first poll. */
  onReachable?: (reachable: boolean) => void;
  now?: () => number;
}

/**
 * Keeps each session's pane as herdr lists it. Session files carry no pane under herdr, so this is what makes Go work
 * there. A `pane` event names no working directory: the collector takes it for a session it knows, and drops it for
 * one it does not, so a pane that still names an ended session makes nothing.
 */
export class HerdrAdapter {
  /** The pane each session was last reported in. */
  private readonly panes = new Map<string, string>();
  private timer: NodeJS.Timeout | null = null;
  private busy = false;
  private reachable: boolean | null = null;
  private readonly run: CommandRunner;
  private readonly now: () => number;

  constructor(private readonly o: HerdrAdapterOptions) {
    this.run = o.run ?? execRunner('herdr', 3000);
    this.now = o.now ?? Date.now;
  }

  start(intervalMs = 3000): void {
    if (this.timer) return;
    void this.poll();
    this.timer = setInterval(() => void this.poll(), intervalMs);
  }

  stop(): void {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
  }

  /** One listing. Overlapping calls are skipped. Never throws. */
  async poll(): Promise<void> {
    if (this.busy) return;
    this.busy = true;
    try {
      await this.scan();
    } catch {
      // keep polling
    } finally {
      this.busy = false;
    }
  }

  private setReachable(v: boolean): void {
    if (this.reachable === v) return;
    this.reachable = v;
    this.o.onReachable?.(v);
  }

  private async scan(): Promise<void> {
    const r = await this.run(['pane', 'list']);
    const panes = r.code === 0 ? parsePaneList(r.stdout) : null;
    // A herdr that does not answer, or answers with something else, says nothing about the panes: they stay as they were.
    if (!panes) {
      this.setReachable(false);
      return;
    }
    this.setReachable(true);
    const now = this.now();
    const seen = new Map<string, string>();
    // A session listed in two panes (a split showing one transcript) keeps the first.
    for (const p of panes) if (p.sessionId && !seen.has(p.sessionId)) seen.set(p.sessionId, p.pane);
    for (const [sessionId, pane] of seen) {
      if (this.panes.get(sessionId) === pane) continue;
      this.panes.set(sessionId, pane);
      this.o.emit({ type: 'pane', sessionId, ts: now, source: 'terminal', pane });
    }
    for (const sessionId of [...this.panes.keys()]) {
      if (seen.has(sessionId)) continue;
      this.panes.delete(sessionId);
      this.o.emit({ type: 'pane', sessionId, ts: now, source: 'terminal', pane: null });
    }
  }
}

/** Whether herdr answers `pane list` now: what 'auto' decides the terminal by. */
export async function probeHerdr(run: CommandRunner = execRunner('herdr', 2000)): Promise<boolean> {
  try {
    const r = await run(['pane', 'list']);
    return r.code === 0 && parsePaneList(r.stdout) !== null;
  } catch {
    return false;
  }
}
