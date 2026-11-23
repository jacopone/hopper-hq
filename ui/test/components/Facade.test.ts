import { afterEach, describe, expect, it, vi } from 'vitest';
import { flushSync } from 'svelte';
import Facade from '../../components/Facade.svelte';
import source from '../../components/Facade.svelte?raw';
import { FEATURE_SLOTS, slotOf } from '../../../src/scene/palette';
import type { FloorSummary, LobbySummary } from '../../../src/scene/types';
import { CHECKOUT, DOCS, NOW, ORDERS, makeScene } from '../helpers/fixtures';
import { cleanup, render, text } from '../helpers/render';

afterEach(cleanup);

function facade(floors = makeScene().floors, selected: string | null = null) {
  const onFloor = vi.fn();
  const onDesk = vi.fn();
  const target = render(Facade, { floors, selected, lobby: null, onFloor, onDesk, onLobby: vi.fn() });
  const floor = (n: number) => target.querySelectorAll('g.floor')[n]!;
  return { target, onFloor, onDesk, floor };
}

/** The Lobby's summary with a queue of eight and three more: one refused, the rest ready, the first ready one in a repository's colour. */
const QUEUE: LobbySummary = {
  doorman: 'Gordon',
  refused: 1,
  ready: 10,
  seatsFull: 1,
  memory: { pct: 30, gatePct: 75, warnPct: 85 },
  held: false,
  paused: 0,
  queue: [
    { id: 'G-1', name: 'G-1 turned away', kind: 'refused', slot: null, tie: 4, org: 'tenuta' },
    ...Array.from({ length: 7 }, (_, i) => ({ id: `G-${10 + i}`, name: `G-${10 + i} ready`, kind: 'ready' as const, slot: i === 0 ? 3 : null, tie: i, org: i === 0 ? ('amatino' as const) : null })),
  ],
  queueMore: 3,
  updatedAt: NOW,
};

describe('Facade', () => {
  it('makes the Lobby a button with its counts when a gatekeeper is configured, and leaves it as decor without', () => {
    const onLobby = vi.fn();
    const target = render(Facade, { floors: makeScene().floors, selected: null, lobby: { doorman: 'Gordon', refused: 3, ready: 2, seatsFull: 1, memory: { pct: 75, gatePct: 75, warnPct: 85 }, held: true, paused: 2, queue: [], queueMore: 0, updatedAt: NOW }, onFloor: vi.fn(), onDesk: vi.fn(), onLobby });
    const lobby = target.querySelector('g.lobby')!;
    expect(lobby.getAttribute('role')).toBe('button');
    expect(lobby.getAttribute('aria-label')).toBe('Lobby: 3 refused, 2 ready, 1 seat full, session memory 75%, launches held');
    expect([...lobby.querySelectorAll('.t-meta tspan')].map(text)).toEqual(['3 refused', '2 ready', '1 seat full', 'session memory 75%', 'launches held']);
    // Only the refusals are red: tasks that are ready and wait for a go are not an alarm.
    const [refused, ready] = [...lobby.querySelectorAll('.t-meta tspan')].map((t) => t.getAttribute('class') ?? '');
    expect(refused).not.toBe(ready);
    lobby.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    expect(onLobby).toHaveBeenCalled();
    // A button that takes focus shows it: the Lobby has the outline a floor has, lit on hover and focus.
    expect(lobby.querySelector('polygon.outline')!.getAttribute('points')).toMatch(/\d/);
    cleanup();
    const plain = render(Facade, { floors: makeScene().floors, selected: null, lobby: null, onFloor: vi.fn(), onDesk: vi.fn(), onLobby });
    expect(plain.querySelector('g.lobby')!.getAttribute('role')).toBeNull();
    expect(plain.querySelector('g.lobby polygon.outline')).toBeNull();
  });

  it('draws the queue as micro-robots outside the doors: the refused with the needs badge, the ready with the clock, a group with its count beyond, the doorman at the door', () => {
    const target = render(Facade, { floors: makeScene().floors, selected: null, lobby: QUEUE, onFloor: vi.fn(), onDesk: vi.fn(), onLobby: vi.fn() });
    const bots = [...target.querySelectorAll('g.lobby .queue .bot:not(.group):not(.doorman)')];
    expect(bots).toHaveLength(8);
    expect(bots.filter((b) => b.classList.contains('badge-needs'))).toHaveLength(1);
    expect(bots.filter((b) => b.classList.contains('badge-clock'))).toHaveLength(7);
    expect(bots[0]!.classList.contains('badge-needs')).toBe(true);
    // The body is the repository's slot when the queue names one, grey when not.
    expect(bots[1]!.classList.contains('repo-3')).toBe(true);
    expect([...bots[2]!.classList].some((c) => c.startsWith('repo-'))).toBe(false);
    expect(bots.map((b) => text(b.querySelector('title')))).toEqual(['G-1 turned away', 'G-10 ready', 'G-11 ready', 'G-12 ready', 'G-13 ready', 'G-14 ready', 'G-15 ready', 'G-16 ready']);
    expect(target.querySelectorAll('g.lobby .queue .bot.group')).toHaveLength(3);
    expect(text(target.querySelector('g.lobby .queue .more-chip text'))).toBe('+3');
    expect(text(target.querySelector('g.lobby .queue .more-chip title'))).toBe('3 more waiting');
    const doorman = target.querySelector('g.lobby .queue .bot.doorman')!;
    expect(text(doorman.querySelector('title'))).toBe('Gordon, at the door');
    // Gordon wears a cap and carries a clipboard; the hard hat is the workflow agent's.
    expect(doorman.querySelector('.cap')).not.toBeNull();
    expect(doorman.querySelector('.clipboard')).not.toBeNull();
    expect(doorman.querySelector('.hat')).toBeNull();
  });

  it("dresses each robot of the line in its task's tie, its organisation's lanyard and the brief in its hand", () => {
    const target = render(Facade, { floors: makeScene().floors, selected: null, lobby: QUEUE, onFloor: vi.fn(), onDesk: vi.fn(), onLobby: vi.fn() });
    const bots = [...target.querySelectorAll('g.lobby .queue .bot:not(.group):not(.doorman)')];
    expect(bots[0]!.classList.contains('tie-4')).toBe(true);
    expect(bots[3]!.classList.contains('tie-2')).toBe(true);
    // The lanyard: a strap and a card, in the organisation's colour; none without an organisation.
    expect(bots[0]!.classList.contains('org-tenuta')).toBe(true);
    expect(bots[0]!.querySelectorAll('.lanyard')).toHaveLength(2);
    expect(bots[1]!.classList.contains('org-amatino')).toBe(true);
    expect(bots[2]!.querySelectorAll('.lanyard')).toHaveLength(0);
    expect([...bots[2]!.classList].some((c) => c.startsWith('org-'))).toBe(false);
    // Every launch in the line holds its brief; the group beyond and the doorman do not.
    expect(bots.every((b) => b.querySelector('.folder') !== null)).toBe(true);
    expect(target.querySelector('g.lobby .queue .bot.group .folder')).toBeNull();
  });

  it("rings the desks of a task across the floors, and joins them with a thread, while one of them is hovered", () => {
    const floors: FloorSummary[] = makeScene().floors.map((f) => ({ ...f, windows: f.windows.map((w) => ({ ...w })) }));
    const withSession = floors.flatMap((f, fi) => f.windows.map((w, wi) => ({ w, fi, wi }))).filter(({ w }) => w.sessionId !== null);
    const [a, b, c] = withSession;
    a!.w.task = 'G-7';
    b!.w.task = 'G-7';
    c!.w.task = 'G-8';
    const target = render(Facade, { floors, selected: null, lobby: null, onFloor: vi.fn(), onDesk: vi.fn(), onLobby: vi.fn() });
    const window = (x: { w: { sessionId: string | null } }) => target.querySelector(`[data-desk="${x.w.sessionId}"]`)!;
    expect(target.querySelectorAll('.task-ring')).toHaveLength(0);
    window(a!).dispatchEvent(new MouseEvent('mouseenter'));
    flushSync();
    expect(target.querySelectorAll('.task-ring')).toHaveLength(2);
    expect(target.querySelectorAll('.task-thread')).toHaveLength(1);
    expect(target.querySelector('.task-ring')!.classList.contains(`tie-${slotOf('G-7', FEATURE_SLOTS)}`)).toBe(true);
    // A task with one desk gets a ring and no thread.
    window(c!).dispatchEvent(new MouseEvent('mouseenter'));
    flushSync();
    expect([target.querySelectorAll('.task-ring').length, target.querySelectorAll('.task-thread').length]).toEqual([1, 0]);
    // Leaving a desk takes the rings away; a desk with no task rings nothing.
    window(c!).dispatchEvent(new MouseEvent('mouseleave'));
    flushSync();
    expect(target.querySelectorAll('.task-ring')).toHaveLength(0);
    const plain = withSession.find(({ w }) => w.task === null || w.task === undefined)!;
    window(plain).dispatchEvent(new MouseEvent('mouseenter'));
    flushSync();
    expect(target.querySelectorAll('.task-ring')).toHaveLength(0);
  });

  it('draws no group when everything fits in the line, and the doorman still stands at the door with nobody waiting', () => {
    const target = render(Facade, { floors: makeScene().floors, selected: null, lobby: { ...QUEUE, queue: QUEUE.queue.slice(0, 2), queueMore: 0, refused: 1, ready: 1 }, onFloor: vi.fn(), onDesk: vi.fn(), onLobby: vi.fn() });
    expect(target.querySelectorAll('g.lobby .queue .bot:not(.group):not(.doorman)')).toHaveLength(2);
    expect(target.querySelector('.more-chip')).toBeNull();
    cleanup();
    const empty = render(Facade, { floors: makeScene().floors, selected: null, lobby: { ...QUEUE, queue: [], queueMore: 0, refused: 0, ready: 0 }, onFloor: vi.fn(), onDesk: vi.fn(), onLobby: vi.fn() });
    expect(empty.querySelectorAll('g.lobby .queue .bot:not(.doorman)')).toHaveLength(0);
    expect(empty.querySelector('g.lobby .queue .bot.doorman')).not.toBeNull();
  });

  it('draws the sessions\' memory as a tank on the roof: its level, the gate\'s line and the watchdog\'s, turning amber and red past them', () => {
    const tank = (memory: LobbySummary['memory']) => {
      const target = render(Facade, { floors: makeScene().floors, selected: null, lobby: { ...QUEUE, memory }, onFloor: vi.fn(), onDesk: vi.fn(), onLobby: vi.fn() });
      const t = target.querySelector('g.roof .tank');
      return { target, t };
    };
    const quiet = tank({ pct: 30, gatePct: 75, warnPct: 85 });
    expect(quiet.t!.getAttribute('data-level')).toBe('30');
    expect(text(quiet.t!.querySelector('title'))).toBe('Session memory 30%');
    const tone = (el: Element | null | undefined) => ['warn', 'gate'].find((c) => el?.classList.contains(c)) ?? '';
    expect([...quiet.t!.querySelectorAll('.mark')].map(tone)).toEqual(['gate', 'warn']);
    expect(tone(quiet.t!.querySelector('.water'))).toBe('');
    cleanup();
    expect(tone(tank({ pct: 80, gatePct: 75, warnPct: 85 }).t!.querySelector('.water'))).toBe('gate');
    cleanup();
    expect(tone(tank({ pct: 90, gatePct: 75, warnPct: 85 }).t!.querySelector('.water'))).toBe('warn');
    cleanup();
    // No gate mark when the gatekeeper names none; no tank without a cap.
    expect([...tank({ pct: 30, gatePct: null, warnPct: 85 }).t!.querySelectorAll('.mark')].map(tone)).toEqual(['warn']);
    cleanup();
    expect(tank(null).t).toBeNull();
  });

  it('draws every place of the line even when two launches carry the same id once cleaned', () => {
    const twin = (name: string) => ({ id: 'G-7', name, kind: 'ready' as const, slot: null, tie: 0, org: null });
    const target = render(Facade, { floors: makeScene().floors, selected: null, lobby: { ...QUEUE, queue: [twin('first'), twin('second')], queueMore: 0 }, onFloor: vi.fn(), onDesk: vi.fn(), onLobby: vi.fn() });
    expect([...target.querySelectorAll('g.lobby .queue .bot:not(.group):not(.doorman) title')].map(text)).toEqual(['first', 'second']);
  });

  it('draws nothing of the queue or the tank without a gatekeeper, and a click on a robot opens the Lobby', () => {
    const plain = render(Facade, { floors: makeScene().floors, selected: null, lobby: null, onFloor: vi.fn(), onDesk: vi.fn(), onLobby: vi.fn() });
    expect(plain.querySelector('.queue')).toBeNull();
    expect(plain.querySelector('.tank')).toBeNull();
    cleanup();
    const onLobby = vi.fn();
    const target = render(Facade, { floors: makeScene().floors, selected: null, lobby: QUEUE, onFloor: vi.fn(), onDesk: vi.fn(), onLobby });
    target.querySelector('g.lobby .queue .bot')!.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    expect(onLobby).toHaveBeenCalledTimes(1);
  });

  it('draws one floor button per floor, bottom-up, each named for a screen reader', () => {
    const { target } = facade();
    expect([...target.querySelectorAll('g.floor')].map((g) => g.getAttribute('aria-label'))).toEqual([
      'Floor 1, docs-refresh (docs-site, storefront-web): 2 sessions, shutters down',
      'Floor 2, orders-api: 5 sessions, 1 agent, 1 needs you, 1 done',
      'Floor 3, search-ranking (search-svc, storefront-web): 2 sessions, 1 no signal',
      'Floor 4, checkout-v2 (orders-api, payments-svc, storefront-web): 4 sessions, 5 agents, 1 needs you, 1 done, 1 in a meeting',
    ]);
    for (const g of target.querySelectorAll('g.floor')) {
      expect(g.getAttribute('role')).toBe('button');
      expect(g.getAttribute('tabindex')).toBe('0');
    }
  });

  it('colours each window by the state at its desk, leaves a free desk\'s window dark, and lowers the shutters on a dormant floor', () => {
    const { target, floor } = facade();
    const win = (id: string) => target.querySelector(`polygon[data-desk="${id}"]:not(.st-agent)`)!;
    expect(target.querySelectorAll('polygon[data-desk]:not(.st-agent)')).toHaveLength(13);
    // 16 desks on the checkout floor, 8 on each other floor; 13 sessions sit at them.
    const free = [...target.querySelectorAll('polygon.st-free')];
    expect(free).toHaveLength(16 + 3 * 8 - 13);
    expect(free.every((w) => !w.hasAttribute('data-desk') && !w.classList.contains('lit') && w.querySelector('title') === null)).toBe(true);
    expect(win('oa-c3').getAttribute('class')).toMatch(/\bst-needs_you\b/);
    expect(win('oa-c3').classList.contains('lit')).toBe(true);
    expect(win('ss-e5').classList.contains('st-no_signal')).toBe(true);
    expect(win('oa-j0').classList.contains('st-idle')).toBe(true);
    expect(win('oa-j0').classList.contains('lit')).toBe(false);
    expect(text(win('oa-c3').querySelector('title'))).toBe('Needs you');
    expect(floor(0).classList.contains('shut')).toBe(true);
    expect(floor(0).querySelectorAll('line.slat')).toHaveLength(24);
    expect(floor(1).classList.contains('shut')).toBe(false);
  });

  it("frames a free desk's window, and draws nothing past a floor's plan and its agents but its wall", () => {
    const { floor } = facade();
    // The orders floor has 8 desks and 1 running agent on a building 21 windows wide: 9 windows and its side strip, no more.
    expect(floor(1).querySelectorAll('polygon.sfill')).toHaveLength(8 + 1 + 1);
    expect(floor(1).querySelectorAll('polygon.st-empty')).toHaveLength(1);
    expect(floor(1).querySelectorAll('polygon.st-free')).toHaveLength(3);
    const free = source.slice(source.indexOf('\n  .sfill.st-free {'), source.indexOf('}', source.indexOf('\n  .sfill.st-free {')));
    expect(free).toMatch(/stroke: var\(--win-frame\);/);
  });

  it("lights a window past the desks for each running agent, in the meeting rooms' colour, that leads to its session's desk", () => {
    const { target, floor, onDesk } = facade();
    const agents = [...floor(3).querySelectorAll('polygon.st-agent')];
    expect(agents).toHaveLength(5);
    expect(agents.every((a) => a.classList.contains('lit') && text(a.querySelector('title')) === 'Agent at work')).toBe(true);
    // The checkout floor's agents run under ps-d4 (3) and sw-a1 (2); the orders floor's one under its session.
    expect(agents.map((a) => a.getAttribute('data-desk'))).toEqual(['ps-d4', 'ps-d4', 'ps-d4', 'sw-a1', 'sw-a1']);
    expect(floor(1).querySelectorAll('polygon.st-agent')).toHaveLength(1);
    expect(floor(0).querySelectorAll('polygon.st-agent')).toHaveLength(0);
    expect(target.querySelector('.agents-more')).toBeNull();
    agents[0]!.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    expect(onDesk).toHaveBeenCalledWith(CHECKOUT, 'ps-d4');
    // The same colour as a meeting: an agent at work is in a meeting room inside.
    expect(source).toMatch(/\.sfill\.st-in_meeting, \.sfill\.st-agent \{ fill: var\(--s-meeting\)/);
  });

  it('lights at most six agent windows a floor and writes the rest after them', () => {
    const floors = makeScene().floors;
    floors[0] = { ...floors[0]!, agents: 9, agentWindows: Array.from({ length: 6 }, () => ({ sessionId: 'ps-d4' })) };
    const { floor } = facade(floors);
    expect(floor(3).querySelectorAll('polygon.st-agent')).toHaveLength(6);
    const more = floor(3).querySelector('.agents-more')!;
    expect(text(more).replace(text(more.querySelector('title')), '')).toBe('+3');
    expect(text(more.querySelector('title'))).toBe('3 more agents at work');
    expect(floor(3).getAttribute('aria-label')).toContain('4 sessions, 9 agents');
  });

  it('labels each floor with its number, name and counts', () => {
    const { floor } = facade();
    const top = floor(3);
    expect(text(top.querySelector('.t-num'))).toBe('4');
    expect(text(top.querySelector('.t-name'))).toBe('checkout-v2');
    const tone = (t: Element) => [...t.classList].find((c) => c.startsWith('c-')) ?? '';
    expect([...top.querySelectorAll('.t-meta tspan')].map((t) => `${tone(t)}|${t.textContent}`)).toEqual([
      '|orders-api, payments-svc +1 · 4 sessions · 5 agents',
      'c-needs|● 1 needs you',
      'c-done|● 1 done',
      'c-meeting|● 1 in a meeting',
    ]);
  });

  it('never draws the building below 80% of its size, where its text gets too small to read: the stage scrolls instead', () => {
    const many = makeScene().floors.map((f) => ({ ...f, windows: Array.from({ length: 40 }, (_, i) => ({ sessionId: `${f.key}-${i}`, state: 'working' as const, task: null })) }));
    for (const floors of [makeScene().floors, many]) {
      const { target } = facade(floors);
      const svg = target.querySelector<SVGSVGElement>('svg.facade')!;
      const [, , width, height] = svg.getAttribute('viewBox')!.split(' ').map(Number);
      expect(svg.style.minWidth).toBe(`${Math.round(width! * 0.8)}px`);
      expect(svg.style.minHeight).toBe(`${Math.round(height! * 0.8)}px`);
      cleanup();
    }
  });

  it('ends a long floor name with an ellipsis, and shows it whole on hover', () => {
    const floors = makeScene().floors;
    floors[0]!.name = 'jira-1234-add-idempotency-keys-to-orders';
    const { floor } = facade(floors);
    expect(text(floor(3).querySelector('.t-name'))).toBe('jira-1234-add-idempotency-k…');
    expect(floor(3).querySelector(':scope > title')?.textContent).toBe('jira-1234-add-idempotency-keys-to-orders');
    expect(floor(3).getAttribute('aria-label')).toMatch(/^Floor 4, jira-1234-add-idempotency-keys-to-orders \(.*\): /);
    expect(text(floor(2).querySelector('.t-name'))).toBe('search-ranking');
    expect(floor(2).querySelector(':scope > title')?.textContent).toBe('search-ranking');
  });

  it('goes inside a floor on click, Enter or Space, and to a desk from its window', () => {
    const { target, floor, onFloor, onDesk } = facade();
    floor(1).dispatchEvent(new MouseEvent('click', { bubbles: true }));
    flushSync();
    expect(onFloor).toHaveBeenLastCalledWith(ORDERS);
    floor(3).dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    expect(onFloor).toHaveBeenLastCalledWith(CHECKOUT);
    floor(0).dispatchEvent(new KeyboardEvent('keydown', { key: ' ', bubbles: true }));
    expect(onFloor).toHaveBeenLastCalledWith(DOCS);
    floor(0).dispatchEvent(new KeyboardEvent('keydown', { key: 'a', bubbles: true }));
    expect(onFloor).toHaveBeenCalledTimes(3);
    target.querySelector('polygon[data-desk="sw-b2"]')!.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    expect(onDesk).toHaveBeenCalledWith(CHECKOUT, 'sw-b2');
    expect(onFloor).toHaveBeenCalledTimes(3);
  });

  it('outlines the open floor', () => {
    const { floor } = facade(undefined, CHECKOUT);
    expect(floor(3).classList.contains('selected')).toBe(true);
    expect(floor(1).classList.contains('selected')).toBe(false);
  });

  it('shows a hostile floor name as text', () => {
    const floors = makeScene().floors;
    floors[0]!.name = '<img src=x onerror=alert(1)>';
    const { target, floor } = facade(floors);
    expect(text(floor(3).querySelector('.t-name'))).toBe('<img src=x onerror=alert(1)>');
    expect(target.querySelector('img')).toBeNull();
  });
});
