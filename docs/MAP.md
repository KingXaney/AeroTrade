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
| `components/primitives/` | The UI vocabulary: `Panel`, `PageTitle`, `SectionHeading`, `MicroLabel`, `StatTile`, `ActionButton`, `TextField`, `RowCard`, `Disclosure`, `Switch`, `Badge`, `EmptyState`, `ConfirmDialog`, `Sheet`, `Skeleton`, `SafeMarkdown`, `Term`, `Tabs` (views inside one page, in the URL) |
| `components/shell/` | The app frame: the top bar, the icon rail and its hover cards, a section's tabs, the mobile drawer, ⌘K search, route error/loading, sign-out |
| `components/forms/` | Form fields (generic over react-hook-form values), keyword chips |
| `components/ui/` | shadcn output only — regenerable, never hand-edited |
| `lib/format.ts` | Every display formatter: money, signed %, drawdown, time-ago, ET timestamps |
| `lib/dates.ts` | Eastern-time calendar days and date arithmetic |
| `lib/text.ts` | `escapeRegExp` (the one way user text becomes a regex), hashing, URL normalising |
| `lib/rate-limit.ts` | The one Mongo-backed rate-limit counter (sign-in, sign-up, password reset, chat) and `peekRateLimit`, its read without a spend |
| `lib/day-memo.ts` | The per-day memo request-path reads share |
| `components/three/` | What a three.js scene reads from the page it draws in: WebGL, the theme stamp, reduced motion, a coarse pointer, the colour tokens as RGB (`lib/theme/css-color`) — the landing terrain and the brain's graph share it |
| `lib/ai/` | Model selection, inference, prompt helpers (chat itself is `lib/chat/`) |
| `lib/utils.ts` | `cn` only |

## Features

| Feature | Pages | Components | Logic | Actions | Jobs | Wording | Browser QA |
|---|---|---|---|---|---|---|---|
| **auth** | `(auth)/sign-in`, `sign-up`, `forgot-password`, `(reset)/reset-password` | `auth/`, `forms/` | `lib/auth/` — `server` (better-auth), `session`, `limits`, `validation`, `sign-up-options`, `sign-up-profile` | `auth.actions` | `email` (welcome) | — | `qa-auth` |
| **landing** | `/` signed out (`app/(marketing)/welcome`, shown there by `proxy.ts`), `api/landing/surface` | `landing/` — `MomentumTerrain` (the hero's 3D terrain), `terrain-scene` (three.js), `TerrainSlice`, `ThemeDemo` | `lib/landing/` — `momentum-surface` (the terrain's maths), `terrain-view` (its scale, cells, presets), `surface-store` (Tiingo first, the stored bars else); `lib/prices/tiingo` (the Tiingo client) | — | — | `copy/landing`, `terrain` | `qa-shell`, `qa-landing` |
| **home** | `/` signed in | `home/` (and the topics and learn widgets' bodies, and the landing terrain `landing/MomentumTerrain` as its first section) | `lib/home/` — `view` (accounts as rows, the next step), `page-store`; the terrain through `lib/landing/surface-store` | — | — | `copy/home`, `terrain` | `qa-home`, `qa-landing` |
| **dashboard** | `/dashboard` | `dashboard/`, `dashboard/widgets/<feature>/`, `widgets/registry.tsx` | `lib/dashboard/` — `catalog` (every widget), `loaders`, `layout`, `layout-store`, `availability` | `dashboard.actions` | — | — | `qa-topics`, `qa-styles` |
| **trading** | `/trade`, `/portfolio`, `/history`, `api/accounts/[accountId]/export` | `trading/desk`, `trading/portfolio`, `trading/accounts`, `trading/learn` | `lib/trading/` — `accounts`, `orders`, `fill`, `ledger`, `valuation`, `analytics(-store)`, `lifecycle`, `active-account`, `snapshots`, `csv`, `portfolio-page(-store)`, `learn/` | `trading.actions`, `accounts.actions` | `trading` (daily snapshots) | `copy/trade`, `portfolio`, `receipts`, `habits`, `luck`, `unpriced` | `qa-trading`, `qa-learn-account`, `qa-topics-refresh` |
| **income** | `/portfolio` (Income panel) | `income/` | `lib/income/` — `accrual` (the one accrual clock), `store` (nightly credit), `page-store` | — | `income` | `copy/income` | `qa-income` |
| **strategies** | `/strategies`, `/strategies/[slug]`, `api/strategies/[slug]/export` | `strategies/` | `lib/strategies/` — `catalog` (`CATALOG_PARAMS`), `rules/`, `engine`, `simulate`, `whatif`, `store`, `page-store`, `detail-view`, `job`, `learn/` | `strategies.actions` | `strategies` | `copy/strategies`, `board`, `cadence`, `decision`, `replay`, `simulated`, `verdict`, `whatif`, `time-in-market` | `qa-strategies`, `qa-learn` |
| **navigator** | `/brain` (Navigator panels) | `navigator/` | `lib/navigator/` — `config` (the rails), `scoring`, `allocator`, `universe`, `run` (weekly job + bootstrap), `store`, `prompts` | `navigator.actions` | `navigator` | `copy/navigator` | `qa-learn`, `qa-chat` |
| **brain** | `/brain` | `brain/` — `BrainGraph` (3D, over `graph-scene`), `BrainGraph2D` (the SVG rings without WebGL), `ActiveTheses`, `EvidenceList`, `NarrativeLeaderboard`, `BrainLegend`, `SecondOpinionCard` | `lib/brain/` — `config` (half-lives, thresholds), `decay`, `extraction`, `ingest`, `update`, `store`, `opinion`, `legend`, `event-types`, `trust` (what an outlet settles before any model label), `since-thesis`, `graph-layout` (the graph's shells) | `opinion.actions` | `brain` | `copy/brain` | `qa-learn`, `qa-trading` |
| **news** | `/news` | `news/` | `lib/news/` — `config` (`RSS_FEEDS`, kill switch), `adapters/`, `feed`, `feed-store`, `article`, `sanitize`, `briefing`, `briefing-store`, `prompts`, `page`, `page-store` | `news-feed.actions` | `news` (the morning briefing) | `copy/news` | `qa-news-feed` |
| **topics** | `/topics` (`?edit=1` is the manage view), `/topics/[slug]` | `topics/` | `lib/topics/` — `starters` (curated set), `seed`, `insert`, `manage` (the manage view's offers and cap), `refresh`, `brief`, `match`, `store`, `page-store` | `topics.actions` | `topics` | `copy/topics` | `qa-topics`, `qa-topics-refresh` |
| **learn** | `/learn`, `/learn/course/[lesson]` | `learn/`, `dashboard/widgets/learn/` | `lib/learn/` — `glossary`, `banned`, `reasons`, `course(-store)`, `missions`, `moments`, `lesson(-store)`, `facts(-store)`, `copy/` | `learn.actions` | — | `copy/*` | `qa-learn`, `qa-learn-account` |
| **games** | `/games`, `/games/puzzle`, `/games/puzzles`, `/games/puzzles/[id]`, `/games/arithmetic`, `/games/kelly`, `/games/market-making`, `/games/correlation` (pages of the Learn section) | `games/` | `lib/games/` — `puzzles` (the daily schedule; reads the bank), `answer`, `streak`, `arithmetic`, `arithmetic-round`, `interview`, `kelly`, `market-making`, `correlation`, `rounds` (what a reported round must be, and the replays), `store`, `types` | `games.actions` | — | `copy/games`, the puzzle bank `copy/puzzles/` | `qa-games` |
| **poker** | `/poker` (`?tab=equity`, `push-fold`, `pot-odds`, `river`; a page of the Learn section) | `poker/` — the tabs, `HandGrid`, `RangeEditor`, `ExploitabilityChart`, `engine` (worker or page thread), `engine.worker.ts`, `usePokerJob`, `session-store` | `lib/poker/` — `cards`, `evaluator`, `range`, `showdown`, `equity`, `preflop` (the table), `ranking`, `pushfold`, `pot-odds`, `river/` (`tree`, `solver`, `view`), `jobs`, `drive`, `protocol`; the generated `data/` | — | — | `copy/poker` | `qa-poker` |
| **chat** | `api/chat`, `api/chat/usage` | `chat/` | `lib/chat/` — `system-prompt`, `tools`, `tool-copy`, `limits`, `usage`, `usage-store`, `errors`, `explain`, `learner-hooks`, `ask`, `robot-tips` | — | — | `copy/chat`, `copy/robot` | `qa-chat`, `qa-chat-tutor` |
| **email** | — | — | `lib/email/` — `send` (transport), `layout` (the frame and blocks), `templates` (welcome, reset), `prompts`, `digest-summary`, `digest-view`, `digest-render`, `digest` (assembly), `digest-store` (the daily claim), `welcome`, `recipients`, `sections/`; `lib/site` (name, address) | — | `email` | `copy/email`; the lesson section reuses `copy/lesson` | `qa-email` (also `npm run email:preview`) |
| **jobs** | `api/inngest`, `/brain` (status strip) | `jobs/` | `lib/jobs/` — `registry` (every job's id, event, cron, status label), `functions/`, `health`, `job-runs`, `steps`, `client` | — | — | — | `qa-income`, `qa-strategies` |
| **prices** | — | — | `lib/prices/` — `store` (every bar/dividend/T-bill read), `yahoo`, `stooq`, `finnhub` (quotes, profiles, financials, search), `market-hours`, `sectors`, `total-return` | `stocks.actions` (quotes) | `strategies`, `income` | `copy/market` | `qa-income`, `qa-strategies` |
| **stocks** | `/stocks/[symbol]`, `/watchlist`, `/markets` | `stocks/` | `lib/stocks/` — `watchlist-store`, `watchlist`, `watchlist-page-store`, `key-numbers`, `rules-see`, `tradingview`, `popular` | `stocks.actions`, `watchlist.actions` | — | `copy/key-numbers`, `rules-see`, `watchlist` | `qa-strategies`, `qa-styles` |
| **friends** | `/friends`, `/friends/[id]` | `friends/` | `lib/friends/` — `store` | `friends.actions` | — | — | `qa-shell` |
| **settings** | `/settings` | `settings/`, `theme/` | `lib/settings/preferences-store`, `lib/theme/` — `palettes`, `styles`, `presets`, `resolve`, `store` | `preferences.actions`, `appearance.actions` | — | — | `qa-topics`, `qa-chat` |
| **shell** | `app/(root)/layout.tsx` | `shell/` | `lib/shell/` — `navigation` (every nav link), `sidebar` (the rail's two cards), `shell-store`, `news-seen` (the News dot clears in place) | — | — | `copy/shell` | `qa-shell`, `qa-styles`, `qa-topics` (the News card and its dot) |

## To change…, edit…

| To change… | Edit |
|---|---|
| A quant strategy's rule or parameter | `lib/strategies/catalog.ts` (`CATALOG_PARAMS` — explainers and column labels are built from it) and the rule in `lib/strategies/rules/<slug>.ts`. The reason decoder `lib/learn/reasons.ts` has a round-trip test that fails if a reason's wording changes |
| Add a quant strategy | A rule in `lib/strategies/rules/`, its entry in `lib/strategies/catalog.ts`; the compiler then points at every `Record<StrategyId, …>` table (`rules/index.ts`, `whatif.ts`, board narration) |
| The AI Navigator's caps, cash floor, thresholds | `lib/navigator/config.ts` — the glossary and the /brain legend read them |
| When a job runs | `lib/jobs/registry.ts` (`crons`); never rename an id or event there (Inngest keys runs on them) |
| The daily email's layout | `lib/email/layout.ts` (the frame and its blocks), `lib/email/digest-view.ts` (sections, links), `lib/email/digest-render.ts` (HTML and text), `lib/email/prompts.ts` (what the model is asked), `lib/email/sections/` (topics, lesson), `lib/learn/copy/email.ts` (every fixed sentence) |
| The chat's prompt or a chat tool | `lib/chat/system-prompt.ts`, `lib/chat/tools.ts` + its description in `lib/chat/tool-copy.ts`, the name in `lib/chat/types.ts` (`ChatToolName`), its chip label in `components/chat/ChatToolChip.tsx` |
| Chat rate limits | `lib/chat/limits.ts` (defaults; `CHAT_*_LIMIT` env overrides). The panel's caption reads whatever they resolve to through `lib/chat/usage-store.ts`, so a new limit needs no copy change |
| The robot's tips, or when it speaks | `lib/learn/copy/robot.ts` (`ROBOT_TIPS`; the first entry is the lead tip), the timings in `lib/chat/robot-tips.ts` |
| A theme's colours, or add a theme | `lib/theme/palettes.ts` (palettes), `lib/theme/styles.ts` + `app/globals.css` (visual styles) |
| Add a dashboard widget | Its entry in `lib/dashboard/catalog.ts`, its data in `lib/dashboard/loaders.ts`, its component in `components/dashboard/widgets/<feature>/` and one line in `components/dashboard/widgets/registry.tsx` (`Record<WidgetId, …>` makes the compiler insist) |
| A sentence the app teaches, or a definition | `lib/learn/copy/<feature>.ts`; definitions only in `lib/learn/glossary.ts` |
| A daily puzzle, or add one | Its text and answer in `lib/learn/copy/puzzles/<category>.ts`, an independent check of its answer in `lib/games/__tests__/puzzle-checks.ts`, and its id appended to `PUZZLE_SCHEDULE` in `lib/learn/copy/puzzles/index.ts` — append only: a test pins the order of the days already shown |
| A game's rules, or add a game | Its engine in `lib/games/<game>.ts` (pure, seeded), its report and how it is scored in `lib/games/rounds.ts` (`GAMES`, `RoundInputSchema`, `keptRound`), its page `app/(root)/games/<game>/page.tsx` and component in `components/games/`, its hub card in `app/(root)/games/page.tsx`, its copy in `lib/learn/copy/games.ts` |
| The streak, or what counts for a day | `lib/games/streak.ts` (derived from the solved rows, never stored); which attempt is a day's is `lib/games/puzzles.contextFor`; the writes are `lib/actions/games.actions.ts` |
| A poker job, or how the page runs it | The job in `lib/poker/jobs.ts` (`pokerJob`); the messages in `lib/poker/protocol.ts` (bump `ENGINE_PROTOCOL`); the worker `components/poker/engine.worker.ts`; the choice of engine and the page-thread fallback in `components/poker/engine.ts` |
| Poker equity's methods, or the preflop table | `lib/poker/equity.ts` (`planEquity` picks the method; `EXACT_BUDGET`, `MC_BLOCK`, `MC_TARGET_SE`); the table and its ranking are regenerated by `node scripts/poker-preflop-equity.mjs`, never edited |
| The river solver, its tree limits or when it stops | The tree in `lib/poker/river/tree.ts` (`RIVER_LIMITS`, how sizes become amounts); the solve in `lib/poker/river/solver.ts` (`RIVER_TARGET_PCT`, `RIVER_MAX_ITERATIONS`, the DCFR constants); the River tab's presets in `components/poker/RiverTab.tsx` |
| The push/fold solver, its stacks or its tolerance | `lib/poker/pushfold.ts` (`PUSH_FOLD_STACK`, `PUSH_FOLD_ANTE`, `PUSH_FOLD_TOLERANCE`); the antes offered are `PUSH_FOLD_ANTES` in `lib/learn/copy/poker.ts` |
| A course lesson, or add one | Its text in `lib/learn/copy/course/<module>.ts` (an id is never renamed); the order and the modules in `lib/learn/course.ts`; the landing page's syllabus and Home's next lesson follow |
| The landing page's terrain | Its maths in `lib/landing/momentum-surface.ts` (lookbacks, the σ window, the notable threshold), its colour stops, cells and camera presets in `lib/landing/terrain-view.ts`, the scene in `components/landing/terrain-scene.ts`, its colours as the `--terrain-*` tokens in `app/globals.css`, its sentences in `lib/learn/copy/terrain.ts`; the Tiingo client in `lib/prices/tiingo.ts` (`TIINGO_TOKEN`, the publication hour, the hour-long fetch cache), the read and its cache in `lib/landing/surface-store.ts`, the route `app/api/landing/surface/route.ts` |
| How every panel / button / heading looks | `components/primitives/` (`Panel`, `ActionButton`, `PageTitle`, …) and the tokens in `app/globals.css` — per visual style: the `--panel-*`, `--card-*`, `--chrome-*`, `--label-*`, `--heading-*`, `--control-*` and `--motion-*` tokens in each `[data-style]` block |
| The order ticket | `components/trading/desk/OrderPanel.tsx`, its maths in `lib/trading/order-math.ts`, the fill in `lib/trading/orders.ts` + `fill.ts`, the action in `lib/actions/trading.actions.ts` |
| How interest and dividends are credited | `lib/income/accrual.ts` (the only accrual clock — AGENTS.md invariant 11), `lib/income/store.ts` (the nightly job) |
| News sources | `lib/news/config.ts` (`RSS_FEEDS`, caps, the Google kill switch), `lib/news/adapters/` |
| The morning briefing | `lib/news/prompts.ts` (what the model is asked), `lib/news/briefing.ts` (what is kept of its answer, and the limits), `lib/jobs/functions/news.ts` (the job), `components/news/NewsBriefing.tsx` |
| The news page's sections | `lib/news/page.ts` (which sections, how many stories, the one-story-once rule), `app/(root)/news/page.tsx` |
| Add a page to the nav | `lib/shell/navigation.ts` — a page of a section in `NAV_SECTIONS` (the rail, the section's tabs, the drawer) or an account page in `ACCOUNT_PAGES` (the avatar menu); ⌘K and Quick Links read both through `NAV_PAGES` |
| The stock page | `app/(root)/stocks/[symbol]/page.tsx`, `components/stocks/`, the embeds in `lib/stocks/tradingview.ts` |
| Sign-in / sign-up rules | `lib/auth/validation.ts` (email/password rules), `lib/auth/limits.ts` (rate limits), `lib/auth/server.ts` (better-auth), `lib/actions/auth.actions.ts` |
| A stored field | `database/models/<model>.model.ts`, its type in `lib/<feature>/types.ts`, the store named in `database/models/README.md` |
| What "new" means on a topic badge or the rail's News dot | `lib/topics/config.ts` (`UNSEEN_WINDOW_HOURS`, `UNSEEN_COUNT_CAP`, `unseenFloor`); the dot's stamp is `newsSeenAt` in `database/models/user-preferences.model.ts`, written by `lib/actions/news-feed.actions.markNewsSeen`, and the card's sentences are `lib/learn/copy/shell.ts` |
| The default followed topics, and what the manage view offers | `lib/topics/starters.ts` (`STARTER_TOPICS`, `DEFAULT_TOPIC_NAMES`); `lib/topics/manage.ts` (`offeredTopics`) |
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
