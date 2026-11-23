import { describe, expect, it } from 'vitest';
import { folderFloorOf, OTHER_FOLDER, type FolderRules } from '../../src/core/folder.js';

const RULES: FolderRules = { home: '/home/j', containers: ['/home/j/amatino', '/home/j/experiments', '/home/j/tools'] };
const floor = (cwd: string) => folderFloorOf(cwd, RULES);

describe('folderFloorOf', () => {
  it('gives a session the folder right under the home: a project folder and the repositories in it are one floor', () => {
    expect(floor('/home/j/tenuta')).toEqual({ key: '/home/j/tenuta', name: 'tenuta' });
    expect(floor('/home/j/tenuta/controllo-gestione')).toEqual({ key: '/home/j/tenuta', name: 'tenuta' });
    expect(floor('/home/j/nixos-config/.worktrees/x')).toEqual({ key: '/home/j/nixos-config', name: 'nixos-config' });
    expect(floor('/home/j/obsidian_brain')).toEqual({ key: '/home/j/obsidian_brain', name: 'obsidian_brain' });
  });

  it('gives a session under a container folder the folder one level further down: two repositories there are two floors', () => {
    expect(floor('/home/j/amatino/amatino-app')).toEqual({ key: '/home/j/amatino/amatino-app', name: 'amatino-app' });
    expect(floor('/home/j/amatino/amatino-crm/src')).toEqual({ key: '/home/j/amatino/amatino-crm', name: 'amatino-crm' });
    expect(floor('/home/j/experiments/ai-hedge-fund')).toEqual({ key: '/home/j/experiments/ai-hedge-fund', name: 'ai-hedge-fund' });
  });

  it('puts a worktree under its repository on its repository floor', () => {
    expect(floor('/home/j/amatino/amatino-app/.claude/worktrees/x')).toEqual(floor('/home/j/amatino/amatino-app'));
  });

  it('gives a session in a container folder itself the container floor', () => {
    expect(floor('/home/j/amatino')).toEqual({ key: '/home/j/amatino', name: 'amatino' });
  });

  it('matches whole path segments only: a folder beside a container is not in it', () => {
    expect(floor('/home/j/amatino-old/x')).toEqual({ key: '/home/j/amatino-old', name: 'amatino-old' });
  });

  it('gives the home its own floor, and puts every session outside the home on one floor, other', () => {
    expect(floor('/home/j')).toEqual({ key: '/home/j', name: '~' });
    expect(floor('/tmp')).toEqual({ key: OTHER_FOLDER, name: 'other' });
    expect(floor('/tmp/scratch/x')).toEqual({ key: OTHER_FOLDER, name: 'other' });
    expect(floor('/home/jo/x')).toEqual({ key: OTHER_FOLDER, name: 'other' });
  });

  it('reads a trailing slash as no slash, and takes the deepest container that holds the folder', () => {
    expect(floor('/home/j/tenuta/')).toEqual({ key: '/home/j/tenuta', name: 'tenuta' });
    const nested: FolderRules = { home: '/home/j/', containers: ['/home/j/amatino/', '/home/j/amatino/labs'] };
    expect(folderFloorOf('/home/j/amatino/labs/a/b', nested)).toEqual({ key: '/home/j/amatino/labs/a', name: 'a' });
    expect(folderFloorOf('/home/j/amatino/c/d', nested)).toEqual({ key: '/home/j/amatino/c', name: 'c' });
  });
});
