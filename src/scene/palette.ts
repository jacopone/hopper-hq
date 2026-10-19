/**
 * Colour slots: a repo colours its rug and its robots' bodies, a feature colours the robots' ties. Browser-safe.
 * The theme maps slot n to --repo-n / --feature-n, so the same repo or feature looks the same everywhere.
 */

export const REPO_SLOTS = 8;
export const FEATURE_SLOTS = 8;

/** The organisations an account belongs to: the company, the farm, a person's own, any other. The theme's --org-<name> colours them. */
export const ORGS = ['amatino', 'tenuta', 'personal', 'other'] as const;
export type Org = (typeof ORGS)[number];

/** Mail providers whose addresses are a person's own. */
const PERSONAL_DOMAINS: ReadonlySet<string> = new Set(['gmail.com', 'googlemail.com', 'outlook.com', 'hotmail.com', 'live.com', 'icloud.com', 'me.com', 'proton.me', 'protonmail.com', 'yahoo.com']);

/** One letter and a name for each organisation, for a chip and a tooltip. */
export const ORG_LETTER: Readonly<Record<Org, string>> = { amatino: 'A', tenuta: 'T', personal: 'P', other: '?' };
export const ORG_LABEL: Readonly<Record<Org, string>> = { amatino: 'Amatino', tenuta: 'Tenuta Larnianone', personal: 'Personal', other: 'Another organisation' };

const inDomain = (domain: string, root: string): boolean => domain === root || domain.endsWith(`.${root}`);

/**
 * The organisation of an account, from its email's domain; null when the account is not an email (a config directory's
 * label), so that nothing is guessed.
 */
export function orgOfAccount(account: string | null | undefined): Org | null {
  const m = /^[^@\s]+@([^@\s]+)$/.exec((account ?? '').trim());
  if (!m) return null;
  const domain = m[1]!.toLowerCase();
  if (inDomain(domain, 'amatino.ai')) return 'amatino';
  if (inDomain(domain, 'tenutalarnianone.com')) return 'tenuta';
  return PERSONAL_DOMAINS.has(domain) ? 'personal' : 'other';
}

/** The organisation of an orchestrator's task area ('amatino', 'tenuta', 'personali'); null for any other word. */
export function orgOfArea(area: string | null | undefined): Org | null {
  return area === 'amatino' ? 'amatino' : area === 'tenuta' ? 'tenuta' : area === 'personali' ? 'personal' : null;
}

/** 32-bit FNV-1a over UTF-16 code units, from the standard offset basis or another seed. */
export function fnv1a32(text: string, seed = 0x811c9dc5): number {
  let h = seed;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

/**
 * murmur3's 32-bit finalizer: every input bit reaches every output bit. FNV-1a alone mixes a key's last code units into its
 * high bits through one multiply only, and its low bits depend only on the low bits of each code unit.
 */
export function fmix32(h: number): number {
  h ^= h >>> 16;
  h = Math.imul(h, 0x85ebca6b);
  h ^= h >>> 13;
  h = Math.imul(h, 0xc2b2ae35);
  h ^= h >>> 16;
  return h >>> 0;
}

/**
 * A stable slot in 0..slots-1: the high bits of the mixed hash, so 'web' and 'Web', or 'api-v1' and 'api-v9', need not
 * share one. Repo slots are keyed by repo root (cwd outside git), feature slots by feature key.
 */
export function slotOf(key: string, slots: number): number {
  return Math.floor((fmix32(fnv1a32(key)) * slots) / 2 ** 32);
}
