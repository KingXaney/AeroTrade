---
paths:
  - "app/(root)/settings/**"
  - "components/settings/**"
  - "lib/settings/**"
  - "lib/theme/**"
  - "components/theme/**"
  - "lib/actions/appearance.actions.ts"
  - "lib/actions/preferences.actions.ts"
  - "lib/learn/copy/settings.ts"
---

# settings

Contracts of this feature that a map cannot show: a part of `AGENTS.md`, kept in a file of its
own so it loads only beside the files its `paths:` name. A `### name` in the text is that
feature's file in this folder; Shared, owner and the numbered invariants are in `AGENTS.md`;
the map is `docs/MAP.md`.

- `/settings` shows one section at a time (`?tab=`), each reading only its own data. The daily
  email's `/settings#notifications` is sent to its section by
  `components/settings/SettingsHashRedirect`, as `/learn#term` is by `components/learn/LearnRedirect`.

- `lib/theme/store` is the saved theme's read and its cookie mirror.
- The app has one look, so a theme is two choices: a palette (`lib/theme/palettes`) and Reduce
  motion (`lib/theme/resolve`, `Theme`). `lib/theme/resolve.resolveTheme` reads those two keys
  and no other, and `lib/theme/resolve.isThemeInput` — what
  `lib/actions/appearance.actions.setAppearance` accepts — checks the same two: the `style` that
  a document saved before the one look still holds, or a tab opened before it still posts, is
  ignored, never an error. No migration removes the stored field, and a save sets the two fields
  by path and leaves a stored style where it is: it is the record of that reader's choice for a
  rollback, and what an older build reads while a preview shares production's database.
- The theme cookie is written `v2:<palette>:<0|1>`. `lib/theme/resolve.decodeThemeCookie` is
  whole-value and reads two shapes: that one, and `v1:<palette>:<style>:<0|1>` where the style is
  one of the five ids v1 ever wrote (a private list there, dated: a cookie lives a year from its
  last write, so the v1 branch goes a year after this shipped) — the style dropped, the palette
  and the motion choice kept. Anything else is the default theme. `app/layout.tsx` is the
  cookie's only parser, so the route groups where `components/theme/ThemeSync` is not mounted
  (the landing and auth pages, `/play`, the office) read an old cookie exactly as the app does.
- `app/layout.tsx` stamps `data-palette`, `data-mode` and `data-motion` from the theme, and
  `components/theme/ThemeProvider.applyToDocument` writes the same three. No attribute names a
  style: the one look's tokens are `:root`'s and its rules the stylesheet's own (which layer holds
  what is Shared in `AGENTS.md`), and `lib/theme/__tests__/motion-guards.test.ts` fails if
  `data-style` is written there again. A preview (`useTheme().preview`) paints the whole theme and
  saves nothing: a hover or a focus on a palette chip in Settings, a click in the landing page's
  `components/landing/ThemeDemo`. Appearance's sentences are `lib/learn/copy/settings`
  (`APPEARANCE_COPY`).
- Beside the theme's own tests, `lib/theme/__tests__` holds the look every page shares:
  `lib/theme/__tests__/density.test.ts` (the density tokens, each declared once, and the frame they
  size: ### shell), `lib/theme/__tests__/motion-guards.test.ts` (both reduced-motion guards and the
  `.fx-*` vocabulary) and `lib/theme/__tests__/fonts.test.ts` (the three faces), each described
  under Shared in `AGENTS.md`; why the look is one, and compact, is
  `docs/specs/2026-11-22-one-look.md`.
