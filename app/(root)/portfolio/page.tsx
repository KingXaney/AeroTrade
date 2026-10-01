import {cookies} from "next/headers";
import Link from "next/link";
import {requireUserId} from "@/lib/auth/session";
import {preferredAccountId} from "@/lib/trading/active-account";
import {getPortfolioPageView} from "@/lib/trading/portfolio-page-store";
import AccountSummary from "@/components/trading/portfolio/AccountSummary";
import PositionsTable from "@/components/trading/portfolio/PositionsTable";
import TradeHistory from "@/components/trading/portfolio/TradeHistory";
import ResetAccountButton from "@/components/trading/accounts/ResetAccountButton";
import AccountSwitcher from "@/components/trading/accounts/AccountSwitcher";
import ManageAccountMenu from "@/components/trading/accounts/ManageAccountMenu";
import AccountComparisonTable from "@/components/trading/portfolio/AccountComparisonTable";
import AnalyticsStats from "@/components/trading/portfolio/AnalyticsStats";
import PerformanceChart from "@/components/trading/PerformanceChart";
import ExportCsvButton from "@/components/trading/portfolio/ExportCsvButton";
import IncomeActivity from "@/components/income/IncomeActivity";
import ReturnBridge from "@/components/trading/learn/ReturnBridge";
import RiskLens from "@/components/trading/learn/RiskLens";
import TradingHabits from "@/components/trading/learn/TradingHabits";
import LuckOrSkill from "@/components/trading/learn/LuckOrSkill";
import WhatTheseMean from "@/components/learn/WhatTheseMean";
import Panel from "@/components/primitives/Panel";
import SectionHeading from "@/components/primitives/SectionHeading";
import {actionButton} from "@/components/primitives/ActionButton";

type PortfolioPageProps = {
    searchParams: Promise<{account?: string}>;
};

// The reads and everything worked out from them live in getPortfolioPageView
// (lib/trading/portfolio-page-store.ts, lib/trading/portfolio-page.ts); the page only composes.
const PortfolioPage = async ({searchParams}: PortfolioPageProps) => {
    const userId = await requireUserId();

    const {account: accountParam} = await searchParams;
    const view = await getPortfolioPageView(userId, preferredAccountId(accountParam, await cookies()));
    const {account, portfolio, analytics, bridge, habits, luck, income, tradeLog} = view;

    return (
        <div className="space-y-4">
            {/* Header */}
            <div className="flex flex-col md:flex-row md:items-end md:justify-between gap-4 mb-2">
                <div>
                    <h1 className="text-2xl font-semibold text-fg mb-1 font-heading">
                        {account.name}
                    </h1>
                    <p className="text-sm text-fg-muted">{view.summaryLine}</p>
                </div>
                <div className="flex flex-wrap items-center gap-3">
                    <AccountSwitcher accounts={view.switcherAccounts} activeId={account.id} />
                    <ManageAccountMenu accountId={account.id} accountName={account.name} canDelete={view.multiAccount} />
                    <ExportCsvButton accountId={account.id} />
                    <Link
                        href="/trade"
                        className={actionButton({size: 'md', className: 'inline-flex items-center gap-2 transition-all active:scale-[0.98]'})}
                    >
                        <span className="material-symbols-outlined text-base">candlestick_chart</span>
                        Trade Desk
                    </Link>
                    <ResetAccountButton
                        accountId={account.id}
                        accountName={account.name}
                        startingBalance={portfolio.startingBalance}
                    />
                </div>
            </div>

            {/* Which account wins — all accounts side by side */}
            {view.multiAccount && (
                <Panel>
                    <h2 className="text-sm font-bold uppercase tracking-[0.1em] text-brand mb-4 font-mono">
                        Account Comparison
                    </h2>
                    <AccountComparisonTable rows={view.comparisonRows} activeId={account.id} />
                </Panel>
            )}

            {/* Performance vs benchmark + analytics */}
            {analytics && (
                <>
                    <Panel>
                        <h2 className="text-sm font-bold uppercase tracking-[0.1em] text-brand mb-1 font-mono">
                            Performance vs S&amp;P 500
                        </h2>
                        <p className="font-mono text-[11px] text-fg-muted mb-4">
                            Returns include interest on cash and dividends · benchmark is SPY&apos;s total return, dividends reinvested
                        </p>
                        <PerformanceChart series={analytics.series} accountName={account.name} band={view.chartBand} />
                    </Panel>
                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                        <ReturnBridge accountId={account.id} bridge={bridge} />
                        <RiskLens series={analytics.series} snapshotThrough={analytics.snapshotThrough} portfolio={portfolio} />
                    </div>
                    <AnalyticsStats analytics={analytics} definitions />
                </>
            )}

            {/* The learner's own trading, measured: habits over their lots, and where the return
                landed among random portfolios held over the same days */}
            {(habits || luck) && (
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                    {habits && <TradingHabits read={habits} />}
                    {luck && <LuckOrSkill luck={luck} />}
                </div>
            )}

            {/* Account summary */}
            <AccountSummary portfolio={portfolio} income={analytics?.income} definitions />

            {/* Holdings */}
            <Panel>
                <h2 className="text-sm font-bold uppercase tracking-[0.1em] text-brand mb-4 font-mono">
                    Holdings
                </h2>
                <PositionsTable positions={portfolio.positions} accountId={account.id} lotNotes={view.lotNotes} />
            </Panel>

            {/* What the account earned without trading */}
            {income && (
                <Panel id="income" aria-labelledby="income-heading">
                    <SectionHeading id="income-heading">Income</SectionHeading>
                    <IncomeActivity activity={income} />
                    <WhatTheseMean keys={['apy', 't-bill-rate', 'bond-equivalent-yield', 'ex-date', 'pay-date']} />
                </Panel>
            )}

            {/* Trade history — only from a ledger that was read */}
            {tradeLog && (
                <Panel>
                    <h2 className="text-sm font-bold uppercase tracking-[0.1em] text-brand mb-4 font-mono">
                        Trade History
                    </h2>
                    <TradeHistory trades={tradeLog.trades} totalCount={analytics?.tradeCount} exportHref={tradeLog.exportHref} receipts={tradeLog.receipts} buyNotesBySellId={tradeLog.buyNotesBySellId} />
                </Panel>
            )}
        </div>
    );
};

export default PortfolioPage;
