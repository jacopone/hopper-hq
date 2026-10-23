<script lang="ts">
  import type { Org } from '../../src/scene/palette';

  /**
   * A micro-robot standing on the façade, in the proportions of the 3D robots (renderer/robot.ts, BOT: hip .34, torso
   * .36, shoulders .22, head .38 x .28), upright because the façade has no depth to turn it in. Its body is the colour
   * slot of its repository (grey without one), its tie the colour of its task, its lanyard the colour of its account's
   * organisation; a badge floats over its head as on the floors: needs (red, blocked), clock (amber, waiting; the head
   * bows). A launch in the line holds its brief, a folder. The doorman is the orchestrator: a cap, a clipboard; the hard
   * hat is the workflow agent's.
   */
  interface Props {
    /** Where its feet stand, on the page. */
    x: number;
    y: number;
    /** Pixels to a metre of robot. */
    u?: number;
    /** The repository's colour slot; null is grey. */
    slot?: number | null;
    /** The task's tie slot; null is the neutral tie. */
    tie?: number | null;
    /** The organisation of its lanyard; null: no lanyard. */
    org?: Org | null;
    badge?: 'needs' | 'clock' | null;
    /** Holds the brief. */
    folder?: boolean;
    /** What a hover says. */
    title?: string;
    kind?: 'line' | 'group' | 'doorman';
  }
  let { x, y, u = 25, slot = null, tie = null, org = null, badge = null, folder = false, title = '', kind = 'line' }: Props = $props();

  const r = (n: number) => Math.round(n * 10) / 10;
  const hip = $derived(0.34 * u);
  const torso = $derived(0.36 * u);
  const top = $derived(-hip - torso);
  const headTop = $derived(top - 0.34 * u);
  const badgeY = $derived(headTop - (kind === 'doorman' ? 6 : 4));
  /** The lanyard's strap, a V from the neck, and where its card hangs. */
  const strap = $derived(
    [[-0.105, 0], [-0.072, 0], [0, 0.168], [0.072, 0], [0.105, 0], [0, 0.215]].map(([px, py]) => `${r(px! * u)},${r(top + py! * u)}`).join(' '),
  );
</script>

<g class={['bot', kind, slot !== null && `repo-${slot}`, tie !== null && `tie-${tie}`, org && `org-${org}`, badge && `badge-${badge}`]} transform="translate({r(x)} {r(y)})">
  {#if title}<title>{title}</title>{/if}
  <ellipse class="shade" cx="0" cy=".5" rx={r(0.3 * u)} ry={r(0.1 * u)} />
  {#each [-1, 1] as s (s)}
    <rect class="shell" x={r(s * 0.09 * u - 0.9)} y={r(-hip)} width="1.8" height={r(hip)} />
    <rect class="foot" x={r(s * 0.09 * u - 1.5)} y="-1.4" width="3" height="1.4" rx=".5" />
    <rect class="shell" x={r(s * 0.225 * u - 0.65)} y={r(top + 0.8)} width="1.3" height={r(0.32 * u)} rx=".6" />
  {/each}
  <rect class="body" x={r(-0.18 * u)} y={r(top)} width={r(0.36 * u)} height={r(torso)} rx="1.6" />
  <polygon class="tie" points="-0.8,{r(top + 0.6)} 0.8,{r(top + 0.6)} 0.55,{r(top + 4.2)} -0.55,{r(top + 4.2)}" />
  {#if org}
    <polygon class="lanyard" points={strap} />
    <rect class="lanyard" x={r(-0.065 * u)} y={r(top + 0.2 * u)} width={r(0.13 * u)} height={r(0.1 * u)} rx=".5" />
  {/if}
  {#if folder}
    <g class="folder" transform="translate({r(-0.47 * u)} {r(top + 0.2 * u)})">
      <rect class="folder-body" width={r(0.2 * u)} height={r(0.26 * u)} rx=".6" />
      <rect class="folder-tab" y={r(0.03 * u)} width={r(0.2 * u)} height={r(Math.max(0.8, 0.03 * u))} />
    </g>
  {/if}
  <g class="head" transform={badge === 'clock' ? `rotate(9 0 ${r(top)}) translate(0 1.1)` : undefined}>
    <rect class="shell edged" x={r(-0.19 * u)} y={r(headTop)} width={r(0.38 * u)} height={r(0.28 * u)} rx="1.4" />
    <rect class="face" x={r(-0.155 * u)} y={r(top - 0.3 * u)} width={r(0.31 * u)} height={r(0.2 * u)} rx=".8" />
    <rect class="visor" x={r(-0.09 * u)} y={r(top - 0.2 * u)} width={r(0.18 * u)} height=".9" rx=".4" />
    {#if kind === 'doorman'}
      <rect class="cap" x={r(-0.2 * u)} y={r(headTop - 0.09 * u)} width={r(0.4 * u)} height={r(0.1 * u)} rx=".8" />
      <ellipse class="cap" cx="0" cy={r(headTop + 0.01 * u)} rx={r(0.23 * u)} ry={r(0.035 * u)} />
    {/if}
  </g>
  {#if kind === 'doorman'}
    <g class="clipboard" transform="translate({r(0.3 * u)} {r(top + 0.12 * u)})">
      <rect class="clip-board" width={r(0.17 * u)} height={r(0.24 * u)} rx=".5" />
      <path class="clip-lines" d="M {r(0.03 * u)} {r(0.09 * u)} h {r(0.11 * u)} M {r(0.03 * u)} {r(0.14 * u)} h {r(0.11 * u)} M {r(0.03 * u)} {r(0.19 * u)} h {r(0.07 * u)}" />
    </g>
  {/if}
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
  .bot { --body: var(--bot-jet); --tie: var(--feature-none); --lanyard: var(--org-other); }
  .repo-0 { --body: var(--repo-0); }
  .repo-1 { --body: var(--repo-1); }
  .repo-2 { --body: var(--repo-2); }
  .repo-3 { --body: var(--repo-3); }
  .repo-4 { --body: var(--repo-4); }
  .repo-5 { --body: var(--repo-5); }
  .repo-6 { --body: var(--repo-6); }
  .repo-7 { --body: var(--repo-7); }
  .tie-0 { --tie: var(--feature-0); }
  .tie-1 { --tie: var(--feature-1); }
  .tie-2 { --tie: var(--feature-2); }
  .tie-3 { --tie: var(--feature-3); }
  .tie-4 { --tie: var(--feature-4); }
  .tie-5 { --tie: var(--feature-5); }
  .tie-6 { --tie: var(--feature-6); }
  .tie-7 { --tie: var(--feature-7); }
  .org-amatino { --lanyard: var(--org-amatino); }
  .org-tenuta { --lanyard: var(--org-tenuta); }
  .org-personal { --lanyard: var(--org-personal); }
  .org-other { --lanyard: var(--org-other); }
  .shade { fill: var(--shadow); }
  .shell { fill: var(--bot-shell); }
  .edged { stroke: var(--edge); stroke-width: .4; }
  .foot { fill: var(--bot-jet); }
  .body { fill: var(--body); stroke: var(--edge); stroke-width: .4; }
  .tie { fill: var(--tie); }
  .doorman .tie { fill: var(--s-working); }
  .doorman .body { fill: var(--feature-none); }
  .lanyard { fill: var(--lanyard); stroke: var(--edge); stroke-width: .3; }
  .folder-body { fill: var(--scene-wood); stroke: var(--edge); stroke-width: .4; }
  .folder-tab { fill: var(--s-working); }
  .face { fill: var(--scene-monitor); }
  .visor { fill: var(--bot-visor); }
  .cap { fill: var(--sign-bg); stroke: var(--edge); stroke-width: .3; }
  .clip-board { fill: var(--scene-paper); stroke: var(--bot-jet); stroke-width: .5; }
  .clip-lines { fill: none; stroke: var(--bot-jet); stroke-width: .5; }
  .dot { stroke: var(--panel); stroke-width: .9; }
  .badge-needs .dot { fill: var(--s-needs); animation: bot-pulse 1.6s ease-in-out infinite; }
  .badge-clock .dot { fill: var(--s-nosignal); }
  .glyph { fill: none; stroke: var(--badge-fg); stroke-width: .75; stroke-linecap: round; }
  @keyframes bot-pulse { 0%, 100% { opacity: 1; } 50% { opacity: .5; } }
  @media (prefers-reduced-motion: reduce) { .badge-needs .dot { animation: none; } }
</style>
