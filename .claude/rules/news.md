---
paths:
  - "lib/news/**"
  - "components/news/**"
  - "app/(root)/news/**"
  - "lib/jobs/functions/news.ts"
  - "lib/actions/news-feed.actions.ts"
  - "lib/learn/copy/news.ts"
  - "scripts/qa/qa-news-feed.mjs"
---

# news

Contracts of this feature that a map cannot show: a part of `AGENTS.md`, kept in a file of its
own so it loads only beside the files its `paths:` name. A `### name` in the text is that
feature's file in this folder; Shared, owner and the numbered invariants are in `AGENTS.md`;
the map is `docs/MAP.md`.

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
