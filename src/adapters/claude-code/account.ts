import { readFile } from 'node:fs/promises';
import { basename } from 'node:path';
import type { ClaudeDir } from '../../config.js';

/** The account Claude Code signed into in a config directory, from its .claude.json; null when the file does not say. */
export async function readAccountEmail(dir: string): Promise<string | null> {
  try {
    const parsed: unknown = JSON.parse(await readFile(`${dir}/.claude.json`, 'utf8'));
    const account = (parsed as { oauthAccount?: { emailAddress?: unknown } } | null)?.oauthAccount;
    const email = account?.emailAddress;
    return typeof email === 'string' && email.trim() ? email.trim() : null;
  } catch {
    return null;
  }
}

/**
 * What to call the sessions of each config directory: the label given for it; else, when there are several directories
 * to tell apart, the account signed into it, or the directory's name. With one directory and no label there is nothing
 * to tell apart, and its sessions carry no account.
 */
export async function accountLabels(dirs: readonly ClaudeDir[]): Promise<Map<string, string | null>> {
  const out = new Map<string, string | null>();
  for (const d of dirs) {
    if (d.label !== null) out.set(d.dir, d.label);
    else if (dirs.length === 1) out.set(d.dir, null);
    else out.set(d.dir, (await readAccountEmail(d.dir)) ?? basename(d.dir).replace(/^\./, ''));
  }
  return out;
}
