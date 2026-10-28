// The dashboard as this user can see it: the saved layout less every widget whose data they do
// not have (a second account, an onboarding still running) or that is the owner's alone
// (lib/lab/owner.ts: the brains and the strategies), and the widgets they may add. The
// dashboard and /settings both read it here, so the grid and the settings list cannot drift.
// Server-only: the portfolios and onboarding facts are the request's cache()d reads.

import {getDashboardLayoutForUser} from "@/lib/dashboard/layout-store";
import {WIDGET_IDS, WIDGETS, isWidgetAvailable, type AvailabilityContext, type WidgetId} from "@/lib/dashboard/catalog";
import {filterAvailable, type DashboardLayout} from "@/lib/dashboard/layout";
import {getPortfoliosForUser} from "@/lib/trading/valuation";
import {getOnboardingFacts} from "@/lib/learn/facts-store";
import {onboardingActive} from "@/lib/learn/missions";

const getAvailability = async (userId: string, owner: boolean): Promise<AvailabilityContext> => {
    const [portfolios, facts] = await Promise.all([getPortfoliosForUser(userId), getOnboardingFacts(userId, owner)]);
    return {accountCount: portfolios.length, advanced: true, onboarding: onboardingActive(facts), owner};
};

// `owner` from the session (lib/lab/owner.isLabOwner), as the (root) layout reads it.
export const getVisibleLayout = async (userId: string, owner: boolean): Promise<{layout: DashboardLayout; availableIds: WidgetId[]}> => {
    const [stored, availability] = await Promise.all([getDashboardLayoutForUser(userId), getAvailability(userId, owner)]);
    return {
        layout: filterAvailable(stored, availability),
        availableIds: WIDGET_IDS.filter((id) => isWidgetAvailable(WIDGETS[id], availability)),
    };
};
