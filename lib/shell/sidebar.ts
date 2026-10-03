// The rail's two hover cards as view-models: every account's portfolio rolled into one card, and
// the News card — the day's briefing headline, when the reader last looked, and the followed
// topics with the most new first. Pure; the reads behind them are getShellView
// (lib/shell/shell-store.ts), which also applies the reader's outlet filter: the briefing arrives
// already through filterBriefing (lib/news/page.ts) and `allowed` is outletAllowed(prefs)
// (lib/news/feed.ts), so this module imports nothing server-side and the client components
// (components/shell/Rail.tsx, NewsSidebarCard.tsx) take their types from it.

import {countUnpriced} from "@/lib/trading/analytics";
import {sortTopicsForRail} from "@/lib/topics/rail";
import type {PortfolioSummary} from "@/lib/trading/types";
import type {MarketBriefingView} from "@/lib/news/briefing";
import type {TopicOverviewItem, TopicsOverview} from "@/lib/topics/types";

const SIDEBAR_TOP = 3;

export type SidebarPortfolio = {
    totalValue: number;
    totalReturnPct: number;
    cash: number;
    accountsCount: number;
    unpriced: number;      // holdings with no live quote, across every account
    top: {symbol: string; quantity: number; unrealizedPnlPct: number; priceStale: boolean}[];
};

export type SidebarNewsTopic = {
    slug: string;
    name: string;
    color: string | null;
    unseenCount: number;        // since the reader opened this topic, inside the window (lib/topics/config.unseenFloor)
    headline: string | null;    // the newest article from an outlet the reader has not hidden
    datetime: number | null;    // its unix seconds
};

export type SidebarNews = {
    followed: number;
    briefing: {headline: string; date: string} | null;   // the day's market briefing, through the outlet filter
    seenAt: number | null;      // epoch ms the reader last opened News; null = never
    newTopics: number;          // followed topics with an allowed article newer than the last look — the rail's dot
    top: SidebarNewsTopic[];
};

type Allowed = (source: string | undefined) => boolean;

// `portfolio` is every account rolled into one (aggregatePortfolios), largest holding first.
export const toSidebarPortfolio = (portfolio: PortfolioSummary, accountsCount: number): SidebarPortfolio => {
    return {
        totalValue: portfolio.totalValue,
        totalReturnPct: portfolio.totalReturnPct,
        cash: portfolio.cash,
        accountsCount,
        unpriced: countUnpriced(portfolio.positions),
        top: portfolio.positions.slice(0, SIDEBAR_TOP).map((p) => ({
            symbol: p.symbol,
            quantity: p.quantity,
            unrealizedPnlPct: p.unrealizedPnlPct,
            priceStale: p.priceStale,
        })),
    };
};

// A topic lights the dot when its newest allowed article is newer than the reader's last look at
// News and at the topic itself: never looked anywhere, any article lights it; a topic opened from
// the Home widget after its newest article leaves no stale dot; a hidden outlet never lights it
// (invariant 10 for the signal as well as the text). Zero extra queries — the overview's `latest`.
const newerThanLastLook = (topic: TopicOverviewItem, newsSeenAt: number | null, allowed: Allowed): boolean =>
    topic.latest !== null
    && allowed(topic.latest.source)
    && topic.latest.datetime * 1000 > Math.max(newsSeenAt ?? 0, topic.lastSeenAt ?? 0);

export const toSidebarNews = ({overview, briefing, allowed, newsSeenAt}: {
    overview: TopicsOverview;
    // Already through filterBriefing: null when every cited outlet is hidden.
    briefing: MarketBriefingView | null;
    allowed: Allowed;
    newsSeenAt: number | null;
}): SidebarNews => ({
    followed: overview.topics.length,
    briefing: briefing && briefing.headline ? {headline: briefing.headline, date: briefing.date} : null,
    seenAt: newsSeenAt,
    newTopics: overview.topics.filter((t) => newerThanLastLook(t, newsSeenAt, allowed)).length,
    // The /topics rail's order: the most unseen first, the freshest first among equals.
    top: sortTopicsForRail(overview.topics).slice(0, SIDEBAR_TOP).map((t) => {
        const latest = t.latest && allowed(t.latest.source) ? t.latest : null;
        return {
            slug: t.slug,
            name: t.name,
            color: t.color,
            unseenCount: t.unseenCount,
            headline: latest?.headline ?? null,
            datetime: latest?.datetime ?? null,
        };
    }),
});
