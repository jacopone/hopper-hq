import { describe, expect, it } from 'vitest';
import { mkdir, mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { accountLabels, readAccountEmail } from '../../src/adapters/claude-code/account.js';

const tmp = () => mkdtemp(join(tmpdir(), 'shq-acct-'));

describe('readAccountEmail', () => {
  it('reads the signed-in account from .claude.json', async () => {
    const dir = await tmp();
    await writeFile(join(dir, '.claude.json'), JSON.stringify({ oauthAccount: { emailAddress: ' me@example.com ' } }));
    expect(await readAccountEmail(dir)).toBe('me@example.com');
  });

  it('is null without the file, or when it does not say', async () => {
    const dir = await tmp();
    expect(await readAccountEmail(dir)).toBeNull();
    await writeFile(join(dir, '.claude.json'), '');
    expect(await readAccountEmail(dir)).toBeNull();
    await writeFile(join(dir, '.claude.json'), JSON.stringify({ oauthAccount: { emailAddress: 7 } }));
    expect(await readAccountEmail(dir)).toBeNull();
  });
});

describe('readAccountEmail, where Claude Code keeps the account', () => {
  it('reads .config.json when .claude.json says nothing, and the home .claude.json for the default directory', async () => {
    const dir = await tmp();
    await writeFile(join(dir, '.claude.json'), '');
    await writeFile(join(dir, '.config.json'), JSON.stringify({ oauthAccount: { emailAddress: 'cfg@example.com' } }));
    expect(await readAccountEmail(dir)).toBe('cfg@example.com');
    const home = await tmp();
    await mkdir(join(home, '.claude'));
    await writeFile(join(home, '.claude.json'), JSON.stringify({ oauthAccount: { emailAddress: 'home@example.com' } }));
    expect(await readAccountEmail(join(home, '.claude'))).toBe('home@example.com');
  });
});

describe('accountLabels', () => {
  it('gives one unlabelled directory no account', async () => {
    const dir = await tmp();
    expect(await accountLabels([{ dir, label: null }])).toEqual(new Map([[dir, null]]));
  });

  it('keeps a label given, and tells several directories apart by account, else by name', async () => {
    const a = await tmp();
    const b = await tmp();
    const c = join(await tmp(), '.claude');
    await writeFile(join(b, '.claude.json'), JSON.stringify({ oauthAccount: { emailAddress: 'b@example.com' } }));
    const labels = await accountLabels([{ dir: a, label: 'work' }, { dir: b, label: null }, { dir: c, label: null }]);
    expect(labels.get(a)).toBe('work');
    expect(labels.get(b)).toBe('b@example.com');
    expect(labels.get(c)).toBe('claude');
  });
});
