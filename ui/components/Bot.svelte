<script lang="ts">
  /**
   * A micro-robot standing on the façade, in the proportions of the 3D robots (renderer/robot.ts, BOT: hip .34, torso
   * .36, shoulders .22, head .38 x .28), upright because the façade has no depth to turn it in. Its body is the colour
   * slot of its repository (grey without one), its tie the feature colour; a badge floats over its head as on the
   * floors: needs (red, blocked), clock (amber, waiting; the head bows). A hard hat marks the doorman.
   */
  interface Props {
    /** Where its feet stand, on the page. */
    x: number;
    y: number;
    /** Pixels to a metre of robot. */
    u?: number;
    /** The repository's colour slot; null is grey. */
    slot?: number | null;
    badge?: 'needs' | 'clock' | null;
    hat?: boolean;
    /** What a hover says. */
    title?: string;
    kind?: 'line' | 'group' | 'doorman';
  }
  let { x, y, u = 25, slot = null, badge = null, hat = false, title = '', kind = 'line' }: Props = $props();

  const r = (n: number) => Math.round(n * 10) / 10;
  const hip = $derived(0.34 * u);
  const torso = $derived(0.36 * u);
  const top = $derived(-hip - torso);
  const headTop = $derived(top - 0.34 * u);
  const badgeY = $derived(headTop - (hat ? 6 : 4));
</script>

<g class={['bot', kind, slot !== null && `repo-${slot}`, badge && `badge-${badge}`]} transform="translate({r(x)} {r(y)})">
  {#if title}<title>{title}</title>{/if}
  <ellipse class="shade" cx="0" cy=".5" rx={r(0.3 * u)} ry={r(0.1 * u)} />
  {#each [-1, 1] as s (s)}
    <rect class="shell" x={r(s * 0.09 * u - 0.9)} y={r(-hip)} width="1.8" height={r(hip)} />
    <rect class="foot" x={r(s * 0.09 * u - 1.5)} y="-1.4" width="3" height="1.4" rx=".5" />
    <rect class="shell" x={r(s * 0.225 * u - 0.65)} y={r(top + 0.8)} width="1.3" height={r(0.32 * u)} rx=".6" />
  {/each}
  <rect class="body" x={r(-0.18 * u)} y={r(top)} width={r(0.36 * u)} height={r(torso)} rx="1.6" />
  <polygon class="tie" points="-0.8,{r(top + 0.6)} 0.8,{r(top + 0.6)} 0.55,{r(top + 4.2)} -0.55,{r(top + 4.2)}" />
  <g class="head" transform={badge === 'clock' ? `rotate(9 0 ${r(top)}) translate(0 1.1)` : undefined}>
    <rect class="shell edged" x={r(-0.19 * u)} y={r(headTop)} width={r(0.38 * u)} height={r(0.28 * u)} rx="1.4" />
    <rect class="face" x={r(-0.155 * u)} y={r(top - 0.3 * u)} width={r(0.31 * u)} height={r(0.2 * u)} rx=".8" />
    <rect class="visor" x={r(-0.09 * u)} y={r(top - 0.2 * u)} width={r(0.18 * u)} height=".9" rx=".4" />
    {#if hat}
      <path class="hat" d="M {r(-0.2 * u)} {r(top - 0.33 * u)} A {r(0.2 * u)} {r(0.17 * u)} 0 0 1 {r(0.2 * u)} {r(top - 0.33 * u)} Z" />
      <rect class="hat" x={r(-0.25 * u)} y={r(headTop)} width={r(0.5 * u)} height="1.1" rx=".5" />
    {/if}
  </g>
  {#if badge}
    <circle class="dot" cx="0" cy={r(badgeY)} r="2.7" />
    {#if badge === 'clock'}
      <path class="glyph" d="M 0 {r(badgeY - 1.5)} V {r(badgeY)} H 1.1" />
    {:else}
      <path class="glyph" d="M 0 {r(badgeY - 1.5)} V {r(badgeY + 0.2)} M 0 {r(badgeY + 1.3)} V {r(badgeY + 1.4)}" />
    {/if}
  {/if}
</g>

<style>
  .bot { --body: var(--bot-jet); }
  .repo-0 { --body: var(--repo-0); }
  .repo-1 { --body: var(--repo-1); }
  .repo-2 { --body: var(--repo-2); }
  .repo-3 { --body: var(--repo-3); }
  .repo-4 { --body: var(--repo-4); }
  .repo-5 { --body: var(--repo-5); }
  .repo-6 { --body: var(--repo-6); }
  .repo-7 { --body: var(--repo-7); }
  .shade { fill: var(--shadow); }
  .shell { fill: var(--bot-shell); }
  .edged { stroke: var(--edge); stroke-width: .4; }
  .foot { fill: var(--bot-jet); }
  .body { fill: var(--body); stroke: var(--edge); stroke-width: .4; }
  .tie { fill: var(--feature-none); }
  .doorman .tie { fill: var(--s-working); }
  .doorman .body { fill: var(--feature-none); }
  .face { fill: var(--scene-monitor); }
  .visor { fill: var(--bot-visor); }
  .hat { fill: var(--s-working); stroke: var(--edge); stroke-width: .35; }
  .dot { stroke: var(--panel); stroke-width: .9; }
  .badge-needs .dot { fill: var(--s-needs); animation: bot-pulse 1.6s ease-in-out infinite; }
  .badge-clock .dot { fill: var(--s-nosignal); }
  .glyph { fill: none; stroke: var(--badge-fg); stroke-width: .75; stroke-linecap: round; }
  @keyframes bot-pulse { 0%, 100% { opacity: 1; } 50% { opacity: .5; } }
  @media (prefers-reduced-motion: reduce) { .badge-needs .dot { animation: none; } }
</style>
