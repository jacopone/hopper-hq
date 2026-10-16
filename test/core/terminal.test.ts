import { describe, expect, it } from 'vitest';
import { resolveTerminal } from '../../src/config.js';
import { herdrTabOf, isPaneOf } from '../../src/core/terminal.js';

describe('panes', () => {
  it('knows each terminal\'s pane ids, and nothing else', () => {
    expect(isPaneOf('tmux', '%7')).toBe(true);
    expect(isPaneOf('tmux', 'wK:p2')).toBe(false);
    expect(isPaneOf('herdr', 'wK:p2')).toBe(true);
    expect(isPaneOf('herdr', 'w2:p1A')).toBe(true);
    for (const bad of ['%7', 'wK:t2', 'wK:p2;rm', 'K:p2', '', null, undefined]) expect(isPaneOf('herdr', bad)).toBe(false);
  });

  it('names the herdr tab of a pane', () => {
    expect(herdrTabOf('wK:p2')).toBe('wK:t2');
    expect(herdrTabOf('%7')).toBeNull();
  });
});

describe('resolveTerminal', () => {
  it('takes the option, else HOPPER_HQ_TERMINAL, else auto, and refuses other words', () => {
    expect(resolveTerminal('herdr', { HOPPER_HQ_TERMINAL: 'tmux' })).toBe('herdr');
    expect(resolveTerminal(undefined, { HOPPER_HQ_TERMINAL: 'tmux' })).toBe('tmux');
    expect(resolveTerminal(undefined, {})).toBe('auto');
    expect(() => resolveTerminal('screen', {})).toThrow(/Unknown terminal: screen/);
  });
});
