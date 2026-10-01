import {redirect} from "next/navigation";
import {cookies} from "next/headers";
import Link from "next/link";
import {ACTIVE_ACCOUNT_COOKIE} from "@/lib/constants";
import {getCurrentUserId} from "@/lib/actions/watchlist.actions";
import {getAccountAnalytics, getComparisonStats, getIncomeActivity, getPortfoliosForUser, getTradeLedger, TRADE_HISTORY_LIMIT} from "@/lib/trading/account";
import {replayReceipts} from "@/lib/trading/receipts";
import {buyNotesBySellId, openLotNotes} from "@/lib/trading/lots";
import {countUnpriced} from "@/lib/trading/analytics";
import {buildReturnBridge} from "@/lib/trading/learn/bridge";
import {drawdownBand} from "@/lib/learn/copy/portfolio";
import {getLuckOrSkill} from "@/lib/trading/learn/luck-store";
import {getTradingHabits} from "@/lib/trading/learn/habits-store";
import {toComparisonRows, toSwitcherAccounts} from "@/lib/dashboard/select";
import {marketStatus} from "@/lib/prices/market-hours";
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
import IncomeActivity from "@/components/trade/IncomeActivity";
import ReturnBridge from "@/components/learn/ReturnBridge";
import RiskLens from "@/components/learn/RiskLens";
import TradingHabits from "@/components/learn/TradingHabits";
import LuckOrSkill from "@/components/learn/LuckOrSkill";
import WhatTheseMean from "@/components/learn/WhatTheseMean";
import Panel from "@/components/primitives/Panel";
import SectionHeading from "@/components/primitives/SectionHeading";

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

    // The page's one ledger read, shared (cache()) with getAccountAnalytics and getIncomeActivity,
    // which hide their own sections when it fails. A failed read hides everything drawn from it
    // here too — the trade log with its receipts and buy notes, the lot notes — rather than
    // showing an empty ledger as "0 trades".
    const ledgerRead = getTradeLedger(userId, account.id).catch((error) => {
        console.error('Portfolio: reading the trade ledger failed:', error);
        return null;
    });
    // Habits derive from the same ledger — no second trade read — and hide with it; their few
    // quotes start the moment it resolves, alongside the page's other reads rather than after
    // them. Luck or skill starts then too: it places the return as the learner's only when the
    // learner placed a fill in this account (not on the Navigator's), the scope habits count.
    const habitsRead = ledgerRead.then((ledger) => (ledger ? getTradingHabits({
        ledger,
        positions: portfolio.positions,
        inceptionAt: account.inceptionAt,
        startingBalance: portfolio.startingBalance,
    }) : null));
    // Its own bounded reads (null = panel hidden); the learner's return is a stored snapshot's.
    const luckRead = ledgerRead.then((ledger) => getLuckOrSkill({
        accountId: account.id,
        inceptionAt: account.inceptionAt,
        startingBalance: portfolio.startingBalance,
        unpriced: countUnpriced(portfolio.positions),
        holdings: portfolio.positions.length,
        // A ledger that could not be read cannot say whose fills these are; the panel reads as before.
        ownFills: ledger === null || ledger.some((trade) => trade.source === 'user'),
    }));
    const [ledger, analytics, comparisonStats, income, luck, habits] = await Promise.all([
        ledgerRead,
        getAccountAnalytics(userId, account.id),
        getComparisonStats(userId, Object.fromEntries(all.map((x) => [x.account.id, x.summary.totalValue]))),
        getIncomeActivity(userId, account.id),
        luckRead,
        habitsRead,
    ]);

    // The trade log is the ledger's tail, newest first.
    const trades = ledger ? ledger.slice(-TRADE_HISTORY_LIMIT).reverse() : null;
    const receipts = ledger ? replayReceipts(ledger) : undefined;
    const count = portfolio.positions.length;
    const unpriced = countUnpriced(portfolio.positions);
    const marketOpen = marketStatus().state === 'open';
    const switcherAccounts = toSwitcherAccounts(all);
    const comparisonRows = toComparisonRows(all, comparisonStats);
    // Split from the same summary the Total Return tile prints, so the lines add up to it.
    const bridge = analytics ? buildReturnBridge({
        totalReturn: portfolio.totalReturnAbs,
        positions: portfolio.positions,
        realizedPnl: analytics.realizedPnl,
        income: analytics.income,
        tradeCount: analytics.tradeCount,
    }) : null;

    return (
        <div className="space-y-4">
            {/* Header */}
            <div className="flex flex-col md:flex-row md:items-end md:justify-between gap-4 mb-2">
                <div>
                    <h1 className="text-2xl font-semibold text-fg mb-1" style={{fontFamily: 'var(--type-display)'}}>
                        {account.name}
                    </h1>
                    <p className="text-sm text-fg-muted">
                        {count === 0
                            ? 'No open positions yet'
                            : `${count} ${count === 1 ? 'holding' : 'holdings'} · ${unpriced === 0 ? (marketOpen ? 'live valuation' : 'valued at last close') : unpriced === count ? 'valued at cost' : `${unpriced} valued at cost`}`}
                    </p>
                </div>
                <div className="flex flex-wrap items-center gap-3">
                    <AccountSwitcher accounts={switcherAccounts} activeId={account.id} />
                    <ManageAccountMenu accountId={account.id} accountName={account.name} canDelete={all.length > 1} />
                    <ExportCsvButton accountId={account.id} />
                    <Link
                        href="/trade"
                        className="inline-flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-bold uppercase tracking-[0.1em] transition-all active:scale-[0.98]"
                        style={{fontFamily: 'var(--type-mono)', backgroundColor: 'var(--brand)', color: 'var(--on-brand)'}}
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

            {/* Which strategy wins — all accounts side by side */}
            {all.length > 1 && (
                <section className="glass-panel rounded-xl p-5">
                    <h2 className="text-sm font-bold uppercase tracking-[0.1em] text-brand mb-4" style={{fontFamily: 'var(--type-mono)'}}>
                        Strategy Comparison
                    </h2>
                    <AccountComparisonTable rows={comparisonRows} activeId={account.id} />
                </section>
            )}

            {/* Performance vs benchmark + analytics */}
            {analytics && (
                <>
                    <section className="glass-panel rounded-xl p-5">
                        <h2 className="text-sm font-bold uppercase tracking-[0.1em] text-brand mb-1" style={{fontFamily: 'var(--type-mono)'}}>
                            Performance vs S&amp;P 500
                        </h2>
                        <p className="font-mono text-[11px] text-fg-muted mb-4">
                            Returns include interest on cash and dividends · benchmark is SPY&apos;s total return, dividends reinvested
                        </p>
                        <PerformanceChart series={analytics.series} accountName={account.name} band={drawdownBand(analytics.drawdown)} />
                    </section>
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
            <section className="glass-panel rounded-xl p-5">
                <h2 className="text-sm font-bold uppercase tracking-[0.1em] text-brand mb-4" style={{fontFamily: 'var(--type-mono)'}}>
                    Holdings
                </h2>
                <PositionsTable positions={portfolio.positions} accountId={account.id} lotNotes={ledger ? openLotNotes(ledger) : undefined} />
            </section>

            {/* What the account earned without trading */}
            {income && (
                <Panel id="income" aria-labelledby="income-heading">
                    <SectionHeading id="income-heading">Income</SectionHeading>
                    <IncomeActivity activity={income} />
                    <WhatTheseMean keys={['apy', 't-bill-rate', 'bond-equivalent-yield', 'ex-date', 'pay-date']} />
                </Panel>
            )}

            {/* Trade history — only from a ledger that was read */}
            {ledger && trades && (
                <section className="glass-panel rounded-xl p-5">
                    <h2 className="text-sm font-bold uppercase tracking-[0.1em] text-brand mb-4" style={{fontFamily: 'var(--type-mono)'}}>
                        Trade History
                    </h2>
                    <TradeHistory trades={trades} totalCount={analytics?.tradeCount} exportHref={`/api/accounts/${account.id}/export`} receipts={receipts} buyNotesBySellId={buyNotesBySellId(ledger)} />
                </section>
            )}
        </div>
    );
};

export default PortfolioPage;
