<script lang="ts">
  import { ORG_LABEL, ORG_LETTER } from '../../src/scene/palette';
  import { formatAgo } from '../../src/scene/text';
  import type { LobbyDetail, PausedSession, ShownState, TaskSession } from '../../src/scene/types';
  import { singleClick } from '../lib/click';
  import { plural } from '../lib/words';
  import Bar from './Bar.svelte';
  import Bot from './Bot.svelte';

  /**
   * The gatekeeper's Lobby drawn and in words: the gate's last verdict, the room left for sessions as pips, the board of
   * tasks (waiting outside, turned away or ready for a seat; and in the building, each with its sessions as robots in its
   * tie and its organisation's lanyard), the machine as gauges against the gate's limits, the seats with their two
   * allowances as bars and the chip of their organisation, the sessions' memory against its cap with the sessions the
   * watchdog paused. It is also what a browser without WebGL gets of the Lobby.
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
  const refused = $derived(lobby ? lobby.tasks.filter((t) => t.where === 'refused') : []);
  const ready = $derived(lobby ? lobby.tasks.filter((t) => t.where === 'waiting') : []);
  const live = $derived(lobby ? lobby.tasks.filter((t) => t.where === 'live') : []);
  /** A session's badge on its robot: the floors' own, for the two states that call for one. */
  const badgeOf = (state: ShownState): 'needs' | 'clock' | null => (state === 'needs_you' ? 'needs' : state === 'no_signal' ? 'clock' : null);
  const ROBOT_STEP = 26;
  function pressDesk(e: KeyboardEvent, s: TaskSession): void {
    if (e.key !== 'Enter' && e.key !== ' ') return;
    e.preventDefault();
    onDesk(s.sessionId);
  }
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
  /** The week against a straight line to its reset, whether any of it is used, and how old the reading is: an old one says so. */
  const weekLine = (s: SeatRow) => {
    if (!s.session && !s.week) return 'no reading';
    const parts = [s.weekTouched ? 'week touched' : 'week untouched'];
    if (s.weekPace) {
      const a = s.weekPace.aheadPct;
      parts.push(`${s.weekPace.elapsedPct}% of it gone`, a === 0 ? 'on the line' : `${Math.abs(a)} points ${a > 0 ? 'over' : 'under'} the line`);
    } else parts.push('reset not known');
    if (s.readAgeMs !== null) parts.push(`read ${formatAgo(s.readAgeMs)} ago${s.stale ? ', stale' : ''}`);
    else if (s.stale) parts.push('stale');
    return parts.join(' · ');
  };
  /** 912, 98.0k, 4.56M, 1.86B. */
  const tok = (n: number) =>
    n < 1000 ? `${n}` : n < 99_950 ? `${(n / 1000).toFixed(1)}k` : n < 999_500 ? `${(n / 1000).toFixed(0)}k` : n < 999_995_000 ? `${(n / 1e6).toFixed(2)}M` : `${(n / 1e9).toFixed(2)}B`;
  const usd = (n: number) => (n > 0 && n < 0.01 ? '<$0.01' : `$${n.toFixed(2)}`);
  const rate = (n: number) => `$${n}`;
  type Tally = NonNullable<LobbyDetail['usage']>['total'];
  const sumOf = (t: Tally) => t.tokens.input + t.tokens.cacheWrite + t.tokens.cacheRead + t.tokens.output;
  const counting = (t: Tally) => (t.counting ? ' · counting…' : '');
  /** The sessions listed by name; the rest are counted in the totals. */
  const USAGE_SHOWN = 12;
  /** The watchdog's mark is a share of the cap: without a cap there is none to name. */
  const gauge = (p: NonNullable<LobbyDetail['power']>) =>
    p.maxBytes === null ? `${gib(p.usedBytes)} GiB used · no cap` : `${gib(p.usedBytes)} / ${gib(p.maxBytes)} GiB (${pct(p.usedBytes, p.maxBytes)}%) · mark ${p.warnPct}%`;
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
    power && power.maxBytes !== null ? [...(lobby?.limits ? [{ at: lobby.limits.slicePct, label: `the gate refuses at ${lobby.limits.slicePct}%` }] : []), { at: power.warnPct, label: `the watchdog pauses at ${power.warnPct}%` }] : [],
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
      <p class="pip-key"><span class="keyed working"></span> at work <span class="keyed free"></span> free now <span class="keyed held"></span> held back</p>
    {/if}
    {#if lobby.capacity.plan}<p class="cap-plan">{lobby.capacity.plan}</p>{/if}
    <p class="cap-now">{capNow(lobby.capacity)}</p>
    {#if lobby.capacity.nextReset}<p class="cap-next">Next seat opens in {formatAgo(lobby.capacity.nextReset.at - now)}: {lobby.capacity.nextReset.seat}</p>{/if}
  </section>
  <section>
    <h3 class="p-h3">Waiting outside</h3>
    {#if refused.length + ready.length > 0}
      {#if refused.length > 0}
        <div class="refused">
          <h4>Turned away · {refused.length}</h4>
          <ul class="list">
            {#each refused as t, i (i)}
              <li class="row">
                {#if t.org}<i class="stripe org-{t.org}" title={ORG_LABEL[t.org]}></i>{/if}<i class="swatch tie-{t.tie}"></i>
                <span>{t.title ?? t.id}{t.account ? ` · ${t.account}` : ''}{t.since !== null ? ` · ${formatAgo(now - t.since)}` : ''}{t.reason ? ` · ${t.reason}` : ''}</span>
              </li>
            {/each}
          </ul>
        </div>
      {/if}
      {#if ready.length > 0}
        <div class="ready">
          <h4>Ready, waiting for a seat and a go · {ready.length}</h4>
          <ul class="list">
            {#each readyShown as t, i (i)}
              <li class="row">
                {#if t.org}<i class="stripe org-{t.org}" title={ORG_LABEL[t.org]}></i>{/if}<i class="swatch tie-{t.tie}"></i>
                <span>{t.title ?? t.id}{t.since !== null ? ` · ${formatAgo(now - t.since)}` : ''}</span>
              </li>
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
    <h3 class="p-h3">In the building</h3>
    {#if live.length > 0}
      <div class="cards">
        {#each live as t, i (i)}
          <div class="card">
            {#if t.org}<i class="stripe org-{t.org}" title={ORG_LABEL[t.org]}></i>{/if}
            <div class="card-body">
              <p class="card-head"><i class="swatch tie-{t.tie}"></i><b>{t.id}</b>{t.title ? ` ${t.title}` : ''}</p>
              <p class="card-count">{plural(t.sessions.length, 'session', 'sessions')}{t.subagents > 0 ? ` · ${plural(t.subagents, 'subagent', 'subagents')}` : ''}</p>
              <svg class="robots" viewBox="0 0 {ROBOT_STEP * t.sessions.length + 8} 58" width={ROBOT_STEP * t.sessions.length + 8} height="58" role="group" aria-label="Sessions of {t.id}">
                {#each t.sessions as s, i (s.sessionId)}
                  <g class="pick" role="button" tabindex="0" aria-label={s.name} onclick={singleClick(() => onDesk(s.sessionId))} onkeydown={(e) => pressDesk(e, s)}>
                    <Bot x={18 + i * ROBOT_STEP} y={54} u={40} slot={s.body} tie={t.tie} org={s.org} badge={badgeOf(s.state)} title={s.name} />
                  </g>
                {/each}
              </svg>
            </div>
          </div>
        {/each}
      </div>
    {:else}
      <p class="p-note">No task has a session in the building.</p>
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
      {#if lobby.machine.rebuild}<p class="rebuild">rebuild under way</p>{/if}
    {:else}
      <p class="p-note">No reading of the machine.</p>
    {/if}
  </section>
  <section>
    <h3 class="p-h3">Seats</h3>
    <ul class="list seats">
      {#each lobby.seats as s (s.account)}
        <li class:full={s.full} class:stale={s.stale} class:current={s.current}>
          <span class="seat-line">{s.current ? '▸ ' : ''}{#if s.org}<i class="chip org-{s.org}" title={ORG_LABEL[s.org]} data-letter={ORG_LETTER[s.org]}></i>{/if}{seatLine(s)}</span>
          <span class="seat-bars">
            <Bar pct={s.session ? s.session.usedPct : null} over={s.session !== null && s.session.usedPct >= lobby.seatLimitPct} stale={s.stale} marks={[{ at: lobby.seatLimitPct, label: `full at ${lobby.seatLimitPct}%` }]} />
            <Bar pct={s.week ? s.week.usedPct : null} over={s.week !== null && s.week.usedPct >= lobby.seatLimitPct} stale={s.stale} marks={[{ at: lobby.seatLimitPct, label: `full at ${lobby.seatLimitPct}%` }]} />
          </span>
          <span class="seat-week" class:old={s.stale}>{weekLine(s)}</span>
        </li>
      {/each}
    </ul>
    <!-- The status line writes the five-hour and the all-models week; the Fable week is in no reading. -->
    <p class="week-limits p-note">Bars: 5h, then 7d all models · Fable: not read</p>
    {#if lobby.turnTo}<p class="turn">Turn → {lobby.turnTo}</p>{/if}
  </section>
  <section>
    <h3 class="p-h3">Tokens at list price</h3>
    {#if lobby.usage}
      {@const u = lobby.usage}
      <p class="usage-note p-note">List price, not billed: the seats are subscriptions. Rates read {u.prices.readAt} from platform.claude.com, {u.prices.currency} {u.prices.unit}.</p>
      <p class="usage-total">In the building: {tok(sumOf(u.total))} tokens · {usd(u.total.costUsd)}{u.total.unpricedTokens > 0 ? ` · ${tok(u.total.unpricedTokens)} tokens of a model with no price` : ''}{counting(u.total)}</p>
      {#if u.seats.length > 0}
        <ul class="list usage-seats">
          {#each u.seats as s (s.account)}
            <li>{#if s.org}<i class="chip org-{s.org}" title={ORG_LABEL[s.org]} data-letter={ORG_LETTER[s.org]}></i>{/if}{s.account} · {plural(s.sessions, 'session', 'sessions')} · {tok(sumOf(s))} tokens · {usd(s.costUsd)}{counting(s)}</li>
          {/each}
        </ul>
        <ul class="list usage-sessions">
          {#each u.sessions.slice(0, USAGE_SHOWN) as s (s.sessionId)}
            <li>
              <span class="line">{s.name}{s.task && !s.name.startsWith(s.task) ? ` · ${s.task}` : ''} · in {tok(s.tokens.input)} · write {tok(s.tokens.cacheWrite)} · read {tok(s.tokens.cacheRead)} · out {tok(s.tokens.output)} · {usd(s.costUsd)}{counting(s)}</span>
              {#if s.subagentsCount > 0}
                <span class="subs-head">{plural(s.subagentsCount, 'subagent', 'subagents')} · {tok(sumOf(s.subagentsTally))} tokens · {usd(s.subagentsTally.costUsd)}{counting(s.subagentsTally)}</span>
                <ul class="subs">
                  {#each s.subagents as a (`${a.runId ?? ''}/${a.agentId}`)}
                    <li>{a.type ?? 'agent'}{a.label ? ` · ${a.label}` : a.runId ? ` · ${a.runId}` : ''} · {tok(sumOf(a))} tokens · {usd(a.costUsd)}{counting(a)}</li>
                  {/each}
                  {#if s.subagentsMore > 0}<li class="more">+{s.subagentsMore} more</li>{/if}
                </ul>
              {/if}
            </li>
          {/each}
        </ul>
        {#if u.sessions.length > USAGE_SHOWN}<p class="p-note">{plural(u.sessions.length - USAGE_SHOWN, 'more session', 'more sessions')} in the totals.</p>{/if}
      {/if}
      {#if u.prices.rates.length > 0}
        <ul class="list rates">
          {#each u.prices.rates as r (r.model)}
            <li>{r.label} · in {rate(r.input)} · 5m write {rate(r.cacheWrite5m)} · 1h write {rate(r.cacheWrite1h)} · read {rate(r.cacheRead)} · out {rate(r.output)}</li>
          {/each}
        </ul>
      {/if}
    {:else}
      <p class="p-note">The building does not meter its sessions.</p>
    {/if}
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
  .row { display: flex; gap: 6px; align-items: baseline; }
  .row > span { min-width: 0; overflow-wrap: anywhere; }
  .org-amatino { --org: var(--org-amatino); }
  .org-tenuta { --org: var(--org-tenuta); }
  .org-personal { --org: var(--org-personal); }
  .org-other { --org: var(--org-other); }
  .tie-0 { --tie: var(--feature-0); }
  .tie-1 { --tie: var(--feature-1); }
  .tie-2 { --tie: var(--feature-2); }
  .tie-3 { --tie: var(--feature-3); }
  .tie-4 { --tie: var(--feature-4); }
  .tie-5 { --tie: var(--feature-5); }
  .tie-6 { --tie: var(--feature-6); }
  .tie-7 { --tie: var(--feature-7); }
  .swatch { flex: none; display: inline-block; width: 16px; height: 7px; border-radius: 2px; background: var(--tie, var(--feature-none)); }
  .stripe { flex: none; align-self: stretch; display: inline-block; width: 4px; border-radius: 2px; background: var(--org, var(--org-other)); box-shadow: inset 0 0 0 1px var(--edge); }
  .chip { display: inline-grid; place-items: center; width: 1.35em; height: 1.35em; margin-right: .45em; border-radius: .3em; background: var(--org, var(--org-other)); box-shadow: inset 0 0 0 1px var(--edge); vertical-align: -.2em; }
  .chip::after { content: attr(data-letter); font: 700 .78em var(--font-mono); color: #fff; }
  .chip.org-personal::after { color: #18202b; }
  .cards { display: grid; gap: 8px; }
  .card { display: flex; gap: 8px; border: 1px solid var(--line); border-radius: 6px; padding: 6px 8px 4px 6px; background: var(--panel); }
  .card-body { min-width: 0; }
  .card-head { margin: 0; display: flex; gap: 6px; align-items: baseline; font-family: var(--font-mono); font-size: 12.5px; overflow-wrap: anywhere; }
  .card-count { margin: 2px 0 0; font-size: 11.5px; color: var(--muted); }
  .robots { display: block; overflow: visible; }
  .pick { cursor: pointer; outline: none; }
  .pick:hover :global(.body), .pick:focus-visible :global(.body) { stroke: var(--accent); stroke-width: 1.2; }
  .pips { display: flex; flex-wrap: wrap; gap: 4px; }
  .pip, .keyed { display: inline-block; width: 14px; height: 14px; border-radius: 3px; box-sizing: border-box; vertical-align: -2px; }
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
  .rebuild { display: inline-block; margin: 8px 0 0; padding: 1px 8px; border-radius: 10px; background: var(--hover); color: var(--needs-ink); font-size: 12px; }
  .seats li { display: grid; gap: 3px; }
  .usage-total { margin: 4px 0; font-family: var(--font-mono); font-size: 12.5px; font-weight: 600; }
  .usage-sessions, .rates { margin-top: 6px; font-size: 11.5px; }
  .rates { color: var(--muted); }
  .usage-sessions > li { display: grid; gap: 2px; }
  .subs-head { padding-left: 12px; color: var(--muted); }
  .subs { list-style: none; margin: 0; padding: 0 0 0 24px; display: grid; gap: 1px; color: var(--muted); }
  .seat-week { font-size: 11.5px; color: var(--muted); }
  .seat-week.old { font-style: italic; }
  .seat-bars { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; }
</style>
