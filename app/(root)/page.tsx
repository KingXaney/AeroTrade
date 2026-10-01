import {cookies} from "next/headers";
import type {ReactNode} from "react";
import {ACTIVE_ACCOUNT_COOKIE} from "@/lib/trading/config";
import {requireUserId} from "@/lib/auth/session";
import {getDashboardLayoutForUser} from "@/lib/dashboard/layout-store";
import {getPortfoliosForUser} from "@/lib/trading/account";
import {WIDGET_IDS, WIDGETS, isWidgetAvailable, resolveDataKeys, type WidgetId} from "@/lib/dashboard/catalog";
import {filterAvailable, layoutFingerprint} from "@/lib/dashboard/layout";
import {loadDashboardData, type LoaderCtx} from "@/lib/dashboard/loaders";
import {pickActiveAccount, toSwitcherAccounts} from "@/lib/dashboard/select";
import {getOnboardingFacts} from "@/lib/learn/facts-store";
import {onboardingActive} from "@/lib/learn/missions";
import {renderWidgetBody} from "@/components/dashboard/widgets/registry";
import DashboardGrid from "@/components/dashboard/DashboardGrid";
import AccountSwitcher from "@/components/trade/AccountSwitcher";

type HomeProps = {
    searchParams: Promise<{customize?: string; account?: string}>;
};

// The dashboard is a widget grid rendered from the user's saved layout. This
// stays a Server Component: every widget body is rendered here and handed to
// the client grid, which only owns order/span/edit state.
const Home = async ({searchParams}: HomeProps) => {
    const userId = await requireUserId();

    const {customize, account} = await searchParams;
    const cookieStore = await cookies();
    const ctx: LoaderCtx = {userId, preferredAccountId: account ?? cookieStore.get(ACTIVE_ACCOUNT_COOKIE)?.value};

    // Portfolios are cache()-deduped with the (root) layout, so this costs nothing extra.
    const [stored, portfolios, facts] = await Promise.all([getDashboardLayoutForUser(userId), getPortfoliosForUser(userId), getOnboardingFacts(userId)]);
    const availability = {accountCount: portfolios.length, advanced: true, onboarding: onboardingActive(facts)};
    const layout = filterAvailable(stored, availability);
    const availableIds = WIDGET_IDS.filter((id) => isWidgetAvailable(WIDGETS[id], availability));

    const {eager, needsActiveAccount} = resolveDataKeys(layout.widgets.map((w) => w.id));
    const {data, failed} = await loadDashboardData(eager, ctx);

    const bodies = Object.fromEntries(
        layout.widgets.map((w) => [w.id, renderWidgetBody(w.id, {ctx, data, failed, span: w.span})]),
    ) as Partial<Record<WidgetId, ReactNode>>;

    const activeAccount = data.activeAccount ?? pickActiveAccount(portfolios, ctx.preferredAccountId);
    const headerActions = needsActiveAccount && portfolios.length > 1 && activeAccount
        ? <AccountSwitcher accounts={toSwitcherAccounts(portfolios)} activeId={activeAccount.account.id} />
        : null;

    return (
        <DashboardGrid
            key={layoutFingerprint(layout)}
            initialLayout={layout}
            bodies={bodies}
            availableIds={availableIds}
            headerActions={headerActions}
            startInEditMode={customize === '1'}
        />
    );
};

export default Home;
