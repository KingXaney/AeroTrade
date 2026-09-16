# Followed Topics — news beyond the watchlist

**Status:** implemented 2026-08-29 on `feature/themes-dashboard-widgets` (ships with the themes + widgets work).
**Scope:** theme-picker hover fix (P0) and the followed-topics feature (P1–P5: pipeline, jobs, dashboard, email/chat, entry points).

## Why

AeroTrade was a stock tracker. Users asked to follow the **news and topics they care about** — markets *and* beyond
("Fed rate decisions", "AI chips", "NBA trade deadline", "climate policy") — and to rebalance the product toward that.

Decisions confirmed with the user: topics are open-ended free text · matching is keyword-based with editable keywords ·
surfaces = `/topics` page, dashboard widgets, daily email section, per-topic AI "what changed today" brief, chat tools ·
`/` stays the widget dashboard but its default layout becomes topics-first; `/topics` is first in navigation.

## Shape

| Piece | Where | Notes |
|---|---|---|
| Topic (per user) | `database/models/topic.model.ts` | `keywords`/`exclude` normalised; `keywordSetHash` shared across users with the same set; `brief` single-nested; unique `{userId, slug}` |
| TopicArticle (per keyword set) | `database/models/topic-article.model.ts` | unique `{keywordSetHash, contentHash}`, TTL 30 days; `sourceType: 'web'` for search hits |
| Search source | `lib/news/adapters/search.ts` | Google News RSS search, no key; query built only by `buildSearchQuery`; `web` capped to 0 in the general digest/brain |
| Matching | `lib/topics/match.ts` | `escapeRegExp` + unicode word boundaries; 3×headline + 1×summary; exclusions veto |
| Refresh | `lib/topics/refresh.ts` + `lib/inngest/functions.ts` | `refresh-topic-feeds` cron every 3h (≤60 sets, 1s gaps) · `refresh-topic-on-demand` event (concurrency per set, 6/h per user) · first visit does one bounded inline fetch |
| Briefs | `generate-topic-briefs` 08:00 ET | ≤20 Gemini calls/run, `topicBrief` task in `lib/ai/models.ts`; parsed by `lib/topics/brief.ts`; rendered as text only |
| Reads / actions | `lib/topics/store.ts`, `lib/actions/topics.actions.ts` | session-derived, `isValidObjectId`, `{_id, userId}` scoping, limits from `lib/topics/config.ts` |
| UI | `app/(root)/topics/**`, `components/topics/*` | rail, header (refresh / edit / delete), composer, brief, feed with load-more, empty state with starters + brain suggestions |
| Dashboard | `lib/dashboard/widgets.ts`, `components/dashboard/widgets/Topics*.tsx` | `topics-overview`, `topics-latest` (lazy), `topic-briefs`; `LEGACY_DEFAULT_LAYOUT_V1` → `migrateLegacyDefault` at read time (no version bump) |
| Email | `lib/topics/digest-section.ts`, `sendDailyNewsSummary` | deterministic HTML, every string escaped, links allow-listed; per-user `topicsInDigest` toggle |
| Chat | `lib/ai/tools.ts` | `getFollowedTopics`, `getTopicFeed`, `followTopic`, `unfollowTopic`; the model never supplies ids |
| Entry points | ⌘K "Follow topic: …", Follow buttons on `/brain` rows and the stock header, Settings › Topics | |

## Guardrails

- User text never becomes a regex except through `escapeRegExp`; keyword count/length caps bound matching cost.
- User topics never write into `BrainEntity` — the navigator scores the brain's global entities.
- Briefs use the untrusted-data prompt guard, get no URLs, are zod-parsed and rendered as text.
- `NEWS_SEARCH_ENABLED=false` is the kill switch for the search adapter and the cron.
- `normalizeLayout` stays pure; the legacy-default migration runs only where saved layouts are **read**.

## Verification

- `npx tsc --noEmit`, `npm run lint`, `npm test` (438 tests), `npx next build --experimental-build-mode compile`.
- Browser QA (2026-08-29, in-memory Mongo + Playwright/Chrome, no `.env`): 28/28 — sign-up → `/topics` starters → follow →
  live Google News fetch on first visit → topics-first dashboard → widget library badges → Settings › Topics + email toggle →
  theme-card hover sweep with no flash of the committed style → ⌘K follow/open → edit keywords → delete → not-found.
- Not exercised locally: the Inngest crons/briefs and the digest email (need `npx inngest-cli dev` + Gemini/SMTP keys);
  `scripts/trigger-topics.mjs` fires them.

## Deferred

Bing News as a second search adapter; per-topic language; folding `/history` into `/topics`; per-widget topic instances.
