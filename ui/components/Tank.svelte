<script lang="ts">
  import type { GateModel } from '../facade/geometry';

  /**
   * The water tank on the roof: the sessions' memory against its cap, as a level behind glass. Two lines cross it: where
   * the gatekeeper stops admitting launches (amber) and where the watchdog pauses sessions (red); the water takes the
   * colour of the last line it passed. It carries no word, so that it is not read as the laptop's battery.
   */
  interface Props {
    tank: GateModel['tank'];
    pct: number;
    /** Where the gatekeeper stops admitting; null when it names no line. */
    gatePct: number | null;
    warnPct: number;
  }
  let { tank, pct, gatePct, warnPct }: Props = $props();

  const r = (n: number) => Math.round(n * 10) / 10;
  const { cx, cy, rx, ry, h, legH } = $derived(tank);
  const yb = $derived(cy - legH);
  const yt = $derived(yb - h);
  const level = $derived(Math.max(0, Math.min(100, pct)));
  const yl = $derived(yb - (h * level) / 100);
  const at = (m: number) => yb - (h * m) / 100;
  const tone = $derived(level >= warnPct ? 'warn' : gatePct !== null && level >= gatePct ? 'gate' : '');
  /** The front half of the ring around the tank at a level. */
  const ring = (m: number) => `M ${r(cx - rx)} ${r(at(m))} A ${rx} ${ry} 0 0 0 ${r(cx + rx)} ${r(at(m))}`;
</script>

<g class="tank" data-level={level}>
  <title>Session memory {Math.round(level)}%</title>
  {#each [[-0.78, 0.35], [0.78, 0.35], [-0.5, -0.62], [0.5, -0.62]] as [dx, dy] (`${dx},${dy}`)}
    <line class="leg" x1={r(cx + dx! * rx)} y1={r(cy + dy! * ry)} x2={r(cx + dx! * rx)} y2={r(yb + dy! * ry)} />
  {/each}
  <path class="glass" d="M {r(cx - rx)} {r(yt)} V {r(yb)} A {rx} {ry} 0 0 0 {r(cx + rx)} {r(yb)} V {r(yt)} Z" />
  {#if level > 0}
    <path class={['water', tone]} d="M {r(cx - rx)} {r(yl)} V {r(yb)} A {rx} {ry} 0 0 0 {r(cx + rx)} {r(yb)} V {r(yl)} A {rx} {ry} 0 0 1 {r(cx - rx)} {r(yl)} Z" />
    <ellipse class={['surface', tone]} cx={r(cx)} cy={r(yl)} {rx} {ry} />
  {/if}
  {#if gatePct !== null}<path class="mark gate" d={ring(gatePct)} />{/if}
  <path class="mark warn" d={ring(warnPct)} />
  <ellipse class="lid" cx={r(cx)} cy={r(yt)} {rx} {ry} />
  <polygon class="cone" points="{r(cx - rx - 2)},{r(yt)} {r(cx)},{r(yt - 13)} {r(cx + rx + 2)},{r(yt)}" />
</g>

<style>
  .leg { stroke: var(--plinth); stroke-width: 1.8; }
  .glass { fill: var(--win-back); fill-opacity: .55; stroke: var(--win-frame); stroke-width: .9; }
  .water, .surface { fill: var(--accent); }
  .water { fill-opacity: .85; }
  .surface { stroke: var(--panel); stroke-opacity: .5; stroke-width: .6; }
  .water.gate, .surface.gate { fill: var(--s-nosignal); }
  .water.warn, .surface.warn { fill: var(--s-needs); }
  .mark { fill: none; stroke-width: 1.2; }
  .mark.gate { stroke: var(--s-nosignal); stroke-dasharray: 3 2; }
  .mark.warn { stroke: var(--s-needs); stroke-width: 1.6; }
  .lid { fill: var(--roof); stroke: var(--win-frame); stroke-width: .9; }
  .cone { fill: var(--plinth); stroke: var(--edge); stroke-width: .6; }
</style>
