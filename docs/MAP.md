# Repo map

Where every feature lives, and where to go to change something. Every feature has **one name**,
used in every layer:

| Layer | Path | Holds |
|---|---|---|
| Pages | `app/(root)/<route>/page.tsx` | Composes one `lib` read and components; no business logic |
| UI | `components/<feature>/` | That feature's components |
| Logic | `lib/<feature>/` | Pure logic, plus `store.ts` / `*-store.ts` (anything that touches Mongo) and `types.ts` |
| Client entry points | `lib/actions/<feature>.actions.ts` | `'use server'` actions; each reads the user from the session, never from the caller |
| Wording | `lib/learn/copy/<feature>.ts` | Every learner-facing sentence, held to the no-advice list (AGENTS.md invariant 12) |
| Scheduled jobs | `lib/jobs/functions/<feature>.ts` | Thin Inngest wrappers; the step bodies live in `lib/<feature>/` |
| Data | `database/models/` | One Mongoose model per file — [its README](../database/models/README.md) maps model → feature → store |
| Unit tests | `lib/<feature>/__tests__/` | Vitest, next to the code they test |
| Browser QA | `scripts/qa/qa-<feature>.mjs` | Playwright against an in-memory Mongo — `npm run qa` |
| Design docs | `docs/specs/` | Why the larger features are built the way they are |

Shared pieces that belong to no single feature:

| Path | What |
|---|---|
| `components/primitives/` | The UI vocabulary: `Panel`, `PageTitle`, `SectionHeading`, `MicroLabel`, `StatTile`, `ActionButton`, `TextField`, `RowCard`, `Disclosure`, `Switch`, `Badge`, `EmptyState`, `ConfirmDialog`, `Sheet`, `Skeleton`, `SafeMarkdown`, `Term` |
| `components/shell/` | The app frame: the top bar, the icon rail and its hover cards, a section's tabs, the mobile drawer, ⌘K search, route error/loading, sign-out |
| `components/forms/` | Form fields (generic over react-hook-form values), keyword chips |
| `components/ui/` | shadcn output only — regenerable, never hand-edited |
| `lib/format.ts` | Every display formatter: money, signed %, drawdown, time-ago, ET timestamps |
| `lib/dates.ts` | Eastern-time calendar days and date arithmetic |
| `lib/text.ts` | `escapeRegExp` (the one way user text becomes a regex), hashing, URL normalising |
| `lib/rate-limit.ts` | The one Mongo-backed rate-limit counter (sign-in, sign-up, password reset, chat) |
| `lib/day-memo.ts` | The per-day memo request-path reads share |
| `lib/ai/` | Model selection, inference, prompt helpers (chat itself is `lib/chat/`) |
| `lib/utils.ts` | `cn` only |

## Features

| Feature | Pages | Components | Logic | Actions | Jobs | Wording | Browser QA |
|---|---|---|---|---|---|---|---|
| **auth** | `(auth)/sign-in`, `sign-up`, `forgot-password`, `(reset)/reset-password` | `auth/`, `forms/` | `lib/auth/` — `server` (better-auth), `session`, `limits`, `validation`, `sign-up-options`, `sign-up-profile` | `auth.actions` | `email` (welcome) | — | `qa-auth` |
| **home** | `/` | `home/` (and the topics and learn widgets' bodies) | `lib/home/` — `view` (accounts as rows, the next step), `page-store` | — | — | `copy/home` | `qa-home` |
| **dashboard** | `/dashboard` | `dashboard/`, `dashboard/widgets/<feature>/`, `widgets/registry.tsx` | `lib/dashboard/` — `catalog` (every widget), `loaders`, `layout`, `layout-store`, `availability` | `dashboard.actions` | — | — | `qa-topics`, `qa-styles` |
| **trading** | `/trade`, `/portfolio`, `/history`, `api/accounts/[accountId]/export` | `trading/desk`, `trading/portfolio`, `trading/accounts`, `trading/learn` | `lib/trading/` — `accounts`, `orders`, `fill`, `ledger`, `valuation`, `analytics(-store)`, `lifecycle`, `active-account`, `snapshots`, `csv`, `portfolio-page(-store)`, `learn/` | `trading.actions`, `accounts.actions` | `trading` (daily snapshots) | `copy/trade`, `portfolio`, `receipts`, `habits`, `luck`, `unpriced` | `qa-trading`, `qa-learn-account`, `qa-topics-refresh` |
| **income** | `/portfolio` (Income panel) | `income/` | `lib/income/` — `accrual` (the one accrual clock), `store` (nightly credit), `page-store` | — | `income` | `copy/income` | `qa-income` |
| **strategies** | `/strategies`, `/strategies/[slug]`, `api/strategies/[slug]/export` | `strategies/` | `lib/strategies/` — `catalog` (`CATALOG_PARAMS`), `rules/`, `engine`, `simulate`, `whatif`, `store`, `page-store`, `detail-view`, `job`, `learn/` | `strategies.actions` | `strategies` | `copy/strategies`, `board`, `cadence`, `decision`, `replay`, `simulated`, `verdict`, `whatif`, `time-in-market` | `qa-strategies`, `qa-learn` |
| **navigator** | `/brain` (Navigator panels) | `navigator/` | `lib/navigator/` — `config` (the rails), `scoring`, `allocator`, `universe`, `run` (weekly job + bootstrap), `store`, `prompts` | `navigator.actions` | `navigator` | `copy/navigator` | `qa-learn`, `qa-chat` |
| **brain** | `/brain` | `brain/` | `lib/brain/` — `config` (half-lives, thresholds), `decay`, `extraction`, `ingest`, `update`, `store`, `opinion`, `legend`, `event-types`, `since-thesis` | `opinion.actions` | `brain` | `copy/brain` | `qa-learn`, `qa-trading` |
| **news** | `/news` | `news/` | `lib/news/` — `config` (`RSS_FEEDS`, kill switch), `adapters/`, `feed`, `feed-store`, `article`, `sanitize` | `news-feed.actions` | — | — | `qa-news-feed` |
| **topics** | `/topics`, `/topics/[slug]` | `topics/` | `lib/topics/` — `starters` (curated set), `seed`, `insert`, `refresh`, `brief`, `match`, `store`, `page-store` | `topics.actions` | `topics` | `copy/topics` | `qa-topics`, `qa-topics-refresh` |
| **learn** | `/learn` | `learn/`, `dashboard/widgets/learn/` | `lib/learn/` — `glossary`, `banned`, `reasons`, `missions`, `moments`, `lesson(-store)`, `quiz(-store)`, `facts(-store)`, `copy/` | `learn.actions` | — | `copy/*` | `qa-learn`, `qa-learn-account` |
| **chat** | `api/chat` | `chat/` | `lib/chat/` — `system-prompt`, `tools`, `tool-copy`, `limits`, `errors`, `explain`, `learner-hooks`, `ask` | — | — | `copy/chat` | `qa-chat`, `qa-chat-tutor` |
| **email** | — | — | `lib/email/` — `send` (transport), `templates`, `prompts`, `digest`, `welcome`, `recipients`, `sections/` | — | `email` | lesson section reuses `copy/lesson` | — (unit tests: the sections are pure) |
| **jobs** | `api/inngest`, `/brain` (status strip) | `jobs/` | `lib/jobs/` — `registry` (every job's id, event, cron, status label), `functions/`, `health`, `job-runs`, `steps`, `client` | — | — | — | `qa-income`, `qa-strategies` |
| **prices** | — | — | `lib/prices/` — `store` (every bar/dividend/T-bill read), `yahoo`, `stooq`, `finnhub` (quotes, profiles, financials, search), `market-hours`, `sectors`, `total-return` | `stocks.actions` (quotes) | `strategies`, `income` | `copy/market` | `qa-income`, `qa-strategies` |
| **stocks** | `/stocks/[symbol]`, `/watchlist`, `/markets` | `stocks/` | `lib/stocks/` — `watchlist-store`, `watchlist`, `watchlist-page-store`, `key-numbers`, `rules-see`, `tradingview`, `popular` | `stocks.actions`, `watchlist.actions` | — | `copy/key-numbers`, `rules-see`, `watchlist` | `qa-strategies`, `qa-styles` |
| **friends** | `/friends`, `/friends/[id]` | `friends/` | `lib/friends/` — `store` | `friends.actions` | — | — | `qa-shell` |
| **settings** | `/settings` | `settings/`, `theme/` | `lib/settings/preferences-store`, `lib/theme/` — `palettes`, `styles`, `presets`, `resolve`, `store` | `preferences.actions`, `appearance.actions` | — | — | `qa-topics`, `qa-chat` |
| **shell** | `app/(root)/layout.tsx` | `shell/` | `lib/shell/` — `navigation` (every nav link), `sidebar`, `shell-store` | — | — | — | `qa-shell`, `qa-styles` |

## To change…, edit…

| To change… | Edit |
|---|---|
| A quant strategy's rule or parameter | `lib/strategies/catalog.ts` (`CATALOG_PARAMS` — explainers and column labels are built from it) and the rule in `lib/strategies/rules/<slug>.ts`. The reason decoder `lib/learn/reasons.ts` has a round-trip test that fails if a reason's wording changes |
| Add a quant strategy | A rule in `lib/strategies/rules/`, its entry in `lib/strategies/catalog.ts`; the compiler then points at every `Record<StrategyId, …>` table (`rules/index.ts`, `whatif.ts`, board narration) |
| The AI Navigator's caps, cash floor, thresholds | `lib/navigator/config.ts` — the glossary and the /brain legend read them |
| When a job runs | `lib/jobs/registry.ts` (`crons`); never rename an id or event there (Inngest keys runs on them) |
| The daily email's layout | `lib/email/templates.ts` (HTML frame), `lib/email/prompts.ts` (what the model writes), `lib/email/sections/` (topics, lesson), `lib/email/digest.ts` (assembly) |
| The chat's prompt or a chat tool | `lib/chat/system-prompt.ts`, `lib/chat/tools.ts` + its description in `lib/chat/tool-copy.ts`, the name in `lib/chat/types.ts` (`ChatToolName`), its chip label in `components/chat/ChatToolChip.tsx` |
| Chat rate limits | `lib/chat/limits.ts` (defaults; `CHAT_*_LIMIT` env overrides) |
| A theme's colours, or add a theme | `lib/theme/palettes.ts` (palettes), `lib/theme/styles.ts` + `app/globals.css` (visual styles) |
| Add a dashboard widget | Its entry in `lib/dashboard/catalog.ts`, its data in `lib/dashboard/loaders.ts`, its component in `components/dashboard/widgets/<feature>/` and one line in `components/dashboard/widgets/registry.tsx` (`Record<WidgetId, …>` makes the compiler insist) |
| A sentence the app teaches, or a definition | `lib/learn/copy/<feature>.ts`; definitions only in `lib/learn/glossary.ts` |
| How every panel / button / heading looks | `components/primitives/` (`Panel`, `ActionButton`, `PageTitle`, …) and the tokens in `app/globals.css` — per visual style: the `--panel-*`, `--card-*`, `--chrome-*`, `--label-*`, `--heading-*`, `--control-*` and `--motion-*` tokens in each `[data-style]` block |
| The order ticket | `components/trading/desk/OrderPanel.tsx`, its maths in `lib/trading/order-math.ts`, the fill in `lib/trading/orders.ts` + `fill.ts`, the action in `lib/actions/trading.actions.ts` |
| How interest and dividends are credited | `lib/income/accrual.ts` (the only accrual clock — AGENTS.md invariant 11), `lib/income/store.ts` (the nightly job) |
| News sources | `lib/news/config.ts` (`RSS_FEEDS`, caps, the Google kill switch), `lib/news/adapters/` |
| Add a page to the nav | `lib/shell/navigation.ts` — a page of a section in `NAV_SECTIONS` (the rail, the section's tabs, the drawer) or an account page in `ACCOUNT_PAGES` (the avatar menu); ⌘K and Quick Links read both through `NAV_PAGES` |
| The stock page | `app/(root)/stocks/[symbol]/page.tsx`, `components/stocks/`, the embeds in `lib/stocks/tradingview.ts` |
| Sign-in / sign-up rules | `lib/auth/validation.ts` (email/password rules), `lib/auth/limits.ts` (rate limits), `lib/auth/server.ts` (better-auth), `lib/actions/auth.actions.ts` |
| A stored field | `database/models/<model>.model.ts`, its type in `lib/<feature>/types.ts`, the store named in `database/models/README.md` |
| The default followed topics | `lib/topics/starters.ts` (`STARTER_TOPICS`, `DEFAULT_TOPIC_NAMES`) |
| The brain's decay / half-lives | `lib/brain/config.ts` (`HALF_LIFE_*`), maths in `lib/brain/decay.ts` |
| Any formatting of money, % or dates | `lib/format.ts` (display), `lib/dates.ts` (ET calendar) |
| Run the browser QA | `npm run qa` (all, ~5 min) or `npm run qa -- <suite>` — the suites and what each seeds are in `scripts/qa/README.md` |

## Conventions that make the map hold

- A module that touches Mongo is named `store.ts` or `<topic>-store.ts`; everything else under
  `lib/` is pure and unit-tested (AGENTS.md invariant 1).
- Shared types are exported from `lib/<feature>/types.ts` and imported where used — no global types.
- `'use server'` files export only session-derived actions; a read that takes a user id lives in
  the feature's store.
- A route's page composes one lib read (`get…PageView`) plus components.
- Moving a file: `node scripts/move.mjs moves.json` rewrites every import, mock, script path and
  doc mention.
- A change meant to look identical: `scripts/qa/visual-sweep.mjs` before and after, then
  `scripts/qa/visual-diff.mjs`.
