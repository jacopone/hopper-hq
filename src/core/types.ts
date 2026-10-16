/** The terminal multiplexer the sessions run in: it names the panes, and Go reaches a session through it. */
export type TerminalKind = 'tmux' | 'herdr';

/** One reading of an account's allowance window. */
export interface Allowance {
  usedPct: number;
  resetsAt: number | null;
  /** When the reading was written (ms). */
  readAt: number;
}

/** An account the team can work under: an elevator in the Lobby. */
export interface Seat {
  /** The account: an email, or the label its gatekeeper gives it. */
  account: string;
  /** A short name for its sign ('Leonardo'). */
  name: string;
  /** The five-hour window. */
  session: Allowance | null;
  /** The seven-day window. */
  week: Allowance | null;
  /** The seat the team uses now. */
  current: boolean;
  /** Over the gatekeeper's limit: the cabin is full. */
  full: boolean;
  /** No reading, or one older than the gatekeeper's staleness window. */
  stale: boolean;
  /** Takes turns: a seat outside the rota (a personal account) is shown but never offered. */
  turnable: boolean;
}

export type GateReasonKind = 'memory' | 'load' | 'disk' | 'pressure' | 'slice' | 'pacing' | 'rebuild' | 'cap' | 'other';
export interface GateReason {
  kind: GateReasonKind;
  text: string;
}

/** The gate's last word. */
export interface GateVerdict {
  go: boolean;
  text: string;
  reasons: GateReason[];
  at: number;
}

/** A launch waiting outside. */
export interface Waiting {
  /** The orchestrator's id for it ('G-270'); unique in the queue. */
  id: string;
  name: string;
  account: string | null;
  since: number;
  reason: GateReason | null;
}

/** The sessions' memory against their cap. */
export interface Power {
  usedBytes: number;
  /** Null when there is no cap. */
  maxBytes: number | null;
  /** The watchdog's mark, as a percentage of maxBytes. */
  warnPct: number;
  /** The watchdog holds every launch. */
  held: boolean;
  /** Panes of the sessions the watchdog paused and has not released. */
  pausedPanes: string[];
}

/** What a gatekeeper shows in the Lobby (design 2026-10-16 §3). */
export interface Lobby {
  doorman: { name: string };
  gate: GateVerdict | null;
  queue: Waiting[];
  seats: Seat[];
  /** The account to take next when the current seat is full; null when none has margin. */
  turnTo: string | null;
  power: Power | null;
  cap: { working: number | null; max: number | null } | null;
  updatedAt: number;
}

/** Lifecycle states of a session. Time-based ones (idle, dormant, no_signal) are also derived at read time, see core/view.ts. */
export type SessionState =
  | 'working'
  | 'needs_you'
  | 'done'
  | 'in_meeting'
  | 'no_signal'
  | 'idle'
  | 'dormant'
  | 'ended';

export type WaitKind = 'permission' | 'question' | 'plan' | 'input';

export interface WaitReason {
  kind: WaitKind;
  /** Short text, e.g. "Bash" or "Which database?" */
  text: string;
  /** Optional detail, e.g. the command awaiting permission. */
  detail?: string;
}

export interface Workspace {
  cwd: string;
  /** Root of the main repository (not of a linked worktree). Null outside git. */
  repoRoot: string | null;
  /** Basename of repoRoot, or of cwd outside git. */
  repoName: string;
  /** True when cwd belongs to a linked worktree. */
  worktree: boolean;
  /** Current branch; 'HEAD' when detached; null when unknown. */
  branch: string | null;
  /**
   * Top level of the working tree: a linked worktree's own root, or the main checkout's root. Null outside git.
   * Absent in sessions saved before it existed: read `root ?? cwd`.
   */
  root?: string | null;
}

export interface ChildAgent {
  id: string;
  type: string;
  description: string | null;
  running: boolean;
  lastAction: string | null;
  updatedAt: number;
  /**
   * Set when it was running as the daemon restored it from the store, until an event reports on it: what the store kept is
   * the last word on it. It runs on until the restored subagents are settled, and once stopped that way, the filesystem
   * may start it again on a transcript written before its last update.
   */
  restored?: boolean;
}

export interface OpenTool {
  id: string | null;
  label: string;
  startedAt: number;
}

export type RunStatus = 'running' | 'completed' | 'failed' | 'killed';

/** An agent a workflow run's script started. */
export interface RunAgent {
  id: string;
  /** The journal's label or the spawn's description; null when unknown. */
  label: string | null;
  /** The phase the agent started in; null when unknown. */
  phase: string | null;
  /** Agent type from its meta file or the spawn ('workflow-subagent', 'Explore', ...); 'agent' when unknown. */
  type: string;
  running: boolean;
  startedAt: number;
  updatedAt: number;
}

/** A workflow run a session started (design §5). */
export interface WorkflowRun {
  /** 'wf_…' */
  id: string;
  /** The script's meta.name; null until known. */
  name: string | null;
  /** The script's meta.description (the launch result's Summary line); null until known. */
  summary: string | null;
  /** Phase titles in order; empty when unknown. */
  phases: string[];
  /** Phase of the most recently started agent; null before the first. */
  currentPhase: string | null;
  status: RunStatus;
  /** True once a filesystem event confirmed the run. Until then only its running agents keep the session in a meeting. */
  onDisk: boolean;
  startedAt: number;
  endedAt: number | null;
  /** The latest agents (running ones are never dropped). */
  agents: RunAgent[];
  /** How many of the run's agents finished, including any dropped from `agents`. */
  agentsFinished: number;
  /**
   * Ids of the finished agents dropped from `agents`, the latest last, at most MAX_DROPPED_AGENTS: a start or an end read
   * again for one of them counts nothing twice. Absent while none was dropped.
   */
  droppedAgents?: string[];
}

/** The "where it stands" line (M3a design §3). */
export interface SessionSummary {
  text: string;
  /** When it was written. */
  at: number;
  /** Hash of the input it was written from: the same input is not summarized twice. */
  inputHash: string;
}

export interface Session {
  id: string;
  agentKind: 'claude-code';
  location: 'local' | 'cloud';
  pid: number | null;
  name: string | null;
  tmuxPane: string | null;
  /** The tmux session the pane is in, as Claude Code wrote it; null when unknown. Pane ids are per tmux server: this tells two %N apart. */
  tmuxSession: string | null;
  /** The account its config directory stands for (an email, or a label given for the directory); null when there is one directory and nothing to tell apart. */
  account: string | null;
  /** The orchestrator's task id ('G-268'): from the session's name, else from the gatekeeper. Null when none. */
  task: string | null;
  transcriptPath: string | null;
  workspace: Workspace;
  state: SessionState;
  stateSince: number;
  waitReason: WaitReason | null;
  /** The subagent whose wait waitReason is; null when it is the session's own, or nobody's in particular. */
  waitAgentId: string | null;
  title: string | null;
  firstPrompt: string | null;
  lastPrompt: string | null;
  lastAction: string | null;
  lastActionAt: number | null;
  openTool: OpenTool | null;
  backgroundTasks: number;
  children: ChildAgent[];
  /** Workflow runs, the latest first-started last; at most 10, running ones never dropped. */
  runs: WorkflowRun[];
  /** The main agent's last tool labels, oldest first; at most 10. */
  recentActions: string[];
  /** The main agent's last reply text, cleaned, at most 2000 characters; null when unknown. */
  lastAnswer: string | null;
  lastAnswerAt: number | null;
  /** When the user last sent a prompt; null when unknown. */
  lastPromptAt: number | null;
  summary: SessionSummary | null;
  startedAt: number;
  /** ts of the last applied ordered event. */
  lastEventAt: number;
  /** seq of the last applied ordered event (tie-break for equal ts). */
  lastSeq: number;
  /** When the user marked the current 'done' as seen. */
  seenAt: number | null;
}

/** 'terminal': the multiplexer's own listing (herdr), which says which pane a session is in. 'gatekeeper': the orchestrator's files, which name each session's task. */
export type EventSourceKind = 'hook' | 'fs' | 'demo' | 'terminal' | 'gatekeeper';

interface EventBase {
  sessionId: string;
  /** Wall-clock ms when the event happened (hook stamp, transcript timestamp, file time). */
  ts: number;
  /** Arrival order, assigned by the collector. */
  seq: number;
  source: EventSourceKind;
  /** Working directory, when known. Lets the collector create a session it has not seen yet. */
  cwd?: string;
}

export type CollectorEvent = EventBase &
  (
    | {
        type: 'session.seen';
        workspace: Workspace;
        pid?: number | null;
        name?: string | null;
        tmuxPane?: string | null;
        tmuxSession?: string | null;
        account?: string | null;
        transcriptPath?: string | null;
        startedAt?: number;
      }
    | { type: 'session.started' }
    /** The pane the terminal shows the session in; null when it shows it in none any more. Only a known session takes it. */
    | { type: 'pane'; pane: string | null }
    /** The task the gatekeeper's registry gives the session; null when it lists none. Only a known session takes it. */
    | { type: 'task'; task: string | null }
    | { type: 'session.status'; status: 'busy' | 'idle' | 'waiting'; waitingFor: string | null }
    | { type: 'branch'; branch: string | null }
    | { type: 'title'; title: string }
    | { type: 'prompt'; text: string | null }
    | { type: 'tool.started'; toolId: string | null; tool: string; label: string; agentId: string | null }
    | { type: 'tool.finished'; toolId: string | null; ok: boolean; agentId: string | null }
    | { type: 'waiting'; reason: WaitReason; agentId: string | null }
    | { type: 'turn.finished'; backgroundTasks: number }
    | { type: 'agent.started'; agentId: string; agentType: string; description: string | null; runId?: string | null; phase?: string | null }
    | { type: 'workflow.started'; runId: string; name?: string | null; summary?: string | null; phases?: string[] }
    | { type: 'workflow.finished'; runId: string; status: 'completed' | 'failed' | 'killed'; startedAt?: number }
    | { type: 'answer'; text: string }
    | { type: 'agent.finished'; agentId: string }
    | { type: 'session.ended'; reason: string }
  );

export type DistributiveOmit<T, K extends PropertyKey> = T extends unknown ? Omit<T, K> : never;

/** An event before the collector assigns `seq`. Adapters produce these. */
export type RawEvent = DistributiveOmit<CollectorEvent, 'seq'>;

export type EventOf<T extends CollectorEvent['type']> = Extract<CollectorEvent, { type: T }>;
