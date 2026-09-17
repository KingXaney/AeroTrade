# Design documents

Each larger feature was designed before it was built. The specs are kept as written, with a
status line pointing at the commit that shipped them.

| Spec | What it covers | Status |
|---|---|---|
| [Minimalist redesign](specs/2026-06-16-minimalist-redesign-design.md) | The "Quiet Cyber" visual system the app shipped with: flat panels, cyan accent, mono labels | Implemented |
| [Themes + dashboard widgets](specs/2026-08-24-themes-and-dashboard-widgets.md) | Semantic theme tokens, 12 palettes × 5 styles, the widget registry, layout engine and settings page | Implemented — `22ea56c` |
| [Followed topics](specs/2026-08-29-followed-topics.md) | Open-ended news topics: search adapter, keyword matcher, refresh jobs, AI briefs, digest section, chat tools, topics-first dashboard | Implemented — `076d910` |
| [Personal news feed](specs/2026-09-17-news-feed.md) | A per-user news feed defaulting to Google News top stories: categories, regions, outlets, keywords; drives /news, the dashboard widget, /history and the digest | Implemented — `feat/news-feed` |

`screenshots/` holds the images used by the README, captured with `scripts/qa/screenshots.mjs`.
