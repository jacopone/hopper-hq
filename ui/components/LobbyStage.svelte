<script lang="ts">
  import { onDestroy, onMount } from 'svelte';
  import type { LobbyDetail } from '../../src/scene/types';
  import type { RendererModule } from '../lib/renderer';
  import type { LobbyView } from '../renderer/index';

  /**
   * The Lobby in 3D: the hall with an elevator per seat, the doorman at the counter, the line in front of it and the
   * ready tasks on the couches. The renderer loads on mount and draws on this component's own canvas, as a floor's
   * stage does; without WebGL the panel beside it says all the Lobby holds.
   */
  interface Props {
    lobby: LobbyDetail;
    /** The theme in force. The stage reads the colours again when it changes. */
    theme: 'day' | 'night';
    load: () => Promise<RendererModule>;
  }
  let { lobby, theme, load }: Props = $props();

  let canvas: HTMLCanvasElement | undefined = $state();
  let view: LobbyView | null = $state.raw(null);
  let failure: 'no-webgl' | 'load' | null = $state(null);
  let renderer: RendererModule | null = null;
  let painted = '';
  let gone = false;

  function reducedMotion(): boolean {
    try {
      return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    } catch {
      return false;
    }
  }

  function colours(r: RendererModule) {
    const root = getComputedStyle(document.documentElement);
    return r.readThemeTokens((name) => root.getPropertyValue(name), reducedMotion());
  }

  function fail(err: unknown): void {
    if (gone) return;
    if (err instanceof Error && err.name === 'WebGLUnavailableError') {
      failure = 'no-webgl';
      return;
    }
    failure = 'load';
    console.error(err);
  }

  onMount(() => {
    load().then((r) => {
      if (gone || !canvas) return;
      try {
        const v = r.mountLobbyView({ canvas }, colours(r));
        renderer = r;
        painted = theme;
        view = v;
      } catch (err) {
        fail(err);
      }
    }, fail);
  });

  onDestroy(() => {
    gone = true;
    view?.dispose();
  });

  $effect(() => {
    view?.setLobby(lobby);
  });
  $effect(() => {
    if (!view || !renderer || theme === painted) return;
    painted = theme;
    view.setTheme(colours(renderer));
  });

  const refused = $derived(lobby.tasks.filter((t) => t.where === 'refused').length);
  const ready = $derived(lobby.tasks.filter((t) => t.where === 'waiting').length);
</script>

<div class="lobby-stage">
  {#if failure === 'no-webgl'}
    <p class="no-webgl" role="status">This browser cannot draw the Lobby in 3D. All it holds is in the panel.</p>
  {:else if failure === 'load'}
    <div class="load-failed" role="alert">
      <p>The 3D view could not load; the daemon may have been updated. Reload the page.</p>
      <button type="button" class="btn" onclick={() => location.reload()}>Reload</button>
    </div>
  {:else}
    <canvas bind:this={canvas} aria-label="The Lobby in 3D: {refused} refused in line, {ready} ready on the couches, {lobby.seats.length} elevators"></canvas>
    {#if !view}
      <p class="loading" role="status">Loading the 3D Lobby…</p>
    {:else}
      <p class="hint">Elevators: one per seat, lamp green with room, red full, amber without a fresh reading; the gauge is the week used · drag to turn · scroll to zoom</p>
    {/if}
  {/if}
</div>

<style>
  .lobby-stage { position: absolute; inset: 0; overflow: hidden; }
  canvas { position: absolute; inset: 0; display: block; width: 100%; height: 100%; touch-action: none; }
  .hint { position: absolute; left: 12px; right: 12px; bottom: 10px; margin: 0; font-size: 12px; color: var(--muted); pointer-events: none; }
  .loading { position: absolute; inset: 0; display: grid; place-items: center; margin: 0; color: var(--muted); pointer-events: none; }
  .no-webgl { position: absolute; inset: 0; display: grid; place-items: center; margin: 0; padding: 24px; text-align: center; color: var(--muted); }
  .load-failed { position: absolute; inset: 0; display: grid; place-content: center; justify-items: center; gap: 12px; padding: 24px; text-align: center; }
  .load-failed p { margin: 0; max-width: 46ch; }
  @media (max-width: 900px) {
    .hint { display: none; }
  }
</style>
