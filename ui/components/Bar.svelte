<script lang="ts">
  /**
   * A horizontal bar: filled to a share of its scale, with marks where a limit lies. It carries no text; the row it sits
   * in says the figure in words.
   */
  interface Props {
    /** Share of the scale that is filled, 0 to 100. */
    pct: number | null;
    /** Where limits lie on the scale, 0 to 100, each with what it is. */
    marks?: { at: number; label: string }[];
    /** Past its limit: drawn in the alarm colour. */
    over?: boolean;
    /** Nothing to draw yet: an empty track. */
    stale?: boolean;
  }
  let { pct, marks = [], over = false, stale = false }: Props = $props();
  const clamp = (n: number) => Math.max(0, Math.min(100, Math.round(n)));
</script>

<span class="bar" class:over class:stale aria-hidden="true">
  {#if pct !== null}<span class="fill" style:width="{clamp(pct)}%"></span>{/if}
  {#each marks as m (m.label)}<i class="mark" title={m.label} style:left="{clamp(m.at)}%"></i>{/each}
</span>

<style>
  .bar { position: relative; display: block; height: 8px; min-width: 56px; border-radius: 4px; background: var(--hover); box-shadow: inset 0 0 0 1px var(--line); }
  .fill { position: absolute; inset: 0 auto 0 0; border-radius: 4px; background: var(--s-done); }
  .over .fill { background: var(--s-needs); }
  .stale .fill { background: var(--muted); opacity: .45; }
  .mark { position: absolute; top: -2px; bottom: -2px; width: 2px; margin-left: -1px; background: var(--fg); opacity: .7; border-radius: 1px; }
</style>
