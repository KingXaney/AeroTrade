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
- `npm run trigger -- <brain|navigator|news|snapshots|splits|alerts|income|topics|briefs|briefing|strategies|strategies-preview|strategies-resimulate|culture|culture-weekly|culture-preview|culture-resimulate|culture-backfill|lab|agent-world|agent-world-now|agent-world-preview>` — fire a job locally (`news <email>`: a test brief to that one opted-in reader; `culture-backfill [brandId ...]`: every brand's Wikipedia views back to the backtest horizon, or the named brands)
- `npm run test:db` — connect to `MONGODB_URI` (from `.env`) and print the database and host it reached
- `npm run migrate:accounts` — the idempotent multi-account migration: repairs income rows written twice (`scripts/income-dedupe.mjs`), builds the indexes in `scripts/migration-indexes.mjs` and drops the ones they replaced (run it on every database, again whenever that list changes; `-- --dry-run` writes nothing and prints what it would change)
- `npm run opinion:local` — the brain's Second Opinion from your Claude subscription through the Claude Code CLI, written straight to the database (`.env.example` lists the other ways)
- `npm run email:preview` — render every email from the fixtures into the QA output folder (output/email under scripts/qa) and check it at desktop and phone widths, light and dark (`qa-email` without the harness)
- `npm run qa` — browser QA (`scripts/qa/run.sh`): an in-memory MongoDB, `next dev` and the Inngest dev server, then every suite or the named ones (`npm run qa -- learn`); one suite per feature, listed in `scripts/qa/README.md`
- `node scripts/poker-preflop-equity.mjs` — regenerate the poker solver's exact preflop table and its ranking (about seven minutes on every core; `--check` recomputes 40 entries, `--ranking` rewrites only the ranking)

## Where things live

[docs/MAP.md](docs/MAP.md) is the map: every feature's folder in every layer, and "To change…,
edit…". The contracts a map cannot show are one file per feature in `.claude/rules/`, under the
map's own feature names (dashboard keeps none beyond Shared and the invariants).
Each file opens with a `paths:` list of the files it belongs beside, and Claude Code loads it by
itself the first time one of them is opened with Read, Write or Edit (or a `cat` or `head` of
that one file) — from the checkout the session started in, for a worktree under it too. A
search, a `sed` or a scripted edit loads nothing, and nothing else loads them at all: **any
other reader — a person, another agent, a session working through the shell — reads a feature's
file before changing that feature.**

- [landing](.claude/rules/landing.md)
- [home](.claude/rules/home.md)
- [shell](.claude/rules/shell.md)
- [auth](.claude/rules/auth.md)
- [trading](.claude/rules/trading.md)
- [income](.claude/rules/income.md)
- [strategies](.claude/rules/strategies.md)
- [navigator](.claude/rules/navigator.md)
- [brain](.claude/rules/brain.md)
- [research](.claude/rules/research.md)
- [news](.claude/rules/news.md)
- [culture](.claude/rules/culture.md)
- [agent world](.claude/rules/agent-world.md)
- [topics](.claude/rules/topics.md)
- [learn](.claude/rules/learn.md)
- [lab](.claude/rules/lab.md)
- [games](.claude/rules/games.md)
- [poker](.claude/rules/poker.md)
- [poker night](.claude/rules/poker-night.md): the game, the room and the lobby
- [poker night, the table](.claude/rules/poker-night-table.md)
- [poker night, the rest](.claude/rules/poker-night-extras.md): the Hands guide, emotes, sounds, looks and awards
- [chat](.claude/rules/chat.md)
- [email](.claude/rules/email.md)
- [jobs](.claude/rules/jobs.md)
- [prices](.claude/rules/prices.md)
- [stocks](.claude/rules/stocks.md)
- [settings](.claude/rules/settings.md)
- [broker](.claude/rules/broker.md)
- [friends](.claude/rules/friends.md)

`lib/__tests__/docs-map.test.ts` fails when a path named here, in a rule file or in the map stops
existing; when a rule file is missing from this list, has a glob that matches nothing, or outgrows
the 40,000 characters Claude Code loads on demand (split it, as poker night is); and when this
page outgrows 30,000, since every session reads all of it.

### Shared

- A heavy page composes one lib read that returns its view, shaped by a pure sibling: `/portfolio`
  `lib/trading/portfolio-page-store` (`lib/trading/portfolio-page`), `/strategies/[slug]`
  `lib/strategies/page-store.getStrategyPageView` (`lib/strategies/detail-view`), both topics pages
  `lib/topics/page-store`, `/watchlist` `lib/stocks/watchlist-page-store` (`lib/stocks/watchlist`),
  the `(root)` layout `lib/shell/shell-store` (`lib/shell/sidebar`, the view-models of the rail's
  two hover cards).
- A read that takes a user id or email is never an action; it lives in its feature's plain store —
  `lib/stocks/watchlist-store`, `lib/friends/store`, `lib/navigator/store`, `lib/theme/store`,
  `lib/email/recipients`.
- `components/primitives/`: `Panel` is the top-level framed surface and never nests; `RowCard` is a
  flat row *inside* one. `StatTile` is every label / value / hint tile, `Disclosure` every
  markerless details/summary ('link', 'panel' or 'row' — a card folded to its title — with
  `openOnHash` the page hash that opens it), `ActionButton` every labelled button (primary,
  strong, secondary, danger, destructive; `actionButton()` for a Link), `Switch` the themed toggle
  over `components/ui/switch`, `TextField`/`TextArea` the compact form field, `iconButton` the
  square icon affordance's class string.
- A caption, a panel heading and a labelled control take their face, case, tracking and colour
  from the active visual style, through `.label-type`, `.heading-type` and `.control-type`
  (`app/globals.css`, the components layer — a utility at the call site still wins): `MicroLabel`,
  `SectionHeading`, `ActionButton` and `Badge` carry them, and a hand-written label uses the
  class, never `font-mono uppercase tracking-[…]`. A label's text is written as it should read in
  sentence case; a style that wants capitals applies them. `RowCard` and `.news-item` read the
  style's `--card-*` tokens; the header and everything that floats (menus, dialogs, the drawer,
  the chat window: `.chrome-surface` and the shadcn `data-slot` contents) read `--chrome-*`. A
  style block sets only style tokens — a palette block outranks it, so it never writes a
  palette token.
- `lib/ai/prompt-utils.injectJson` is every prompt's JSON fill; `lib/brain/prompts` keeps an
  import-free copy. `lib/ai/models` is the one table of which model runs which task (`AI_TIER`:
  free Gemini, or Anthropic with its key) and which Gemini key is in use (`AI_PLAN`:
  `GEMINI_API_KEY`, or `GEMINI_API_KEY_PAID` from a billed project — `geminiApiKey`, read by the
  Inngest client and the chat route alike; a plan without its key falls back to the free key).
- `lib/action-toast.runWithToast`: a client button's server action with its outcome toasted, a
  thrown call (dropped connection, renamed action) included as `UNREACHABLE_MESSAGE` — the `/brain`
  cards' one copy of that catch.
- `lib/day-memo` is the one in-process memo the request-path reads share: kept for an ET day, keyed
  on the stored data's own stamp (latest closes, run dates), never the clock alone, so a read taken
  before a price job lands is never pinned.
- `database/models/`: the paper account, trade, snapshot and income models' indexes are also listed in
  `scripts/migration-indexes.mjs`, which `migrate:accounts` builds and
  `lib/__tests__/migration-indexes.test.ts` holds equal to the models.

### owner

- The app's owner — its admin — is the accounts `LAB_OWNER_EMAILS` names (`lib/lab/owner.isLabOwner`;
  `lib/lab/owner-store.readOwnerUserIds` is the same list as user ids, for the reads that have no
  session). The owner alone has the lab (`/learn`), both brains (`/brain`, `/culture`), the trading
  agent world (`/agent-world` and its office) and the strategies (`/strategies`); for anyone else
  none of them exists:
  - the nav: the Strategies and Brain sections are `owner: true` (### shell);
  - the pages: `requireOwner` sends anyone else Home; the actions (the Navigator's, the culture
    follow's, the strategy follow's, the Second Opinion's) and the routes (the strategy CSV, the
    agent world's live poll) take `getOwnerUserId`;
  - the widgets: every one in the `strategies` and `brain` categories, and `news-brain-tile`, is
    `owner` (`lib/dashboard/catalog`), shown only with `AvailabilityContext.owner` — the dashboard
    and Settings read it from the session (`getVisibleLayout(userId, owner)`);
  - the chat: `buildTools(userId, {owner})` leaves `OWNER_CHAT_TOOLS` (`lib/chat/types`) out for
    anyone else and `advisorSystemPrompt({owner})` never names them; the chips about them
    (`OWNER_CHAT_SUGGESTIONS`, `chatSuggestionsFor`) and the robot's tip (`robotTipsFor`) are the
    owner's;
  - the rest: the stock page's "What the rules see" (no strategy watches a symbol for anyone
    else), the first-week missions in `OWNER_MISSIONS`, a followed strategy's rebalance lesson
    (`OnboardingFacts.owner`), the Topics page's brain suggestions, `/portfolio`'s "Traded by", the
    glossary's groups homed on those pages (`glossaryGroupsFor`), ⌘K's Learn rows for their
    terms (`lib/learn/where.searchGlossaryFor`) and the strategies' disclaimer
    under them, and the daily brief's Navigator and culture blocks;
  - the jobs: the AI Navigator and the culture pickers trade the owner's enrolments only
    (`buildNavigatorUniverse`, `listActiveFollowers`); one anyone else made before rests.
  News — the briefing, the feed, the topic briefs — is everyone's, as are the accounts, the
  topics, the games, poker night and the glossary's other groups. The landing page and the
  auth pages' right column describe only what every account can open (`lib/learn/copy/landing`,
  held by its test).

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
   `beginnerLine` renders in the strategy detail header, the wide quant-strategies widget, nowhere else — never per row on a board, never in the narrow
   widget. Learn surfaces self-limit from rows plus stamp-once fields in the no-default `learn`
   preference sub-schema (no learner flag), and read with bounded queries — no board-carrying
   aggregate on a request path. `#signal-board` keeps exactly one `<details>` of its own; new
   disclosures are siblings inside `#strategy-signals`. The board's one `<WhatTheseMean>` is led by
   "Read this board — SYMBOL".

## Next.js 16

This version has breaking changes — APIs, conventions, and file structure may differ from
what you remember. Read the relevant guide in `node_modules/next/dist/docs/` before writing
framework-facing code (route handlers, `proxy.ts`, caching). Heed deprecation notices.

<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
