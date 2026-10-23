import { readdir, readFile, stat } from 'node:fs/promises';
import { basename, dirname, join } from 'node:path';
import { readNewLines, type TailState } from '../adapters/claude-code/jsonl.js';
import type { Tokens } from '../core/types.js';
import { byCodeUnit } from '../core/view.js';
import { costOf, type MessageUsage } from './prices.js';

/** What a transcript used: tokens by kind, their list price, and the tokens of models with no price, which the cost leaves out. */
export interface Tally {
  tokens: Tokens;
  costUsd: number;
  unpricedTokens: number;
  /** The models of its replies, sorted. */
  models: string[];
  replies: number;
}

type Obj = Record<string, unknown>;
const obj = (v: unknown): Obj | null => (v && typeof v === 'object' && !Array.isArray(v) ? (v as Obj) : null);
const count = (v: unknown): number => (typeof v === 'number' && Number.isFinite(v) && v > 0 ? Math.round(v) : 0);
const word = (v: unknown, fallback: string): string => (typeof v === 'string' && v ? v : fallback);

/**
 * A model reply's usage from a transcript line, by the reply's id: Claude Code writes one line per content block of a
 * reply, each with the reply's usage, so the id is what a reply is counted once by. Null for any other line.
 */
export function usageOfLine(line: string): { id: string; usage: MessageUsage } | null {
  let e: Obj | null;
  try {
    e = obj(JSON.parse(line));
  } catch {
    return null;
  }
  const m = e && e.type === 'assistant' ? obj(e.message) : null;
  const u = m && obj(m.usage);
  const model = m && typeof m.model === 'string' ? m.model : null;
  const id = m && (typeof m.id === 'string' ? m.id : typeof e!.requestId === 'string' ? e!.requestId : null);
  if (!u || !model || model === '<synthetic>' || !id) return null;
  const split = obj(u.cache_creation);
  const written = count(u.cache_creation_input_tokens);
  // Without the split the writes are five-minute ones, the API's default lifetime.
  const w1h = split ? count(split.ephemeral_1h_input_tokens) : 0;
  const w5m = split ? count(split.ephemeral_5m_input_tokens) : written;
  return {
    id,
    usage: { model, speed: word(u.speed, 'standard'), geo: word(u.inference_geo, 'global'), input: count(u.input_tokens), cacheWrite5m: w5m, cacheWrite1h: w1h, cacheRead: count(u.cache_read_input_tokens), output: count(u.output_tokens) },
  };
}

const KINDS = ['input', 'cacheWrite5m', 'cacheWrite1h', 'cacheRead', 'output'] as const;
const sumOf = (u: MessageUsage) => KINDS.reduce((n, k) => n + u[k], 0);

/** How much of a file one read takes at most, so that the first pass over a long transcript is spread over polls. */
export const READ_BUDGET = 4 * 1024 * 1024;

/**
 * One transcript's usage, read whole from its start and then as it grows. A reply seen again keeps the largest count
 * of each kind. A file that shrinks was replaced: the count starts again.
 */
export class UsageFile {
  private tail: TailState;
  private readonly replies = new Map<string, MessageUsage>();
  private tokens = { input: 0, cacheWrite5m: 0, cacheWrite1h: 0, cacheRead: 0, output: 0 };
  private cost = 0;
  private unpriced = 0;
  private readonly models = new Set<string>();
  /** The whole file, as it was at the last read, is counted. */
  done = false;

  constructor(readonly path: string) {
    this.tail = { path, offset: 0, skipping: false };
  }

  async read(budget = READ_BUDGET): Promise<void> {
    let size: number;
    try {
      size = (await stat(this.path)).size;
    } catch {
      this.done = true;
      return;
    }
    if (size < this.tail.offset) this.reset();
    const before = this.tail.offset;
    const { lines, state } = await readNewLines(this.tail, budget);
    this.tail = state;
    for (const line of lines) {
      const r = usageOfLine(line);
      if (r) this.add(r.id, r.usage);
    }
    // A line still being written leaves the offset where it was: what is complete is counted.
    this.done = this.tail.offset >= size || (this.tail.offset === before && !this.tail.skipping);
  }

  private reset(): void {
    this.tail = { path: this.path, offset: 0, skipping: false };
    this.replies.clear();
    this.tokens = { input: 0, cacheWrite5m: 0, cacheWrite1h: 0, cacheRead: 0, output: 0 };
    this.cost = 0;
    this.unpriced = 0;
    this.models.clear();
  }

  private add(id: string, u: MessageUsage): void {
    const was = this.replies.get(id);
    const next: MessageUsage = was ? { ...u, ...Object.fromEntries(KINDS.map((k) => [k, Math.max(was[k], u[k])])) } : u;
    if (was) this.take(was, -1);
    this.take(next, 1);
    this.replies.set(id, next);
  }

  private take(u: MessageUsage, sign: 1 | -1): void {
    for (const k of KINDS) this.tokens[k] += sign * u[k];
    this.models.add(u.model);
    const c = costOf(u);
    if (c === null) this.unpriced += sign * sumOf(u);
    else this.cost += sign * c;
  }

  tally(): Tally {
    const t = this.tokens;
    return {
      tokens: { input: t.input, cacheWrite: t.cacheWrite5m + t.cacheWrite1h, cacheRead: t.cacheRead, output: t.output },
      costUsd: this.cost,
      unpricedTokens: this.unpriced,
      models: [...this.models].sort(),
      replies: this.replies.size,
    };
  }
}

/** A session's transcript, as the building knows it. */
export interface MeteredSession {
  id: string;
  transcript: string | null;
}

/** A subagent's usage: the session's own, or one agent of a workflow run it launched. */
export interface SubagentUsage extends Tally {
  agentId: string;
  /** Its type and task from its meta file; null when the file says none. */
  type: string | null;
  label: string | null;
  /** The workflow run it belongs to; null for a subagent of the session itself. */
  runId: string | null;
  done: boolean;
}

/** A session's usage as far as it is read: its own transcript's, and each subagent's; `done` once a transcript is counted whole. */
export interface SessionUsage {
  main: Tally & { done: boolean };
  /** By run (the session's own first), then by id. */
  subagents: SubagentUsage[];
}

interface Agent {
  file: UsageFile;
  agentId: string;
  runId: string | null;
  type: string | null;
  label: string | null;
}

interface Metered {
  main: UsageFile;
  agents: Map<string, Agent>;
}

const AGENT_FILE = /^agent-(.+)\.jsonl$/;
const META_MAX = 256 * 1024;

/** An agent's type and task, from the meta file beside its transcript; nulls when it has none or it is not JSON. */
async function metaOf(path: string): Promise<{ type: string | null; label: string | null }> {
  try {
    const st = await stat(path);
    if (!st.isFile() || st.size > META_MAX) return { type: null, label: null };
    const d = JSON.parse(await readFile(path, 'utf8')) as Record<string, unknown> | null;
    const text = (v: unknown) => (typeof v === 'string' && v ? v : null);
    return { type: text(d?.agentType), label: text(d?.description) };
  } catch {
    return { type: null, label: null };
  }
}

async function names(dir: string): Promise<string[]> {
  try {
    return await readdir(dir);
  } catch {
    return [];
  }
}

/** How much the meter reads at most in one poll, across every transcript: the first pass over the building is spread over polls. */
export const POLL_BUDGET = 16 * 1024 * 1024;

/**
 * The usage of the sessions in the building, from their transcripts, read whole and then as they grow. Read-only; it
 * calls nothing. A session that leaves the building is forgotten.
 */
export class UsageMeter {
  private readonly sessions = new Map<string, Metered>();
  private timer: NodeJS.Timeout | null = null;
  private busy = false;

  constructor(private readonly budget = POLL_BUDGET) {}

  start(sessions: () => readonly MeteredSession[], intervalMs = 10_000): void {
    if (this.timer) return;
    const tick = () => void this.poll(sessions()).catch(() => undefined);
    tick();
    this.timer = setInterval(tick, intervalMs);
  }

  stop(): void {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
  }

  /** One pass: the subagents found, then the files not yet read whole first, each up to what is left of the budget. Overlapping calls are skipped. */
  async poll(sessions: readonly MeteredSession[]): Promise<void> {
    if (this.busy) return;
    this.busy = true;
    try {
      const live = new Set<string>();
      for (const s of sessions) {
        if (!s.transcript) continue;
        live.add(s.id);
        let m = this.sessions.get(s.id);
        if (!m || m.main.path !== s.transcript) this.sessions.set(s.id, (m = { main: new UsageFile(s.transcript), agents: new Map() }));
        await this.findAgents(m);
      }
      for (const id of [...this.sessions.keys()]) if (!live.has(id)) this.sessions.delete(id);
      let left = this.budget;
      const files = [...this.sessions.values()].flatMap((m) => [m.main, ...[...m.agents.values()].map((a) => a.file)]);
      for (const f of files.sort((a, b) => Number(a.done) - Number(b.done))) {
        if (left <= 0) break;
        const step = Math.min(left, READ_BUDGET);
        await f.read(step);
        left -= step;
      }
    } finally {
      this.busy = false;
    }
  }

  /** The subagents beside a session's transcript: its own in subagents/, a workflow run's in subagents/workflows/<run>/. */
  private async findAgents(m: Metered): Promise<void> {
    const dir = join(dirname(m.main.path), basename(m.main.path, '.jsonl'), 'subagents');
    const runs = (await names(join(dir, 'workflows'))).filter((n) => n.startsWith('wf_'));
    for (const [runId, at] of [[null, dir] as const, ...runs.map((r) => [r, join(dir, 'workflows', r)] as const)]) {
      for (const name of await names(at)) {
        const agentId = AGENT_FILE.exec(name)?.[1];
        const key = `${runId ?? ''}/${agentId}`;
        if (!agentId || m.agents.has(key)) continue;
        const meta = await metaOf(join(at, `agent-${agentId}.meta.json`));
        m.agents.set(key, { file: new UsageFile(join(at, name)), agentId, runId, ...meta });
      }
    }
  }

  read(): Map<string, SessionUsage> {
    return new Map(
      [...this.sessions].map(([id, m]) => [
        id,
        {
          main: { ...m.main.tally(), done: m.main.done },
          subagents: [...m.agents.values()]
            .sort((a, b) => byCodeUnit(a.runId ?? '', b.runId ?? '') || byCodeUnit(a.agentId, b.agentId))
            .map((a) => ({ ...a.file.tally(), agentId: a.agentId, runId: a.runId, type: a.type, label: a.label, done: a.file.done })),
        },
      ]),
    );
  }
}
