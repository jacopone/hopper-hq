import { describe, expect, it } from 'vitest';
import { homedir } from 'node:os';
import { delimiter, join } from 'node:path';
import { DEFAULT_PORT, DEFAULT_THRESHOLDS, parseClaudeDir, resolveFloorMode, resolvePaths } from '../src/config.js';

describe('parseClaudeDir', () => {
  it('reads a directory, and a label after the last "="', () => {
    expect(parseClaudeDir('/a')).toEqual({ dir: '/a', label: null });
    expect(parseClaudeDir('/a=work')).toEqual({ dir: '/a', label: 'work' });
    expect(parseClaudeDir('/opt/x=1/claude=me@example.com')).toEqual({ dir: '/opt/x=1/claude', label: 'me@example.com' });
  });

  it('drops an empty label and keeps the directory', () => {
    expect(parseClaudeDir('/a=')).toEqual({ dir: '/a', label: null });
  });

  it('refuses an empty directory', () => {
    expect(() => parseClaudeDir('')).toThrow();
    expect(() => parseClaudeDir('=label')).toThrow();
  });
});

describe('resolvePaths', () => {
  const home = join(homedir(), '.claude');

  it('prefers explicit options, then environment, then home defaults', () => {
    expect(resolvePaths({ claudeDirs: ['/a'], dataDir: '/b' }, { CLAUDE_CONFIG_DIR: '/x', HOPPER_HQ_HOME: '/y' })).toEqual({ claudeDirs: [{ dir: '/a', label: null }], dataDir: '/b' });
    expect(resolvePaths({}, { CLAUDE_CONFIG_DIR: '/x', HOPPER_HQ_HOME: '/y' })).toEqual({ claudeDirs: [{ dir: '/x', label: null }], dataDir: '/y' });
    expect(resolvePaths({}, {})).toEqual({ claudeDirs: [{ dir: home, label: null }], dataDir: join(homedir(), '.hopper-hq') });
  });

  it('takes one directory as a shorthand', () => {
    expect(resolvePaths({ claudeDir: '/a' }, {}).claudeDirs).toEqual([{ dir: '/a', label: null }]);
  });

  it('takes several directories, each with its label, from the options or HOPPER_HQ_CLAUDE_DIRS', () => {
    expect(resolvePaths({ claudeDirs: ['/a=work', '/b'] }, { CLAUDE_CONFIG_DIR: '/x' }).claudeDirs).toEqual([
      { dir: '/a', label: 'work' },
      { dir: '/b', label: null },
    ]);
    expect(resolvePaths({}, { HOPPER_HQ_CLAUDE_DIRS: ['/a=work', '/b=home'].join(delimiter), CLAUDE_CONFIG_DIR: '/x' }).claudeDirs).toEqual([
      { dir: '/a', label: 'work' },
      { dir: '/b', label: 'home' },
    ]);
  });

  it('keeps each directory once, the first spelling of its label winning', () => {
    expect(resolvePaths({ claudeDirs: ['/a=work', '/b', '/a=other', '/b=home'] }, {}).claudeDirs).toEqual([
      { dir: '/a', label: 'work' },
      { dir: '/b', label: 'home' },
    ]);
  });

  it('ignores an empty list and empty entries', () => {
    expect(resolvePaths({ claudeDirs: [] }, {}).claudeDirs).toEqual([{ dir: home, label: null }]);
    expect(resolvePaths({}, { HOPPER_HQ_CLAUDE_DIRS: `${delimiter}/a${delimiter}` }).claudeDirs).toEqual([{ dir: '/a', label: null }]);
  });
});

describe('resolveFloorMode', () => {
  it('takes the option, else HOPPER_HQ_FLOORS, else feature, and refuses other words', () => {
    expect(resolveFloorMode('repo', { HOPPER_HQ_FLOORS: 'feature' })).toBe('repo');
    expect(resolveFloorMode(undefined, { HOPPER_HQ_FLOORS: 'repo' })).toBe('repo');
    expect(resolveFloorMode(undefined, {})).toBe('feature');
    expect(() => resolveFloorMode('branch', {})).toThrow(/Unknown floor mode: branch/);
  });
});

describe('defaults', () => {
  it('uses the thresholds from the design', () => {
    expect(DEFAULT_THRESHOLDS).toEqual({
      doneToIdleMs: 4 * 60 * 60 * 1000,
      idleToDormantMs: 3 * 24 * 60 * 60 * 1000,
      noSignalMs: 10 * 60 * 1000,
      childFreshMs: 90 * 1000,
    });
    expect(DEFAULT_PORT).toBe(7337);
  });
});
