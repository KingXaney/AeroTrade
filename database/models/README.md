# Models

One Mongoose model per file, named after the stored entity. The folder is flat on purpose — the
entity name is the obvious key — so this table says which feature owns each model and where its
reads and writes live. Change a field here, then in the store module named beside it.

| Model | Feature | Read and written by |
|---|---|---|
| `paper-account` | trading | `lib/trading/accounts`, `ledger`, `valuation`, `lifecycle`, `orders` |
| `paper-trade` | trading | `lib/trading/ledger`, `orders`, `lifecycle` |
| `account-snapshot` | trading | `lib/trading/snapshots` (the nightly write), `valuation`, `analytics-store` |
| `account-income` | income | `lib/income/store` (the nightly credit), `lib/income/page-store` |
| `benchmark-snapshot` | prices | `lib/prices/benchmark-store` (cold-start fallback for the SPY benchmark) |
| `price-bar` | prices | `lib/prices/store` — every bar, dividend and T-bill read goes through it |
| `price-series-meta` | prices | `lib/prices/store` |
| `strategy-run` | strategies | `lib/strategies/store` (the daily job), `page-store` (the pages) |
| `strategy-state` | strategies | `lib/strategies/store` |
| `strategy-backtest` | strategies | `lib/strategies/store`, `page-store` |
| `ai-navigator` | navigator | `lib/navigator/store` (enrolment), `run` (the weekly job) |
| `suggestion-set` | navigator | `lib/navigator/store`, `run`; the digest reads the latest set |
| `brain-entity` | brain | `lib/brain/store`, `update`, `ingest` |
| `news-item` | brain | `lib/brain/ingest` (the daily sweep), `store` (evidence reads) |
| `second-opinion` | brain | `lib/brain/opinion` |
| `market-briefing` | news | `lib/news/briefing-store` (the morning job's write, the page's read) |
| `topic` | topics | `lib/topics/store`, `insert` (the one write path), `seed`, `refresh` |
| `topic-article` | topics | `lib/topics/store`, `refresh` |
| `watchlist` | stocks | `lib/stocks/watchlist-store`; `lib/actions/watchlist.actions` adds and removes |
| `friendship` | friends | `lib/friends/store`; `lib/actions/friends.actions` writes |
| `user-preferences` | settings | `lib/settings/preferences-store`, plus each feature's own sub-document: `lib/dashboard/layout-store` (layout), `lib/theme/store` (appearance), `lib/news/feed-store` (feed, the `newsSeenAt` stamp), `lib/strategies/follows`, `lib/learn` stores (`learn`) |
| `job-run` | jobs | `lib/jobs/job-runs` (each run's stamp), `lib/jobs/health` (the status strip) |
| `game-round` | games | `lib/games/store` (records and recent rounds); `lib/actions/games.actions.recordGameRound` writes |
| `puzzle-solve` | games | `lib/games/store` (the streak, today's puzzle, the archive); `lib/actions/games.actions` writes |
| `rate-limit` | auth | `lib/rate-limit` — the one counter sign-in, sign-up, password reset and the chat spend; `peekRateLimit` reads a window for the chat's caption without spending it |

Indexes the paper account, trade and snapshot models declare are also listed in
`scripts/migration-indexes.mjs`, which `npm run migrate:accounts` builds and
`lib/__tests__/migration-indexes.test.ts` holds equal to the models.
