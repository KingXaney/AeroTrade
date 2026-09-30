# AeroTrade — notes for contributors and coding agents

## What this is

A paper-trading terminal with an AI news brain (Next.js 16 App Router, React 19, TypeScript,
Tailwind v4, MongoDB/Mongoose, better-auth, Inngest, Vercel AI SDK). See README.md for the
product tour and docs/specs/ for the design documents behind the larger features.

## Commands

- `npm run check` — lint + typecheck + unit tests (what CI runs)
- `npm test` / `npm run test:watch` — vitest, node environment, `lib/**/__tests__` only
- `npm run build:check` — compile-only Next build; needs no database or keys
- `npm run dev` + `npx inngest-cli@latest dev -u http://localhost:3000/api/inngest` — app + jobs
- `npm run trigger -- <brain|navigator|news|snapshots|income|topics|briefs|strategies|strategies-preview|strategies-resimulate>` — fire a job locally
- `scripts/qa/` — browser QA against an in-memory MongoDB (see its README)

## Where things live

- `app/` routes · `components/` UI by feature · `lib/actions/` server actions (session-derived, userId-scoped)
- `components/primitives/` the shared surface vocabulary — `Panel`, `PageTitle`, `SectionHeading`,
  `MicroLabel`, `Badge`, `EmptyState`, `iconButton`. Hand-owned, and separate from
  `components/ui/` on purpose: that folder is the shadcn registry target and is regenerable.
- `lib/news` ingest + sanitise + the per-user feed (`feed-prefs` client-safe, `feed` pure, `feed-store` server) · `lib/brain` entity graph · `lib/navigator` allocation rails · `lib/topics` followed topics (`starters` the curated set, `seed` what a new account gets, `insert` the one write path)
- `lib/trading` paper accounts (`income` the accrual convention and the Income panel's receipts — each month rebuilt to the cent from its own rows, `explainDividend`, `missedExDates` — `income-store` the nightly credit, `bridge` the return split to the cent, `risk` the typical daily swing; `analytics` also dates the drawdown; `lots` FIFO pairs a sell with the learner's buy notes, `receipts` replays each fill through the engine's `applyFill` (the trade log and `/trade`'s `LastFill`), `csv` the export's quoted, formula-safe cells; `account.getTradeLedger` is the one cached PaperTrade read a page makes, and the per-account trade reads — ledger, bounded history, CSV, comparison table, the chat's sell totals — start at the account's `inceptionAt` through `account.epochTrades`/`epochTradesOf`; `account.getCashApy` the one cached rate read, behind both the Income panel's APY and the ticket's month of interest (`income.interestOverDays`)) · `lib/dashboard` widget registry/layout · `lib/theme` palettes/styles · `lib/ai` models + chat tools (`explain` shapes what `explainTerm` hands the model, `learner-hooks` its per-metric account reads)
- `lib/strategies` the quant strategies: pure catalog/rules/engine/simulator (one `runStrategyDay` for live and backtest; `params` the one reader of `def.params`), `store`/`queries` server side · `lib/prices` daily bars (Yahoo first, Stooq fallback), dividends, the T-bill rate, the SPY total-return index, signals, NYSE calendar
- `lib/learn` what the app teaches: `glossary` (every metric, news concept and rail, pure and client-safe), `banned` (the one no-advice word list), `copy/<feature>` (every learner-facing sentence, as pure exports), `missions` / `verdict` / `replay` pure, `reasons` the reason decoder (one ordered grammar over every string the rules, `planOrders` and the engine write; a round-trip test runs every rule's branches through it, so a reworded reason fails there, not on the page), `board-narration` "Read this board" (the signal board's top row read by a narrator per strategy from `row.values` and the catalog's parameters), `moments` / `lesson` Today's lesson, the `components/dashboard/widgets/TodaysLesson` widget (a fresh first from the account or a followed strategy's rebalance, stamped seen in `learn.lessonsSeen` by `lib/actions/learn.actions`; else the concept today's topic articles used, matched by equality), `facts-store` / `lesson-store` the server reads, `quiz` the Daily quiz (one question a day from a strategy's recent board, seeded by the date through FNV-1a; `quiz-read` its server read over `getRecentRuns`, one bounded point read per strategy), `time-in-market` Time in the market (the same $10,000 owned three ways on SPY's total-return index — all at once, monthly deposits, cash only — every cent of cash through `replayIncome` with its optional `deposits`; a day holding cash with no usable rate voids the way; `time-in-market-read` reads `getBenchmarkIndex` and bounded ^IRX points, and renders only on `/strategies/buy-and-hold-spy` as `components/strategies/TimeInMarket` with three `SeriesTiles` and `PerformanceChart`'s dollar mode) · `components/learn/` the `WhatTheseMean` disclosure, `ReasonGloss` (inside `components/strategies/ReasonDisclosure`, a fill's one "What the rule saw"), `BoardReading`, and `/portfolio`'s `ReturnBridge` (the guess lives in localStorage, read after mount) and `RiskLens` · `components/primitives/Term`
- `lib/inngest/functions.ts` every scheduled job · `database/models/` Mongoose models · `types/global.d.ts` ambient domain types

## Invariants — keep these true

1. Pure modules (`lib/**` without DB/network) are unit-tested; DB-bound modules are covered by `scripts/qa`.
   Tests must never import `lib/actions/*`, `lib/better-auth/*` or `lib/dashboard/loaders.ts` (top-level DB await).
2. User text never becomes a regex except through `escapeRegExp` (`lib/topics/match.ts`).
3. User topics never write into `BrainEntity`; the navigator scores only the brain's global entities.
4. LLM output is untrusted: JSON-parse with zod and clamp; email HTML goes through `sanitizeDigestHtml`
   with an allow-list of article URLs; briefs render as plain text.
5. Colours and fonts come from the semantic theme tokens (`text-fg`, `bg-brand/10`, `font-mono`),
   never hex literals in `.tsx`. New code uses the `font-mono` / `font-heading` utilities rather
   than `style={{fontFamily}}` — the older inline spelling is still widespread and is being retired.
6. `normalizeLayout` stays pure; the legacy-default migration runs only where saved layouts are read.
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
   = SPY total return. `lib/trading/income.ts` is the ONLY implementation of the accrual convention —
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
