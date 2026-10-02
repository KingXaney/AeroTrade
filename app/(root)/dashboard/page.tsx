import {cookies} from "next/headers";
import type {ReactNode} from "react";
import {requireUserId} from "@/lib/auth/session";
import {getPortfoliosForUser} from "@/lib/trading/valuation";
import {resolveDataKeys, type WidgetId} from "@/lib/dashboard/catalog";
import {layoutFingerprint} from "@/lib/dashboard/layout";
import {getVisibleLayout} from "@/lib/dashboard/availability";
import {loadDashboardData, type LoaderCtx} from "@/lib/dashboard/loaders";
import {pickActiveAccount, preferredAccountId, toSwitcherAccounts} from "@/lib/trading/active-account";
import {renderWidgetBody} from "@/components/dashboard/widgets/registry";
import DashboardGrid from "@/components/dashboard/DashboardGrid";
import AccountSwitcher from "@/components/trading/accounts/AccountSwitcher";

type DashboardProps = {
    searchParams: Promise<{customize?: string; account?: string}>;
};

// The dashboard is a widget grid rendered from the user's saved layout — the page the reader
// arranges, beside Home (app/(root)/page.tsx), which arranges itself. This
// stays a Server Component: every widget body is rendered here and handed to
// the client grid, which only owns order/span/edit state.
const Dashboard = async ({searchParams}: DashboardProps) => {
    const userId = await requireUserId();

    const {customize, account} = await searchParams;
    const ctx: LoaderCtx = {userId, preferredAccountId: preferredAccountId(account, await cookies())};

    // Portfolios are cache()-deduped with the (root) layout and the availability read, so this
    // costs nothing extra.
    const [{layout, availableIds}, portfolios] = await Promise.all([getVisibleLayout(userId), getPortfoliosForUser(userId)]);

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

export default Dashboard;
