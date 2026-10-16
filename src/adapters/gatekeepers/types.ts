import type { Lobby } from '../../core/types.js';

/** What a gatekeeper provider hands the building. */
export interface GatekeeperSink {
  /** A whole Lobby, each time something in it changed. */
  lobby(l: Lobby): void;
  /** The task of a session the gatekeeper can name; null when it names none any more. */
  task(sessionId: string, task: string | null): void;
}

/** Reads an orchestrator's state into the Lobby. Read-only towards the orchestrator; it runs nothing of it. */
export interface GatekeeperProvider {
  start(sink: GatekeeperSink, intervalMs?: number): void;
  stop(): void;
  /** One reading now. */
  poll(): Promise<void>;
}
