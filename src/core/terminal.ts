import type { TerminalKind } from './types.js';

/** The terminal multiplexer the sessions run in: tmux switches with `switch-client`, herdr with `tab focus`. */
export type { TerminalKind };

export const TERMINAL_KINDS: readonly TerminalKind[] = ['tmux', 'herdr'];

/** What the user asks for: a terminal, or 'auto', which takes herdr when it answers and tmux otherwise. */
export type TerminalChoice = TerminalKind | 'auto';

/** A pane id as each terminal writes it: tmux '%N'; herdr 'w<workspace>:p<pane>' (its tab is 'w<workspace>:t<pane>'). */
export const PANE_PATTERN: Record<TerminalKind, RegExp> = {
  tmux: /^%\d+$/,
  herdr: /^w[0-9A-Za-z]+:p[0-9A-Za-z]+$/,
};

export function isPaneOf(kind: TerminalKind, pane: string | null | undefined): pane is string {
  return typeof pane === 'string' && PANE_PATTERN[kind].test(pane);
}

/** The herdr tab a pane is in: 'wK:p2' sits in tab 'wK:t2'. Null for anything that is not a herdr pane id. */
export function herdrTabOf(pane: string): string | null {
  return isPaneOf('herdr', pane) ? pane.replace(':p', ':t') : null;
}
