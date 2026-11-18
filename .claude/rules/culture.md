---
paths:
  - "lib/culture/**"
  - "components/culture/**"
  - "app/(root)/culture/**"
  - "lib/actions/culture.actions.ts"
  - "lib/jobs/functions/culture.ts"
  - "lib/learn/copy/culture.ts"
  - "database/models/culture-*.model.ts"
  - "scripts/qa/qa-culture.mjs"
---

# culture

Contracts of this feature that a map cannot show: a part of `AGENTS.md`, kept in a file of its
own so it loads only beside the files its `paths:` name. A `### name` in the text is that
feature's file in this folder; Shared, owner and the numbered invariants are in `AGENTS.md`;
the map is `docs/MAP.md`.

- The culture brain keeps its own collections — the `culture-*` models, read and written only by
  `lib/culture/store` and `lib/culture/picker-store` — and never writes `BrainEntity` or
  `NewsItem` (invariant 3, extended; `lib/culture/__tests__/guard.test.ts` holds the import graph).
  Its decay maths is the pure `lib/brain/decay`, shared.
- `lib/culture/catalog.ts` is the universe: a brand's id is its entity key and its series key and
  is never renamed; `owner: null` is a private brand, tracked for context and for the category-share
  denominator, never traded; `owner.since` dates a change of hands. The model only suggests
  (`CultureSuggestion`, shown on the system view); a person adds a brand in code.
- The LLM extracts and explains; deterministic code decides. `lib/culture/extraction` reads the
  model's labels with zod and clamps them; an item it never read folds through its alias matches
  at `FALLBACK_IMPORTANCE`; `lib/culture/fold.planCultureFold` is the one planner — once per run
  id, attention once per day, every fold scaled by `SOURCE_FOLD_WEIGHTS`, news lowest. Attention
  series are one document per brand, source and month, never a row per day;
  `lib/culture/store.writeAttentionRows` upserts a day in place.
- Two pickers over one feature set: `CULTURE_PROFILES` in `lib/culture/config` (Spike, Quiet;
  `price` is the backtest-only control), scored by `lib/culture/scoring.scoreCultureUniverse` with
  each term rank-normalised over the owners that have it (null = neutral 0) and the weights
  renormalised over the feeds a run has (`effectiveWeights`); `lib/culture/engine.decideWeek` is
  the one place a week is decided, through the Navigator's allocator under `CULTURE_RAILS`. A new
  picker is a new profile id, never a reweighted old one: its account and decisions carry the id.
- Each live profile trades its own paper account under `CULTURE_OWNER_ID` (`system:culture`,
  never `global` nor the strategies' sentinel), opened by
  `lib/culture/picker-store.ensureCultureAccount` on the first weekly run and traded only by
  `lib/jobs/functions/culture.runCultureWeekly` (`PaperTrade.source: 'culture-brain'`, idempotency
  key `culture:<profile>:<week>:<side>:<symbol>`). The weekly claim per profile is atomic; a run
  outside the session or on `dryRun` previews and claims nothing; without a model key the
  rationale is skipped, never retried into a 403.
- Every reason a picker writes is decoded by `lib/learn/culture-reasons` (round-tripped in its
  test) and glossed on the server (`glossCultureReasons`) before a client panel sees it.
- The simulated record is `lib/culture/simulator.simulateCulture` (pure): the same `decideWeek`
  on the first session of each ET week over stored bars and stored Wikipedia pageviews, the
  pageview surprises replayed through `lib/brain/decay` as the daily fold applies them
  (`attentionReplayer`), next-open fills, the one income clock stepped as the strategies'
  simulator steps it (`lib/strategies/simulate.incomeWalker`); three variants — the price-only
  control, Spike and Quiet — share each week's features and differ only by weights, and the
  weights renormalise over the feeds present (price, pageviews, the replayed entities), so a
  variant and a live run score on one scale. One document, `CultureBacktest` under
  `CULTURE_BACKTEST_KEY`, rebuilt by the weekly job's last phase when `lib/culture/backtest.cultureBacktestDue`
  says so (a new `CULTURE_ENGINE_VERSION`, a moved `catalogHash`, a resimulate, a new `SIGNALS_VERSION`, no build yet),
  inside `lib/culture/backtest-store.cultureBacktestReady` (dividends vouched for across the
  window for every simulated owner and SPY, a T-bill rate for every day of it — the bars step
  refetches whole whatever is lacking while a rebuild is pending); a failure or a wait is a note
  in the job's stamp, never in the way of trading. OTC owners are never simulated
  (`BACKTEST_LISTINGS`). The page prints the variants beside the live records as neutral tiles
  under "Simulated — attention and price only, not live", with the survivorship caveat, and
  each record's Simulated tab is its own profile's variant with `attention-backtest` as its term.
- `/culture` composes `lib/culture/page-store` (every read global, cached per request), shaped by
  the pure `lib/culture/page-view`: three views in the URL (`?view=`), and `?brand=` always the
  brands view with `#evidence`. The comparison strip prints the pickers in `LIVE_PROFILES` order
  and SPY, with no sign colour and no sort by return (invariant 12); the board explains its marks
  (● thesis, ○ private, * unpriced) once, only when some row carries them (invariant 8); a stored
  item's link becomes an anchor only through `lib/culture/links.outboundHref` (http(s)); the
  legend `lib/culture/legend` prints every figure from the config at the foot of every view.
  Every sentence is `lib/learn/copy/culture`.
- The brands view also draws the brands named together: `lib/culture/store.getCultureGraph`
  reads the heaviest entities with their co-mention `links`, the pure `lib/culture/graph` keeps
  each pair once and prunes a brand none of the others was named with, and
  `components/culture/BrandLinks` lays them on a circle (deterministic, no physics), each name a
  link to its evidence; the page draws the panel only when there is a line to draw (invariant 8).
- The chat's `getCultureBrain` tool reads the same page readers (`getTopCultureEntities`,
  `getTickerRollup`, `getCulturePicksView`) and hands the model `lib/chat/culture-brain`'s shape:
  rounded brands and owners, each picker's live record beside SPY, its latest decision with
  every reason decoded through the culture grammar, and its simulated record apart, under one
  stance line held to the no-advice list.
- The Brain section of `lib/shell/navigation` carries the three brains (`/brain`, `/culture`, `/agent-world`); the rail
  stays short (seven icons since Markets and Trade merged; five for anyone but the owner, who alone has Strategies and Brain). The two widgets (`culture-picks`, `brand-attention`) are library-only,
  category `brain` ("Brains & AI").
- Enrolling an account with a picker (the Navigator's shape, per picker): `lib/culture/follow`
  (pure — `followAccountName` "Culture · Spike", `FollowProfileSchema` over `LIVE_PROFILES`,
  `targetsFromDecisionItems`, `followStatusView`, `describeFollowRun`), `lib/culture/follow-store`
  (the `CultureFollow` row per user and profile with its atomic weekly claim `claimFollowWeek`, the
  account's own `CultureFollowDecision` rows — a preview never overwrites an executed one — and the
  reads the page, /portfolio, the widget, the email and the chat make), `lib/actions/culture.actions`
  (`enrollCulturePicker` reuses an empty account named for the picker through `restartAccount`, else
  `createPaperAccount`, then queues the bootstrap; pause, resume, `runCultureFollowNow`, unenroll
  keeps the account; zod on `unknown`, one counter `culture:follow:<uid>`). The weekly run trades each
  active enrolment after its picker's own decision — `engine.decideForBook` lays the picker's `scored`
  and `targets` over the account's own book under `CULTURE_RAILS`, fills through `executeOrder(userId,
  …)` with `source: 'culture-brain'` and the same idempotency key shape — and `bootstrapCultureFollow`
  (`culture-follow-bootstrap`, trigger `culture-follow <userId> <profile>`) deploys a new enrolment
  from the picker's latest executed decision, without re-scoring or a model call; outside the session
  both preview and claim nothing (`cultureDay`). `lib/trading/lifecycle.deleteOwnedAccount` refuses the
  account while the row stands; `/portfolio` says who trades an account (`lib/trading/traded-by`,
  `components/trading/portfolio/TradedBy`) and its culture fills carry the one "What the picker saw"
  from the enrolment's own decisions. The card is `components/culture/FollowPickerCard` and the
  account's decisions reuse `PicksPanel` (scope `follow`); every sentence is `CULTURE_FOLLOW_COPY`.
- Wikipedia history fills itself: a brand's attention surprise reads its last four weeks against
  the six months before them, and a brand's owner is eligible only with a brand whose surprise is
  measured (`lib/culture/scoring.isEligibleInput`). The daily run's `wikipedia-plan` step
  (`lib/culture/history.planWikipediaFetch` over `lib/culture/store.wikipediaFirstMonths`) asks a
  brand whose stored series starts after the baseline for its whole backfill window
  (`historyWindow`, listed owners first), every other brand for the lookback (`recentWindow`): one
  request a title either way. Without it no brand had a baseline and no owner was eligible — the
  pickers' first two weeks of empty decisions (2026-10-13, 2026-10-19). The fetches keep under
  Wikimedia's 200 requests a minute for an identified bot (`WIKIPEDIA_REQUEST_GAP_MS`), wait out a
  refusal once (`retryWaitMs`), stop after `WIKIPEDIA_REFUSALS_TO_STOP` in a row or a spent
  `WIKIPEDIA_STEP_BUDGET_MS`, and the job pauses a minute after a refused pass; the User-Agent names
  the site. Each weekly decision stores its eligibility (`eligibilityOf`: how many owners could be
  bought, and how many lacked attention, bars or a quote), printed beside the universe line, with
  one sentence when nothing could be bought (`CULTURE_PICKS_COPY.noneEligible`). Such a week is
  void (`lib/culture/decisions.isVoidWeek`: eligibility stored, none eligible, nothing executed):
  the next weekly run — Tuesday's retry — lets the picker's claim go (`releaseCultureWeek`) with
  its enrolled accounts' where they traded nothing (`releaseIdleFollowWeek`) and decides the week
  again; nothing traded, so nothing can double.
- Jobs: `culture-brain-update` daily 06:40 ET (trigger `culture`), `culture-brain-weekly` Mondays
  10:45 ET with a Tuesday holiday retry (`culture-weekly`, `culture-preview`, `culture-resimulate`),
  `culture-wikipedia-backfill` on demand (`culture-backfill [brandId…]`), `culture-follow-bootstrap`
  on demand (`culture-follow`). QA: `npm run qa -- culture`.
