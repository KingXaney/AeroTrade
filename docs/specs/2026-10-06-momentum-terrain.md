# The momentum terrain: the front door's hero

Status: Built (2026-10-06), on `feat/momentum-terrain`; Tiingo added the same day at the owner's request.

## Why

The owner brought a build plan for an "S&P 500 Momentum Terrain": an interactive 3D surface of
SPY momentum — one year of sessions along x, lookback periods from 5 to 250 days along y,
normalised momentum as height — rebuilt once a day and served as a static file, to be the landing
page's attention-grabber. The plan was written for a standalone static site: a Python script
against Tiingo, a GitHub Action committing `surface.json`, an `index.html` loading three.js from
a CDN.

## What the plan keeps, and what changes

The maths, the look, every interaction and the data source are the plan's. The pipeline is the
app's own.

| Plan | Here | Why |
|---|---|---|
| Tiingo, a token, Python once a day | Tiingo first, once `TIINGO_TOKEN` is set: `lib/prices/tiingo` reads SPY in one payload and Next caches the fetch for an hour (`lib/landing/surface-store`). Without a key, or when Tiingo fails or is short, the stored SPY bars the strategies job backfills (~1,560 days) draw the same surface. | The first build used only the stored bars, since a second provider seemed to duplicate them; the owner has a key and asked for Tiingo, whose free tier (50 requests an hour, 1,000 a day) is far more than one request an hour. The fallback keeps the page from ever being empty for want of a key, and keeps the no-Python, no-bot-commit shape. |
| `adjClose` | Tiingo's `adjClose` for the Tiingo path — consistent inside one payload, the only place the app trusts an adjusted close; the total-return index (`lib/prices/total-return.totalReturnIndex`) for the stored bars | Stored adjCloses mix download dates and Yahoo rebases them on every distribution (AGENTS invariant 11); chaining closes with stored dividends is what every other SPY total-return read in the app does. |
| A static `surface.json` committed by a GitHub Action, redeploying the site | `GET /api/landing/surface`, computed on demand and memoised per ET day on the last bar's stamp (`lib/day-memo`), with `Cache-Control: public, max-age=300, s-maxage=300, stale-while-revalidate`; a day with nothing to draw is a 404 nobody caches | The same effect — about one fetch an hour, every visitor served from a cache, no browser ever calling the provider — without a bot commit to `main` every evening. The CDN caches it five minutes, as the plan's `_headers` did. Today's row is taken only after 5:30 pm ET, when Tiingo has published it. |
| `fallback.png` | A skeleton while the JSON loads; the same grid as a 2D heatmap when WebGL is missing | A screenshot goes stale the day after it is taken. The heatmap is the plan's own v2 floor map, drawn from live data. |
| three.js from a CDN import map | `three` as a dependency, loaded with a dynamic `import()` after the data arrives | Next bundles it; named imports keep the chunk to what the scene uses; the landing HTML stays light. |
| Hex colours in `main.js` | `--terrain-*` tokens in `app/globals.css`, read at runtime | Invariant 5: no hex in `.tsx`. A theme preview from the page's own switcher recolours the surface. |

What the plan called v1, v2 and v3 are all built except the optional contour lines: the surface,
zero and base planes, drop lines, front edge, hover tooltip with a marker, auto-rotate that
pauses on touch, the floor heatmap, a 2D slice under the canvas, slice highlights on the surface,
camera presets, the flatten toggle, the intro rise and up to three story markers on the year's
largest moves.

## The surface

`lib/landing/momentum-surface.ts` (pure, unit-tested):

```
z(t, n) = ln(P_t / P_{t−n}) / (σ_t · √n)
```

P is SPY's total-return index, σ_t the sample standard deviation of the trailing 60 daily log
returns. Lookbacks 5, 10, 20, 40, 80, 160, 250 — roughly doubling, so evenly spaced rows are honest
on a log scale. 250 sessions shown; fewer (never under 60) when the stored history is shorter, so a
database with two years of SPY still draws. Null — the hero shows its unavailable state — when the
history is too short, a value is not finite or |z| > 20 (bad data). Up to three "notable" cells
(|z| > 3, one per day, largest first) become the story markers.

The route returns the plan's JSON shape (`ticker`, `updated`, `lookbacks`, `dates`, `price`,
`z[lookback][day]`, `zAbsMax`) plus `notable` and `source` (`tiingo` or `stored`, which the footer
names — Tiingo with its credit linked). `price` is the plain close, so it matches a quote site; the
adjusted series is only inside `z`.

## The page

- The hero is text left (two fifths), terrain right (three fifths); under `lg` they stack,
  headline first, the canvas 4:3 (the plan's 60vh left a tall, mostly empty canvas on a phone).
  The example screen the hero used to carry moved beside "How it starts".
- The plan's camera positions became directions: the scene fits the distance to the canvas's
  aspect — the nearest camera that keeps the cylinder the surface turns inside in frame, from any
  azimuth — and slides the look-at point so the surface sits in the middle of the canvas. A preset
  tweens both the position and the look-at point; a resize re-fits in place.
- The canvas is `role="img"` with an `aria-label` built from the data; the tooltip is hover-only
  and `aria-hidden`; presets and the flatten toggle are real buttons with `aria-pressed`.
- Reduced motion (the OS setting or `html[data-motion="reduced"]`): no auto-rotate, no intro rise,
  camera presets jump instead of tweening, the flatten toggle is instant.
- On a coarse pointer the orbit controls are off and the canvas keeps `touch-action: pan-y`, so a
  phone scrolls past it; the surface still auto-rotates, a tap still shows the tooltip.
- The render loop runs only while the hero is on screen and the tab visible, and draws only when
  something moved. Pixel ratio is capped at 2 (1.5 on touch).
- The landing page itself still reads nothing: the terrain's data arrives from the route after the
  page paints, and the page renders the same without it.

## Home

The owner asked for it on Home too. Home opens on the same component: the page reads
`getMomentumSurface` on the server beside its own view and hands the surface in as `initial`, so
the section exists only when there is a surface (a box with nothing to say is not drawn) and the
client draws it at once with no loading state. It is frameless, like the landing hero — the first
cut put it in a `Panel`, and the surface floated on the panel's lighter box instead of the page;
the owner asked for it to match the background. The section's heading replaces the eyebrow, the
canvas is 16:9 under `lg` and 400px tall above it, and the definitions keep their Ask links, since
the chat widget is mounted on the signed-in pages.

## Wording

Every sentence is `TERRAIN_COPY` in `lib/learn/copy/landing.ts`, held to the copy tier of the
no-advice list. The terms the hero shows — normalised momentum, lookback, volatility — are glossary
entries (`normalized-momentum` and `lookback` are new, homed on the front door), listed in its one
"What these mean", whose lead paragraph says how the surface is laid out and nothing a definition
already says (`lib/learn/__tests__/panel-method.test.ts`). The hero carries no "Ask in chat" links:
the chat widget is not mounted on the marketing page.

## Not done

- Contour lines at −2σ, 0, +2σ (the plan's optional v2 item).
- A story marker's text is generated from the data ("largest 20-day fall this year"), not written
  by hand per event.
