# Design documents

[MAP.md](MAP.md) is the repo map: every feature's files in every layer, and what to edit to change
what. Start there.

Each larger feature was designed before it was built. The specs are kept as written, with a
status line pointing at the commit that shipped them; the status column below matches each one.

| Spec | What it covers | Status |
|---|---|---|
| [Minimalist redesign](specs/2026-06-16-minimalist-redesign-design.md) | The "Quiet Cyber" visual system the app shipped with: flat panels, cyan accent, mono labels | Implemented — `064689e`; superseded in part by Themes (now the `quiet-cyber` palette) |
| [Themes + dashboard widgets](specs/2026-08-24-themes-and-dashboard-widgets.md) | Semantic theme tokens, 12 palettes × 5 styles, the widget registry, layout engine and settings page | Implemented — `22ea56c` |
| [Followed topics](specs/2026-08-29-followed-topics.md) | Open-ended news topics: search adapter, keyword matcher, refresh jobs, AI briefs, digest section, chat tools, topics-first dashboard | Implemented — `076d910`; superseded in part by Default topics |
| [Personal news feed](specs/2026-09-17-news-feed.md) | A per-user news feed defaulting to Google News top stories: categories, regions, outlets, keywords; drives /news, the dashboard widget, /history and the digest | Implemented — `cfe99c1` |
| [Quant strategies](specs/2026-09-21-quant-strategies.md) | Eight classic quant strategies paper-traded live by deterministic rules with a simulated warm-up: engine, catalog, daily job, Yahoo-first price bars, /strategies pages and widget | Implemented — `4ea3fa0` |
| [Default topics](specs/2026-09-25-default-topics.md) | Six topics seeded at sign-up instead of a setup wall, the once-only `topicsSeededAt` marker, and followed topics folded into /news, the news widget and /history | Implemented — `c24c766` |
| [Brokerage income](specs/2026-09-25-brokerage-income.md) | Interest on idle cash at the 13-week T-bill rate, real dividends inferred from adjclose, SPY total-return benchmark — every account including the strategies' backtests, back-credited from inception | Implemented — `e1ac613` |
| [Learn](specs/2026-09-27-learn.md) | The app teaches from its own data: a glossary behind every number, a no-advice word list every prompt and sentence is held to, a First-week checklist, /learn, Guess the Verdict, "What the rule saw" with every reason decoded, "Read this board", the return split and a receipt for every fill and income line, Today's lesson (on the dashboard and in the daily email), a rate-limited chat tutor grounded in the glossary, an order ticket that states its consequences down to the interest on the cash left, a daily quiz, time in the market on SPY, a what-if lab on every rule with a setting to move, trading habits and luck or skill, the brain's legend and the Navigator's reasons decoded, and the stock page in plain words | Implemented — `37400a4`, `e7fe3ec`, `56658f3` |

`screenshots/` holds the images used by the README, captured with `scripts/qa/screenshots.mjs` (`npm run qa -- screenshots`).
