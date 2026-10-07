# The culture brain

Status: Built in slices (2026-10-06 → 2026-10-07). Slices 0 to D are in: the Reddit OAuth client,
the daily pipeline, the two weekly pickers, the `/culture` page with its widgets, and the
three-variant backtest. Of Slice E, what costs nothing is in: the brands-named-together graph on
the brands view, the chat's `getCultureBrain` tool, and the YouTube search rotation (off until
`CULTURE_YOUTUBE_SEARCH_PER_DAY` is set). A paid TikTok or Instagram provider for the adapter
slot, and a third picker once the first two have a record, remain open.

## Why

The news brain reads what the financial press writes, so a youth brand reaches it only once the
press has noticed — by which time the market usually has too. The owner asked for a sibling brain
that tracks what the younger generation actually uses, drinks, wears, eats, plays and watches,
maps that attention onto listed companies, and follows the stocks the way the news brain does. The
question underneath was whether behavioural attention carries information the press lags; the
design answers it by measuring rather than assuming.

## The one-paragraph answer

A curated brand catalog in code is the universe (`lib/culture/catalog.ts`: ~190 brands, each with
its aliases, its Wikipedia titles, its App Store names and its listed owner or `null`). A daily
job reads attention sources — Wikipedia pageviews per brand, Apple's App Store charts, YouTube's
popular chart and youth subreddits when their keys are set, a fixed set of Google News queries —
counts brand mentions deterministically, has a model label a small batch of items (which brand,
how people feel, what kind of moment), and folds everything into a decayed brand graph through
the news brain's own pure decay maths, each source at its own weight and news lowest, since the
press is the lagging source. Once a week two deterministic pickers read the same graph with
different weights — **Spike** (attention surprise and trend, the obvious signal) and **Quiet**
(attention that has persisted for weeks, that the press has not covered, that built since the last
earnings report, and category share against private rivals) — each allocating through the
Navigator's allocator under shared rails and trading its own system-owned paper account measured
against SPY. The page prints both records side by side, neutral, so the record and not the copy
says which captures younger consumers. The principle kept from the news brain: **the LLM extracts
and explains; deterministic, tested code decides.**

## Rules

- **Own collections only.** Nothing under `lib/culture/**` imports `BrainEntity`, `NewsItem`,
  the news brain's fold, store or ingest (`lib/culture/__tests__/guard.test.ts`); the decay maths
  `lib/brain/decay` is shared because it is pure. AGENTS.md invariant 3, extended.
- **The catalog is the universe; the model only suggests.** A brand enters the catalog by a
  person editing `catalog.ts`; a name the model meets that the catalog lacks lands in a
  suggestions queue the system view shows. An id is never renamed: it is the entity key and the
  attention series key.
- **Every per-run cost is a constant**, never a function of the catalog's size: fixed query sets,
  three model calls a day, a capped and weekly-verified universe, monthly attention documents.
- **Describe, never advise** (invariant 12). Every sentence is a pure export under
  `lib/learn/copy/culture.ts`, held to the no-advice list; the comparison strip ranks nothing,
  colours nothing, and prints the pickers in the registry's order whatever the returns say.

## Sources

| Source | What is stored | Cost per day | Key |
|---|---|---|---|
| Wikipedia pageviews | one row per brand per day (titles summed) | 1 request per brand, chunks of 25 per step, 100 ms apart | none (a contact in the User-Agent) |
| Apple App Store charts | the chart score (101 − rank) of each brand's apps, free and paid | 2 requests | none |
| YouTube most-popular chart | 50 videos as items | 1 quota unit | `YOUTUBE_API_KEY` (optional) |
| Reddit youth subreddits | posts as items | ~20 requests (OAuth client credentials) | `REDDIT_CLIENT_ID` / `_SECRET` (shared with the news brain) |
| Google News | a fixed set of youth-culture and category queries as items, capped at 120 | ~21 requests | the news kill switch `NEWS_SEARCH_ENABLED` |
| A social provider | `SocialAdapter` slot, empty registry | — | `CULTURE_SOCIAL_ADAPTER` (none ships) |

TikTok, Instagram and Snapchat have no public trend API (TikTok's research API is academic-only;
Instagram's hashtag endpoint needs app review and allows 30 hashtags a week; Snapchat Trends is a
website), so v1 reads YouTube's official API and leaves a key-gated adapter slot.

## Attention

An entity's weight is **attention**, folded daily through `lib/brain/decay` (fast layer halving
every 5 days, slow every 60): a Wikipedia week against the brand's own 90-day median (a tripling
at full importance), an App Store climb of 50 places at full importance, and each labelled item's
importance × relevance, every fold first scaled by its source (`SOURCE_FOLD_WEIGHTS`: Wikipedia 1,
App Store 0.8, Reddit 0.6, YouTube and a social provider 0.5, news 0.2). A brand thesis starts at
a slow weight of 5 and ends under 40% of its peak — the news brain's own thresholds.

The pickers read the raw series for their features (`lib/culture/picker-features.ts`,
`inputs.ts`): surprise (28 days against the 180 before), trend (OLS over 90 days), persistence
(consecutive weeks above a fixed baseline, capped at 26), quiet attention (surprise × (1 − press
rank)), category share with private brands in the denominator, attention since the owner's last
report (Finnhub's calendar when a key allows, else neutral), app rank. Brands roll up to their
owner by baseline share, no brand past half, so PepsiCo's dozen brands never out-mass a
single-brand company by count. Each term is rank-normalised over the owners that have it; an
owner without the measurement sits at 0, and a feed a run lacks is zeroed with the rest
renormalised, so a live run and a backtest on attention and price score on one scale.

## The two pickers, and why both

`CULTURE_PROFILES` in `lib/culture/config.ts`: one feature set, two weightings, one price-only
control for the backtest. Spike keeps the plain surprise signal the user can watch; Quiet is the
attempt to get ahead of the press. Both trade through the Navigator's `buildTargets` and
`diffToOrders`, which now take a rails object (`CULTURE_RAILS`: ten names at most 15% each over a
5% cash floor, four trades a week, a 21-day minimum hold, a 30% hard stop), under the Navigator's
200-day cap and volatility haircut. Each has its own shared paper account under `system:culture`,
opened on the first weekly run; the weekly claim per profile is atomic; a run outside the session
or on `dryRun` previews and claims nothing; a Tuesday cron retries holiday Mondays. A reason
grammar (`lib/learn/culture-reasons.ts`) decodes every string a picker writes into clauses glossed
from the config, so a moved constant moves the prose.

## Surfaces

`/culture` is three views, one at a time in the URL: **brands** (the board by category with the
marks explained once, the rising list on the fast layer, a brand's evidence with the model's
labels), **picks** (the strip of both records and SPY in neutral tiles, then each picker's column:
its account, its record against SPY, its latest decision with every reason read in plain words,
its holdings, its trade log with "What the picker saw" on each culture fill), and **system** (the
counters, the last day each source stored, the Wikipedia drift alarm, the earnings calendar, the
week's quote check, the accounts, the three jobs' stamps, the suggestions queue). The legend
(`lib/culture/legend.ts`) closes every view, collapsed, every figure from the constants. The
Brain section of the rail carries both brains as tabs. Two library widgets: the Culture Brain
tile and Brand attention.

## Verification

Unit: the catalog's rules, alias matching, the extraction reader, the fold planner, the features,
the roll-up, the scorer under both profiles and every feed set, the engine, the grammar's round
trip, the legend's sentinel test, the page shaping, every sentence against the no-advice list.
Browser (`npm run qa -- culture`): the data layer through jiti, the weekly job through the Inngest
dev server on a seeded week, then the page — the board, the evidence, the two columns, the system
view, the widgets, a phone width.

## The backtest

`lib/culture/simulator.ts` (pure) runs the same `decideWeek` on the first session of each ET
week over stored bars and stored Wikipedia pageviews, for the last 260 weeks before the accounts'
launch after a 260-bar warm-up. Attention is replayed, not read: each brand's pageview surprises
go through the fold's own decay maths as the daily job applies them (a day's surprise folded the
morning after, decayed to the reading day), so the simulation has slow attention and theses as
the live brain would have had them from pageviews alone. Three variants — the price-only control,
Spike and Quiet — share each week's features and differ only by their weights, which renormalise
over the feeds present (price, pageviews, the replayed entities). Fills are at the next open (the
close when a bar has none), a buy keeps the cash floor, a buy the plan funded with a sell that
did not fill is dropped, and cash earns interest and holdings their dividends through the one
income clock, stepped exactly as the strategies' simulator steps it (a parity test holds the
simulator's rows to a live replay of its own fills). The build is one `CultureBacktest` document,
rebuilt when the engine version or the catalog's owners change or on `culture-resimulate`, only
once every simulated owner's dividends are vouched for across the window and the T-bill series
spans it; OTC owners are never simulated. The page prints the three variants and SPY as neutral
tiles under "Simulated — attention and price only, not live" with the survivorship caveat, and
each record's Simulated tab is its own variant.

## What comes next

A paid TikTok/Instagram provider under the adapter slot (`CULTURE_SOCIAL_ADAPTER`), and a third
profile once the first two have a record to compare it with.
