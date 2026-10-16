export interface FeatureRules {
  /** Compared case-insensitively. Sessions on these branches have no feature. */
  trunkBranches: string[];
  /** Branches created by tools rather than people: Claude Code names a worktree's branch 'worktree-<name>' (subagents' are 'worktree-agent-<id>'). */
  generatedBranches: RegExp[];
  /** First capture group is the ticket id. */
  ticketPatterns: RegExp[];
}

export const DEFAULT_FEATURE_RULES: FeatureRules = {
  trunkBranches: ['main', 'master', 'dev', 'develop', 'trunk', 'head'],
  generatedBranches: [/^claude\//i, /^worktree-/i],
  ticketPatterns: [/\b([A-Z][A-Z0-9]{1,9}-\d+)\b/, /\b(CU-[a-z0-9]{4,})\b/i],
};

/** Which floors the building has: one per feature (branch, across repositories), or one per repository. */
export type FloorMode = 'feature' | 'repo';

export const FLOOR_MODES: readonly FloorMode[] = ['feature', 'repo'];

/** Floors by repository: no branch makes a feature, so every session sits in its repository's department, its checkout its pod. */
export const REPO_FLOOR_RULES: FeatureRules = { ...DEFAULT_FEATURE_RULES, generatedBranches: [/^/] };

/** The rules for a floor mode. */
export function rulesFor(mode: FloorMode): FeatureRules {
  return mode === 'repo' ? REPO_FLOOR_RULES : DEFAULT_FEATURE_RULES;
}

/** Feature key for a branch, or null when the session has no feature (trunk, detached, generated). */
export function deriveFeature(
  branch: string | null | undefined,
  repoName: string,
  rules: FeatureRules = DEFAULT_FEATURE_RULES,
): string | null {
  const b = (branch ?? '').trim();
  if (!b) return null;
  if (rules.trunkBranches.map((t) => t.toLowerCase()).includes(b.toLowerCase())) return null;
  if (rules.generatedBranches.some((re) => re.test(b))) return null;

  for (const re of rules.ticketPatterns) {
    const m = b.match(re);
    if (m?.[1]) return m[1].toUpperCase();
  }

  const last = b.split('/').filter(Boolean).pop() ?? b;
  const parts = last.toLowerCase().split('-');
  const repo = repoName.toLowerCase();
  const repoTokens = new Set([repo, ...repo.split(/[-_.]+/).filter((t) => t.length >= 3)]);
  const tail = parts[parts.length - 1];
  if (parts.length >= 3 && tail !== undefined && repoTokens.has(tail)) parts.pop();
  const slug = parts.join('-');
  return slug || null;
}
