# Themes + Customizable Dashboard Widgets — Design Spec

**Date:** 2026-08-24
**Status:** Implemented on `feature/themes-dashboard-widgets`

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
- **Styles** are hand-written `[data-style="…"]` blocks (minimal = `:root` defaults,
  futuristic, liquid-glass, brutalist, soft) that only set style tokens plus their own
  effects (shimmer/glow/particles, glass specular + drifting blobs, hard shadows, …).
  Reduced motion is honoured from the OS and from `html[data-motion="reduced"]`.
- **Persistence**: `UserPreferences.appearance` (Mongo) is the source of truth; the
  `aero-theme` cookie (`v1:<palette>:<style>:<0|1>`, httpOnly, 1 year) mirrors it so
  `app/layout.tsx` renders `<html data-palette data-style data-mode data-motion class="dark?">`
  with zero flash. `setAppearance` (session-derived, whitelisted) writes both; the cookie
  write re-renders the layouts. `ThemeSync` adopts the account's theme on a device whose
  cookie is stale; sign-out clears the cookie.
- **Client**: `ThemeProvider` (preview → `document.documentElement` only; commit → server
  action) wraps all of `<body>` so the toaster and `ThemeBackdrop` can read it.
  `useThemeTokens()` feeds canvas/SVG/TradingView consumers from the committed theme only.
- **Migration**: `scripts/codemod-theme-tokens.mjs` rewrote 497 hex / 172 rgba / 240
  inline-font literals to tokens (Tailwind arbitrary classes → token utilities, inline
  styles → `var()`/`color-mix()`, fonts → `--type-*`). Gain/loss colours were split by
  hand (`getChangeColorClass`, change badges, `sentimentColor`); medal colours stay literal.

## Dashboard widgets

- **Registry** (`lib/dashboard/widgets.ts`, pure): 28 widgets with allowed spans on a
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
