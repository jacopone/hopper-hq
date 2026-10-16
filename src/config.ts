import { homedir } from 'node:os';
import { delimiter, join } from 'node:path';
import { FLOOR_MODES, type FloorMode } from './core/feature.js';

/** One of Claude Code's config directories (sessions/, projects/, settings.json), and what to call its sessions. */
export interface ClaudeDir {
  dir: string;
  /** The account label given for it: 'DIR=LABEL'. Null when none was: the daemon finds one when it has to. */
  label: string | null;
}

export interface Paths {
  /** Claude Code's config directories, at least one. One per account when several accounts run on the machine. */
  claudeDirs: ClaudeDir[];
  /** hopper-hq's own data directory (token, daemon.json, database). */
  dataDir: string;
}

/** The floor mode named by an option or HOPPER_HQ_FLOORS; the default, feature, when neither says; an error for a word that is no mode. */
export function resolveFloorMode(value: string | undefined, env: NodeJS.ProcessEnv = process.env): FloorMode {
  const word = value ?? env.HOPPER_HQ_FLOORS ?? 'feature';
  if (!(FLOOR_MODES as readonly string[]).includes(word)) throw new Error(`Unknown floor mode: ${word} (one of ${FLOOR_MODES.join(', ')})`);
  return word as FloorMode;
}

export interface PathOptions {
  /** One config directory: shorthand for `claudeDirs: [dir]`. */
  claudeDir?: string;
  /** Config directories as given on the command line: 'DIR' or 'DIR=LABEL'. */
  claudeDirs?: string[];
  dataDir?: string;
}

/** 'DIR' or 'DIR=LABEL', the label after the last '=': a directory may hold one, an account label does not. */
export function parseClaudeDir(spec: string): ClaudeDir {
  const at = spec.lastIndexOf('=');
  const dir = at === -1 ? spec : spec.slice(0, at);
  const label = at === -1 ? '' : spec.slice(at + 1).trim();
  if (!dir) throw new Error(`Invalid Claude config directory: ${JSON.stringify(spec)}`);
  return { dir, label: label || null };
}

/**
 * The config directories to watch, each once, in the order given: the first time one is named decides its place, and
 * the first label given for it is kept. A directory named with and without a label takes the label.
 */
function uniqueDirs(specs: readonly string[]): ClaudeDir[] {
  const out: ClaudeDir[] = [];
  for (const spec of specs) {
    if (!spec) continue;
    const next = parseClaudeDir(spec);
    const prev = out.find((d) => d.dir === next.dir);
    if (!prev) out.push(next);
    else if (prev.label === null) prev.label = next.label;
  }
  return out;
}

export function resolvePaths(opts: PathOptions = {}, env: NodeJS.ProcessEnv = process.env): Paths {
  const given = opts.claudeDirs ?? (opts.claudeDir === undefined ? [] : [opts.claudeDir]);
  let claudeDirs = uniqueDirs(given);
  if (claudeDirs.length === 0 && env.HOPPER_HQ_CLAUDE_DIRS) claudeDirs = uniqueDirs(env.HOPPER_HQ_CLAUDE_DIRS.split(delimiter));
  if (claudeDirs.length === 0) claudeDirs = [{ dir: env.CLAUDE_CONFIG_DIR || join(homedir(), '.claude'), label: null }];
  return {
    claudeDirs,
    dataDir: opts.dataDir ?? env.HOPPER_HQ_HOME ?? join(homedir(), '.hopper-hq'),
  };
}

export interface Thresholds {
  /** An unseen 'done' becomes 'idle' after this long. */
  doneToIdleMs: number;
  /** 'idle' becomes 'dormant' after this long. */
  idleToDormantMs: number;
  /** 'working' with no activity becomes 'no_signal' after this long. */
  noSignalMs: number;
  /** A subagent transcript written within this window counts as running (filesystem fallback). */
  childFreshMs: number;
}

export const DEFAULT_THRESHOLDS: Thresholds = {
  doneToIdleMs: 4 * 60 * 60 * 1000,
  idleToDormantMs: 3 * 24 * 60 * 60 * 1000,
  noSignalMs: 10 * 60 * 1000,
  childFreshMs: 90 * 1000,
};

export const DEFAULT_PORT = 7337;
