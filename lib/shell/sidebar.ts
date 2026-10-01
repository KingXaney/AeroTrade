// The shell's two sidebar cards as view-models: every account's portfolio rolled into one
// card, and the followed topics with the most unread first. Pure; the reads behind them are
// getShellView (lib/shell/shell-store.ts).

import {countUnpriced} from "@/lib/trading/analytics";
import type {PortfolioSummary} from "@/lib/trading/types";
import type {TopicsOverview} from "@/lib/topics/types";

const SIDEBAR_TOP = 3;

export type SidebarPortfolio = {
    totalValue: number;
    totalReturnPct: number;
    cash: number;
    accountsCount: number;
    unpriced: number;      // holdings with no live quote, across every account
    top: {symbol: string; quantity: number; unrealizedPnlPct: number; priceStale: boolean}[];
};

export type SidebarTopics = {
    followed: number;
    unseen: number;
    top: {slug: string; name: string; color: string | null; unseenCount: number}[];
};

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

// Most unread first; among equals, the freshest article first.
export const toSidebarTopics = (overview: TopicsOverview): SidebarTopics => ({
    followed: overview.topics.length,
    unseen: overview.unseenTotal,
    top: [...overview.topics]
        .sort((a, b) => b.unseenCount - a.unseenCount || (b.latest?.datetime ?? 0) - (a.latest?.datetime ?? 0))
        .slice(0, SIDEBAR_TOP)
        .map((t) => ({slug: t.slug, name: t.name, color: t.color, unseenCount: t.unseenCount})),
});
