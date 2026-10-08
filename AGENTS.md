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
- `npm run trigger -- <brain|navigator|news|snapshots|income|topics|briefs|briefing|strategies|strategies-preview|strategies-resimulate>` — fire a job locally (`news <email>`: a test brief to that one opted-in reader)
- `npm run test:db` — connect to `MONGODB_URI` (from `.env`) and print the database and host it reached
- `npm run migrate:accounts` — the idempotent multi-account migration: builds the indexes in `scripts/migration-indexes.mjs` and drops the ones they replaced (run it on every database, again whenever that list changes)
- `npm run opinion:local` — the brain's Second Opinion from your Claude subscription through the Claude Code CLI, written straight to the database (`.env.example` lists the other ways)
- `npm run email:preview` — render every email from the fixtures into the QA output folder (output/email under scripts/qa) and check it at desktop and phone widths, light and dark (`qa-email` without the harness)
- `npm run qa` — browser QA (`scripts/qa/run.sh`): an in-memory MongoDB, `next dev` and the Inngest dev server, then every suite or the named ones (`npm run qa -- learn`); one suite per feature, listed in `scripts/qa/README.md`
- `node scripts/poker-preflop-equity.mjs` — regenerate the poker solver's exact preflop table and its ranking (about seven minutes on every core; `--check` recomputes 40 entries, `--ranking` rewrites only the ranking)

## Where things live

[docs/MAP.md](docs/MAP.md) is the map: every feature's folder in every layer, and "To change…,
edit…". Below, by the same feature names, are only the contracts a map cannot show (dashboard
and friends keep none beyond Shared and the invariants).
`lib/__tests__/docs-map.test.ts` fails when a path named here or in the map stops existing.

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
  markerless details/summary ('link' or 'panel'), `ActionButton` every labelled button (primary,
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

### landing

- `/` has two faces. `proxy.ts` rewrites a request with no session cookie for exactly `/` to
  `app/(marketing)/welcome` (the address stays `/`) and redirects every other gated path to
  /sign-in; with a cookie it is Home. The landing page reads nothing — no session, no database.
- Its sentences, and the auth pages' right column (`components/auth/AuthShell`), are
  `lib/learn/copy/landing`: numbers only from the app's own constants, no return figure, user
  count or testimonial, and the no-advice list applies as everywhere. The example screen is
  the app's own primitives, labelled as an example. `components/landing/ThemeDemo` previews a
  theme and saves nothing.
- The hero is the momentum terrain, `components/landing/MomentumTerrain`: a 3D surface of SPY's
  normalised momentum — the last 250 sessions along x, lookbacks 5 to 250 days along y, height
  z = ln(P_t/P_{t−n}) / (σ_t√n) on the total-return index — that fetches `app/api/landing/surface`
  after the page paints and loads the three.js scene (`components/landing/terrain-scene`) with a
  dynamic import; the page itself still reads nothing and is the same page without it. The maths
  is pure, `lib/landing/momentum-surface` (fewer sessions when the history is short, null — the
  hero's unavailable state — under 60 or on a cell beyond 20σ). `lib/landing/surface-store` draws
  from Tiingo first once `TIINGO_TOKEN` is set — `lib/prices/tiingo` reads SPY in one payload, the
  token in a header, the fetch cached by Next for an hour, today's row only after 5:30 pm ET, and
  its `adjClose` trusted because it is read inside ONE payload (invariant 11) — else from SPY's
  stored bars through `lib/prices/total-return`; either surface is memoised per ET day on its last
  bar's stamp (`lib/day-memo`), and the route caches five minutes (a 404, never). The footer names
  the source, Tiingo with its credit linked. Colours are the
  `--terrain-*` tokens in `app/globals.css`, read from the document at runtime and re-read when
  the page's theme switcher repaints it (never hex in a component); motion follows the OS setting
  and `html[data-motion]` (no auto-rotate, no intro, presets and the flatten toggle jump); on a
  coarse pointer the orbit controls are off and the canvas keeps `touch-action: pan-y`, so a phone
  scrolls past it; the wheel is the page's until the surface is grabbed, while + and −, a pinch, or
  Ctrl and the wheel zoom at any time; without WebGL the
  same grid is the 2D heatmap (`components/landing/terrain-heatmap`); the loop draws only while the
  hero is on screen and something moves. Its sentences are `lib/learn/copy/terrain`; its terms
  (`normalized-momentum`, `lookback`, `volatility`, homed on the front door in `lib/learn/where`)
  are the panel's one `WhatTheseMean`, passed in by the page with `ask={false}`, since the chat
  widget is not mounted there. Home draws the same component from a server read (see home).

### home

- `/` is Home for a signed-in reader: `lib/home/page-store.getHomeView` (the accounts' valuation and
  the topics overview are the shell's own request-cached reads) shaped by `lib/home/view`. It
  adapts from rows, never a flag: `nextStep` is the first first-week mission not yet done, then
  the session (the trade desk while the market is open, the news while it is closed); a box with
  nothing to say is not drawn. The widget grid is `/dashboard`; every action that revalidates
  `/` revalidates it too (`lib/__tests__/home-revalidate.test.ts`).
- Home opens on the landing page's momentum terrain (`components/landing/MomentumTerrain`,
  `size="panel"`, no eyebrow under the section's own heading), frameless like the landing hero so
  the transparent canvas sits on the page background, not in a panel's box: the page reads
  `lib/landing/surface-store.getMomentumSurface` on the server beside `getHomeView` and hands the
  surface in as `initial`, so the section exists only when there is one (never a loading box) and
  the client draws it at once. Its one `WhatTheseMean` keeps its Ask links, since the chat is
  mounted here; the landing page's has none.
- Poker night on Home: `components/home/PokerNightChip`, a link chip to `/poker-night` beside the
  streak, is the way in that is always there while `pokerNightEnabled()` — and, while the reader
  holds a seat, the way straight back to it ("Rejoin your table", `lobby.homeChipOf`, streamed in
  over the lobby's chip from the panel's own read, one per request through React's `cache`); the panel
  `components/home/HomePokerNight` (props only) is drawn only when it has a row — the tables the
  reader holds a seat at (Rejoin) or hosts from outside one (Open), then friends' shown open tables
  (Join), `HOME_LIMITS` of each, each row's line opening with its table's game (`lobby.tableLine`: "PLO · …"),
  and "Learn the hands" (`/poker-night?tab=hands`). Its read,
  `lib/poker-night/lobby-store.getHomePokerNight` (null with the kill switch on or no row), shaped by
  the pure `lib/poker-night/lobby.homePokerNight`, is streamed under `<Suspense fallback={null}>` by
  `PokerNightAsync`, declared in `app/(root)/page.tsx` because poker night's server guard keeps its
  stores out of `components/`; it is not part of `getHomeView`, and a failed read draws nothing. No
  poker night action revalidates `/`: Home renders per request.

### shell

- `lib/shell/navigation` is the one nav registry. A section (`NAV_SECTIONS`) is one icon on the
  rail (`components/shell/Rail`) and one row of the mobile drawer; its pages are the tabs
  `components/shell/SectionTabs` shows above the page (none for a section of one page), and
  `match` names routes it owns that are not tabs (`/stocks/AAPL` lights Markets). Friends and
  Settings are `ACCOUNT_PAGES`, in the avatar menu. Every `href` is a page file — the test checks.
- The rail never widens: a name is a tooltip, a summary (Portfolio, News) a portaled hover card,
  and anything the reader must see without hovering — something new in a followed topic since
  they last opened News, a holding valued at cost, a pending friend request — is a dot on the
  icon or the avatar (invariant 8). The News card (`components/shell/NewsSidebarCard`, the pure
  `lib/shell/sidebar.toSidebarNews`) is the day's briefing headline through the reader's outlet
  filter, "since you last looked", and three topics with their newest allowed headline — never
  "0 new". The dot's stamp is `newsSeenAt` in `database/models/user-preferences.model.ts`, written
  once per visit by `components/news/NewsSeenMarker` (on `/news` and the `/topics` index) through
  `lib/actions/news-feed.actions.markNewsSeen` and read with the outlet filter by
  `lib/news/feed-store.getNewsReaderPrefs`; the stamp never revalidates — the shell clears its dot
  from `lib/shell/news-seen` (the `aero:news-seen` window event, as `lib/chat/ask` opens the chat)
  and settles on the next full load. The shell's own sentences are `lib/learn/copy/shell`.
- The header repeats no section: logo, the one `components/shell/SearchCommand` trigger (which
  also finds pages, `searchPages`), the account menu. The assistant's launcher is not in the bar:
  `components/chat/ChatWidget` floats the robot (`components/chat/RobotMascot`) fixed bottom-right
  at every width, over the page, and the `(root)` layout's content wrapper (`app/(root)/layout.tsx`)
  ends in `pb-24` so it never covers a page's last panel.

### auth

- `lib/auth/session` is the one session read: `getSessionUser` (the shell's User),
  `getCurrentUserId` (actions and routes), `requireUserId` (pages — signed out redirects to /sign-in).
- The server actions keep their own rate limits — better-auth's `rateLimit` never runs on this
  app's `auth.api.*` path — all counted by `lib/rate-limit.takeRateLimit`, the one Mongo counter.
  `lib/rate-limit.peekRateLimit` is its read-only pair — one `findOne`, never a write, null once
  the window has passed — for anything that shows a window without spending it.
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
    (`cadenceControls`); drawn by `TradingHabits`. `lib/trading/learn/habits-store` reads only the page's ledger plus at most
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
- `lib/strategies/learn/`: `replay` is pure; `board-narration` is "Read this board"
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
- A piece's nature — `reported`, `company`, `opinion`, `rumour` (`NATURES` in `lib/brain/config`) — is
  the extractor's second label, beside the event type. `lib/brain/trust.sourceTrust` reads the
  outlet first (a press-release wire is `company` whatever the model said; a commentary outlet
  weighs `COMMENTARY_IMPORTANCE_SHARE` of its importance), then `lib/brain/extraction.sanitizeExtraction`
  clamps: an opinion or a rumour at most `TAKE_IMPORTANCE_CAP`, and each mention's tone joins the
  sentiment at `SENTIMENT_SHARE_BY_NATURE` (the `sentimentShare` of `lib/brain/decay.foldMentions`);
  attention always counts in full, and a clamp only ever lowers a weight. The evidence list badges
  company, opinion and rumour (`NATURE_BADGES` in `lib/brain/event-types`, glossary `nature-*`); a
  reported piece carries none, and a row tagged before the label reads as reported. The model never
  sees a URL; the trust check reads it.
- The Knowledge Graph is 3D: `components/brain/BrainGraph` over `components/brain/graph-scene`
  (three.js, loaded on demand). The entities sit on three concentric shells — themes inner,
  sectors middle, tickers outer — placed by the pure `lib/brain/graph-layout` (deterministic for
  one input: every entity takes one of n directions spread evenly over the sphere — the heaviest
  facing the camera, a linked one beside its links, an unlinked one as far from the rest as it
  can — and its shell only sets the radius, so no two names are ever close from the centre
  however densely the news links them), as spheres sized by slow
  weight and coloured by sentiment, a thesis haloed, each entity's heaviest links as lines
  (`restingEdges`; all of an entity's links while it is lit). Each label is a real link
  to `evidenceHref`, floated over the canvas by the scene, so Tab and Enter work as the SVG's nodes
  did; the canvas is `aria-hidden`, the host `role="group"`, never `img`. Without WebGL the SVG
  rings draw instead (`components/brain/BrainGraph2D`). Both scenes read the page through
  `components/three/scene-env` (WebGL, the theme stamp, reduced motion, a coarse pointer, the
  colour tokens as RGB through `lib/theme/css-color`).
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
- `/brain` is three views, one at a time in the URL (`?view=`): narratives (the default, and
  where an evidence link `?entity=` always lands), the AI Navigator, and system. Each view reads
  only its own data.
- `lib/brain/legend` is the /brain legend: every figure from the brain's and the Navigator's
  constants, the fading example worked by `lib/brain/decay.ts`; mechanism only.
  `components/brain/BrainLegend` shows it collapsed, at the foot of every view.
- `lib/brain/event-types` are the evidence badges: eight of the extractor's nine labels, 'other'
  none, each a glossary `event-*` entry.

### news

- `lib/news/feed-prefs` is client-safe, `lib/news/feed` pure, `lib/news/feed-store` the server side.
- `lib/news/article.showSummary` is whether a headline card prints its summary —
  `components/news/ArticleCard`, behind both article cards.
- The morning briefing: `lib/jobs/functions/news` makes one model call a day over the brain's
  most important tagged articles (`lib/brain/store.getBriefingCandidates`, which sorts on
  importance and never projects it) and writes one global `MarketBriefing` per ET day. The model
  sees numbered headlines and no URLs (`lib/news/prompts`) and cites by number;
  `lib/news/briefing.parseBriefingText` keeps only citations that name an article it was shown,
  drops a point left with none, and snapshots each cited article into the document. The page
  renders the text as text nodes under the AI caveat; a link is always a stored article's own.
- `/news` composes `lib/news/page-store.getNewsPageView`, shaped by the pure `lib/news/page`:
  the briefing, then the followed topics (each topic's own brief and newest stories), then tagged
  articles naming a held or watched symbol (`lib/brain/store.getNewsForSymbols`), then the feed
  — a few leading, the rest behind one disclosure. A story prints once, a section with nothing
  is absent, and every section passes `lib/news/feed.outletAllowed`, the one outlet rule. The
  feed itself (`getNewsFeedForPrefs`: kill switch, outage fallback, the topic batch for the widget
  and /history) is untouched.

### topics

- `lib/topics/starters` is the curated set, `lib/topics/seed` what a new account gets (once —
  invariant 9), `lib/topics/insert` the one write path.
- `lib/topics/feed-key` is the key both topics pages give `TopicFeed`, so a refresh with a new
  first page remounts it.
- `lib/topics/rail.sortTopicsForRail` is the order of the /topics rail and the Topics widget.
- What "new" means on every topic badge is `lib/topics/config.unseenFloor`: articles published
  after the reader last opened the topic, counting back at most `UNSEEN_WINDOW_HOURS` (24, the
  daily email's window), counted to `UNSEEN_COUNT_CAP` + 1 at most and printed through
  `lib/format.formatCapped` ("99+"). `Topic.lastSeenAt` means only "the reader opened this topic":
  `components/topics/TopicSeenMarker` stamps it on every topic view, and `lib/learn/facts-store`
  reads it as the first-week step; the News dot has its own stamp (shell).
- `/topics?edit=1` is the manage view: `components/topics/TopicsManager` over the `manage` kind of
  `lib/topics/page-store.getTopicsPageView` (returned before the merged feed and the inline fetch,
  so a round of editing never runs a search), shaped by `lib/topics/manage` (`offeredTopics` hides
  the starters and brain suggestions already followed, by slug; `slotsLeft` the 16-topic cap;
  `topicToInput` what Undo re-creates). Rows keep their stored order; Edit opens the shell's one
  composer, which stays on the page (`TopicsShell` `stayOnSave`); Remove is immediate and its
  toast's Undo calls `createTopic` from the row's own fields (a re-create under a new id, same slug
  and keyword set); starters follow through `followStarterTopics`, one first-run event for the
  batch. Removing the last topic lands on the empty state (invariant 9). The topic page's own
  confirmation, `components/topics/UnfollowTopicDialog`, is unchanged. `components/topics/TopicChips`
  is the one starter chip, keyed by slug, that the empty state and the manage view share.
- Nothing on the manage view calls `router.refresh()`: every topics action revalidates `/topics`,
  and a revalidating action re-renders the current URL in its own response (Next's server-actions
  guide), so a refresh on top would render the view twice.

### learn

- `lib/learn/glossary` is every metric, news concept and rail, pure and client-safe;
  `lib/learn/banned` the one no-advice word list (invariant 12).
- `lib/learn/copy/<feature>` is every learner-facing sentence, as pure exports. A panel whose one
  `WhatTheseMean` is led by its own paragraph keeps its term list beside that paragraph —
  `LUCK_TERMS`, `HABITS_TERMS`, `TIM_TERMS` — and the paragraph says only what those definitions
  do not, held by `lib/learn/__tests__/panel-method.test.ts`. That disclosure is
  `components/learn/WhatTheseMean`; a label's definition is `components/primitives/Term`.
- `lib/learn/reasons` is the reason decoder: one ordered grammar over every string the rules,
  `planOrders` and the engine write. A round-trip test runs every rule's branches through it, so a
  reworded reason fails there, not on the page. `NAVIGATOR_GRAMMAR`/`decodeNavigatorReason` are
  the AI Navigator's own list — the two engines share the rebalance shape under different bands,
  so the caller picks — glossed from `lib/navigator/config.ts` and round-tripped over
  `scoreUniverse`/`diffToOrders`.
- `/learn` is the hub, one view at a time in the URL (`?tab=`, `components/primitives/Tabs`): the
  course, Today (the lesson and the first-week list), the glossary, the strategies. A
  `/learn#term` address — ⌘K, Today's lesson and the daily email hand it out — is sent to the
  glossary tab by `components/learn/GlossaryHashRedirect`, since the server never sees a hash.
- The beginner course, `lib/learn/course` (pure): four modules of four lessons in one fixed
  order, text in `lib/learn/copy/course/<module>`. A lesson is two or three framing sentences,
  the glossary's own definitions of its terms printed beside them (never a paraphrase — the
  test rejects a five-word run shared with a listed definition), a link to the real screen and
  a "Mark as done" button (`components/learn/LessonDone`). It is done when the reader marks it
  done (`lib/actions/learn.actions.markCourseLessonDone` stamps `learn.courseDone` once, with
  `$addToSet`, after checking the id against the registry) or when the reader did the thing it is
  about (`doneFrom`, read off the first-week facts). A lesson id is its address and its stamp and
  is never renamed. `lib/learn/course-store.getCourseProgress` is the one read; progress is a
  count, never a bar or a score.
- Today's lesson (`lib/learn/moments`, `lib/learn/lesson`; the
  `components/dashboard/widgets/learn/TodaysLesson` widget): a fresh moment first, from the account
  or a followed strategy's rebalance, stamped seen in `learn.lessonsSeen` by
  `lib/actions/learn.actions`; else the concept today's topic articles used, matched by equality.
  The server reads are `lib/learn/facts-store` and `lib/learn/lesson-store`; `lib/learn/missions`
  is pure.

### games

- The games are the one place the app keeps a score: the daily-puzzle streak counts days, and a
  record is a reader's own top score. The learn surfaces stay count-only (a course's progress is a
  count, never a bar or a score). Every games sentence is still held to the no-advice list
  (invariant 12): "record" and "highest", never "best"; nothing says what to do with money.
- The puzzle bank `lib/learn/copy/puzzles` is server-only: an answer reaches the page only once
  the puzzle is solved or revealed, every answer is checked in `lib/actions/games.actions`, and
  `lib/games/__tests__/puzzle-guard.test.ts` fails if a client file — or anything under
  `components/` — imports the bank, `lib/games/puzzles` or `lib/games/store`. Every answer key has
  an independent check in `lib/games/__tests__/puzzle-checks.ts` (a simulation, an enumeration or
  a direct computation), so a wrong key fails CI.
- `lib/games/puzzles.dailyPuzzleFor`: day 1 is `PUZZLES_START_DATE`, the days walk
  `PUZZLE_SCHEDULE` — append-only, its first sixty pinned by a hash — and cycle. A `PuzzleSolve`
  row stores its own puzzle id and ET `day` (null in the archive), one per puzzle per context, so
  no streak depends on the schedule. The streak is the distinct days of solved rows
  (`lib/games/streak.streakFrom`), never stored; a revealed solution or an archive solve counts
  nothing toward it.
- Each write is one atomic update filtered on the row still being open — a double click or a
  second tab cannot count twice — and every games action is counted per user by
  `lib/rate-limit.takeRateLimit`. A solve or a reveal revalidates `/`, `/dashboard`, the `/games`
  subtree and `/learn`.
- The streak shows on Home (`components/games/StreakChip`, beside the market status), on the
  hub's `components/games/StreakPanel`, and in `components/games/DailyPuzzleCard` on Learn › Today
  and the library-only `daily-puzzle` widget — all from the reads in `lib/games/store`.
- A scored game's round is counted in the browser and reported when it ends;
  `lib/games/rounds.keptRound` keeps only what a person could have played (bounded counts, a real
  duration, known settings). These are one reader's practice records, not a leaderboard. A record
  is the top score per game and settings key, read from `GameRound` rows
  (`lib/games/store.readGameSummary`); `lib/games/arithmetic.settingsKey` names Zetamac's defaults
  "zetamac".
- The Kelly coin, market-making and correlation games (`lib/games/kelly`, `market-making`,
  `correlation`) draw everything random from one seed before the first move, so a game is its seed
  and its moves. The page reports those, and `lib/games/rounds.keptRound` replays them for the
  score — a reported score is never taken on trust, and a move the game would have refused voids
  the report. Their terms (`kelly-criterion`, `fair-value`, `bid-ask-spread`, `adverse-selection`,
  `correlation`) are the glossary's `games` group, homed at `/games`.
- The arithmetic round is the pure reducer `lib/games/arithmetic-round`: the seed and the clock
  arrive in its actions, a problem is drawn from the seed and its place
  (`lib/games/arithmetic.problemAt`), and `components/games/ArithmeticGame` owns only the
  interval, the 1–5 keys (never with ⌘, Ctrl or Alt) and the one report a round sends.

### poker

- The poker solver (`/poker`: Equity, Push or fold, Pot odds, River) works everything out in the browser
  and stores nothing: no model, action or store; the page reads only the session. Every
  `lib/poker` module is pure and unit-tested; `lib/poker/cards` and `lib/poker/evaluator` import
  nothing, so the worker, the page and the Node table script share them.
- `components/poker/engine` is the one way a page runs a job: the Web Worker
  (`components/poker/engine.worker.ts`, created only by `components/poker/engine-worker-host.ts`
  beside it, since its `new URL('./engine.worker.ts')` is relative to that folder) when it answers
  `hello` within four seconds with `lib/poker/protocol.ENGINE_PROTOCOL`, else the page thread;
  `?engine=main` forces the page thread. A job is a generator (`lib/poker/jobs.pokerJob`) driven
  in slices by `lib/poker/drive`, the latest job winning; a stop unanswered within a second ends the
  worker. A change to the messages bumps `ENGINE_PROTOCOL`. A tab's inputs and last result live in
  `components/poker/session-store` for the page session only.
- Every figure is reproducible: Monte Carlo draws from its seed (`lib/random.mulberry32`) in fixed
  blocks of `MC_BLOCK`, so the worker, the page and Node agree to the bit, and `qa-poker` holds the
  page to Node. An enumeration stopped part-way shows no figure (its boards come in card order); a
  stopped Monte Carlo keeps its estimate and standard error. `lib/poker/showdown` is the one
  showdown sweep, checked against every pair.
- `lib/poker/data/preflop-equity.json` and `preflop-ranking.json` are generated by
  `scripts/poker-preflop-equity.mjs`, never edited by hand; `lib/poker/__tests__/preflop.test.ts`
  holds the table to the published equities and `equity.test.ts` to an enumeration of AA against
  KK. A thread loads the table only for a preflop job (`components/poker/preflop-table`); the range
  editor's Top x% reads the ranking (`lib/poker/ranking`) instead.
- `lib/poker/pushfold` solves heads-up push or fold to `PUSH_FOLD_TOLERANCE` by discounted CFR and
  measures the strategies it returns afresh, so the exploitability shown is that of the charts
  drawn. The shares are not monotone at fine steps — one seat can widen as the other tightens — so
  tests pin a coarse ladder of stacks.
- The river solver: `lib/poker/river/tree` builds the betting tree as flat arrays (sizes past the
  stack become the all-in, a raise adds at least the last increment, at most
  `RIVER_LIMITS.maxDecisions` decisions — `maxDecisionsOnPage` on the page thread); and
  `lib/poker/river/solver` solves it by discounted CFR (or CFR+), vectorised over each side's live
  hands, its folds and showdowns through `lib/poker/showdown`. Exploitability is measured at fixed
  iterations (10, 20, 30, 50, 75, 100, then every 50) and the solve stops under `RIVER_TARGET_PCT`
  of the pot. A stop sends 'stop' into the job (`lib/poker/drive`'s `finishOnStop`), which returns
  the average strategy so far; `lib/poker/river/view` reads a decision's per-class strategy.
  `lib/poker/__tests__/river-solver.test.ts` holds it to the polarized-range-against-a-bluff-catcher
  closed form and to a brute force over every pure strategy.
- Wording (invariant 12 applies): an equilibrium, never "optimal" or "GTO"; a hand wins against
  another, never "beats" it; "stronger", never "better"; no sentence opens on "Hold'em", which
  `findBanned` reads as "hold". The terms are the glossary's `poker` group, homed at `/poker`;
  `hand-equity` because net worth owns the alias `equity`, and no alias is a bare `range`, `ev`,
  `ratio` or `stack`.

### poker night

- A Texas hold'em table friends share by link, a feature apart from poker (the solver); it reuses
  `lib/poker/cards` and `lib/poker/evaluator` and changes neither. So far it is the pure engine and
  room layer in `lib/poker-night/`, the three models, the stores, the table's API under
  `app/api/poker-night/[code]/`, the lobby and the playable table (`/play/CODE`), live over Ably
  where a key is set and polling everywhere else, with its looks, emotes and the night's awards;
  the design and the phase still to come are `docs/specs/2026-10-06-poker-night.md`. State version 2
  (the modes work's P4) holds every stored field PLO, multi-board and Triple T need, so a later phase
  only switches them on: `lib/poker-night/config.ENABLED` (every game now: Texas hold'em, PLO on one
  to three boards, Triple T; the tests hand `checkConfig`/`dealable` a narrower list) gates
  the input paths (`checkConfig`: 'not-open') and the deal (`dealable`: a table set to a game this
  deploy does not deal waits between hands, its config intact), never the stored shape;
  `lib/poker-night/variants` (pure) is each game's evaluation (`handValue`, `bestHand`, Omaha's
  `hand-name.bestOmaha`), `readShown` (a shown hand read on every board, client and server alike),
  `limitOf`, `autoDiscard`; a hand keeps its own `variant`, one five-card run per board in `deck`
  and what is out of each in `boards`, and a pot pays board by board (`winners`/`shares` are
  `number[][]`, split by `pots.splitBoards`, the odd chips to the first boards).
- PLO (P5, one board): four cards each (`config.HOLE_CARDS`), a hand exactly two of them with exactly
  three from the board (`variants.handValue`/`bestHand` over `hand-name.bestOmaha`; never "plays the
  board", `playsBoardFor`), high only. Pot limit is `betting.legalFor`'s, on `BettingSnapshot.limit`
  and `pot` (the server's Σ committed; the client's Σ `SeatView.inPot`): at most to the current bet
  plus the pot after the call, never below the minimum, never past all in; the all-in move is a raise
  only within the cap (`betting.allInOpen`), the call facing the whole stack, else 'illegal' — so the
  raise panel's top is Pot (`bet-sizing.Sizing.cap`, `quickSizes`, `confirmLabel`) and its confirm
  sends a raise to it (`bet-sizing.moveFor`), never an all-in over the cap. The game is the host's,
  from the next hand: the lobby's one-tap buttons (`QuickStart`, `data-quick-start="holdem|plo|triple-t"`,
  Texas hold'em still the one tap) and `components/poker-night/GameChoice` in the start form and the
  host drawer (`lobby.GAME_CHOICES`/`boardChoices`, `overlays.GameForm.variant`); `variants.modeOf`,
  `nextModeOf` and `modeChanged` name the game in play and the next — the top bar's second line
  (`data-pn-mode-label`, the code from 400 px), the felt before the first hand, the countdown when it
  changes, a toast and an announcement at its first deal (the deal event's `changed`), the join
  card's terms with "How it plays" (the Hands drawer opened on that game, before the rankings —
  `overlay-requests.openOverlay('hands', {lead: true})`, `HandsGuide`'s `lead` — for a visitor too), the invite
  sheet, the link preview and every lobby and Home row (`LOBBY_PROJECTION` reads
  `state.config.variant`/`boards`; `lobby.modeLine`); every name is `MODE_COPY`. The dock fans four
  cards (`.pn-hole[data-count="4"]`, the night's width held by `data-slots`, at 0.8 of the card in the
  column of a phone on its side so the emote button keeps its row) and names nothing
  before the flop (`dock.handStrength(variant, …)`); a seat's four backs keep the two's footprint and
  a turned-up four overlap by `stage.SHOWN_STEP` (`shownHandRect(…, count)` via
  `BannerSeen.handSize`, which the banner and the pots keep clear of); the deal event carries its
  card count, which the choreography deals round in the time two take. `budget.test` holds PLO's
  heaviest table (pot raises to all in) to every budget too.
- Triple T (P7): three cards each (`config.HOLE_CARDS`); once the antes and blinds are posted the hand
  opens its throw-away — `Hand.phase` 'discard', nobody on the clock (`actor` null), `state.turn`
  moved on once and one deadline for everyone, `config.discardMs` (the turn's seconds, never above
  `DISCARD_MAX_SECONDS`, 20) — in which every player still in with three, all in from posting
  included, throws one away at the same time (`engine.discard`, the action `{type: 'discard', turn,
  card}`: refused 'not-seated', 'stale' for another throw-away's turn or past the deadline's grace,
  'not-now' out of it or thrown already, 'illegal' for a card not held); the last throw opens the
  betting as Texas hold'em does (`settleTurn` from the big blind), and from there the hand is Texas
  hold'em with the two kept (`PLAYING_CARDS`). At the deadline (`clock.nextDue`, every writer giving
  it the slack, there being no actor) `engine.timeout` throws for everyone still to
  (`variants.autoDiscard`, data-free: the odd one out when two match, else the lowest; flagged the
  clock's) and counts no timeout and makes nobody away, so a slow throw never folds a blind. A leaver
  who owes chips folds; one who owes none (the big blind, all in) has a card thrown for them at once,
  flagged 'auto'; a hand won in the throw-away ends with its winner's three, never shown. A card
  thrown away lives in `Hand.discards` (PRIVATE), its log line names no card (`'discard'`, amount 0):
  the public view says only how many a seat holds face down (`CardsView`, 3 then 2) and who is still
  to throw (`HandView.toDiscard`); the thrower alone gets it, `MeView.discard` and their history's
  `players[].discard` (`historyView`), and a show turns up the two kept. A throw is visible (the seat's
  count moves); `feed.nearTurn` counts everyone dealt in as near through it, and `feed.needsPrivate`
  reads the whole view when the seat's count no longer matches the cards held (the deadline threw for
  the viewer). At the table: `components/poker-night/DiscardPicker` in the dock (a radio group of
  three cards of 44 px or more, the one picked lifted 10 px, dimmed by filter and marked with an ✕;
  arrows move the pick, Enter on the card picked throws it; 1–3, Enter and Escape with the focus on the
  table, `keys.discardIntentForKey`, the digits held to the player's switch; Peek keeps them face down
  until pressed and never names the card; both it and its full-width confirm behind the tap shield),
  the throw-away's seconds and then what the two kept make beside it (`dock.DockView.discard`), the
  wait for the others with "Leave after this hand" once thrown, the card thrown flying off
  (`HoleCards`' `thrown`, `.pn-hole[data-slots="3"]` holding three's width the whole hand); the plates
  "Discarding…" (`TABLE_COPY.discarding`, `data-discarding`) over three backs, a third back flying to the
  middle as each throws (the log's `discard` event, `choreography` `BEAT.DISCARD_GAP`, the fold's
  swish); the felt's count (`dock.throwAwayCount`, "Everyone throws away one card · 3 of 5 done" with
  the seconds, inside the board's empty place: the count alone where it is narrow, nothing narrower); `overlays.attentionKey` (`turn:n` or `discard:handNo`, in place of the old turn key)
  closes the drawers, chimes and buzzes for the throw-away as for a turn; the screen reader hears the
  three cards at once, the viewer's own throw (or the clock's) with its card, the others' without, and
  the throw-away over (the `discarded` event); the hand log and history say the reader's own card
  thrown away to them alone (`LOG_COPY.youThrew`). Every sentence is `DISCARD_COPY`; the game's
  glossary entry is `triple-t`, its Hands section the guide's third game. `simulate.test` plays Triple
  T nights (throws, refused throws, deadlines, leavers in the throw-away), `views.test` scans them for
  another player's card thrown away, and `budget.test` holds its heaviest table to every budget.
- `lib/poker-night/engine.reduce` is the one way a table's state (`lib/poker-night/types`) changes:
  a pure reducer that clones once, never mutates its input and hands back the same reference for a
  no-op. Time, the deck and the first big blind's draw arrive inside the action, so a step replays
  exactly. `lib/poker-night/clock.advance` applies whatever has fallen due — a timeout once
  `TIMING.TURN_GRACE_MS` is past the deadline, a run-out street, the next deal — each at the moment
  it runs, so every new deadline counts from then; nothing wakes on a timer.
- `lib/poker-night/shuffle` is the engine's only server-only file and its only use of
  `node:crypto` (`SECURE_SOURCE`). The clock takes any `DeckSource` (`lib/poker-night/deck`), so
  tests deal from a stacked or seeded one. `lib/poker-night/__tests__/server-guard.test.ts` follows
  imports transitively: no 'use client' file (in `app/`, `components/`, `hooks/` or `lib/`) and
  nothing under `components/` may reach `shuffle`, the poker-night stores, identity, guest-token,
  pass, route-kit or realtime, and no 'use client' file, nor any of poker night's components, may
  reach crypto, mongoose, `database/` or the session. Ably is split the same way: the browser reaches
  only `ably/modular`, through a dynamic `import()`, and no server module does. A server page is
  not held to it.
- `lib/poker-night/views` is the only way state leaves the server: `publicView`, `wireView`,
  `playerView` and `historyView` copy field by field from a whitelist. `lib/poker-night/view-types`
  is the client contract (version 2: `TableView.v`), declared on its own, never an `Omit<>` of a
  server type, and it has no deck. The client offers moves with
  `legalFor(snapshotFromView(view), seat)`, the very function the server checks them with
  (`lib/poker-night/betting.legalFor`). To keep the wire to its budget a seat's face-down cards are
  their count (`CardsView` is `'none' | number | Card[]`), a paid pot carries its winners alone
  (`PaidPotView`; the shares are `pots.paidParts`/`seatShares`, the server's own split), a shown
  hand its cards alone (`variants.readShown`), and the ledger rows are tuples (`LedgerView`;
  `views.ledgerRows`/`ledgerRowOf` read them). Only the viewer's own `me` carries their cards, their
  thrown-away card, their pre-action, `next` ('leave' once they left now, 'leave-after' while they
  play out a hand they chose to leave after, 'sit-out' while a sit-out waits), the hand's asks they
  made or were asked, the hands shown to them alone (`shownToMe`), who they may ask (`canAsk`) and
  why not the rest they could (`askBlocked`, `asks.askChoices`: asks off, a cooldown, one waiting,
  the limit — the one thing a view says of another player's asks setting, what the engine's refusal
  would say), and their own `allowAsks`; `PlayerView.nudge` is their nudge count (below).
- Conservation: Σ stacks + Σ committed to a live hand + Σ cashed out = Σ bought
  (`lib/poker-night/ledger.conservation`), checked after every step of
  `lib/poker-night/__tests__/simulate.test.ts` (100 seeded nights; `PN_SIM_SEEDS=1000` runs more).
  Chips are bought only when they land (`recordBuy`), so a pending buy is not yet bought; net is
  chips + cashed out − bought, with chips counting what is in a live pot, steady mid-hand.
- A stored state field never changes meaning without bumping `STATE_VERSION`
  (`lib/poker-night/config`, now 2) and adding a step to `lib/poker-night/migrate`: `migrateState`
  hands a valid version 2 state back as it is, checks a version 1 one against its own frozen shape
  and steps it (`v1ToV2`: the config's game last, rebuys 'auto' read as 'approve', `leaveAfter` off,
  ledger times to seconds, a request's time kept, the hand's one board as a run and a
  board, pots paid on that board, shown hands as their cards), and refuses anything else;
  `migrateSummary` reads a PokerHand row written before version 2 as today's
  (`hands-store.readHand`/`readHands`). The version 1 fixtures (`state-v1-corpus.json`,
  `state-v1-showdown.json`, `summary-v1.json`) are each stepped, held to their invariants and
  played on in `fixtures-v1.test.ts`. A hand's log, a ledger row's events and a hand's asks are
  stored as number tuples whose kinds index `ENTRY_KINDS`, `LEDGER_KINDS` and `ASK_ANSWERS`,
  append-only lists; `lib/poker-night/__tests__/budget.test.ts` holds the state to 16,000 bytes,
  the room document to 27,200 for what each write reads (30,000 with the emotes) and the wire view
  to 4,500 on the heaviest table the engine builds, every private list at its longest on top
  (`PN_BUDGET_PRINT=1` prints the bytes: 14,798, 26,806, 29,457 and 3,787 when version 2 landed;
  each request's time, kept since, took the read past 27,000).
- The rules a change most often meets (the spec has the rest): the big blind always moves one
  eligible seat on (`lib/poker-night/seats.positions`); a short all-in reopens nobody who has acted
  unless the short all-ins since add up to a full raise, but a checker facing an opening all-in
  below the minimum bet may raise; the uncalled bet goes back even to a folded seat; every live hand
  shows at a showdown; a player who leaves or is removed while facing a bet folds at once, otherwise
  stays in, away, and is cashed out when the hand completes. "Leave after this hand"
  (`leave-after`, `Seat.leaveAfter`, private) plays the hand out as usual — not away, moves and
  pre-actions as ever — and cashes out once as it completes, a buy waiting for it dropped; it can be
  taken back until then, takes the place of a sit-out asked for (and of a request), a buy or an
  approval is `not-now` while it is set, and between hands (or not dealt in) it is leaving now — the
  one leave a page that stays open sends, so a deal that lands first never costs a blind
  (`seats.isEligible` leaves it out).
- Buys: before the first hand is dealt every seat and buy lands at once; after it, every buy but the
  host's — a newcomer's first chips, a re-sit, a rebuy, a top-up — is a request the host approves or
  declines (`ledger.needsHost`; one per player, the newest in its place, until decided, withdrawn
  with `withdraw`, or the player leaves). A newcomer waiting sits with nothing, is dealt nothing and
  has no ledger row until the chips land (as a buy-in: `ledger.hasBought`); the rebuy policy is off
  or on (`REBUY_POLICIES`: 'off' | 'approve'), and off stops rebuys and re-sits, never a first
  buy-in, nor cashes out a newcomer still waiting. Every buy waits however long the host is gone —
  nothing lands without their yes; a host unheard from for `LIMITS.hostTakeoverMs` is replaced by
  claim-host (an account holder at the table), and the requests wait for whoever holds the role. A
  request keeps its time (`TableState.requests[].at`): the same request again changes nothing, and
  its player may change its amount or take it back only `REQUESTS.CHANGE_MS` after the last change
  ('request-wait'), so a request comes and goes at most once every few seconds; a leave is never held.
  The host's approve names the amount it says yes to (`HostOp` approve's `amount`, sent by the toast
  and the bank's row): one the request no longer says is refused `stale`, and nothing lands. The
  break's one-tap Leave asks first only when there is no way back (`overlays.leaveTapAsks`).
- Asks to see a hand (`lib/poker-night/asks`, pure, read by the engine and the views alike; the
  engine's `ask`, `reply`, `allow-asks`): once a hand completes, a player dealt into it who folded
  may ask a player whose cards were not shown; the player asked answers with their cards to the one
  who asked alone ('one': in that player's `shownToMe` and history, `HandSummary.players[].seenBy`),
  to everyone ('all': a show), or no. Kept from spam on the server: one ask waiting per player,
  `ASKS.PER_HAND` a hand; one unanswered for `ASKS.WAIT_MS` is a no; after a no the same pair waits
  `ASKS.COOLDOWN_HANDS` hands; a player who turned asks off (`TableState.noAsks`, kept while seated
  or dealt into the hand asks are about — `ledger.cashOut` drops anyone else's, so it never names
  more than the seats and the hand's players) cannot be asked. Asks live in the hand, so the next
  deal ends every one, and one still waiting is a no, with its cooldown, even with seconds left (the
  results pause is never longer than `ASKS.WAIT_MS`, so an ask its player lets go by never comes back
  every hand). A cooldown is never dropped before its hands are up: the table holds
  at most `ASKS.COOLDOWNS_KEPT` cooldowns and waiting asks together, and at that cap a new ask is
  refused `asks-full` until some run out (`asks.asksFull`, in `askChoices` too). A Triple T card
  thrown away is never shown. Refusals `asks-off`, `ask-waiting`, `ask-limit`, `ask-cooldown`,
  `asks-full`, each with its sentence.
- Wording (invariant 12 applies): every sentence is in `lib/learn/copy/poker-night.ts`, held by
  `lib/learn/__tests__/poker-night-copy.test.ts` to the 'copy' tier and to a currency ban (play
  chips have no cash value). A hand wins against another and is "stronger"; its five cards are
  "the five cards that play"; no sentence or label opens on "Hold", "Hold'em" or "Buy" ("Press and
  hold", "Texas hold'em", "Chips in", "Rebuy"). `ACTION_COPY.does` is keyed on every `EntryKind`
  and `REFUSAL_COPY` on every `Refusal`, so a new kind or refusal does not compile without words.
- The room (`lib/poker-night/room`, pure) is the engine's state plus `players` — one row per
  account or guest, whose `pid` (11 random characters) is the only handle that leaves the server;
  `userId` and `guestId` never do — `bannedKeys` and `peopleV`. Its steps (`joinStep`, `actionStep`,
  `clockStep`, …) hand back the same core for a no-op. Removal is the engine's host op `kick` plus
  the room's ban: the removed pid's identity key (`u:<userId>` or `g:<guestId>`) joins `bannedKeys`
  and the row is marked banned, so that identity — or a signed-in browser still carrying the removed
  guest's cookie — is refused `banned` on join and on every request; `unbanStep` (the host only,
  "Let back in") lifts both, and the player returns as the row they were. `actionStep` checks the
  player's row on the core the compare-and-set read, so a removal that commits while a move is on its
  way still refuses it. The room keeps at most `LIMITS.players` rows: a join prunes stale watchers
  and, at the bound, lets go of departed guests' rows that hold nothing (no seat, request or place in
  the hand, unheard from in the active window, a settled ledger row, which `engine.forgetSettled`
  drops with it) — removed ones last, their keys kept in `bannedKeys` (bounded by
  `LIMITS.bannedKeys`) so the removal holds; account rows stay. `peopleV` moves exactly when a
  name, a look, a join, a pruned or let-go row, a removal or a let-back-in does, so the realtime
  message can leave the people out and a client refetches them when it moves.
- Identity (`lib/poker-night/identity`): the better-auth session wins, read only when a session
  cookie is present; else the app's own HMAC guest cookie (`lib/poker-night/guest-token`:
  `aero-pn-guest`, `__Host-` over HTTPS, httpOnly, Lax, 180 days, re-signed after 30 or after a
  rotation through `POKER_NIGHT_GUEST_SECRET_PREVIOUS`), minted only by POST join — for a browser
  with no identity, the guest its body's `joinId` names (`guestIdForJoin`), so a double tap or a
  retried join is one row; else nobody. A session read that throws is a 503, never a guest, and a
  guest is never a better-auth user. The seat pass (`lib/poker-night/pass`, `X-PN-Pass`, ten
  minutes, renewed past half its life) stands in for the identity on GET state, GET detail, GET
  token, tick and POST emote; join and action always read it in full.
- Every table request goes through `lib/poker-night/route-kit.playerRequest`, cheapest refusal
  first: the kill switch (`POKER_NIGHT_ENABLED`), `X-PN-Protocol` (426 reload), a POST's same
  origin, JSON and 2 KiB (read capped, `lib/poker-night/http.readCappedText`), the in-memory bucket
  (`lib/poker-night/bucket`; by the player a valid pass names on every route, else the address)
  before any database call, the code, the pass or the identity, the room's head (one projected
  read), the player. Mongo counters only on join (per address for every new identity; per room, read
  first and spent only for a row the join made, so turned-down joins never use it up) and on an
  unknown code, on every route and on the table's page. Its `json()` takes only `ResponseBody`
  (`lib/poker-night/view-types`), so a server room or a state does not compile into a response.
- `lib/poker-night/store.mutateRoom` is the one way the game moves: read, plan with the pure
  `lib/poker-night/mutation.planMutation`, write behind a compare-and-set on `seq` (five attempts,
  jittered backoff, then 503 busy). The plan: an action id already in the `applied` ring (36,
  `KEEP.APPLIED`) is answered as a duplicate; a room idle 12 hours closes; the clock runs to the request's
  `receivedAt`, then the step, then the clock to now — a turn's timeout at the turn's own time for
  the actor's own request, `TIMING.TIMEOUT_SLACK_MS` later for any other writer (`clock.dueFor`;
  the `nextDueAt` mirror the leader's tick is armed by includes it), so an in-time move still on its
  way is not beaten to the compare-and-set; a refused step still commits the clock's own changes,
  without its action id; nothing changed, no write. Every write moves `seq`; one only its author can
  see — a pre-action, a plan to leave after the hand or a sit-out asked for while the hand is live,
  an ask or its answer, the "let others ask" setting (`mutation.seenByOthers`, over its
  `withoutPrivate`) — moves `hiddenCommits` with it, and everything that leaves the server (views,
  Unchanged, `since`, the realtime message, the results' guard) carries `room-doc.publicSeq`, seq
  less those, so no browser reads their timing off a version; the author's own answer brings it at
  the seq held (the feed's `own` input). A write that changes another player's own view where the
  public table does not show it (`mutation.nudgesOf` over `views.nudgeKey`, both sides read at the
  commit's time — an ask's expiry written down by another pair's ask or answer, which the views
  already read as expired, nudges no one — : the player asked, the
  one who asked, a player the host sat out mid-hand) moves that player's row's `nudge` count
  (`mutation.withNudges`; private, never peopleV): the head projects it, a GET state sends the count
  it holds (`nsince`; one that names none asks after the table alone) and is read whole when it
  moved, every Unchanged and view carries the viewer's
  own, and `afterCommit` says it on their own channel (realtime, below). History rows are guarded by
  the document's own seq (`Commit.writeSeq`), which every commit moves, so an answer shown to one
  player alone is kept. A stored state `migrateState` refuses closes the
  room out of band, or answers reload when a newer deploy wrote it — on the reads too
  (`store.getRoomById` tells them apart, `room-doc.unreadRefusal`). The out-of-band fields
  (`seen`, emotes, `rt`, `lastError`) are never part of the write. `afterCommit`, in the route's
  `after()`, writes the completed hands (`lib/poker-night/hands-store`) and the accounts' results
  (`lib/poker-night/results-store`) and publishes the commit's wire view (realtime, below) when its
  public seq moved. The
  document mapping is `lib/poker-night/room-doc` (pure). Logs carry codes, seqs and messages, never
  a room, a state or a document.
- A GET or a page render never writes: only POST action, join and tick move a room, so a link
  preview, a prefetch or a loop of polls cannot deal a hand.
  `lib/poker-night/__tests__/route-guard.test.ts` holds every `app/api/poker-night/[code]/` route
  to `playerRequest`, Node and ten seconds, and no GET, file of the (play) group or route-kit to
  `mutateRoom`.
- Every room, hand and result query and index, every rate-limit key (`lib/poker-night/limits`) and
  every realtime channel carries the env (`lib/poker-night/env.envOf`: `VERCEL_ENV`, else
  development): a preview shares production's database and must never open a production table.
- The exits: every payload is one of `lib/poker-night/views`' projections or the room's views built
  on them (`room.playerViewFor`, `roomView`, `playPageView`, `room-doc.playerViewOf`,
  `views.bankDetailView`); the people (names and looks) are their own part beside the wire view.
- The lobby, `/poker-night` (a page of the Learn section, `app/(root)/poker-night/page.tsx`), composes
  `lib/poker-night/lobby-store.getLobbyView`, shaped by the pure `lib/poker-night/lobby.shapeLobby`:
  a section with nothing in it comes back null and is not drawn. A table counts as open while it is
  not closed and not idle past `TIMING.IDLE_CLOSE_MS` (its next write closes it), by one filter,
  `lobby.openRoomsFilter`, for the lists (`store.listOpenRooms`, the mirrors only) and the open-table
  cap (`store.countActiveHosted`, `LIMITS.hostOpenTables`). Friends' tables are only those whose host
  turned `showToFriends` on (off by default), hosted by `lib/friends/store.getAcceptedFriendIds`; a
  recent night (`results-store.readRecentResults`) is finished once its table closed or went idle.
  While the reader holds a seat at an open table, the Play tab opens on
  `components/poker-night/lobby/ResumeTable` ("You are seated at …", Rejoin): `lobby.resumeOf`, the
  newest of `store.listSeatedRooms` — the open tables the account has a player row at (the
  `{env, players.userId, status}` index), projected by `lobby.SEATED_PROJECTION` (the lobby's fields
  plus the players' and seats' pids and the seats' `leaving`) and kept by `lobby.holdsSeat`, so a
  watcher, a departed player or a seat on its way out is no seat; the pids never leave the server.
  Home's panel takes its tables from the same reads (### home).
- `lib/actions/poker-night.actions` is the lobby's only: `createPokerNight` (the create counter, the
  cap, `store.insertRoom` seating the host at seat 0 with the chip cap, under `lobby.profileOf` — the
  saved name and look, `lib/poker-night/prefs-store.getPokerNightPrefs` over
  `user-preferences.pokerNight`, else the first name and `avatar.avatarForUser(userId)`), then the page
  opens `/play/CODE?invite=1`; `closePokerNight` (the host's `end` through `mutateRoom`);
  `savePokerNightProfile`. The table never calls a server action, and nothing under
  `components/poker-night/` but `lobby/` imports one. My look offers the name and look a browser kept
  as a guest (`lobby.ME_STORAGE_KEY`, read with `readStoredMe` through `useSyncExternalStore`) to the
  account.
- The table, `/play/CODE` (`app/(play)/play/[code]`, a route group with none of the app's shell):
  its layout settles the address before anything streams — a 307 to the canonical code, a real 404
  for one that names no table (`app/(play)/play/not-found.tsx`) — and the page renders
  `components/poker-night/PokerNightRoom` (the viewer's view, or a visitor's table behind the join
  card), once closed `NightSummary`, and with the kill switch on the lobby's note. The layout, the
  page and its metadata read the room only through `lib/poker-night/page-gate.readTablePage` (once
  per request): a code that names no table spends the address's miss counter, as on the routes, and
  an address past it reads every code as gone, so no one learns which codes exist faster than the
  counter allows. It talks to the route handlers only, through
  `components/poker-night/table-api`, the seat pass on every request that may carry it (on a move it
  only names the player's own rate bucket).
- `components/poker-night/useTableFeed` runs `lib/poker-night/feed` (pure): `feedReducer` applies a
  view only when it is newer; `nextPollDelay` paces the polls; `createTicker` (over `tickerStep`)
  decides when the clock's tick goes — one out at a time, at most `TICK_RETRIES` more per due time on
  a doubling backoff, armed again only by a new due time or role or once the poll gets through after
  failures, never by an answer that lands meanwhile. A visitor polls nothing; the join card reads the
  page again every `VISITOR_REFRESH_MS`, so a removed, locked or full card learns it opened.
- Realtime (Ably) is on only where `lib/poker-night/channel.realtimeEnabled` says so: an
  `ABLY_API_KEY` shaped like one (Production only in Vercel, the key restricted to channels
  `poker-night:*` with publish and subscribe) and `POKER_NIGHT_REALTIME` not `off`; everywhere
  else — previews, local servers, the QA harness (run.sh blanks the key), CI — the table polls. The
  channel is `poker-night:<env>:<room id>`, never the code; the server publishes, in `afterCommit`
  for every commit whose public seq moved, `{name: 'state', id: <room>:<seq>, data: WireView}` —
  the public wire view without the people, so
  no hole card, deck, viewer's part or config — through `lib/poker-night/realtime` (`Ably.Rest`,
  built on first use, `serverExternalPackages` in `next.config.ts`); `budget.test.ts` holds the
  message, envelope and all, to `WIRE_BUDGET_BYTES` (4,500). A failed publish stamps the room's
  `rt` out of band (`store.markRealtimeFailure`, at most once a minute) and every answer says
  `realtimeOk: false` for five minutes — a view, a message, and an Unchanged too (the head reads
  `rt.failAt`). GET token (`app/api/poker-night/[code]/token/route.ts`)
  answers `{realtime: false}`, or the channel and an Ably `TokenDetails` — subscribe only, 15 minutes,
  the pid as clientId, a Mongo counter of 20 per 10 minutes per player — so no browser publishes or
  enters presence. `components/poker-night/realtime-client` loads `ably/modular` (`BaseRealtime`,
  `WebSocketTransport`, `FetchRequest`) by `import()` only when a table goes live, and never gives up
  on a first token (`feed.tokenRetryDelay`: 5, 15 and 45 s, then every five minutes); `useTableFeed`
  feeds each wire into the same reducer by seq, reads the whole view once after every (re)attach and
  whenever `feed.needsPrivate` says the viewer's own part went stale (a GET state's `since` is how
  far that part is known fresh, `FeedState.privateSeq`, which a wire carries on only while no move of
  the viewer's own is out), and lets the connection go after five minutes hidden. A whole view that
  comes back older than a message keeps its own part under the newer table when nothing between could
  have changed it (`feed.graftPrivate`: the same hand, seat, config and people), else is read again
  (`feed.readAgain`); while the part is stale the poll keeps the table's own pace (`feed.pollPace`),
  and a change to the table never puts off a poll already due. `feed.monitorStep`/`transportOf`
  choose the transport — the channel alone with a 20 s safety poll, both for `BOTH_FOR_MS` once it
  stalls (`transportPolicy`, `watchdogTripped`; `realtimeOk` taken from every answer and message, and
  from the page's own view at the start), polls
  alone without realtime — shown as `data-pn-mode` (Live only over a connected channel trusted alone)
  and `data-pn-transport`, beside `data-pn-seq` (the seq drawn). What goes on the channel is
  `lib/poker-night/room-doc.wireOfRoom` of the committed room. Each player also has a channel of
  their own, `poker-night:<env>:<room id>:<pid>` (`channel.privateChannelName`; the token's
  capability names both, `TokenReply.private`), on which `afterCommit` publishes only
  `{name: 'nudge', data: {nudge}}` (`realtime.publishNudge`) when a commit nudged them; the feed
  (`FeedState.nudge`/`knownNudge`, `isBehind`) reads their view then, and `needsPrivate` also asks
  for it as the hand they were dealt completes (who they may ask). `isWire` takes version 2 only
  and `http.PN_PROTOCOL` is 2, so a page left open across the deploy reloads. The QA seam: a dev
  server with
  `NEXT_PUBLIC_PN_RT_FAKE=1` (run.sh only) lets a page that defines `window.__PN_RT_FAKE__` take its
  messages from it — `qa-poker-night`'s relay builds them with `wireOfRoom` from Mongo and delivers
  them held back, out of order and twice; a production build compiles the seam out.
- The animations are `lib/poker-night/events.diffViews` (ids keyed by the hand number and the log's
  length, so each fires once) on `lib/poker-night/choreography`'s timeline, drawn by CSS keyframes
  from custom properties (`--pn-at`, `--pn-dur` in `--motion-base` units; a flight's `--pn-dx` /
  `--pn-dy` from `lib/poker-night/stage`) and exposed as `data-anim`: no SMIL, no Web Animations,
  every class in both reduced-motion guards and brutalist's loops stopped by name
  (`lib/theme/__tests__/motion-guards.test.ts`). Opacity never sits on a turning card (a fold turns
  the inner `.pn-fold-turn`). The one thing a timer moves is a winner's stack counting up, formatted
  text on the same token (`components/poker-night/CountUp`).
- The winner's banner and the line under it (the next deal's countdown, the pause) go where
  `lib/poker-night/stage.bannerPlan` finds room (`stage.resultBannerPlan` at the table: clear of the
  pots paying out and the winners' "+N" too where that leaves room, else of the table alone, since
  both leave within a second or two — never over a plate for the long pause after a hand), clear of every plate and its status flag, open seat,
  turned-up hand (`stage.shownHandRect`), the dealer button and the board with its lit cards' lift:
  the full banner with the line under it nearest the board on the pot's side, then its other side,
  then the felt's empty bands; then the compact banner (a line a winner, no avatar, wrapped when
  narrow); then each apart from the line; then cut short. Cut short, a line keeps its head whole, or
  says it without the chips (`BannerLine.short`: "Board 2: Ana", "Ana wins", the seat's "+N" saying the
  chips; `BannerPlan.short`), never cutting inside a number or a board's name: the plan names fewer
  winners — fewer boards — before a name is cut, and then only to a letter and an ellipsis. A line
  with no room is not drawn (the top bar says a pause too), and only when no banner fits does it name
  fewer winners. Both are drawn
  top-anchored in a wrap exactly the width found, never wider, from `reveal.bannerLines`' words and
  `stage.BANNER`'s sizes, which `stage.test` holds to the stylesheet and clears at 390, 375 and
  320 px phones and a 1440 px desktop for every seat count and button; `qa-poker-night` measures it
  there in a showdown with the side seats' hands up. While the pots pay out under it, it also keeps
  clear of their pills and of the winners' "+N" as it rises (`stage.winPopRect`); it comes in where it
  lands, growing from its middle (`.pn-banner-drop`), so on its way in it covers nothing its place
  does not.
- PLO's two and three boards (P6; `config.ENABLED.boards` 3, PLO alone): each board its own run,
  every board turned together; each pot split evenly between the boards (`pots.splitBoards`, the odd
  chips to board 1, then 2) and each board's part to its strongest eligible hand; the wire sends each
  paid pot's winners board by board and the page rebuilds the shares with `pots.paidParts`.
  `stage.stageLayout`'s fourth argument lays them out as one block (`stage.board`, each board in
  `stage.boards`) — stacked, side by side or cascaded (`CASCADE_STEP` leaves every card's index
  band, `INDEX_BAND`, in sight), each board's numeral at its left where there is room and it
  costs the cards no more than 8 % (`BOARD_LABEL`, held to the stylesheet; `LABELS_SHARE`) — on the felt and clear of every plate, bet line and
  button, and of every hand of four that may turn up unless that alone deals the cards under 18 px
  (`board.handsClear`); a second layout sending the bet lines along the rails is kept when it deals
  them larger; where the middle deals them under 18 px, anywhere across the felt that deals them
  larger (`board.x`, the felt's free half). The stage knows the seats nobody sits in
  (`StageOptions.open`, TableScreen's empty seats but a gone player's ghost): a ring alone, no plate,
  bet line, button or hand there, so on a 568 × 320 phone with four players at eight seats the boards
  move into the free half (about 20 px, not 14). The floors the spike measured are pinned in
  `stage.test` (16 px on a 320 px phone, 19 on a wider one, 20 on one on its side); on a 568 × 320
  phone with seven to nine seats taken nothing fits, and `fallbackY` puts them at `MULTI_BOARD_MIN`
  where they cover least, never a plate. The block is one 44 px button to
  `components/poker-night/BoardsSheet` (44 px cards); the seat ring (`.pn-seats`) takes taps on its
  seats alone. A lit card never lifts on two or three boards. The reveal's `BoardLook`,
  `liftBoardOf` and `scoopOf`: cards light board after board; the banner says a line a board, and
  one line only when one player won every board's share of every pot. The choreography turns each
  street board by board, flies each pot's shares to the boards' numerals (`stage.boardAnchor`)
  before each board's stream, and plays a pay-out that would outlast the result's `revealMs`
  faster, in proportion (`Scheduled.pace` scales the flights). The dock says each board's kind
  behind its numeral's badge (`dock.boardStrengths`, `components/poker-night/HandStrength`,
  `.pn-board-num`), each board's part whole on its line and the line breaking only between boards;
  the hand log and the announcer board by board; the boards' count is picked under PLO by
  `components/poker-night/BoardsChoice`. The boards sheet draws the places still to come in the
  palette's muted ink (`.pn-sheet-board .pn-slot`: it is portaled out of the room, where no felt is set).
- One board (`stage.stageLayout`, `placeBoards`): the widest cards in the band round the middle,
  at every pixel from it, a row counting at the width that fits a pixel over and under it too; among
  those within `BOARD_TIE` of the widest the nearest the middle, one under it only when
  `UNDER_BIAS` nearer — and, given `StageOptions.prefer` (where TableScreen drew it a moment ago, kept
  as a share of the height for the layout it belongs to), the nearest that, so the dock's line wrapping
  a pixel never sends the board across the felt and back. A dealer button sits beside its bet line on
  the side away from the middle, half a pixel (`EDGE`) past touching, so a floating hair never moves
  it. In PLO (`StageOptions.handSize` 4) the board keeps clear of every hand of four that may turn up
  wherever that leaves its cards 18 px or more (`board.handsClear`); Texas hold'em's and Triple T's
  board is laid out as before. A hand turned up that meets another's moves along its row
  (`SeatPlace.shownDx`, `--pn-shown-dx`; `stage.nudgeHands`, `stage.handsMeet` allowing a lit card's
  lift under the hand over it): side and bottom seats placed first, then the top row, toward the middle
  first, else the other way, clear of every plate (and, two cards, the board placed first) — or the
  hand it meets moves instead. Where that still leaves a hand of two over another seat's plate, the
  flag under one (sized as "Out of chips"), another hand or the board — a crowded column of side seats:
  nine on a 375 or 320 px phone, seven or more on one on its side — `stage.placeHands` places every
  hand again (`SeatPlace.shownDy`, `--pn-shown-dy`), a seat at a time round again until none moves and
  then two that still meet together, at the place covering least (`HAND_WEIGHT`: a plate, the board, a
  pots' band, another hand, a flag): along its row, on its plate's other side (under a side seat's) or
  beside it toward the middle — always next to its own plate — and keeps one of the pots' bands by the
  board (`potBands`) clear, so the pots keep a place; never its own plate. Nine hands up on a 320 px
  phone or eight on the smallest phone on its side can still leave two meeting (the banner then sits
  where the pot was, flagged); PLO's four keep the row nudge alone. The emotes' spot reads a hand moved
  under its plate (`emotes.emoteSpot`).
- A plate's status word (`lib/poker-night/plate.plateStatus`: "Folded", "All in", "Offline",
  "Waiting for chips", "No chips yet" for a seat that never had chips here — never "Out of chips" —
  …) hangs under it where `stage.flagRoom` finds room clear of every other seat's plate (an open
  seat's ring), its cards face down, its blind's mark and its flag, every seat's word weighed
  (`SeatRing`); where it has none (`stage.flagsOnPlate`: a crowded column on a phone on its side,
  the widest word on a 320 px one), the plate carries it — Triple T's "Discarding…" as a dashed ring
  (`data-pn-mark="discarding"`, the felt's count and the backs saying who is still to throw), any
  other word in the stack's place, the name beside the avatar (`data-status-on="plate"`,
  `.pn-plate-status`; the stack stays in the plate's accessible name). A squat box — a phone on its
  side, the dock in its column (`layout.isSquat`) — seats eight two to a side column
  (`layout.SQUAT_SLOTS`), so every word hangs there; seven and nine keep the portrait slots, whose
  hands, pots and banner find room where no squat placement leaves them all.
  Three or four cards face down (Triple T's, PLO's) start a whole card's width over a compact or tight
  plate (`stage.SEAT_CARDS_OVER`, `seatCardsRect`'s count, `PotSeen.backs`), above the stack's figures
  that their closed fan would cover; `qa-poker-night-modes`' `tableLayout` counts flags over other
  seats and figures under their fan.
- The pots go where `lib/poker-night/stage.potPlan` finds room on the felt inside its rail
  (`stage.feltSpan`), never over a card (the board's and its lift, a seat's face-down pair, a turned-up
  hand), a plate, its flag or blind's mark, an open seat, the dealer button, a bet line out at the size
  ChipStack draws it (`stage.betLineSize`, an all-in's pulse included) or a winner's "+N": every pot
  its own pill in full ("Main pot 600", "Side pot 1: 1,350") in a row, then short (`FELT_COPY`: "Main
  600", "Side 1: 1,350", counts as a plate prints them), then in rows, then the last side pots
  gathered ("2 more: 5,050"), every pot in one pill last ("4 pots: 6,250") — the nearest to the board
  over it, under it or beside it, the fuller words weighing in their favour. It keeps clear of what
  shows now (`PotSeen.now`, which TableScreen reads off the view) and, where that is near enough, of
  what may yet show — every seated hand but the viewer's turned up, every bet line — so the pills hold
  their place and move only when something lands where they are. With no room for that on the felt
  it lets a "+N" rise over a pill, then leaves the felt, and only where nine seats crowd the smallest
  phone on its side does it cover anything: the least, a flag or a bet line before a card, a plate or
  the board (the plan's `keeps`, `clear` and `felt`, the page's `data-pn-pot-*`). Each pill is drawn
  at the plan's size (`.pn-pot-pill`, `stage.POT_PILL`, held by `stage.test` for one pot to four at
  every seat count on the phones upright and on their side and the desktop); the sweep lands in their
  middle and each pot's chips stream from its own pill (`stage.potCentre`). `qa-poker-night-modes`
  builds three pots and measures every pill against every card, plate, bet line, "+N", the dealer
  button and the banner.
- The table's single-key shortcuts (`lib/poker-night/keys`) act only with the focus on the table,
  and only while the player keeps them on (My look, `PersonalLook.shortcuts` in this browser); Enter
  on a focused button is that button's. A host removes a player only by a press held for two seconds
  (`components/poker-night/HoldToConfirm`), never a typed name, and lets them back in from the host
  drawer.
- The way out: Home in the top bar, and the way back wherever a guest can land (the join card, the
  summary, `error.tsx`, `not-found.tsx`, the kill switch), is `components/poker-night/HomeLink` —
  `/` by a full page load (the landing page for a guest through `proxy.ts`), never `/poker-night`,
  which sends a guest to sign in. A seated player's Home and Leave go through `LeaveDialog`, read on
  every render from `lib/poker-night/overlays.leavePlan`, so a deal that lands while it is open makes
  it the mid-hand one, which offers both ways: "Leave now" (`leave`) and "Leave after this hand"
  (`leave-after`, the primary, which never navigates — from Home too). Every leave that keeps the
  player on the page — the dock's Leave, the dialog's between-hands Leave — is `leave-after`, sent
  through `components/poker-night/useLeaveAfter`, which toasts how it landed (a deal that beat it to
  the table, `overlays.leaveAfterLanded`: "A new hand was dealt first …"); only "Leave now" and Home's
  "Leave and go" send `leave`. The dock offers Sit out and Leave whenever the viewer is not playing a
  hand (`dock.sitOut`/`leave`, the pause after a showdown they reached included) — one tap unless
  `leaveTapAsks` — and after leaving a left panel (`leftState`). What the viewer's own seat does when
  the hand ends is `MeView.next` ('leave', 'leave-after', 'sit-out'; private, never on the wire),
  since a folded or all-in plate keeps reading so: once they left now the dock says they leave when
  it ends and offers nothing more, and Home goes straight home (`overlays.homeAsks`, `leftNow`);
  while they leave after the hand the dock says "Leaving after this hand" ("Last hand" in a narrow
  dock) with Stay in place of who the table waits for (hidden on their own turn), Home carries a dot
  and the menu offers "Stay at the table" beside "Leave now"; while a "Sit out next hand"
  waits, the dock says so and offers "Deal me in" (`dock.takeBack`, a sit-in). A row that takes
  another's place under the thumb (the action bar, the early choices — keyed by `dock.preRowKey`, the
  hand and its choices — and the seat's controls) drops pointer taps for `keys.TAP_SHIELD_MS`
  (`useTapShield`, `data-pn-armed`). A folded hand stays its player's to see, dimmed, until the next
  deal (`me.hole` is kept; `dock.mucked`), and reaches the table only by "Show my cards" (a
  secondary button after Sit out). The host sits another player out — from the bank's row (a line of
  its own under it) or the host drawer's More menu, one hook (`components/poker-night/useHostSitOut`)
  over the map `TableOverlays` keeps — with the engine's host op `sit-out` (from the next deal in a
  live hand, at once between hands). It only ever sits out: the state never says who asked, so a
  take-back could deal in a player who asked to sit out themself; dealing a player back in is theirs
  alone. The player's page tells the host's from its own (`overlays.rememberSitOut` over the seat's
  state and `me.next`, with this browser's `SIT_OUT_ASK_KEY` note for another tab or a reload). A
  complete hand's `HandResultView.gone` names the seats whose player went since the deal, read
  through `reveal.playerAt`, so a result never names the wrong player — nor tells someone who took a
  winner's seat in the pause that they won (`reveal.viewerSeatIn`).
- Leave after this hand, at the table: one tap while the viewer holds cards in the hand in play
  (`overlays.leaveAfterOf`, `dock.leaveAfter`) — a door beside the early choices (`Dock`'s
  `LeaveAfterToggle`, its word "Leave after hand", `TABLE_COPY.leaveAfterShort`, in a wide dock,
  shielded with them; `.pn-pre-row` puts it on a row of its own in a dock of 18rem or less, a phone
  on its side), a button in the seat's row while all in (the same short word), the menu's toggle —
  and, once folded, the break's Leave. "Last hand" is only the state's word, beside the cards with
  Stay; in a dock of 18rem or less that line (`.pn-dock-line`: the seconds, who the table waits
  for, the note, the hand's name) takes a row of its own under the cards. An early choice's label
  breaks after its slash (`PreActions`), never spilling over the next button. The seat empties as
  the hand completes; while its result shows, a seat whose player went keeps a ghost of their plate
  (`SeatRing`'s `GhostSeat` from `HandResultView.gone`: the name, the look, the cards they showed,
  "Left"; never a menu or "Sit here"), which the pots and the banner keep clear of (`TableScreen`).
- The host's yes, at the table: the join card says it once the first hand is dealt
  (`JoinView.needsApproval`, `JOIN_COPY.approvalNote`); a seat whose chips wait reads "Waiting for
  chips" on every plate (the public `requests`) and its dock "Waiting for the host to approve your
  chips" with Cancel (`withdraw`; `dock.waitingChips`), as the bank does, however long the host is
  gone (no way round them: `overlays.buyAsksHost`). A Cancel (marked as it is sent,
  `overlay-requests.markOwnWithdraw`) or a leave is never said as the host's no
  (`overlays.requestEnded`: 'withdrawn'). A seat that never had chips here reads "No chips yet."
  with one tap, "Ask for 2,000 chips" (`bank.buyOptions`' `first`), never "Out of chips" or a
  top-up. The host sees a toast with Approve for each new request and hears a short sound (`sounds`
  'request') at most once a player in `REQUEST_SOUND_MS` (`components/poker-night/AskPrompt`'s
  `RequestWatch`, `overlays.requestAlerts`); a request whose amount changed is said again in its
  toast's place, silently, its Approve naming the new amount; a dot on Bank and Host, and the bank's
  rows say what each is for (`overlays.requestKind`: to sit down, a rebuy, a top-up). The bank's
  figures keep a gap at their left; under 22rem (a 320 px phone's drawer, a container query) the
  Rebuys column gives way to a count under each name (`BANK_COPY.rebuysCount`). A table toast's
  action is a 44 px target (`overlay-kit.TOAST_ACTION`). The rebuy policy is Off / On (host
  approves) in the start form and the host drawer (`components/poker-night/RebuyChoice`, a radio pair
  over `ChoiceGroup`, whose chosen ring is drawn inside the option, so a panel's edge never cuts it).
- Asks, at the table: another player's seat menu leads with "Ask to see their cards"
  (`overlays.askOffer` over `canAsk`, `askBlocked` and the viewer's own `asks`): offered, greyed with
  its reason, or how the viewer's ask of them stands — read at the server's time, so an ask that ran
  out frees the rest with no write; the menu opens toward the table's middle (`stage.menuSide`), whole
  on screen. The player asked sees `AskPrompt` at the foot of the screen, over their own corner and
  nothing of the table — no other plate, turned-up hand, board, pot or banner (`.pn-ask-wrap`: over
  the dock, under the thumb; on a phone on its side, in the dock's column) — while one waits
  (`overlays.askToAnswer`): who asks, its seconds, which run to the next deal when that comes first
  (`overlays.askEndsAt`), "Show Ana" / "Show everyone" / "No thanks", 44 px behind a tap shield, and a
  short sound ('ask'). A hand shown to the viewer alone turns up on its plate for them ("Shown to
  you", `Seat`'s `privateCards`) and in the hand log ("Shown to you: Ana held …", `hand-log`'s
  `seenLines` from `shownToMe` until the history row has it); `AskWatch`, mounted for every joined
  viewer, toasts how each of their asks ended (`overlays.askNews`), the next deal ending one first
  included ('dealt'). "Let others ask to see my cards" is a switch of the personal look
  (`PersonalLook.allowAsks`, saved with an account), which `PokerNightRoom` sends as `allow-asks`
  whenever the seat lacks it (the room forgets it for a player without a seat). Through a result's
  pause the polls come every 1.5 s for a player dealt into the hand (`feed.askWindow`), since the
  next deal ends every ask.
- The Hands guide: `lib/poker-night/hands-guide` (pure) holds the ten rankings strongest first, each
  a five-card example with the cards that make it (`RANKING_EXAMPLES`), the kicker pair
  (`KICKER_EXAMPLE`) and the games (`GUIDE_GAMES`: Texas hold'em, PLO and Triple T, each with its
  glossary entry, the limit's entry when it is not no limit (PLO's `pot-limit`) and its anchor;
  `guideGames` puts the table's own first among them — `guideGameOf` of `variants.modeOf` at the
  table — after the rankings and ties in the drawer, which a player opens mid-game for the rankings;
  PLO's section draws `PLO_EXAMPLE`, one hand on one board, the five that play lifted).
  `hands-guide.test` holds every example to the evaluator. `components/poker-night/HandsGuide` draws it with no hooks, so the lobby's Hands
  tab renders it on the server and `components/poker-night/HandsDrawer` at the table (the menu's
  Hands, the H key, any viewer). Each definition is the glossary's own short, quoted under its
  `<Term>` (`hand-rankings`, `kicker`, `texas-holdem`, `omaha`, `pot-limit`, in the `poker-night` group), and
  `HANDS_COPY` says only what they do not: the copy test rejects a run of five words shared with
  them. The lobby is two views (`?tab=play|hands`, `components/primitives/Tabs` at `size="md"`); the
  Hands tab reads nothing and shows with the kill switch on, and `[data-poker-night-lobby]` marks
  Play only.
- Emotes (`lib/poker-night/emotes`, pure): thirteen reactions, sixteen phrases and ten throwables,
  each glyph one Emoji 12.0 code point kept as a number (never a glyph in a `.tsx`), each id worded
  by `EMOTE_COPY` — no free text anywhere. Seated players only (`checkEmote`); a throw needs the
  host's `throwables` and another seated player. `app/api/poker-night/[code]/emote/route.ts` writes
  out of band, never through `mutateRoom`: one conditional `findOneAndUpdate`
  (`room-doc.emoteWrite`, through `store.pushEmote`) whose filter is the sender's 1.2 s cooldown
  (`emoteAt.<pid>`, stamped with the request's arrival, `receivedAt`, so no counter is written and
  a second emote inside it is 429; the picker's cooldown starts again on the answer), whose pipeline
  gives the emote the room's next `emoteSeq`, keeps the last `KEEP.EMOTES` and counts a throw in
  `awards` for the night summary; `after()` publishes it as the channel's `emote` message.
  Browsers merge emotes by id (`feed.withEmotes`: the emote seq moves only without a gap, so a poll
  never skips one) and draw them in `components/poker-night/EmoteLayer` — lifetimes on timers
  (`EMOTE_TIMING`), at most `ON_SCREEN_CAP`, nothing older than 8 s, only the impact under reduced
  motion, muted all (`PersonalLook.muteEmotes`) or one player for the visit (`SeatMenu`). Where
  they sit is `emotes.emoteSpot` and `throwPath`'s ceiling, from `stage`'s sizes (`AVATAR_PX`,
  `SHOWN_CARD_PX`, `TABLE_TOP_ROOM`, held equal to the stylesheet): clear of a seat's turned-up cards
  and tag, under a plate along the top, never behind the top bar; an impact lands on the target's
  avatar (`stage.avatarCentre`), one per plate (a new one replaces it), with its own landing sound
  (`emotes.landingSound`), told whichever settles the screen first — the store's timer, or new
  emotes arriving the moment the throw lands (`emotes.landedBetween`).
- The table's feel (`components/poker-night/TableFeel`): sounds synthesised by Web Audio from
  `lib/poker-night/sounds`' recipes — layered, physically shaped tones and filtered noise: a card's
  swish and snap, two to four clay chips clacking, a knock, the muck's sweep, and each thing thrown its
  own landing (`HIT_SOUND_IDS`, `emotes.landingSound`: a fish's 60–180 Hz body, wet slap, falling
  squelch and droplets; a tomato's splat and drips; an egg's crack then splat; …) — each part with its
  own attack and exponential fall (`partLevel`, the player's envelope), played from a seed
  (`soundParts(id, seed)`: a cue's key, a landing's emote id through `soundSeed`, else fresh), so one
  seed is one sound on every screen and no two throws, chips or cards quite alike; the turn's chime,
  the arpeggio, the pop and the two notes of a request never vary (`FIXED_SOUNDS`). `sounds.test`
  holds every recipe over many seeds to `SOUND_LIMITS` (a part ≤ 0.35 gain, its layers together ≤ 0.75,
  40 Hz–10 kHz, ≤ 1.2 s); the parts meet in a master gain behind a gentle compressor. Each sound at its
  animation's moment on the motion token, one audio context made and resumed inside a
  gesture a browser counts (`sound-player.stayUnlocked`: click, a touch's pointerup or touchend,
  mousedown, keydown — never a touch's pointerdown — again whenever it stops running), at most
  once per 60 ms, silent while hidden but for the turn's chime; a buzz on a
  phone's turn — and, for a phone that cannot buzz, the dock's edge and "Your turn" breathing on
  `.pn-pulse` (`.pn-turn-edge`, `.pn-turn-cue`, still under either motion guard) — the screen kept
  awake while seated (`useWakeLock`), the room's keys E, L, B, M and ?
  (`keys.roomIntentForKey`, `useHotkeys`) and their list (`ShortcutsDialog`, also in the top bar's
  menu, which also turns the sounds on or off: a check, said as M says it) — each honouring the
  player's own `PersonalLook` switch.
- The table's small conveniences (P8): a move's tag stays on its plate, still, for the rest of the
  street (`reveal.streetTags` from the log tail: the last check, call, bet or raise, never a blind, a
  fold or a card thrown away; `data-tag-still`); the raise panel's − and + step a big blind
  (`bet-sizing.stepRaise`, 44 px) and it opens at the size the player last confirmed before or after the
  flop where this turn offers it — the minimum, ½ or ¾ pot, never the all-in or the pot — kept in this
  browser only (`SIZE_MEMORY_KEY`, `readSizeMemory`, `rememberSize`, `initialRaiseTo`); out of chips,
  the dock's one tap buys the whole buy-in the table allows ("Rebuy 2,000 chips", or "Ask for 2,000
  chips" where the host says yes first: `dock.rebuyTap`), "Other amount" opening the bank only when
  there is another to choose; the winner's banner is a button that opens the hand log; and for a seated
  player an open seat says "Invite" and opens the invite sheet.
- Looks (P5): every colour the table draws is a literal in `lib/poker-night/looks` — eight scenes
  (a gradient sky, an art id and an ambient loop each, `my-theme` the viewer's own palette tokens),
  eight felts, eight card backs, two faces, two suit schemes, four chip sets, the avatar colours —
  rendered to `LOOKS_CSS` (data-attribute selectors and `--pn-*` properties only, injected by the
  (play) layout and the lobby page; `looks.test` holds its CSS safety and its contrast). The DOM
  carries whitelisted ids (`sceneFor`, `feltFor`, `cardBackFor`, …); `components/poker-night/SceneArt`
  draws in `.pn-ink`/`.pn-glow` only. The host picks the scene, the felt and throwables for
  everyone (the room's settings, applied at once from the host drawer's Look section; a signed-in
  host's pick also becomes their new tables' default, `prefs-store.saveTableLook` after the
  action route answers); each player picks the rest for their own eyes (`lib/poker-night/personal`):
  kept in localStorage `aero-poker-night:me` field by field (`nextStoredMe`) the moment it changes
  at the table, laid over an account's saved look (`effectiveLook`), and saved to the account only
  from the lobby's My look (`savePokerNightProfile`, which offers what a browser changed; a save
  clears the browser's own look, `personal.afterAccountSave`, so a later save elsewhere reaches its
  tables) — /play never calls a server action. `peek` keeps the viewer's cards face down in the dock
  until pressed. A seated player's new name and look wait for the hand in play
  (`overlays.profileWaits`): My look's draft is the room's (`profileDraft`), outlasting the drawer,
  and a save mid-hand is sent by itself when the hand ends. The avatar builder edits one part at a
  time (`avatar.withPart`) and rolls only in a click handler. Whatever sits over the scene draws its
  own ground: an open seat is filled with the felt, a card that does not play dims by filter, never
  opacity.
- The night's awards (P7, `lib/poker-night/awards`, pure): `nightAwards` gives Biggest pot
  (`biggestWin`), Most hands won (`wins`), Highest stack (`peakChips`, only for a player dealt a
  hand, since a buy-in alone sets it) and Most all-ins (`allIns`) from the ledger's counters, and
  Tomato magnet and Most roses given from the throws the emote route counts in the room's private
  `awards` (`throwCountsOf` keeps only a pid, a registry throwable and a whole count). An award shows
  only when its figure is above zero; a tie names everyone, in the standings' order. Only a closed
  table's page reads them, on the server (`core.state.ledger` and `store.readNightThrows`, one
  projected findOne), and `summary.summarize` hands the page names, looks and figures — never a
  counter or an identity. `components/poker-night/NightSummary` draws them under the final counts
  and opens with a celebration (the table's `.pn-confetti` in a clipping fixed layer, from
  `awards.celebrationBits` seeded by the code, and `.pn-award-in` cards on the motion token); Copy
  summary adds a line per award (`SUMMARY_COPY.text`). The table's words — side pot, dealer button,
  small blind, minimum raise, rebuy, all in — are the glossary's `poker-night` group, homed at
  `/poker-night` (big blind and ante stay the solver's); the bank's Rebuys header is a `<Term>`, and
  the table has no `WhatTheseMean`, whose rows offer a chat /play does not mount.

### chat

- `lib/chat/explain` shapes what `explainTerm` hands the model, with `lib/chat/learner-hooks` its
  per-metric account reads. `decodeQuotedReason` reads a quoted reason with the strategies' grammar
  or the Navigator's — a `writer` hint first, the other only for what the first leaves whole; with
  no hint a shape both read comes back read both ways.
- `lib/chat/quant-strategies` shapes what `getQuantStrategies` hands it: the leaderboard rows read
  through `getStrategyLeaderboard`, or one strategy's latest run from
  `lib/strategies/page-store.getLatestRun`, with each reason decoded with its def and the board cut
  to its top rows.
- `components/chat/ChatWidget` mounts the one launcher — the robot, aria-label "Open Aero-AI
  Assistant", the QA's handle — and, on `/topics` pages only while the panel is closed, its speech
  bubble `components/chat/RobotTipBubble`. The tips are `lib/learn/copy/robot` (`ROBOT_TIPS`: the
  lead tip first, the rest in the day's order, none twice in a browser session —
  `lib/chat/robot-tips`, sessionStorage `aero-robot:shown`, never an `aero-chat:` key); a tip the
  reader is on — the pointer resting on it, focus inside it — is not taken away
  (`lib/chat/robot-tips.ROBOT_TIP_HOLD_MS`), and the launcher takes the focus a leaving bubble still
  holds; "Try it" prefills the composer through `lib/chat/ask.askAdvisor` and sends nothing, so a
  tip's prompt is chat input and held to the advice tier like a chip. The robot moves by CSS keyframes only
  (`.robot-bob`, `.robot-eyes`, `.robot-antenna`, `.robot-tip-in` in `app/globals.css`), each
  listed in both reduced-motion guards; brutalist stops the loops by name because the zeroed tokens
  do not stop a keyframe. No SMIL, no WAAPI: the sweep's STILL css and the guards stop only CSS.
- The panel's usage caption is `lib/chat/usage` (pure: the three windows as {used, limit, left,
  resetsAt}, the window that refuses next, and the caption's clauses) over
  `lib/chat/usage-store.readChatUsage`, served by `app/api/chat/usage/route.ts` and read by
  `components/chat/useChatUsage` on open and after each reply or refusal. It peeks through
  `peekRateLimit` and never spends: a refused request and an opened panel leave every count
  exactly where `app/api/chat/route.ts`'s `takeRateLimit` calls put it. The caption is a `<div>`
  carrying `data-chat-usage`, never a `<p>`: `scripts/qa/qa-chat-tutor.mjs` reads the panel's
  error copy from its `<p>` elements. Its sentences are `CHAT_USAGE_COPY` in `lib/learn/copy/chat`
  — the day and shared clauses always, the hour clause only while the hour is the wall and low,
  one "resets in" for the warned window else the day's, and none before a window has opened
  (invariant 8). "Messages", not model calls: one message may spend up to five model steps.

### email

- `lib/site` is the product's name and its one public address: email links are `PRODUCTION_URL` in
  production and the app's own `BETTER_AUTH_URL` elsewhere (`siteUrl`). The sender is
  `"AeroTrade" <NODEMAILER_EMAIL>`; `lib/__tests__/brand-name.test.ts` fails if an old product
  name comes back anywhere in the repo.
- Every email is one light frame, `lib/email/layout` (pure): nested tables, inline styles, no
  images, a hidden preheader, a dark-mode block for Apple Mail. Its blocks escape every text
  argument, and `lib/email/layout.linkOrText` is the only way an email makes an anchor — http(s)
  only. Every fixed sentence is `lib/learn/copy/email`; the welcome and reset emails are
  `lib/email/templates`.
- The daily brief takes the morning briefing's pattern. `lib/email/prompts.buildDigestPrompt` shows
  the model numbered articles — headline, the outlet's own summary, the outlet, the kind of source,
  which of the reader's symbols it is about — and no URLs; `lib/email/digest-summary` keeps only
  the bullets and stories that cite an article it was shown, and when the model wrote nothing
  usable (a refusal, a 429 that outlasted Inngest's retries) `fallbackDigestSummary` mails the
  leading articles in their outlets' own words instead of skipping the reader.
- `lib/email/digest-view` decides everything the brief shows: a story's section comes from its
  cited articles (the reader's own symbols first, then wire/RSS, their news feed, SEC filings and
  Reddit, the last two with a caveat); ticker chips name only the reader's symbols and link to
  their stock pages; the AI Navigator's decisions are a table built from the stored set, never
  shown to the model. `allowedUrls` is every link it holds — `lib/email/digest-render` sanitises
  the HTML it builds against it, then adds the topics and lesson sections, each already sanitised
  against its own (`topicsSectionLinks`, `lessonSectionLinks`). The plain-text part spells out
  every link.
- One brief per reader per ET day: the send step claims the day in `DigestSend`
  (`lib/email/digest-store`, unique on user and day) before it sends and releases it if the send
  throws, so a retry, a manual trigger or a duplicate environment cannot mail anyone twice. A test
  send (`event.data.email`) names one opted-in reader and takes no claim.
- A preview build never sends mail (`lib/email/send.mailerReady`): it shares production's mailer
  and readers.
- Today's lesson in the daily email, `lib/email/sections/lesson`: a moment dated exactly
  yesterday — the noon run must not mail a morning fill twice — else the day's concept, in the
  widget's own copy. Every string is escaped; `lessonSectionFor` sanitises it with
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
- Crons run in production (and a local dev server) only: `triggersOf` drops them on a Vercel
  preview build. The Inngest Vercel integration syncs every preview into a branch environment of
  its own, and a preview carries production's database, mailer and model keys — on 2026-10-05
  eight copies of every job were running against production, and the noon digest failed on the
  shared quotas. Events still reach a preview, so a branch can be tested by hand.

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

- `/settings` shows one section at a time (`?tab=`), each reading only its own data. The daily
  email's `/settings#notifications` is sent to its section by
  `components/settings/SettingsHashRedirect`, as `/learn#term` is by its own.

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
