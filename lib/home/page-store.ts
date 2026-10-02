// The signed-in Home page's one read (app/(root)/page.tsx). Server only; the shaping is the pure
// lib/home/view.ts. Every read here is one the (root) layout or the dashboard already makes and
// React-caches for the request — the accounts' valuation and the topics overview are the shell's
// own — so Home adds no query of its own beyond the first-week facts.

import {getOnboardingFacts} from "@/lib/learn/facts-store";
import {deriveMissions, onboardingActive, type Mission} from "@/lib/learn/missions";
import {marketStatus, type MarketStatus} from "@/lib/prices/market-hours";
import {getCachedTopicsOverview} from "@/lib/topics/store";
import {getPortfoliosForUser} from "@/lib/trading/valuation";
import {nextStep, toHomeAccounts, type HomeAccounts, type HomeStep} from "@/lib/home/view";
import type {TopicsOverview} from "@/lib/topics/types";

export type HomeView = {
    market: MarketStatus;
    accounts: HomeAccounts;
    step: HomeStep;
    // The first-week list, while it is still showing.
    missions: Mission[] | null;
    topics: TopicsOverview;
    // Whether any followed topic has a brief to show today.
    hasBriefs: boolean;
};

export const getHomeView = async (userId: string): Promise<HomeView> => {
    const [portfolios, topics, facts] = await Promise.all([
        getPortfoliosForUser(userId),
        // Topics must never take the page down with them, as in the shell.
        getCachedTopicsOverview(userId).catch((error: unknown) => {
            console.error('Home topics failed:', error);
            return {topics: [], unseenTotal: 0} as TopicsOverview;
        }),
        getOnboardingFacts(userId),
    ]);
    const market = marketStatus();
    const missions = deriveMissions(facts);
    const onboarding = onboardingActive(facts);
    return {
        market,
        accounts: toHomeAccounts(portfolios),
        step: nextStep(missions, onboarding, market.state === 'open'),
        missions: onboarding ? missions : null,
        topics,
        hasBriefs: topics.topics.some((t) => t.brief),
    };
};
