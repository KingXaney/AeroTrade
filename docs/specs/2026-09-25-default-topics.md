# Default topics, and topics that drive the news

**Status:** implemented on `feat/default-topics` (2026-09-25).

## Why

Two problems, one request.

**A new account could not reach the product without doing setup first.** Every post-auth
redirect pointed at `/topics` (`app/(auth)/layout.tsx`, `sign-up/page.tsx`,
`sign-in/page.tsx`), and that page early-returned its entire body into `TopicsEmptyState`
whenever the user had no topics — no shell, no rail, no feed, and a Follow button disabled
until you picked a chip. There was no skip and no persisted onboarding flag anywhere in the
repo: the emptiness of the `Topic` collection *was* the flag. So the first screen after
sign-up was a mandatory configuration form for a product nobody had seen yet.

**Followed topics and the personal news feed never touched.** Nothing under `lib/news/`
read `Topic` or `TopicArticle`. A user could follow "AI chips" and see nothing about AI
chips on `/news`, in the dashboard news widget or on `/history` — all three rendered Google
News top stories regardless. The word "keywords" appeared in both systems but named
different fields in different collections.

## What

| | |
|---|---|
| Seeded at sign-up | Six topics — **Fed rate decisions · AI chips · Stock market · Oil & energy** (finance) and **Geopolitics · World economy** (world news) |
| Landing page | The dashboard `/`, whose default layout already leads with topics |
| Ownership | Ordinary `Topic` documents: rename, edit keywords, delete, all unchanged |
| Once-only | `UserPreferences.topicsSeededAt` |
| In the news | Followed-topic articles join `/news`, the `news` widget and `/history` |
| Not in the digest | It already prints a dedicated "📌 Your topics" section |

## The marker is the load-bearing part

`seedDefaultTopics` has two guards and they are not interchangeable:

```ts
if (await Topic.exists({userId})) return EMPTY;
if (!force) {
    const prefs = await UserPreferencesModel.findOne({userId}).select('topicsSeededAt').lean();
    if (prefs?.topicsSeededAt) return EMPTY;
}
```

Guarding on "no topics" alone would resurrect the defaults for anyone who unfollowed
everything on purpose — the exact opposite of being able to change them. `topicsSeededAt`
is stamped whether or not any insert succeeded, so a seed that fails outright is not
retried on every page view forever. `force` is the "Restore the default topics" button in
the empty state: it skips the marker because the user asked explicitly, but keeps the
"you already have topics" check, so a double click is a no-op.

Seeding happens in two places. `signUpWithEmail` is the primary path (there are no social
providers, so it is the only way an account is created) and is awaited so the dashboard is
already populated when the redirect lands; it can never fail sign-up. `/topics` carries the
safety net, which is what covers every account that predates this feature.

## The notice nobody has to store

The user has to be able to tell the topics were preinstalled. Rather than a dismissal flag,
`isUntouchedDefaultSet(slugs)` derives it: the line shows exactly while the user's set is
still the default set, and disappears the moment they add, remove or rename anything. It is
a statement about the current set, not about history — remove a topic you added and the
line comes back, because it is true again.

## Topics in the feed

Topic articles are **already** fetched, scored and stored by the 3-hourly
`refreshTopicFeeds` job, so folding them into the news is a shape change over a Mongo read,
not another network request. Topics therefore never become a `FeedRequest`: nothing about
URL planning, `MAX_FEED_REQUESTS` or the `NEWS_SEARCH_ENABLED` kill switch changes.

- `lib/news/topic-batch.ts` — `toFeedArticles`, pure. `id` is keyed exactly as `mergeFeed`
  re-keys, so a story carried by both a wire and a followed topic collapses into one row.
- `runRequests` now returns **batches**, so the topic batch joins the round-robin. Merging
  it against an already-merged list would have handed topics half the feed.
- The outage test still runs on the requested feed alone. Topic articles come from Mongo
  and can neither prove nor disprove that Google answered; letting them mask an outage
  would drop the "standing in" flag the page shows.
- `filterBySources` applies to the topic batch too. Outlet filtering runs per batch, so
  skipping it would let a followed topic smuggle in an outlet the user hid. **The browser
  QA caught this; the first implementation had the hole.**

Which surfaces get topics falls out of which function they call:

| Surface | Path | Topics? |
|---|---|---|
| dashboard `news` widget | `lib/dashboard/loaders.ts` → `getNewsFeed` | yes |
| `/history` | `app/(root)/history/page.tsx` → `getNewsFeed` | yes |
| `/news` | `getNewsFeedForPrefs` (it needs the prefs for the editor) | yes, passed explicitly |
| daily digest | `lib/inngest/functions.ts` → `getNewsFeedForPrefs` | **no, on purpose** |

`NewsArticleCard` gives its tag slot to the topic when there is one. The slot answers "what
is this about", and for a topic article the topic is the answer; without it the user cannot
tell why their feed changed after following something. The outlet is still on the meta line.

## Keeping the news current

The first cut of this shipped a real defect, caught by asking "is it the same news every
day?" and measuring rather than reasoning. **Google News search ranks by relevance, not
date.** Unbounded, the `("big tech earnings" OR …)` query returned a median result age of
**25 days** and a worst case of **149**. `matchArticles` scores keyword hits and never
recency, and the store is capped at 40 per fetch — so months-old articles landed straight
in the topic and it read as the same news every morning.

Measured across five topic sets on the same day:

| query | n | median age | within 24h |
|---|---|---|---|
| `big tech earnings` plain | 100 | 610h (25d) | 6 |
| `big tech earnings when:7d` | 51 | 61h | 13 |
| `big tech earnings when:1d` | 27 | 7.4h | **27 (all)** |
| `stock market` plain | 100 | 5.2h | 94 |
| `stock market when:7d` | 100 | 67.7h | 15 |
| `stock market when:1d` | 100 | 4.6h | **100 (all)** |

`when:7d` is *worse* than no window for a high-volume topic — Google returns a broader,
relevance-spread set. `when:1d` won on every set tested and never returned zero, so
`TOPIC_SEARCH_WINDOW = '1d'`. A fetch that comes back empty widens once to `7d`, so a
genuinely quiet topic fills on its first try instead of starting blank.

`when:` is the only operator that survives into a query, and it can only come from that
constant: `cleanTerm` strips `:` from every user term before it is quoted, so a keyword of
`when:30d` is flattened to the text `"when 30d"`. The window is reserved from
`QUERY_MAX_CHARS` so truncation can never eat it.

The feed's own keyword slot derives its window from `FEED_MAX_AGE_SECONDS` rather than
hardcoding one — there is no point asking Google for articles `mergeFeed` would discard.

**Why the seeded subject list changed.** `Big Tech earnings` only carries news about four
weeks a quarter; on the day it was measured it returned 27 same-day articles against 100
for `Stock market`. It stays in `STARTER_TOPICS` as an offerable chip, just not a default.

## Caps

`MAX_TOPICS_PER_USER` 12 → 16, so six seeded defaults do not eat the user's own budget.
Defaults share a `keywordSetHash` across every user, so the marginal fetch cost is one
refresh for the whole install, not one per account.

## Verification

- `lib/topics/__tests__/starters.test.ts` — the default set resolves, keeps the validator's
  caps, stays finance-led with world news in it, and every keyword survives
  `normalizeKeywordList` with nothing dropped (the file's own authoring rule, previously
  untested). Plus `isUntouchedDefaultSet` across removal, addition and rename.
- `lib/news/__tests__/topic-batch.test.ts` — the mapping, the id contract, and two merge
  properties: a story carried by a wire is not printed twice, and the topic batch cannot
  swamp the feed.
- `scripts/qa/qa-topics.mjs` — sign-up lands on the dashboard, six topics preinstalled,
  no picker, the notice appears and extinguishes, seeding is idempotent across reloads.
- `scripts/qa/qa-truthful-data.mjs` — one first-run event fills every default, and
  **deleting them all is not undone on the next view**.
- `scripts/qa/qa-news-feed.mjs` — a followed topic reaches `/news` and `/history`, is
  printed once, does not swamp the feed, and respects a hidden outlet.

All nine browser suites and 795 unit tests pass.

## Follow-ups not taken

- The digest's main summary still ignores topics. Right today, but if the dedicated section
  is ever dropped, `pickDigestArticles` is where they would belong.
- `lib/topics/starters.ts` is a hand-written list. The brain already computes a live
  "what we are tracking" set (`getTopEntities`) which the empty state offers as chips; a
  future default set could be partly derived from it rather than fixed.
- The news feed's own `keywords` preference and topic keywords remain separate lists. They
  are structurally interchangeable, but the feed builds one OR-query across all keywords
  while topics build one query per set, so they cannot simply be merged.
