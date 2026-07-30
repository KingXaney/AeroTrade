import {redirect} from "next/navigation";
import {cookies} from "next/headers";
import Link from "next/link";
import {ACTIVE_ACCOUNT_COOKIE} from "@/lib/constants";
import {getCurrentUserId} from "@/lib/actions/watchlist.actions";
import {getAccountAnalytics, getComparisonStats, getPortfoliosForUser, getTradeHistory} from "@/lib/trading/account";
import AccountSummary from "@/components/trade/AccountSummary";
import PositionsTable from "@/components/trade/PositionsTable";
import TradeHistory from "@/components/trade/TradeHistory";
import ResetAccountButton from "@/components/trade/ResetAccountButton";
import AccountSwitcher from "@/components/trade/AccountSwitcher";
import ManageAccountMenu from "@/components/trade/ManageAccountMenu";
import AccountComparisonTable from "@/components/analytics/AccountComparisonTable";
import AnalyticsStats from "@/components/analytics/AnalyticsStats";
import PerformanceChart from "@/components/analytics/PerformanceChart";
import ExportCsvButton from "@/components/analytics/ExportCsvButton";

type PortfolioPageProps = {
    searchParams: Promise<{account?: string}>;
};

const PortfolioPage = async ({searchParams}: PortfolioPageProps) => {
    const userId = await getCurrentUserId();
    if (!userId) redirect('/sign-in');

    // Active strategy account: ?account= wins, then the cookie, then the first account.
    const {account: accountParam} = await searchParams;
    const cookieStore = await cookies();
    const preferredId = accountParam ?? cookieStore.get(ACTIVE_ACCOUNT_COOKIE)?.value;

    const all = await getPortfoliosForUser(userId);
    const activeEntry = (preferredId && all.find((x) => x.account.id === preferredId)) || all[0];
    const {account, summary: portfolio} = activeEntry;

    const [trades, analytics, comparisonStats] = await Promise.all([
        getTradeHistory(userId, account.id),
        getAccountAnalytics(userId, account.id),
        getComparisonStats(userId, Object.fromEntries(all.map((x) => [x.account.id, x.summary.totalValue]))),
    ]);

    const count = portfolio.positions.length;
    const switcherAccounts = all.map((x) => ({
        id: x.account.id,
        name: x.account.name,
        totalReturnPct: x.summary.totalReturnPct,
    }));
    const comparisonRows = all.map((x) => ({
        id: x.account.id,
        name: x.account.name,
        totalValue: x.summary.totalValue,
        totalReturnPct: x.summary.totalReturnPct,
        winRatePct: comparisonStats[x.account.id]?.winRatePct ?? null,
        maxDrawdownPct: comparisonStats[x.account.id]?.maxDrawdownPct ?? null,
    }));

    return (
        <div className="min-h-screen space-y-4">
            {/* Header */}
            <div className="flex flex-col md:flex-row md:items-end md:justify-between gap-4 mb-2">
                <div>
                    <h1 className="text-2xl font-semibold text-[#e2e2e8] mb-1" style={{fontFamily: 'var(--font-sora)'}}>
                        {account.name}
                    </h1>
                    <p className="text-sm text-[#849495]">
                        {count === 0 ? 'No open positions yet' : `${count} ${count === 1 ? 'holding' : 'holdings'} · live valuation`}
                    </p>
                </div>
                <div className="flex flex-wrap items-center gap-3">
                    <AccountSwitcher accounts={switcherAccounts} activeId={account.id} />
                    <ManageAccountMenu accountId={account.id} accountName={account.name} canDelete={all.length > 1} />
                    <ExportCsvButton accountId={account.id} />
                    <Link
                        href="/trade"
                        className="inline-flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-bold uppercase tracking-[0.1em] transition-all active:scale-[0.98]"
                        style={{fontFamily: 'var(--font-jetbrains)', backgroundColor: '#7df4ff', color: '#04212a'}}
                    >
                        <span className="material-symbols-outlined text-base">candlestick_chart</span>
                        Trade Desk
                    </Link>
                    <ResetAccountButton accountId={account.id} />
                </div>
            </div>

            {/* Which strategy wins — all accounts side by side */}
            {all.length > 1 && (
                <section className="glass-panel rounded-xl p-5">
                    <h2 className="text-sm font-bold uppercase tracking-[0.1em] text-[#7df4ff] mb-4" style={{fontFamily: 'var(--font-jetbrains)'}}>
                        Strategy Comparison
                    </h2>
                    <AccountComparisonTable rows={comparisonRows} activeId={account.id} />
                </section>
            )}

            {/* Performance vs benchmark + analytics */}
            {analytics && (
                <>
                    <section className="glass-panel rounded-xl p-5">
                        <h2 className="text-sm font-bold uppercase tracking-[0.1em] text-[#7df4ff] mb-4" style={{fontFamily: 'var(--font-jetbrains)'}}>
                            Performance vs S&amp;P 500
                        </h2>
                        <PerformanceChart series={analytics.series} accountName={account.name} />
                    </section>
                    <AnalyticsStats analytics={analytics} />
                </>
            )}

            {/* Account summary */}
            <AccountSummary portfolio={portfolio} />

            {/* Holdings */}
            <section className="glass-panel rounded-xl p-5">
                <h2 className="text-sm font-bold uppercase tracking-[0.1em] text-[#7df4ff] mb-4" style={{fontFamily: 'var(--font-jetbrains)'}}>
                    Holdings
                </h2>
                <PositionsTable positions={portfolio.positions} accountId={account.id} />
            </section>

            {/* Trade history */}
            <section className="glass-panel rounded-xl p-5">
                <h2 className="text-sm font-bold uppercase tracking-[0.1em] text-[#7df4ff] mb-4" style={{fontFamily: 'var(--font-jetbrains)'}}>
                    Trade History
                </h2>
                <TradeHistory trades={trades} />
            </section>
        </div>
    );
};

export default PortfolioPage;
