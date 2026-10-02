// The news page as a view-model: the morning briefing, then the reader's topics, then what
// names a symbol they hold or watch, then the rest of their feed — a few stories in each, each
// story once. Pure; the reads behind it are lib/news/page-store.ts.
//
// Three rules hold across every section:
//   - A hidden outlet is hidden whichever door it uses (invariant 10): the briefing's citations,
//     topic articles and holdings rows all pass the same outlet filter the feed does. A briefing
//     point left citing nothing is dropped, like one that never cited anything.
//   - A story is shown once: a URL a higher section printed is skipped below it.
//   - A section with nothing to show is absent, not empty (invariant 8).

import {feedUrlKey, outletAllowed} from "@/lib/news/feed";
import {briefingTouches, type MarketBriefingView} from "@/lib/news/briefing";
import {toFeedArticles} from "@/lib/news/topic-batch";
import {sortTopicsForRail} from "@/lib/topics/rail";
import type {NewsFeedPrefs} from "@/lib/news/feed-prefs";
import type {MarketNewsArticle} from "@/lib/news/types";
import type {MergedTopicArticle, TopicBriefView, TopicsOverview} from "@/lib/topics/types";

export const NEWS_TOPICS_SHOWN = 4;
export const NEWS_TOPIC_ARTICLES = 2;
export const NEWS_HOLDINGS_SHOWN = 6;
export const NEWS_LEAD_STORIES = 6;

export type NewsHoldingArticle = {headline: string; source: string; url: string; datetime: number; eventType: string | null; symbols: string[]};

export type NewsTopicSection = {
    slug: string;
    name: string;
    color: string | null;
    unseenCount: number;
    brief: TopicBriefView | null;
    articles: MarketNewsArticle[];
};

export type NewsBriefing = MarketBriefingView & {touches: string[]};

export type NewsPageView = {
    briefing: NewsBriefing | null;
    topics: NewsTopicSection[];
    moreTopics: number;
    holdings: NewsHoldingArticle[];
    lead: MarketNewsArticle[];
    more: MarketNewsArticle[];
    fallback: boolean;
};

type Outlets = Pick<NewsFeedPrefs, 'includeSources' | 'excludeSources'>;

export const filterBriefing = (briefing: MarketBriefingView | null, prefs: Outlets): MarketBriefingView | null => {
    if (!briefing) return null;
    const allowed = outletAllowed(prefs);
    const keep = <T extends {sources: {source: string}[]}>(item: T): T => ({...item, sources: item.sources.filter((s) => allowed(s.source))});
    const bullets = briefing.bullets.map(keep).filter((b) => b.sources.length > 0);
    if (bullets.length === 0) return null;
    return {...briefing, bullets, stories: briefing.stories.map(keep).filter((s) => s.sources.length > 0)};
};

export const toNewsPageView = ({briefing, prefs, overview, topicArticles, holdings, feed, fallback, symbols}: {
    briefing: MarketBriefingView | null;
    prefs: Outlets;
    overview: TopicsOverview;
    topicArticles: readonly MergedTopicArticle[];
    holdings: readonly NewsHoldingArticle[];
    feed: readonly MarketNewsArticle[];
    fallback: boolean;
    // What the reader holds or watches, for the briefing's "touches" line.
    symbols: readonly string[];
}): NewsPageView => {
    const allowed = outletAllowed(prefs);
    const seen = new Set<string>();
    const fresh = (url: string): boolean => {
        const key = feedUrlKey(url);
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
    };

    const visibleBriefing = filterBriefing(briefing, prefs);

    // Topics in the rail's order (unread first), each with its newest stories.
    const bySlug = new Map<string, MarketNewsArticle[]>();
    for (const article of toFeedArticles(topicArticles)) {
        if (!article.topic || !allowed(article.source)) continue;
        const list = bySlug.get(article.topic.slug) ?? [];
        list.push(article);
        bySlug.set(article.topic.slug, list);
    }
    const withContent = sortTopicsForRail(overview.topics).filter((t) => t.brief || (bySlug.get(t.slug)?.length ?? 0) > 0);
    const topics = withContent.slice(0, NEWS_TOPICS_SHOWN).map((t) => ({
        slug: t.slug,
        name: t.name,
        color: t.color,
        unseenCount: t.unseenCount,
        brief: t.brief ?? null,
        articles: (bySlug.get(t.slug) ?? []).filter((a) => fresh(a.url)).slice(0, NEWS_TOPIC_ARTICLES),
    }));

    const holdingRows = holdings.filter((h) => allowed(h.source) && fresh(h.url)).slice(0, NEWS_HOLDINGS_SHOWN);
    const rest = feed.filter((a) => fresh(a.url));

    return {
        briefing: visibleBriefing ? {...visibleBriefing, touches: briefingTouches(visibleBriefing, symbols)} : null,
        topics,
        moreTopics: Math.max(0, withContent.length - topics.length),
        holdings: holdingRows,
        lead: rest.slice(0, NEWS_LEAD_STORIES),
        more: rest.slice(NEWS_LEAD_STORIES),
        fallback,
    };
};
