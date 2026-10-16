<script lang="ts">
  import { formatAgo } from '../../src/scene/text';
  import type { LobbyDetail, PausedSession } from '../../src/scene/types';
  import { singleClick } from '../lib/click';
  import { plural } from '../lib/words';

  /**
   * The gatekeeper's Lobby in words: the gate's last verdict, the launches waiting outside, the seats with their two
   * allowances and the turn to take, the power against its cap with the sessions the watchdog paused. It is also what a
   * browser without WebGL gets of the Lobby.
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
  const sub = $derived.by(() => {
    if (!lobby) return '';
    const parts = [`read ${formatAgo(now - lobby.updatedAt)} ago`, plural(lobby.queue.length, 'waiting', 'waiting')];
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
      <p class="verdict" class:wait={!lobby.gate.go}>{lobby.gate.text}</p>
      {#if lobby.gate.reasons.length > 0}
        <ul class="list">{#each lobby.gate.reasons as r, i (i)}<li>{r.kind}: {r.text}</li>{/each}</ul>
      {/if}
    {:else}
      <p class="p-note">No word from the gate.</p>
    {/if}
  </section>
  <section>
    <h3 class="p-h3">Waiting outside</h3>
    {#if lobby.queue.length > 0}
      <ul class="list">
        {#each lobby.queue as w (w.id)}
          <li>{w.name}{w.account ? ` · ${w.account}` : ''} · {formatAgo(now - w.since)}{w.reason ? ` · ${w.reason.text}` : ''}</li>
        {/each}
      </ul>
    {:else}
      <p class="p-note">Nobody is waiting outside.</p>
    {/if}
  </section>
  <section>
    <h3 class="p-h3">Seats</h3>
    <ul class="list">
      {#each lobby.seats as s (s.account)}
        <li class:full={s.full} class:stale={s.stale} class:current={s.current}>{s.current ? '▸ ' : ''}{seatLine(s)}</li>
      {/each}
    </ul>
    {#if lobby.turnTo}<p class="turn">Turn → {lobby.turnTo}</p>{/if}
  </section>
  <section>
    <h3 class="p-h3">Power</h3>
    {#if lobby.power}
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
  .gauge-text { margin: 0; font-family: var(--font-mono); font-size: 12.5px; }
</style>
