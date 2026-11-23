---
paths:
  - "lib/home/**"
  - "components/home/**"
  - "app/(root)/page.tsx"
  - "lib/learn/copy/home.ts"
  - "scripts/qa/qa-home.mjs"
---

# home

Contracts of this feature that a map cannot show: a part of `AGENTS.md`, kept in a file of its
own so it loads only beside the files its `paths:` name. A `### name` in the text is that
feature's file in this folder; Shared, owner and the numbered invariants are in `AGENTS.md`;
the map is `docs/MAP.md`.

- `/` is Home for a signed-in reader: `lib/home/page-store.getHomeView` (the accounts' valuation and
  the topics overview are the shell's own request-cached reads) shaped by `lib/home/view`. It
  adapts from rows, never a flag: `nextStep` is the first first-week mission not yet done, then
  the session (the trade desk while the market is open, the news while it is closed); a box with
  nothing to say is not drawn. The widget grid is `/dashboard`; every action that revalidates
  `/` revalidates it too (`lib/__tests__/home-revalidate.test.ts`).
- The order is the reader's own figures first: the title and its chips; the paper accounts
  (`#home-accounts`, the total `[data-home-total]`) beside the next step; the momentum terrain; the
  topics (`#home-topics`) beside the briefing or the lesson; the first week or the lesson; poker
  night. Each section keeps its rule: a box with nothing to say is not drawn.
- The terrain is the landing page's (`components/landing/MomentumTerrain`) at `size="strip"`, under
  the section's own heading (handed in as `heading`, no eyebrow), frameless like the landing hero so
  the transparent canvas sits on the page background, not in a panel's box, and inset as a panel's
  content is (a default Panel's padding, `panelPad(5)`, and its 1px border, unseen), so its heading,
  controls and reading start where the panels' above and below it do. From lg the strip is
  one row — the canvas 220px tall with its controls on the left, the slice, legend, caption and
  source on the right — stacked under lg (the canvas 2:1, at most 220px), its one `WhatTheseMean`
  under both. On a band (a canvas at least `lib/landing/terrain-view.STRIP_MIN_ASPECT` times as wide
  as it is tall) the scene's Angle preset looks from lower down (`STRIP_ANGLE`), so the turning
  surface fills the band rather than a third of it; the panel, the hero and a phone's 2:1 strip keep
  the preset's own height. Its Expand button (`data-terrain-expand`, `aria-expanded`, on the heading's line so
  it never moves) swaps the strip for the `panel` size in place and back: state alone — no
  navigation, no fetch, the same canvas and scene, nothing animated — and `data-terrain-size`
  names the size drawn. In the strip the tooltip drops below a pointer in the canvas's top half and
  is held inside the band, and the slice gives the hovered session a line of its own (`stacked`), so
  a hover moves nothing. The page reads `lib/landing/surface-store.getMomentumSurface` on the server
  beside `getHomeView` and hands the surface in as `initial`, so the section exists only when there
  is one (never a loading box) and the client draws it at once. Its one `WhatTheseMean` keeps its
  Ask links, since the chat is mounted here; the landing page's has none.
- Poker night on Home: `components/home/PokerNightChip`, a link chip to `/poker-night` beside the
  streak, is the way in that is always there while `pokerNightEnabled()` — and, while the reader
  holds a seat, the way straight back to it ("Rejoin your table", `lobby.homeChipOf`, streamed in
  over the lobby's chip from the panel's own read, one per request through React's `cache`); the panel
  `components/home/HomePokerNight` (props only) is drawn only when it has a row — the tables the
  reader holds a seat at (Rejoin) or hosts from outside one (Open), then friends' shown open tables
  (Join), `HOME_LIMITS` of each, each row's line opening with its table's game (`lobby.tableLine`: "PLO · …"),
  and "Learn the hands" (`/poker-night?tab=hands`). Its read,
  `lib/poker-night/lobby-store.getHomePokerNight` (null with the kill switch on or no row), shaped by
  the pure `lib/poker-night/lobby.homePokerNight`, is streamed under `<Suspense fallback={null}>` by
  `PokerNightAsync`, declared in `app/(root)/page.tsx` because poker night's server guard keeps its
  stores out of `components/`; it is not part of `getHomeView`, and a failed read draws nothing. No
  poker night action revalidates `/`: Home renders per request.
