<script lang="ts">
  import { formatAgo } from '../../src/scene/text';
  import type { LobbyDetail, PausedSession } from '../../src/scene/types';
  import { singleClick } from '../lib/click';
  import { plural } from '../lib/words';
  import Bar from './Bar.svelte';

  /**
   * The gatekeeper's Lobby drawn and in words: the gate's last verdict, the room left for sessions as pips, the launches
   * waiting outside (turned away, and ready for a seat), the machine as gauges against the gate's limits, the seats with
   * their two allowances as bars, the sessions' memory against its cap with the sessions the watchdog paused. It is also
   * what a browser without WebGL gets of the Lobby.
   */
  interface Props {
    /** undefined while loading, null when no gatekeeper is configured. */
    lobby: LobbyDetail | null | undefined;
    now: number;
    onBack: () => void;
    onDesk: (sessionId: string) => void;
  }
  let { lobby, now, onBack, onDesk }: Props = $props();

  const GIB = 2 ** 30;
  const gib = (bytes: number) => (bytes / GIB).toFixed(1);
  const pct = (used: number, max: number) => Math.round((used / max) * 100);
  /** The ready tasks beyond this many are counted, and a button opens them. */
  const READY_SHOWN = 8;
  const refused = $derived(lobby ? lobby.queue.filter((w) => w.kind === 'refused') : []);
  const ready = $derived(lobby ? lobby.queue.filter((w) => w.kind === 'ready') : []);
  let allReady = $state(false);
  const readyShown = $derived(allReady ? ready : ready.slice(0, READY_SHOWN));
  const sub = $derived.by(() => {
    if (!lobby) return '';
    const parts = [`read ${formatAgo(now - lobby.updatedAt)} ago`, `${refused.length} refused`, `${ready.length} ready`];
    if (lobby.cap) parts.push(`${lobby.cap.working ?? '?'} / ${lobby.cap.max ?? '?'} working`);
    return parts.join(' · ');
  });
  type SeatRow = LobbyDetail['seats'][number];
  const seatLine = (s: SeatRow) =>
    !s.session && !s.week
      ? `${s.name} no fresh reading`
      : `${s.name} 5h ${s.session ? `${Math.round(s.session.usedPct)}%` : '–'} · 7d ${s.week ? `${Math.round(s.week.usedPct)}%` : '–'}${s.full ? ' · full' : ''}${s.stale ? ' · stale' : ''}`;
  const gauge = (p: NonNullable<LobbyDetail['power']>) =>
    `${gib(p.usedBytes)} / ${p.maxBytes === null ? 'no cap' : `${gib(p.maxBytes)} GiB (${pct(p.usedBytes, p.maxBytes)}%)`} · mark ${p.warnPct}%`;
  const pausedLabel = (p: PausedSession) => `${p.name ?? 'a session'} (${p.pane})`;

  /** The frequency a full CPU bar stands for. */
  const CPU_SCALE_MHZ = 4000;
  type Gauge = { label: string; value: string; pct: number | null; marks: { at: number; label: string }[]; over: boolean };
  const nd = 'n/d';
  const share = (n: number, of: number) => (of > 0 ? (n / of) * 100 : 0);
  /** The machine's gauges against the gate's limits; a figure the gate did not give is n/d, with no bar. */
  const gauges = $derived.by((): Gauge[] => {
    const m = lobby?.machine;
    const lim = lobby?.limits;
    if (!m) return [];
    const threads = m.threads ?? m.nproc;
    const out: Gauge[] = [];
    out.push(
      m.memAvailableGb === null
        ? { label: 'Memory available', value: nd, pct: null, marks: [], over: false }
        : {
            label: 'Memory available',
            value: m.memTotalGb === null ? `${m.memAvailableGb} GB` : `${m.memAvailableGb} / ${m.memTotalGb} GB`,
            pct: m.memTotalGb === null ? null : share(m.memAvailableGb, m.memTotalGb),
            marks: lim && m.memTotalGb ? [{ at: share(lim.memMinGb, m.memTotalGb), label: `the gate refuses below ${lim.memMinGb} GB` }] : [],
            over: lim ? m.memAvailableGb < lim.memMinGb : false,
          },
    );
    out.push(
      m.load === null
        ? { label: 'Load', value: nd, pct: null, marks: [], over: false }
        : {
            label: 'Load',
            value: threads === null ? `${m.load}` : `${m.load} / ${threads} threads`,
            pct: threads === null ? null : share(m.load, threads),
            marks: lim && threads !== null ? [{ at: lim.loadPerThread * 100, label: `the gate refuses above ${lim.loadPerThread} × ${threads} threads` }] : [],
            // The gate takes the whole part of the load: 18.9 of 24 threads is 18, and let in.
            over: lim && threads !== null ? Math.floor(m.load) > lim.loadPerThread * threads : false,
          },
    );
    out.push(
      m.diskBusyPct === null
        ? { label: 'Disk busy', value: nd, pct: null, marks: [], over: false }
        : { label: 'Disk busy', value: `${m.diskBusyPct}%`, pct: m.diskBusyPct, marks: lim ? [{ at: lim.diskBusyPct, label: `the gate refuses at ${lim.diskBusyPct}%` }] : [], over: lim ? m.diskBusyPct >= lim.diskBusyPct : false },
    );
    out.push(
      m.psiMemPct === null
        ? { label: 'Memory pressure', value: nd, pct: null, marks: [], over: false }
        : { label: 'Memory pressure', value: `${m.psiMemPct}%`, pct: m.psiMemPct, marks: lim ? [{ at: lim.psiMemPct, label: `the gate refuses at ${lim.psiMemPct}%` }] : [], over: lim ? m.psiMemPct >= lim.psiMemPct : false },
    );
    // The machine's own flag: the mean and the fastest core both under the brake frequency.
    const throttled = m.cpuBraking === true;
    out.push(
      m.cpuMhz === null
        ? { label: 'CPU', value: nd, pct: null, marks: [], over: false }
        : {
            label: 'CPU',
            value: `${m.cpuMhz} MHz${m.nproc === null ? '' : ` · ${m.nproc} cores`}${throttled ? ' · throttled' : ''}`,
            pct: share(m.cpuMhz, CPU_SCALE_MHZ),
            marks: lim ? [{ at: share(lim.brakeMhz, CPU_SCALE_MHZ), label: `under ${lim.brakeMhz} MHz the firmware is braking` }] : [],
            over: throttled,
          },
    );
    return out;
  });
  const power = $derived(lobby?.power ?? null);
  const powerPct = $derived(power && power.maxBytes ? share(power.usedBytes, power.maxBytes) : null);
  const powerMarks = $derived(
    power ? [...(lobby?.limits ? [{ at: lobby.limits.slicePct, label: `the gate refuses at ${lobby.limits.slicePct}%` }] : []), { at: power.warnPct, label: `the watchdog pauses at ${power.warnPct}%` }] : [],
  );

  /** The places under the working cap as pips: at work, free now, and held back (by the seats or the pace). */
  const pips = $derived.by(() => {
    const max = lobby?.cap?.max;
    if (!lobby || max === null || max === undefined || lobby.cap?.working === null) return [];
    const working = Math.min(lobby.cap?.working ?? 0, max);
    const free = Math.min(lobby.capacity.slotsFree ?? 0, max - working);
    return [...Array(working).fill('working'), ...Array(free).fill('free'), ...Array(max - working - free).fill('held')] as ('working' | 'free' | 'held')[];
  });
  const bindText = (c: LobbyDetail['capacity']) => (c.binds === 'cap' ? ' · the cap binds' : c.binds === 'seats' ? ' · the seats bind' : '');
  const capNow = (c: LobbyDetail['capacity']) =>
    c.slotsFree === null
      ? `Places free now: ${nd} · the seats leave ${c.bySeats ?? nd}`
      : `${plural(c.slotsFree, 'place', 'places')} free now · the cap leaves ${c.byCap}, the seats leave ${c.bySeats ?? nd}${bindText(c)}`;
</script>

<button type="button" class="linkbtn back" onclick={singleClick(onBack)}>← Building</button>
<div>
  <p class="eyebrow">Lobby</p>
  <h2 tabindex="-1" class="p-title">{lobby ? `The gate of ${lobby.doorman.name}` : 'The Lobby'}</h2>
  {#if lobby}<p class="p-sub">{sub}</p>{/if}
</div>
{#if lobby === undefined}
  <p class="p-note">Loading the Lobby…</p>
{:else if lobby === null}
  <p class="p-text">No gatekeeper is configured: the Lobby is empty.</p>
{:else}
  <section>
    <h3 class="p-h3">Gate</h3>
    {#if lobby.gate}
      <p class="verdict" class:wait={!lobby.gate.go}><span class="badge" class:go={lobby.gate.go}>{lobby.gate.go ? 'VIA' : 'ASPETTA'}</span> {lobby.gate.text}</p>
      {#if lobby.gate.reasons.length > 0}
        <ul class="list">{#each lobby.gate.reasons as r, i (i)}<li>{r.kind}: {r.text}</li>{/each}</ul>
      {/if}
    {:else}
      <p class="p-note">No word from the gate.</p>
    {/if}
  </section>
  <section>
    <h3 class="p-h3">Capacity</h3>
    {#if pips.length > 0}
      <div class="pips" role="img" aria-label="{lobby.cap?.working ?? 0} of {lobby.cap?.max} places at work">
        {#each pips as kind, i (i)}<span class="pip {kind}"></span>{/each}
      </div>
      <p class="pip-key"><span class="swatch working"></span> at work <span class="swatch free"></span> free now <span class="swatch held"></span> held back</p>
    {/if}
    {#if lobby.capacity.plan}<p class="cap-plan">{lobby.capacity.plan}</p>{/if}
    <p class="cap-now">{capNow(lobby.capacity)}</p>
    {#if lobby.capacity.nextReset}<p class="cap-next">Next seat opens in {formatAgo(lobby.capacity.nextReset.at - now)}: {lobby.capacity.nextReset.seat}</p>{/if}
  </section>
  <section>
    <h3 class="p-h3">Waiting outside</h3>
    {#if lobby.queue.length > 0}
      {#if refused.length > 0}
        <div class="refused">
          <h4>Turned away · {refused.length}</h4>
          <ul class="list">
            {#each refused as w (w.id)}
              <li>{w.name}{w.account ? ` · ${w.account}` : ''} · {formatAgo(now - w.since)}{w.reason ? ` · ${w.reason.text}` : ''}</li>
            {/each}
          </ul>
        </div>
      {/if}
      {#if ready.length > 0}
        <div class="ready">
          <h4>Ready, waiting for a seat and a go · {ready.length}</h4>
          <ul class="list">
            {#each readyShown as w (w.id)}
              <li>{w.name} · {formatAgo(now - w.since)}</li>
            {/each}
          </ul>
          {#if ready.length > READY_SHOWN}
            <button type="button" class="linkbtn more" onclick={singleClick(() => (allReady = !allReady))}>{allReady ? 'Show fewer' : `Show ${ready.length - READY_SHOWN} more`}</button>
          {/if}
        </div>
      {/if}
    {:else}
      <p class="p-note">Nobody is waiting outside.</p>
    {/if}
  </section>
  <section>
    <h3 class="p-h3">Machine</h3>
    {#if lobby.machine}
      <p class="measured p-note">the gate's figures read {formatAgo(now - (lobby.gate?.at ?? lobby.updatedAt))} ago · load and CPU live</p>
      <div class="gauges">
        {#each gauges as g (g.label)}
          <div class="gauge" class:over={g.over}>
            <span class="g-label">{g.label}</span>
            <span class="g-bar"><Bar pct={g.pct} marks={g.marks} over={g.over} /></span>
            <span class="g-value">{g.value}</span>
          </div>
        {/each}
      </div>
      {#if lobby.machine.rebuild}<p class="chip">rebuild under way</p>{/if}
    {:else}
      <p class="p-note">No reading of the machine.</p>
    {/if}
  </section>
  <section>
    <h3 class="p-h3">Seats</h3>
    <ul class="list seats">
      {#each lobby.seats as s (s.account)}
        <li class:full={s.full} class:stale={s.stale} class:current={s.current}>
          <span>{s.current ? '▸ ' : ''}{seatLine(s)}</span>
          <span class="seat-bars">
            <Bar pct={s.session ? s.session.usedPct : null} over={s.session !== null && s.session.usedPct >= lobby.seatLimitPct} stale={s.stale} marks={[{ at: lobby.seatLimitPct, label: `full at ${lobby.seatLimitPct}%` }]} />
            <Bar pct={s.week ? s.week.usedPct : null} over={s.week !== null && s.week.usedPct >= lobby.seatLimitPct} stale={s.stale} marks={[{ at: lobby.seatLimitPct, label: `full at ${lobby.seatLimitPct}%` }]} />
          </span>
        </li>
      {/each}
    </ul>
    {#if lobby.turnTo}<p class="turn">Turn → {lobby.turnTo}</p>{/if}
  </section>
  <section>
    <h3 class="p-h3">Session memory</h3>
    {#if lobby.power}
      <Bar pct={powerPct} marks={powerMarks} over={powerPct !== null && powerPct >= lobby.power.warnPct} />
      <p class="gauge-text">{gauge(lobby.power)}</p>
      {#if lobby.power.held}<p class="p-note warn">Launches held by the watchdog.</p>{/if}
      {#if lobby.power.paused.length > 0}
        <ul class="list paused">
          {#each lobby.power.paused as p (p.pane)}
            <li>
              {#if p.sessionId}
                {@const id = p.sessionId}
                <button type="button" class="linkbtn" onclick={singleClick(() => onDesk(id))}>{pausedLabel(p)}</button>
              {:else}
                {pausedLabel(p)}
              {/if}
            </li>
          {/each}
        </ul>
      {/if}
    {:else}
      <p class="p-note">No reading of the sessions' memory.</p>
    {/if}
  </section>
{/if}

<style>
  .back { align-self: flex-start; }
  .list { list-style: none; margin: 0; padding: 0; display: grid; gap: 6px; font-family: var(--font-mono); font-size: 12.5px; }
  .verdict { margin: 0; font-family: var(--font-mono); font-size: 12.5px; overflow-wrap: anywhere; }
  .verdict.wait, .warn { color: var(--needs-ink); font-weight: 500; }
  .full { color: var(--needs-ink); }
  .stale { color: var(--muted); }
  .turn { margin: 0; color: var(--done-ink); font-weight: 600; }
  .gauge-text { margin: 4px 0 0; font-family: var(--font-mono); font-size: 12.5px; }
  .badge { display: inline-block; padding: 0 6px; border-radius: 4px; font-weight: 600; background: var(--s-needs); color: var(--badge-fg); }
  .badge.go { background: var(--s-done); }
  h4 { margin: 8px 0 4px; font-size: 12px; font-weight: 600; color: var(--muted); }
  .refused li { padding-left: 8px; border-left: 3px solid var(--s-needs); }
  .ready li { padding-left: 8px; border-left: 3px solid var(--line); }
  .more { margin-top: 4px; }
  .pips { display: flex; flex-wrap: wrap; gap: 4px; }
  .pip, .swatch { display: inline-block; width: 14px; height: 14px; border-radius: 3px; box-sizing: border-box; vertical-align: -2px; }
  .working { background: var(--s-working); }
  .free { background: transparent; box-shadow: inset 0 0 0 2px var(--s-done); }
  .held { background: repeating-linear-gradient(45deg, var(--line) 0 3px, transparent 3px 6px); box-shadow: inset 0 0 0 1px var(--line); }
  .pip-key { margin: 6px 0; font-size: 12px; color: var(--muted); display: flex; flex-wrap: wrap; gap: 4px 8px; align-items: center; }
  .cap-plan, .cap-now, .cap-next { margin: 4px 0 0; font-family: var(--font-mono); font-size: 12.5px; overflow-wrap: anywhere; }
  .cap-plan { color: var(--muted); }
  .measured { margin-bottom: 6px; }
  .gauges { display: grid; gap: 6px; }
  .gauge { display: grid; grid-template-columns: auto minmax(0, 1fr); grid-template-areas: 'label value' 'bar bar'; gap: 3px 8px; align-items: baseline; font-family: var(--font-mono); font-size: 12.5px; }
  .g-label { grid-area: label; color: var(--muted); }
  .g-value { grid-area: value; text-align: right; overflow-wrap: anywhere; }
  .g-bar { grid-area: bar; }
  .gauge.over .g-value { color: var(--needs-ink); font-weight: 500; }
  .chip { display: inline-block; margin: 8px 0 0; padding: 1px 8px; border-radius: 10px; background: var(--hover); color: var(--needs-ink); font-size: 12px; }
  .seats li { display: grid; gap: 3px; }
  .seat-bars { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; }
</style>
