# The knowledge graph in 3D

Status: Built (2026-10-06).

## Why

The owner asked for the brain's knowledge graph — an SVG of three concentric rings — to become
"a cool 3D one". The terrain on the landing page had just shown the way: a three.js scene loaded on
demand, on-demand rendering, theme tokens read from the document, a fallback without WebGL.

## What

- **Layout**, `lib/brain/graph-layout` (pure, unit-tested): the SVG's rings become three concentric
  shells — themes inner, sectors middle, tickers outer — so the legend keeps its meaning. The n
  entities take n directions spread evenly over the sphere (a Fibonacci lattice turned so its first
  point faces the camera's opening position), seated in weight order: the heaviest faces the camera,
  an entity with links to seated ones takes the free direction nearest them (weighted by the links),
  one without takes the free direction farthest from everything seated. The shell only sets the
  radius. So spacing is guaranteed — twenty entities are never under 30° apart from the centre,
  however densely the news links them — and a linked pair still sits side by side where a slot
  allows. A first version relaxed directions with attraction and repulsion; with the real brain's
  dense links it clumped. Deterministic for one input, so the graph is stable between renders.
- **Scene**, `components/brain/graph-scene`: spheres sized by the square root of the share of the
  heaviest weight and coloured by sentiment (`--positive`, `--negative`, `--fg-muted`); a thesis gets
  a brand-coloured halo; the links at rest are each entity's three heaviest (`restingEdges`, so a
  densely linked brain is a constellation, not a hairball), lines brightened by weight, and a lit
  entity shows all of its links in the brand colour; the shells are faint rings at
  their equators. A slow auto-rotation that pauses under a hand and resumes after six seconds; a
  bloom from the centre on first draw; hover or focus lights an entity and its links; a click on a
  sphere opens its evidence. Zoom with Ctrl/Meta and the wheel, or the wheel once the graph is grabbed.
- **Links kept**, `components/brain/BrainGraph`: every label is a real `<a>` to `evidenceHref`,
  floated over the canvas by the scene (depth-faded, the hovered one on top), so Tab reaches it and
  Enter opens it exactly as before; the canvas is `aria-hidden`, the host `role="group"`. The
  trading suite's checks moved from `svg a[href=…]` to `[data-brain-graph] a[href=…]`, wait for
  the graph to be drawn, and focus a label before clicking it, since the turning graph never holds a
  label still for Playwright's stability check. The same run surfaced an older race in that suite —
  Playwright scrolling to a target and clicking in the same tick, before the compositor had the new
  scroll offset, so the click fell into the TradingView iframe — now `settledClick` in
  `scripts/qa/lib.mjs`.
- **Fallback**: without WebGL, or if the scene fails to start, the SVG rings draw instead
  (`components/brain/BrainGraph2D`, the old component under a new name); an empty brain shows its
  empty state.
- **Shared**: `components/three/scene-env` (WebGL, theme stamp, reduced motion, coarse pointer,
  tokens as RGB) and `lib/theme/css-color` (the token parser) are what the terrain and the graph both
  read; the terrain was moved onto them.

## Not done

Labels are not moved apart: when two overlap, the nearer one (or the lit one) keeps its place and
the other fades to a trace, still in the tab order and back at full strength on hover or focus.
Edges are straight lines, not arcs.
