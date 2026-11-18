---
paths:
  - "lib/landing/**"
  - "components/landing/**"
  - "app/(marketing)/**"
  - "app/api/landing/**"
  - "lib/prices/tiingo.ts"
  - "lib/learn/copy/landing.ts"
  - "lib/learn/copy/terrain.ts"
  - "components/auth/AuthShell.tsx"
  - "proxy.ts"
  - "scripts/qa/qa-landing.mjs"
---

# landing

Contracts of this feature that a map cannot show: a part of `AGENTS.md`, kept in a file of its
own so it loads only beside the files its `paths:` name. A `### name` in the text is that
feature's file in this folder; Shared, owner and the numbered invariants are in `AGENTS.md`;
the map is `docs/MAP.md`.

- `/` has two faces. `proxy.ts` rewrites a request with no session cookie for exactly `/` to
  `app/(marketing)/welcome` (the address stays `/`) and redirects every other gated path to
  /sign-in; with a cookie it is Home. The landing page reads nothing — no session, no database.
- Its sentences, and the auth pages' right column (`components/auth/AuthShell`), are
  `lib/learn/copy/landing`: numbers only from the app's own constants, no return figure, user
  count or testimonial, and the no-advice list applies as everywhere. The example screen is
  the app's own primitives, labelled as an example. `components/landing/ThemeDemo` previews a
  theme and saves nothing.
- The hero is the momentum terrain, `components/landing/MomentumTerrain`: a 3D surface of SPY's
  normalised momentum — the last 250 sessions along x, lookbacks 5 to 250 days along y, height
  z = ln(P_t/P_{t−n}) / (σ_t√n) on the total-return index — that fetches `app/api/landing/surface`
  after the page paints and loads the three.js scene (`components/landing/terrain-scene`) with a
  dynamic import; the page itself still reads nothing and is the same page without it. The maths
  is pure, `lib/landing/momentum-surface` (fewer sessions when the history is short, null — the
  hero's unavailable state — under 60 or on a cell beyond 20σ). `lib/landing/surface-store` draws
  from Tiingo first once `TIINGO_TOKEN` is set — `lib/prices/tiingo` reads SPY in one payload, the
  token in a header, the fetch cached by Next for an hour, today's row only after 5:30 pm ET, and
  its `adjClose` trusted because it is read inside ONE payload (invariant 11) — else from SPY's
  stored bars through `lib/prices/total-return`; either surface is memoised per ET day on its last
  bar's stamp (`lib/day-memo`), and the route caches five minutes (a 404, never). The footer names
  the source, Tiingo with its credit linked. Colours are the
  `--terrain-*` tokens in `app/globals.css`, read from the document at runtime and re-read when
  the page's theme switcher repaints it (never hex in a component); motion follows the OS setting
  and `html[data-motion]` (no auto-rotate, no intro, presets and the flatten toggle jump); on a
  coarse pointer the orbit controls are off and the canvas keeps `touch-action: pan-y`, so a phone
  scrolls past it; the wheel is the page's until the surface is grabbed, while + and −, a pinch, or
  Ctrl and the wheel zoom at any time; without WebGL the
  same grid is the 2D heatmap (`components/landing/terrain-heatmap`); the loop draws only while the
  hero is on screen and something moves. Its sentences are `lib/learn/copy/terrain`; its terms
  (`normalized-momentum`, `lookback`, `volatility`, homed on the front door in `lib/learn/where`)
  are the panel's one `WhatTheseMean`, passed in by the page with `ask={false}`, since the chat
  widget is not mounted there. Home draws the same component from a server read (see home).
