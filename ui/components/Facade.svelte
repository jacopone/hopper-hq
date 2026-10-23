<script lang="ts">
  import { cleanText } from '../../src/scene/text';
  import { FEATURE_SLOTS, slotOf } from '../../src/scene/palette';
  import type { FloorSummary, LobbySummary } from '../../src/scene/types';
  import { MIN_SCALE, NAME_MAX, facadeOf, type Box, type GateModel, type Label } from '../facade/geometry';
  import { STATES, floorLabel, floorMeta, lobbyLabel, lobbyMeta, plural, type Meta } from '../lib/words';
  import Bot from './Bot.svelte';
  import Tank from './Tank.svelte';

  /**
   * The building from outside: one window per desk of each floor's plan, coloured by the state of whoever sits there and
   * dark in its frame where the desk is free; past the plan, a window lit in the meeting rooms' colour for each running
   * subagent or workflow agent, at most AGENT_WINDOWS_MAX and a '+N' for the rest; then plain wall, so that a floor shows
   * its size and how full it is; floors stacked on a lobby, newest on top. A floor is a button that goes inside; a window
   * with somebody at its desk, or an agent's, goes straight to that desk. A building too big for the stage at MIN_SCALE is drawn at that scale, and the stage
   * scrolls.
   */
  interface Props {
    /** Top to bottom, as the scene lists them. */
    floors: FloorSummary[];
    /** The floor that is open, outlined. */
    selected: string | null;
    onFloor: (key: string) => void;
    onDesk: (floorKey: string, sessionId: string) => void;
    /** The gatekeeper's Lobby; null when none is configured, and the ground floor is decor. */
    lobby?: LobbySummary | null;
    onLobby?: () => void;
  }
  let { floors, selected, onFloor, onDesk, lobby = null, onLobby = () => {} }: Props = $props();

  function pressLobby(e: KeyboardEvent): void {
    if (e.key !== 'Enter' && e.key !== ' ') return;
    e.preventDefault();
    onLobby();
  }

  const model = $derived(facadeOf(floors, lobby !== null && lobbyMeta(lobby).length > 0, lobby !== null));
  /** The group beyond the line: three robots close together, a little smaller. */
  const GROUP: [number, number][] = [[-7, -3], [7, -3], [0, 2.5]];
  const chipWidth = (n: number) => 10 + 6.5 * `+${n}`.length;
  const byKey = $derived(new Map(floors.map((f) => [f.key, f])));

  /** The task whose desk the pointer is over: its desks are ringed on every floor and joined by a thread. */
  let hoverTask: string | null = $state(null);
  const ringed = $derived(hoverTask === null ? [] : model.floors.flatMap((f) => f.windows.filter((w) => w.sessionId !== null && w.task === hoverTask)));
  const hoverTie = $derived(hoverTask === null ? 0 : slotOf(hoverTask, FEATURE_SLOTS));
  const centre = (points: string): [number, number] => {
    const ps = points.split(' ').map((p) => p.split(',').map(Number) as [number, number]);
    return [ps.reduce((a, p) => a + p[0], 0) / ps.length, ps.reduce((a, p) => a + p[1], 0) / ps.length];
  };
  const thread = $derived(ringed.length < 2 ? null : ringed.map((w) => centre(w.points).map((n) => Math.round(n * 10) / 10).join(',')).join(' '));

  function pick(e: MouseEvent, key: string): void {
    const id = (e.target as Element | null)?.closest('[data-desk]')?.getAttribute('data-desk');
    if (id) onDesk(key, id);
    else onFloor(key);
  }

  function press(e: KeyboardEvent, key: string): void {
    if (e.key !== 'Enter' && e.key !== ' ') return;
    e.preventDefault();
    onFloor(key);
  }
</script>

{#snippet solid(b: Box, material: string)}
  <g class="box m-{material}">
    <polygon class="l" points={b.left} />
    <polygon class="r" points={b.right} />
    <polygon class="t" points={b.top} />
  </g>
{/snippet}

{#snippet queue(gate: GateModel, l: LobbySummary)}
  <g class="queue">
    {@render solid(gate.apron, 'plinth')}
    <line class="queue-line" x1={gate.line[0]} y1={gate.line[1]} x2={gate.line[2]} y2={gate.line[3]} />
    {#each l.queue as w, i (i)}
      {#if gate.slots[i]}
        <Bot x={gate.slots[i]![0]} y={gate.slots[i]![1]} slot={w.slot} tie={w.tie} org={w.org} folder badge={w.kind === 'refused' ? 'needs' : 'clock'} title={w.name} />
      {/if}
    {/each}
    {#if l.queueMore > 0}
      {#each GROUP as [dx, dy], i (i)}
        <Bot x={gate.more[0] + dx!} y={gate.more[1] + dy!} u={19} kind="group" />
      {/each}
      <g class="more-chip" transform="translate({gate.more[0]} {gate.more[1] + 13})">
        <title>{l.queueMore} more waiting</title>
        <rect x={-chipWidth(l.queueMore) / 2} y="-7" width={chipWidth(l.queueMore)} height="14" rx="7" />
        <text x="0" y="3.6">+{l.queueMore}</text>
      </g>
    {/if}
    <Bot x={gate.doorman[0]} y={gate.doorman[1]} kind="doorman" title="{l.doorman}, at the door" />
  </g>
{/snippet}

{#snippet label(l: Label, num: string, name: string, metas: Meta[])}
  <line class="leader" x1={l.leader[0]} y1={l.leader[1]} x2={l.leader[2]} y2={l.leader[3]} />
  <circle class="t-btn" cx={l.circle[0]} cy={l.circle[1]} r="11" />
  <text class="t-num" x={l.circle[0]} y={l.circle[1] + 0.5}>{num}</text>
  <text class="t-name halo" x={l.nameAt[0]} y={l.nameAt[1]}>{name}</text>
  {#if metas.length > 0}
    <text class="t-meta halo" x={l.metaAt[0]} y={l.metaAt[1]}>{#each metas as meta, k (k)}<tspan class={meta.tone ? `c-${meta.tone}` : undefined} dx={k > 0 ? 10 : undefined}>{meta.text}</tspan>{/each}</text>
  {/if}
{/snippet}

<svg
  class="facade"
  viewBox={model.viewBox}
  preserveAspectRatio="xMidYMid meet"
  style:min-width="{Math.round(model.size.width * MIN_SCALE)}px"
  style:min-height="{Math.round(model.size.height * MIN_SCALE)}px"
  role="group"
  aria-label="Office building"
>
  <ellipse class="ground-shadow" cx={model.shadow.cx} cy={model.shadow.cy} rx={model.shadow.rx} ry={model.shadow.ry} />
  {@render solid(model.plinth, 'plinth')}
  {#if lobby}
    <g class="lobby floor" role="button" tabindex="0" aria-label={lobbyLabel(lobby)} onclick={() => onLobby()} onkeydown={pressLobby}>
      <title>Lobby</title>
      {@render solid(model.lobby.wall, 'wall')}
      {#each model.lobby.windows as quad, i (i)}<polygon class="sfill st-empty" points={quad} />{/each}
      {#each model.lobby.doors as quad, i (i)}<polygon class="door" points={quad} />{/each}
      <polygon class="sfill st-empty" points={model.lobby.side} />
      {#if model.gate}{@render queue(model.gate, lobby)}{/if}
      {@render label(model.lobby.label, 'L', 'Lobby', lobbyMeta(lobby))}
      <polygon class="outline" points={model.lobby.outline} />
    </g>
  {:else}
    <g class="lobby">
      {@render solid(model.lobby.wall, 'wall')}
      {#each model.lobby.windows as quad, i (i)}<polygon class="sfill st-empty" points={quad} />{/each}
      {#each model.lobby.doors as quad, i (i)}<polygon class="door" points={quad} />{/each}
      <polygon class="sfill st-empty" points={model.lobby.side} />
      {@render label(model.lobby.label, 'L', 'Lobby', [])}
    </g>
  {/if}
  {#each model.floors as floor (floor.key)}
    {@const summary = byKey.get(floor.key)!}
    <g
      class="floor"
      class:selected={floor.key === selected}
      class:shut={floor.shutters}
      role="button"
      tabindex="0"
      aria-label={floorLabel(summary)}
      onclick={(e) => pick(e, floor.key)}
      onkeydown={(e) => press(e, floor.key)}
    >
      <title>{summary.name}</title>
      {@render solid(floor.plate, 'plate')}
      {@render solid(floor.wall, 'wall')}
      {#each floor.windows as w, i (i)}
        {#if w.sessionId !== null && w.state !== null}
          <!-- The ring of a task is a pointer's extra: the floor around the window is the button, and what a task holds is on the Lobby's board. -->
          <!-- svelte-ignore a11y_no_static_element_interactions -->
          <polygon class="sfill st-{w.state}" class:lit={w.lit} points={w.points} data-desk={w.sessionId} onmouseenter={() => (hoverTask = w.task)} onmouseleave={() => (hoverTask = null)}><title>{STATES[w.state].label}</title></polygon>
        {:else}
          <polygon class="sfill st-free" points={w.points} />
        {/if}
      {/each}
      {#each floor.agents as a, i (i)}
        <polygon class="sfill st-agent lit" points={a.points} data-desk={a.sessionId}><title>Agent at work</title></polygon>
      {/each}
      {#if floor.agentsMore}
        <text class="agents-more halo" x={floor.agentsMore.at[0]} y={floor.agentsMore.at[1]}><title>{plural(floor.agentsMore.count, 'more agent', 'more agents')} at work</title>+{floor.agentsMore.count}</text>
      {/if}
      {#each floor.slats as s, i (i)}<line class="slat" x1={s[0]} y1={s[1]} x2={s[2]} y2={s[3]} />{/each}
      <polygon class="sfill st-empty" points={floor.side} />
      {@render label(floor.label, String(floor.number), cleanText(summary.name, NAME_MAX), floorMeta(summary))}
      <polygon class="outline" points={floor.outline} />
    </g>
  {/each}
  {#if ringed.length > 0}
    <g class="task-rings">
      {#each ringed as w, i (i)}<polygon class={['task-ring', `tie-${hoverTie}`]} points={w.points} />{/each}
      {#if thread}<polyline class={['task-thread', `tie-${hoverTie}`]} points={thread} />{/if}
    </g>
  {/if}
  <g class="roof">
    {@render solid(model.roof.slab, 'roof')}
    {#each model.roof.units as unit, i (i)}{@render solid(unit, 'unit')}{/each}
    {#if model.gate && lobby?.memory}<Tank tank={model.gate.tank} pct={lobby.memory.pct} gatePct={lobby.memory.gatePct} warnPct={lobby.memory.warnPct} />{/if}
    <line class="mast" x1={model.roof.mast[0]} y1={model.roof.mast[1]} x2={model.roof.mast[2]} y2={model.roof.mast[3]} />
  </g>
</svg>

<style>
  .facade { display: block; width: 100%; height: 100%; }
  .m-wall { --c: var(--wall); }
  .m-plate { --c: var(--slab); }
  .m-plinth { --c: var(--plinth); }
  .m-roof { --c: var(--roof); }
  .m-unit { --c: var(--slab); }
  .box .t { fill: var(--c); }
  .box .l { fill: color-mix(in oklab, var(--c) 84%, var(--shade)); }
  .box .r { fill: color-mix(in oklab, var(--c) 68%, var(--shade)); }
  .box polygon { stroke: var(--edge); stroke-width: .6; stroke-linejoin: round; }
  .ground-shadow { fill: var(--shadow); }

  .sfill { fill: var(--win-off); color: var(--win-off); stroke: var(--edge); stroke-width: .5; }
  .sfill.st-free { stroke: var(--win-frame); stroke-width: 1.2; }
  .sfill.st-working { fill: var(--s-working); color: var(--s-working); }
  .sfill.st-needs_you { fill: var(--s-needs); color: var(--s-needs); animation: pulse 1.6s ease-in-out infinite; }
  .sfill.st-done { fill: var(--s-done); color: var(--s-done); }
  .sfill.st-in_meeting, .sfill.st-agent { fill: var(--s-meeting); color: var(--s-meeting); }
  .sfill.st-no_signal { fill: var(--s-nosignal); color: var(--s-nosignal); animation: flicker 3.2s ease-in-out infinite; }
  .sfill.st-idle { fill: color-mix(in oklab, var(--win-off) 74%, var(--s-working)); }
  .sfill.st-dormant, .shut .sfill { fill: var(--shutter); animation: none; }
  .sfill.lit { filter: var(--win-filter); }
  .shut .sfill.lit { filter: none; }
  .door { fill: color-mix(in oklab, var(--s-working) 55%, var(--win-off)); stroke: var(--edge); stroke-width: .5; }
  .slat { stroke: color-mix(in oklab, var(--shutter) 70%, var(--shade)); stroke-width: 1; }
  .mast { stroke: var(--muted); stroke-width: 1; }
  .agents-more { font-family: var(--font-mono); font-size: 10px; font-weight: 700; fill: var(--meeting-ink); text-anchor: middle; dominant-baseline: central; }
  .tie-0 { --tie: var(--feature-0); }
  .tie-1 { --tie: var(--feature-1); }
  .tie-2 { --tie: var(--feature-2); }
  .tie-3 { --tie: var(--feature-3); }
  .tie-4 { --tie: var(--feature-4); }
  .tie-5 { --tie: var(--feature-5); }
  .tie-6 { --tie: var(--feature-6); }
  .tie-7 { --tie: var(--feature-7); }
  .task-ring { fill: none; stroke: var(--tie); stroke-width: 3; stroke-linejoin: round; pointer-events: none; }
  .task-thread { fill: none; stroke: var(--tie); stroke-width: 1.6; stroke-dasharray: 4 3; pointer-events: none; }
  .queue-line { stroke: var(--muted); stroke-width: 1; stroke-dasharray: 2 3; opacity: .55; }
  .more-chip rect { fill: var(--sign-bg); stroke: var(--panel); stroke-width: 1; }
  .more-chip text { font-family: var(--font-mono); font-size: 9.5px; font-weight: 700; fill: var(--sign-fg); text-anchor: middle; }

  .floor { cursor: pointer; outline: none; }
  .outline { fill: transparent; stroke: transparent; stroke-width: 2; pointer-events: none; }
  .floor:hover .outline, .floor:focus-visible .outline { stroke: var(--accent); fill: color-mix(in oklab, var(--accent) 8%, transparent); }
  .floor.selected .outline { stroke: var(--accent); stroke-width: 2.5; fill: color-mix(in oklab, var(--accent) 12%, transparent); }
  .floor .sfill[data-desk]:hover { stroke: var(--accent); stroke-width: 1.5; }

  .leader { stroke: var(--muted); stroke-width: 1; stroke-dasharray: 2 3; }
  .t-btn { fill: var(--panel); stroke: var(--fg); stroke-width: 1.3; }
  .t-num { font-family: var(--font-mono); font-size: 11px; font-weight: 600; fill: var(--fg); text-anchor: middle; dominant-baseline: central; }
  .t-name { font-family: var(--font-display); font-stretch: 72%; font-weight: 700; font-size: 16px; letter-spacing: .07em; text-transform: uppercase; fill: var(--fg); }
  .t-meta { font-family: var(--font-body); font-size: 11.5px; fill: var(--muted); }
  .c-needs { fill: var(--needs-ink); font-weight: 600; }
  .c-done { fill: var(--done-ink); font-weight: 600; }
  .c-meeting { fill: var(--meeting-ink); font-weight: 600; }
  .c-nosignal { fill: var(--nosignal-ink); font-weight: 600; }
  .halo { paint-order: stroke; stroke: var(--halo); stroke-width: 4px; stroke-linejoin: round; }

  @keyframes pulse { 0%, 100% { opacity: 1; } 50% { opacity: .5; } }
  @keyframes flicker { 0%, 100% { opacity: .9; } 45% { opacity: .55; } 50% { opacity: .85; } }
</style>
