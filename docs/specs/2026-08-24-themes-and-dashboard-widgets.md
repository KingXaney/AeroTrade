# Themes + Customizable Dashboard Widgets — Design Spec

**Date:** 2026-08-24
**Status:** Implemented — `22ea56c` (2026-08-28).

## Context

AeroTrade had one hard-coded look ("Quiet Cyber": dark, cyan accent, flat panels)
and one fixed dashboard. This work adds per-user **themes** (12 palettes × 5 visual
styles, applied to the whole app and saved to the account) and a **customizable
dashboard**: a 12-column widget grid the user can reorder, resize and extend with
widgets that were never on the dashboard. Both live under a new `/settings` page,
which also absorbs the notification toggles that used to sit in the user dropdown.

## Theme engine

- **Tokens** (`app/globals.css`): semantic CSS custom properties on `:root` —
  colours (`--bg`, `--chrome`, `--surface-0..4`, `--fg(-soft/-muted)`, `--line(-strong)`,
  `--brand(-strong/-dim)`, `--on-brand`, `--positive`, `--negative`, `--on-negative`,
  `--secondary-tint`) and style tokens (`--panel-*`, `--control-radius`, `--glow`,
  `--type-display/body/mono`). The names deliberately avoid shadcn's (`--accent`,
  `--secondary`, `--border`…); Tailwind's `--font-*` namespace is left to Tailwind
  (a same-named runtime token would create a `var()` cycle). `@theme inline` exposes
  the colours as utilities (`text-fg-muted`, `bg-brand/10`, `stroke-brand`, …) and the
  shadcn variables are re-pointed to the tokens so `components/ui/*` follow the theme.
- **Palettes** live in `lib/theme/palettes.ts` (single source of truth). `buildPaletteCss()`
  emits one `html[data-palette="id"]{…}` block per palette; the root layout injects it as
  `<style id="aero-palettes">`. Unit tests enforce contrast floors (fg/surface ≥ 4.5,
  muted ≥ 3, on-brand/brand ≥ 4.5) and byte-parity of the default palette with the old CSS.
- **Styles** are hand-written `[data-style="…"]` blocks (minimal, futuristic, liquid-glass,
  brutalist, soft) that only set style tokens plus their own effects (shimmer/glow/particles,
  glass specular + drifting blobs, hard shadows, …). The `:root` values are the neutral baseline
  a block falls back to. Until 2026-10-06 minimal *was* that baseline and so changed almost
  nothing when chosen; the owner asked for a real difference, and it is now "no boxes": panels
  are open sections under hairline rules, flush left, with wider column gaps; rows and headlines
  are ruled lists; the header and rail sit flat on the page; one typeface (Inter) with
  medium-weight, fg-soft headings; ink buttons (fg on bg) with the accent kept for links and
  active states; floating chrome gets a hairline instead of a shadow. The chrome nearly
  disappears: a 3rem bar with no rule, a small logo, search as an icon, the account as an
  avatar, a 3rem rail of plain icons with the current one in the foreground colour; section
  tabs are words with the current one underlined; the page title is smaller; the chat launcher
  is ink without a halo; the terrain drops its axis caption. The shell hooks this hangs on are
  `data-app-content` (the content wrapper), `data-page-subtitle`, `data-user-name`,
  `data-streak-chip` and `data-terrain-caption`.
  The same day the other four styles each got a layout of their own, so the five are real
  options rather than surface treatments on one shell: **futuristic** is a console — 15px root
  type, the sections docked along the bottom edge (the page runs full width), panels bracketed
  at two corners, a `>` prompt before a mono-capitals title, tabs in brackets, rows with an
  accent edge, tags as framed mono capitals; **liquid-glass** is islands — the bar floats inset
  from the top, the sections float as a centred capsule at the left, pill controls everywhere;
  **brutalist** is a ledger — the rail widens into an 11rem sidebar whose rows carry their names
  (`::after { content: attr(data-rail) }`) with the current one inverted, a stamped inverted
  title, tabs as one segmented block, inverted tags, a faint diagonal hatch behind the page;
  **soft** is a reading column — 17px root type, the page centred at 68rem, a 4.5rem bar with a
  pill search, a column of rounded tiles with the current one lifted, wider gaps, tabs in a pill
  track, a radial wash of the accent behind. The visual sweep takes `QA_THEME` as a comma list
  and `QA_SWEEP_PAGES` as a page subset, so a round of style work is reviewed in one harness run.
  Reduced motion is honoured from the OS and from `html[data-motion="reduced"]`.
- **Persistence**: `UserPreferences.appearance` (Mongo) is the source of truth; the
  `aero-theme` cookie (`v1:<palette>:<style>:<0|1>`, httpOnly, 1 year) mirrors it so
  `app/layout.tsx` renders `<html data-palette data-style data-mode data-motion class="dark?">`
  with zero flash. `setAppearance` (session-derived, whitelisted) writes both; the cookie
  write re-renders the layouts. `ThemeSync` adopts the account's theme on a device whose
  cookie is stale; sign-out clears the cookie.
- **Client**: `ThemeProvider` (preview → `document.documentElement` only; commit → server
  action) wraps all of `<body>` so the toaster and `ThemeBackdrop` can read it. Since
  2026-10-06 a hover previews the palette only: a style moves the page, and a card that moves
  away from the pointer cancels its own preview and loops (the Futuristic card flickered between
  two layouts). The landing switcher, a click, previews the whole theme (`preview(theme, {full: true})`).
  `useThemeTokens()` feeds canvas/SVG/TradingView consumers from the committed theme only.
- **Migration**: `scripts/codemod-theme-tokens.mjs` rewrote 497 hex / 172 rgba / 240
  inline-font literals to tokens (Tailwind arbitrary classes → token utilities, inline
  styles → `var()`/`color-mix()`, fonts → `--type-*`). Gain/loss colours were split by
  hand (`getChangeColorClass`, change badges, `sentimentColor`); medal colours stay literal.

## Dashboard widgets

- **Registry** (`lib/dashboard/catalog.ts`, pure): 28 widgets with allowed spans on a
  12-column grid, data keys, chrome (`link` / `panel` / `panel-lg` / `panel-sm` / `bare`)
  and availability (`multiAccount`, `advanced`). `resolveDataKeys()` splits the transitive
  data needs into an eager `Promise.all` and lazy keys streamed under `<Suspense>`.
- **Layout** (`lib/dashboard/layout.ts`, pure): `{version: 1, widgets: [{id, span}]}`,
  zod-validated, `normalizeLayout()` never throws, immutable helpers. `DEFAULT_LAYOUT` is
  exactly the previous dashboard, so a user with no saved layout sees no change.
- **Loading** (`lib/dashboard/loaders.ts`): one loader per data key over the existing
  server functions, deduped with React `cache()`; a failing loader degrades one widget.
- **Rendering**: `app/(root)/page.tsx` stays a Server Component, renders every widget body
  through `components/dashboard/widgets/registry.tsx` and hands a `Record<id, ReactNode>`
  to the client `DashboardGrid`, keyed by `layoutFingerprint(layout)`.
- **Editing**: `@dnd-kit` pointer drag with a `DragOverlay` ghost (the DOM only moves on
  drop, so TradingView embeds never reload mid-drag), arrow buttons and handle keyboard
  shortcuts as the non-drag path, span picker (XS–XL), remove, library dialog, Save/Cancel/
  Reset. Bodies are `inert` while arranging. Saves go through `saveDashboardLayout`
  (session-derived, zod + normalize). Settings › Dashboard offers a list-based editor.

## Known default-theme deltas (accepted)

The token migration is pixel-identical except for a few unused or near-identical
values that were folded into the smallest sensible token set: shadcn `--popover` /
`--sidebar` (#1a1c20 → surface-2 #1e2024), `--secondary-foreground` (#ddcdff → fg),
`--chart-3` / `--chart-5` (pink/lilac → negative / fg-soft), `surface-container-lowest`
(#0c0e12 → chrome #0d1014), `surface-bright` (#37393e → surface-4), the chat FAB icon
(#006970 → on-brand) and the chat error banner (maroon 15 % → negative 15 %). None of
them is referenced by name outside `components/ui`.

## Verification

`npm test` (390), `npx tsc --noEmit`, `npm run lint` and `next build --experimental-build-mode compile`
run without a database. Visual QA (theme switch without flash, light palettes, TradingView
re-embed, drag/keyboard reorder, mobile) needs a `.env` and `npm run dev`.

## Out of scope (v2)

Custom accent colour, per-widget settings (pinned symbol chart), a tabbed Markets
mega-widget, public-profile themes, OS-driven light/dark auto-switch.
