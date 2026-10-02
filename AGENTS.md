# AeroTrade — notes for contributors and coding agents

## What this is

A paper-trading terminal with an AI news brain (Next.js 16 App Router, React 19, TypeScript,
Tailwind v4, MongoDB/Mongoose, better-auth, Inngest, Vercel AI SDK). See README.md for the
product tour and docs/specs/ for the design documents behind the larger features.

Words: a user's own paper account is an **account** — in what users see, in identifiers
(`bestAccount`, `accountsCount`) and in widget categories (`accounts`). **Strategy** means only the
eight rule-based quant strategies (`lib/strategies`, `/strategies`, category `strategies`), so
`PaperTrade.source: 'strategy'` is a quant fill. Stored values keep their spelling: accounts made
before the rename keep the name "Main Strategy" (new ones are "Main account", `DEFAULT_ACCOUNT_NAME`).

## Commands

- `npm run check` — lint + typecheck + unit tests; CI runs these, then `build:check`
- `npm run lint` / `npm run typecheck` — eslint / `tsc --noEmit`, the first two parts of `check`
- `npm test` / `npm run test:watch` — vitest, node environment, `lib/**/__tests__` only
- `npm run build:check` — compile-only Next build; needs no database or keys
- `npm run build` / `npm start` — the production build and its server
- `npm run dev` + `npx inngest-cli@latest dev -u http://localhost:3000/api/inngest` — app + jobs
- `npm run trigger -- <brain|navigator|news|snapshots|income|topics|briefs|strategies|strategies-preview|strategies-resimulate>` — fire a job locally
- `npm run test:db` — connect to `MONGODB_URI` (from `.env`) and print the database and host it reached
- `npm run migrate:accounts` — the idempotent multi-account migration: builds the indexes in `scripts/migration-indexes.mjs` and drops the ones they replaced (run it on every database, again whenever that list changes)
- `npm run opinion:local` — the brain's Second Opinion from your Claude subscription through the Claude Code CLI, written straight to the database (`.env.example` lists the other ways)
- `npm run qa` — browser QA (`scripts/qa/run.sh`): an in-memory MongoDB, `next dev` and the Inngest dev server, then every suite or the named ones (`npm run qa -- learn`); one suite per feature, listed in `scripts/qa/README.md`

## Where things live

[docs/MAP.md](docs/MAP.md) is the map: every feature's folder in every layer, and "To change…,
edit…". Below, by the same feature names, are only the contracts a map cannot show (dashboard,
friends and shell keep none beyond Shared and the invariants).
`lib/__tests__/docs-map.test.ts` fails when a path named here or in the map stops existing.

### Shared

- A heavy page composes one lib read that returns its view, shaped by a pure sibling: `/portfolio`
  `lib/trading/portfolio-page-store` (`lib/trading/portfolio-page`), `/strategies/[slug]`
  `lib/strategies/page-store.getStrategyPageView` (`lib/strategies/detail-view`), both topics pages
  `lib/topics/page-store`, `/watchlist` `lib/stocks/watchlist-page-store` (`lib/stocks/watchlist`),
  the `(root)` layout `lib/shell/shell-store` (`lib/shell/sidebar`).
- A read that takes a user id or email is never an action; it lives in its feature's plain store —
  `lib/stocks/watchlist-store`, `lib/friends/store`, `lib/navigator/store`, `lib/theme/store`,
  `lib/email/recipients`.
- `components/primitives/`: `Panel` is the top-level framed surface and never nests; `RowCard` is a
  flat row *inside* one. `StatTile` is every label / value / hint tile, `Disclosure` every
  markerless details/summary ('link' or 'panel'), `ActionButton` every labelled button (primary,
  strong, secondary, danger, destructive; `actionButton()` for a Link), `Switch` the themed toggle
  over `components/ui/switch`, `TextField`/`TextArea` the compact form field, `iconButton` the
  square icon affordance's class string.
- `lib/ai/prompt-utils.injectJson` is every prompt's JSON fill; `lib/brain/prompts` keeps an
  import-free copy.
- `lib/action-toast.runWithToast`: a client button's server action with its outcome toasted, a
  thrown call (dropped connection, renamed action) included as `UNREACHABLE_MESSAGE` — the `/brain`
  cards' one copy of that catch.
- `lib/day-memo` is the one in-process memo the request-path reads share: kept for an ET day, keyed
  on the stored data's own stamp (latest closes, run dates), never the clock alone, so a read taken
  before a price job lands is never pinned.
- `database/models/`: the paper account, trade and snapshot models' indexes are also listed in
  `scripts/migration-indexes.mjs`, which `migrate:accounts` builds and
  `lib/__tests__/migration-indexes.test.ts` holds equal to the models.

### auth

- `lib/auth/session` is the one session read: `getSessionUser` (the shell's User),
  `getCurrentUserId` (actions and routes), `requireUserId` (pages — signed out redirects to /sign-in).
- The server actions keep their own rate limits — better-auth's `rateLimit` never runs on this
  app's `auth.api.*` path — all counted by `lib/rate-limit.takeRateLimit`, the one Mongo counter.
- `lib/auth/limits` is import-free: the password-reset and sign-in limits and their counter keys.
  `clientIpFrom` reads `x-vercel-forwarded-for`, then `x-forwarded-for`, then `x-real-ip`, which
  name the client only behind a proxy that overwrites them, such as Vercel.
- Sign-in: `signInCredentials` is read before any counter is spent; `withinSignInLimits` spends the
  counter it is handed in order — the client address, then the lower-cased email — skipping the
  client key when no header names one.
- Sign-up: `withinSignUpLimit` is one per-client counter by the hour, every request no header names
  a client for on one shared key, at `resolveSignUpLimit` — `SIGN_UP_CLIENT_LIMIT` from the
  environment (the browser QA raises it), else 10.
- `lib/auth/validation` (import-free) holds the auth forms' email and password rules and the
  password lengths `lib/auth/server.ts` enforces.
- `lib/auth/sign-up-profile.signUpProfile` checks that country, goal, risk tolerance and industry
  are options the form offers, read before any counter is spent; only those four answers reach the
  welcome event, whose prompt `lib/email/prompts.buildWelcomePrompt` fills through a replacer function.

### trading

- `lib/trading/ledger.getTradeLedger` is the one cached PaperTrade read a page makes. Every
  per-account trade read — the ledger, bounded history, the CSV, the comparison table, `/history`'s
  feed, the chat's sell totals — starts at the account's `inceptionAt` through the ledger's
  `epochTrades`/`epochTradesOf`.
- `lib/trading/fill.applyFill` is the one fill arithmetic, shared by
  `lib/trading/orders.executeOrder`, the strategy simulator and `lib/trading/receipts`, which
  replays each fill through it (the trade log and `/trade`'s `LastFill`).
- `lib/trading/lots` pairs a sell with the learner's buy notes, FIFO; `lib/trading/analytics` also
  dates the drawdown.
- `lib/trading/lifecycle`: the day-zero snapshot, `restartAccount` (reset and Navigator re-enroll)
  and the delete cascade, which refuses the last account and the one the AI Navigator trades in.
- `lib/trading/csv`: the exports' quoted, formula-safe cells and `tradesCsv`, the one row builder
  both CSV routes (`app/api/accounts/[accountId]/export`, `app/api/strategies/[slug]/export`) share.
- `/portfolio`'s learn panels (`lib/trading/learn/`, drawn by `components/trading/learn/`):
  - `lib/trading/learn/bridge` splits the return to the cent (`ReturnBridge`; the guess lives in
    localStorage, read after mount); `lib/trading/learn/risk` is the typical daily swing (`RiskLens`).
  - `lib/trading/learn/habits` (Trading habits) runs over the learner's own lots: `matchLots` over
    every fill in the account, then a closed lot counts when its sell is `source: 'user'`, an open
    one when its buy is; null under 3 closed lots; the pace set beside the catalog's cadences only
    (`cadenceControls`). `lib/trading/learn/habits-store` reads only the page's ledger plus at most
    five quotes for "had you held".
  - `lib/trading/learn/random-portfolios` (Luck or skill): a seeded thousand random five-stock
    portfolios from the large caps, equal dollars in whole shares, earning on the income clock —
    each dividend paid on its pay date, cash at the T-bill rate — as the learner's snapshot does.
    `completeSession` ends the window on the last session the whole served pool and SPY have;
    `luckWindow` ends it on the last snapshot's date and withholds the learner's marker — never a
    live at-cost value — when a holding is unpriced and the last session has no snapshot, or when no
    fill in the account is the learner's. `lib/trading/learn/luck-store` reads the pool's latest
    closes (`lib/prices/store.getLatestBars`), one snapshot and `getHoldWindowBars`' edge closes
    plus dividend rows and the window's ^IRX points, memoised per window and T-bill stamp for the
    ET day. `LuckOrSkill` draws it as an SVG histogram with you / SPY / median markers.

### income

- `lib/income/accrual.ts` is the only accrual clock (invariant 11). It also builds the Income
  panel's receipts: each month rebuilt to the cent from its own rows (`groupIncomeActivity`),
  `explainDividend`, `missedExDates`.
- `lib/income/store` is the nightly credit; `lib/income/page-store.getCashApy` is the one cached
  rate read, behind both the Income panel's APY and the order ticket's month of interest
  (`lib/income/accrual.interestOverDays`).

### strategies

- Catalog, rules, engine and simulator are pure: `lib/strategies/engine.runStrategyDay` is one day
  for live and backtest alike; `lib/strategies/params` is the one reader of `def.params`.
- `lib/strategies/universe.strategiesWatching`: the strategies whose boards carry a symbol — at
  most 4, and what lets `/stocks/[symbol]` render keyless for one.
- `lib/strategies/page-store` reads: `getBoardRowsForSymbol` one `$elemMatch`-projected findOne per
  watching strategy, newest run first; `getLatestRun` one strategy's newest run, one findOne (the
  detail page and the chat read it); `getStrategyLedger` a strategy's whole current-epoch ledger,
  for its CSV export.
- What-if lab, pure layer `lib/strategies/whatif`: `PARAM_RANGES` the only knobs a setting may
  turn; `applyOverrides` lays a setting over a catalog def without touching it (a `top` also sets
  `slots`); `gridFor` the fixed ≤4 single-knob variants the nightly job precomputes;
  `paramDiff`/`toWhatIfView` what a page prints and draws, labelled from `lib/learn/copy/whatif`.
- What-if grid: `lib/strategies/runner.simulateVariantsForStrategy` — one strategies-job step per
  strategy, inside the backtest's readiness guard, bars loaded once, simulated on the readiness
  guard's own T-bill points — runs only when `lib/strategies/job-helpers.variantsDue` says the
  backtest was rebuilt (a new version or a resimulate: its `computedAt` moved) or the grid moved.
  `lib/strategies/store.saveVariants` writes it to `StrategyBacktest.variants`, an array with no
  default beside `variantsVersion` and `variantsFor` (the build's `computedAt`), never through
  `saveBacktest`.
- What-if view: `lib/strategies/whatif.whatIfLab` shows a variant only beside the backtest version, build and dates it
  was computed with; the client `components/strategies/WhatIfLab` renders it with `SimulatedStats`
  as `#whatif-stats`, `neutral` — no sign colour says which setting is ahead; the tiles' labels are
  `lib/learn/copy/simulated`.
- `lib/strategies/learn/`: `verdict` and `replay` are pure; `board-narration` is "Read this board"
  (`components/strategies/BoardReading`) — the signal board's top row read by a narrator per
  strategy from `row.values` and the catalog's parameters (its `readBoardRow` also serves the stock
  page).
- Time in the market, `lib/strategies/learn/time-in-market`: the same $10,000 owned three ways in
  SPY — all at once, monthly deposits, cash only — as shares at its closes, its dividends and every
  cent of cash through `replayIncome` with its optional `deposits`; a day holding cash with no
  usable rate voids the way; the chart is decimated to `TIM_CHART_POINTS`.
  `lib/strategies/learn/time-in-market-store` reads SPY's bars and bounded ^IRX points, memoised for
  the day on their latest points' stamp. It renders only on `/strategies/buy-and-hold-spy`, as
  `components/strategies/TimeInMarket` with three `SeriesTiles` and `PerformanceChart`'s dollar mode.
- A fill's one "What the rule saw" is `components/learn/ReasonGloss` inside
  `components/strategies/ReasonDisclosure`.

### navigator

- `lib/navigator/run` is the one run the weekly job and the bootstrap share — claim, plan, orders,
  rationale (`lib/navigator/prompts` the rationale prompt).
- `lib/navigator/allocator.HOLDING_REASON` is the kept-position fallback reason.
- `/brain` decodes its reasons on the server with `lib/learn/reasons.glossNavigatorReasons`, for
  `SuggestionPanel`'s one "What the Navigator saw" per decision, which the weekly-decisions widget
  never gets.

### brain

- `lib/brain/ingest` is the daily update's sweep, extraction batches and ticker guard.
- `lib/brain/links.evidenceHref` is the one address of an entity's evidence — the graph's nodes,
  Active Theses and the leaderboard all link through it. `lib/brain/store.getEntityEvidence`
  projects the evidence fields and `extraction.eventType`, never importance.
- Active Theses' "since thesis": `lib/brain/since-thesis` is the pure maths — the ten heaviest
  ticker theses, both legs total returns over the same sessions, a missing leg hides the line; both
  legs count a dividend only when its ex-date is after the base close. It is fed by
  `lib/brain/store.getSinceThesis`: one `$or` bars read (`lib/prices/store.getBarsFrom` — each
  ticker from its own thesis date, SPY from the earliest), memoised for the day on the latest
  closes' stamp. `components/brain/ActiveTheses` takes the opt-in `definitions` and `sinceThesis`
  only from the page, never on the dashboard widget.
- `lib/brain/legend` is the /brain legend: every figure from the brain's and the Navigator's
  constants, the fading example worked by `lib/brain/decay.ts`; mechanism only.
  `components/brain/BrainLegend` shows it collapsed, under System Status.
- `lib/brain/event-types` are the evidence badges: eight of the extractor's nine labels, 'other'
  none, each a glossary `event-*` entry.

### news

- `lib/news/feed-prefs` is client-safe, `lib/news/feed` pure, `lib/news/feed-store` the server side.
- `lib/news/article.showSummary` is whether a headline card prints its summary —
  `components/news/ArticleCard`, behind both article cards.

### topics

- `lib/topics/starters` is the curated set, `lib/topics/seed` what a new account gets (once —
  invariant 9), `lib/topics/insert` the one write path.
- `lib/topics/feed-key` is the key both topics pages give `TopicFeed`, so a refresh with a new
  first page remounts it.
- `lib/topics/rail.sortTopicsForRail` is the order of the /topics rail and the Topics widget.

### learn

- `lib/learn/glossary` is every metric, news concept and rail, pure and client-safe;
  `lib/learn/banned` the one no-advice word list (invariant 12).
- `lib/learn/copy/<feature>` is every learner-facing sentence, as pure exports. A panel whose one
  `WhatTheseMean` is led by its own paragraph keeps its term list beside that paragraph —
  `LUCK_TERMS`, `HABITS_TERMS`, `TIM_TERMS` — and the paragraph says only what those definitions
  do not, held by `lib/learn/__tests__/panel-method.test.ts`.
- `lib/learn/reasons` is the reason decoder: one ordered grammar over every string the rules,
  `planOrders` and the engine write. A round-trip test runs every rule's branches through it, so a
  reworded reason fails there, not on the page. `NAVIGATOR_GRAMMAR`/`decodeNavigatorReason` are
  the AI Navigator's own list — the two engines share the rebalance shape under different bands,
  so the caller picks — glossed from `lib/navigator/config.ts` and round-tripped over
  `scoreUniverse`/`diffToOrders`.
- Today's lesson (`lib/learn/moments`, `lib/learn/lesson`; the
  `components/dashboard/widgets/learn/TodaysLesson` widget): a fresh moment first, from the account
  or a followed strategy's rebalance, stamped seen in `learn.lessonsSeen` by
  `lib/actions/learn.actions`; else the concept today's topic articles used, matched by equality.
  The server reads are `lib/learn/facts-store` and `lib/learn/lesson-store`; `lib/learn/missions`
  is pure.
- Daily quiz, `lib/learn/quiz`: one question a day from a strategy's recent board, seeded by the
  date through FNV-1a. `lib/learn/quiz-store` reads over `lib/strategies/page-store.getRecentRuns`
  — boards dated before today (`quizRunWindow`), one bounded point read per strategy — built once
  per ET day and keyed on `getRecentRunDates`' stamp. The client
  `components/dashboard/widgets/learn/DailyQuiz` renders it; a day is counted once by
  `lib/actions/learn.actions.recordQuizAnswer`.

### chat

- `lib/chat/explain` shapes what `explainTerm` hands the model, with `lib/chat/learner-hooks` its
  per-metric account reads. `decodeQuotedReason` reads a quoted reason with the strategies' grammar
  or the Navigator's — a `writer` hint first, the other only for what the first leaves whole; with
  no hint a shape both read comes back read both ways.
- `lib/chat/quant-strategies` shapes what `getQuantStrategies` hands it: the leaderboard rows read
  through `getStrategyLeaderboard`, or one strategy's latest run from
  `lib/strategies/page-store.getLatestRun`, with each reason decoded with its def and the board cut
  to its top rows.

### email

- Today's lesson in the daily email, `lib/email/sections/lesson`: a moment dated exactly
  yesterday — the noon run must not mail a morning fill twice — else the day's concept, in the
  widget's own copy. Every string is escaped and links go through
  `lib/email/sections/topics.linkOrText`; `lessonSectionFor` sanitises it with
  `lessonSectionLinks`, exactly the links it builds.
- The daily-news step reads the facts through `lib/learn/facts-store.readLearnFacts` (accounts and
  preferences once) and the concept once per keyword set per run
  (`lib/learn/lesson-store.readLessonForDigest`).

### jobs

- `lib/jobs/functions/` is one file of thin wrappers per feature (`lib/jobs/functions/index` the
  list the route serves); the step bodies live with their feature — `lib/trading/snapshots`,
  `lib/income/store`, `lib/brain/ingest`, `lib/navigator/run`, `lib/email/digest` and
  `lib/email/welcome`, `lib/topics/refresh`, `lib/strategies/job`.
- `lib/jobs/registry` is the one list of jobs (id, event, crons, status row); `lib/jobs/health` the
  status strip's read of their stamps; `lib/jobs/steps` holds `stepId` and `chunk`.

### prices

- Daily bars come from Yahoo first, Stooq as the fallback (`lib/prices/store`), alongside
  dividends, the T-bill rate, the SPY total-return index, signals and the NYSE calendar
  (`lib/prices/market-hours`).
- `lib/prices/finnhub` (quotes, profiles, financials, search, company news) is a plain module;
  client components reach search and quotes through `lib/actions/stocks.actions`.

### stocks

- `lib/stocks/key-numbers` states the stock page's feed figures as sentences that say what each
  divides: only the metric names it lists become rows; a missing or non-finite figure hides its
  row; its source line states the fetches' cache from `lib/prices/config`'s
  `FINANCIALS_REVALIDATE_SECONDS`/`PROFILE_REVALIDATE_SECONDS`.
- `lib/stocks/rules-see` is "What the rules see": each watching strategy's stored row, read by
  `lib/strategies/learn/board-narration.readBoardRow`; shared dates and values stated once.
- `components/stocks/KeyNumbers` and `components/stocks/RulesSee` are one disclosure each.

### settings

- `lib/theme/store` is the saved theme's read and its cookie mirror.

## Invariants — keep these true

1. Pure modules (`lib/**` without DB/network) are unit-tested; DB-bound modules are covered by `scripts/qa`.
   Tests must never import `lib/actions/*`, `lib/auth/server.ts`, `lib/auth/session.ts` or `lib/dashboard/loaders.ts` (top-level DB await).
2. User text never becomes a regex except through `escapeRegExp` (`lib/text.ts`).
3. User topics never write into `BrainEntity`; the navigator scores only the brain's global entities.
4. LLM output is untrusted: JSON-parse with zod and clamp; email HTML goes through `sanitizeDigestHtml`
   with an allow-list of article URLs; briefs render as plain text.
5. Colours and fonts come from the semantic theme tokens (`text-fg`, `bg-brand/10`, `font-mono`),
   never hex literals in `.tsx`. A font is the `font-mono` / `font-heading` / `font-sans` utility,
   never `style={{fontFamily}}` — the inline spelling is retired, and an ESLint `no-restricted-syntax`
   rule (eslint.config.mjs) rejects a `fontFamily` key in any `.tsx` object. A token colour is a
   class too (`hover:` for hover); only a runtime value (a topic's stored colour, chart data) is inline.
6. `normalizeLayout` stays pure; the legacy-default migration and the renamed widget ids
   (`LEGACY_WIDGET_IDS`) run only where saved layouts are read (`readSavedLayout`). A stored widget
   id never changes meaning: a clearer id is a new entry there, never a rename in place.
7. Framed surfaces are `<Panel>`, never a hand-rolled `bg-surface-2/40 + border` — only `.glass-panel`
   reads `--panel-bg/-border/-blur/-shadow/-radius`, so anything else silently ignores four of the
   five visual styles. `.glass-panel` is declared **outside any cascade layer**, so `rounded-*`,
   `ring-*` and `shadow-*` written next to it lose and do nothing; use `outline-*` for a ring.
8. A column, tile or caveat that is empty or identical on every row is not information — hide it
   (`visibleSignalColumns`) or state it once per panel (`describeUnpriced`, `unpricedNote`), never
   per row. Reference prose belongs in a `<details>`, above-the-fold space belongs to numbers.
9. Default topics are seeded once per account (`seedDefaultTopics`), and `topicsSeededAt` — not the
   topic count — is what makes that "once" hold: guarding on emptiness alone would resurrect the
   defaults for anyone who unfollowed everything on purpose. The same reasoning applies to any
   future onboarding default. Anything derived from the set instead (the "preinstalled" notice, via
   `isUntouchedDefaultSet`) needs no flag at all and is preferred.
10. `lib/news` reads followed-topic articles; `lib/topics` never reads the feed. Topics enter the
   feed as a pre-fetched batch in `mergeFeed`, never as a `FeedRequest`, so the Google kill switch,
   `MAX_FEED_REQUESTS` and the outage fallback are untouched — and the outage test deliberately
   ignores them, since articles read from Mongo cannot prove Google answered. Every batch, the topic
   one included, goes through `filterBySources`: a hidden outlet is hidden whichever door it uses.
   Invariant 3 still holds — nothing here writes to `BrainEntity`, and `SOURCE_CAPS.web = 0` keeps
   topic search hits out of the brain.
11. Paper accounts earn like a brokerage account: interest on cash, dividends on holdings, benchmark
   = SPY total return. `lib/income/accrual.ts` is the ONLY implementation of the accrual convention —
   the nightly job, the back-credit and the strategy simulator all step its clock, and a parity test
   holds simulator and live replay to identical rows. Income is an `AccountIncome` row, never a
   `PaperTrade`. Missing rate or dividend data holds the `incomeThrough` watermark back; it must never
   become a zero. Dividends are inferred from adjclose inside ONE Yahoo payload and stored — stored
   adjcloses are never compared across fetches (Yahoo rebases them on every distribution).
12. The app teaches by describing, never by advising, and it does so from one registry. Every
   learner-facing sentence is a pure export under `lib/learn/copy/` (components render it, never
   inline prose) and its test calls `findBanned` from `lib/learn/banned.ts` — the same list the chat
   chips, tool descriptions and model prompts are held to (a clause beginning "Never"/"No"/"Don't"
   is a prohibition, not advice). Definitions come from `lib/learn/glossary.ts` only — copy that states
   what a term means quotes the entry (`Term: short`), never its own paraphrase: a label carries
   `title=` via `<Term>`, a panel has at most one collapsed `<WhatTheseMean>` listing only the terms it
   shows, an automated fill has exactly one "What the rule saw" disclosure (on its trade-log row; a
   latest-decision order carries one only when it did not fill), and the chat's "Ask in
   chat" link lives only inside those two — never as a per-row icon, never on a dashboard widget.
   `beginnerLine` renders in the strategy detail header, the wide quant-strategies widget and once per
   strategy on the `/learn` index, nowhere else — never per row on a board, never in the narrow
   widget. Learn surfaces self-limit from rows plus stamp-once fields in the no-default `learn`
   preference sub-schema (no learner flag), and read with bounded queries — no board-carrying
   aggregate on a request path. `#signal-board` keeps exactly one `<details>` of its own; new
   disclosures are siblings inside `#strategy-signals`. The board's one `<WhatTheseMean>` is led by
   "Read this board — SYMBOL", and anything in the panel that states a board verdict hides while Guess
   the Verdict is open — the verdict cells, the top row's reading, the run's headline and every order
   (`[data-run-verdict]`): one `:has` switch on `#latest-decision`, with `invisible` so nothing moves.

## Next.js 16

This version has breaking changes — APIs, conventions, and file structure may differ from
what you remember. Read the relevant guide in `node_modules/next/dist/docs/` before writing
framework-facing code (route handlers, `proxy.ts`, caching). Heed deprecation notices.

<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
