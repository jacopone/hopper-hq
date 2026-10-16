import { afterEach, describe, expect, it, vi } from 'vitest';
import { flushSync } from 'svelte';
import StatePill from '../../components/StatePill.svelte';
import Toast from '../../components/Toast.svelte';
import TopBar from '../../components/TopBar.svelte';
import { createToasts } from '../../lib/toast';
import { cleanup, click, render, text } from '../helpers/render';

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe('StatePill', () => {
  it('names the state and carries its colour class', () => {
    const target = render(StatePill, { state: 'needs_you' });
    const pill = target.querySelector('.pill')!;
    expect(text(pill)).toBe('Needs you');
    expect(pill.classList.contains('sw-needs_you')).toBe(true);
  });
});

describe('TopBar', () => {
  it('says the building is provided by FairMind, with a link that opens apart from the page', () => {
    const target = render(TopBar, { crumbs: [{ label: 'Building', route: { floor: null, desk: null, run: null, lobby: false } }], needsYou: 0, done: 0, theme: 'system', resolved: 'day', onNavigate: () => {}, onTheme: () => {} });
    const credit = target.querySelector('a.credit')!;
    expect([text(credit), credit.getAttribute('href'), credit.getAttribute('target'), credit.getAttribute('rel')]).toEqual(['by FairMind', 'https://fairmind.ai', '_blank', 'noopener noreferrer']);
  });
});

describe('TopBar terminal badge', () => {
  const base = () => ({ crumbs: [{ label: 'Building', route: { floor: null, desk: null, run: null, lobby: false } }], needsYou: 1, done: 2, theme: 'system' as const, resolved: 'day' as const, onNavigate: () => {}, onTheme: () => {} });

  it('names tmux and its status line counts by default', () => {
    const target = render(TopBar, { ...base() });
    expect(text(target.querySelector('.tmux .k'))).toBe('tmux');
    expect(target.querySelector('.tmux .r')).toBeNull();
    expect(target.querySelector('.tmux')!.getAttribute('title')).toBe('What the tmux status line shows');
  });

  it('names herdr with how many local sessions Go reaches, or that it does not answer', () => {
    const target = render(TopBar, { ...base(), terminal: { kind: 'herdr', reachable: true, mapped: 21, local: 24 } });
    expect([text(target.querySelector('.tmux .k')), text(target.querySelector('.tmux .r'))]).toEqual(['herdr', '21/24 panes']);
    expect(text(target.querySelector('.tmux .visually-hidden'))).toBe('1 needs you, 2 done, herdr 21/24 panes');
    cleanup();
    const down = render(TopBar, { ...base(), terminal: { kind: 'herdr', reachable: false, mapped: 0, local: 24 } });
    expect(text(down.querySelector('.tmux .r'))).toBe('not answering');
  });
});

describe('Toast', () => {
  it('shows each toast as text, marks errors, and dismisses on click', () => {
    vi.useFakeTimers();
    const toasts = createToasts();
    const target = render(Toast, { toasts });
    toasts.show('Demo: would switch tmux to %7');
    toasts.show('<b>tmux</b> could not switch', 'error');
    flushSync();
    const shown = [...target.querySelectorAll('.toast')];
    expect(shown.map((t) => text(t.querySelector('span')))).toEqual(['Demo: would switch tmux to %7', '<b>tmux</b> could not switch']);
    expect(shown.map((t) => t.classList.contains('error'))).toEqual([false, true]);
    expect(target.querySelector('b')).toBeNull();
    click(shown[0]!.querySelector('button'));
    expect(target.querySelectorAll('.toast')).toHaveLength(1);
    vi.advanceTimersByTime(6000);
    flushSync();
    expect(target.querySelectorAll('.toast')).toHaveLength(0);
  });
});
