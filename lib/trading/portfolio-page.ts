// The /portfolio page's view (app/(root)/portfolio/page.tsx): everything it prints that is
// worked out from the reads rather than read — the header line, the switcher and comparison
// rows, the return bridge, the chart's drawdown band and the trade log drawn from the ledger.
// Pure; the reads are getPortfolioPageView (lib/trading/portfolio-page-store.ts).

import {drawdownBand, HOLDINGS_COPY} from "@/lib/learn/copy/portfolio";
import {toComparisonRows, toSwitcherAccounts, type ComparisonRow, type ComparisonStat, type SwitcherAccount} from "@/lib/trading/active-account";
import {countUnpriced} from "@/lib/trading/analytics";
import {TRADE_HISTORY_LIMIT} from "@/lib/trading/config";
import {accountExportHref} from "@/lib/trading/csv";
import {buildReturnBridge, type ReturnBridge} from "@/lib/trading/learn/bridge";
import {buyNotesBySellId, openLotNotes, type Lot} from "@/lib/trading/lots";
import {replayReceipts, type FillReceipt} from "@/lib/trading/receipts";
import type {AccountAnalytics, AccountWithPortfolio, PaperTradeRecord} from "@/lib/trading/types";
import type {IncomeView} from "@/lib/income/accrual";
import type {HabitsRead} from "@/lib/trading/learn/habits-store";
import type {LuckRead} from "@/lib/trading/learn/luck-store";

// What the page's reads returned; `ledger` is null when the ledger read failed.
export type PortfolioPageReads = {
    all: readonly AccountWithPortfolio[];
    active: AccountWithPortfolio;
    ledger: PaperTradeRecord[] | null;
    analytics: AccountAnalytics | null;
    comparisonStats: Record<string, ComparisonStat | undefined>;
    income: IncomeView | null;
    luck: LuckRead | null;
    habits: HabitsRead | null;
    marketOpen: boolean;
};

export type PortfolioTradeLog = {
    // The ledger's tail, newest first.
    trades: PaperTradeRecord[];
    receipts: Record<string, FillReceipt>;
    buyNotesBySellId: Record<string, string[]>;
    exportHref: string;
};

export type PortfolioPageView = {
    account: AccountWithPortfolio['account'];
    portfolio: AccountWithPortfolio['summary'];
    // "N holdings · <basis>" under the account name.
    summaryLine: string;
    // More than one account: the comparison table shows and the account can be deleted.
    multiAccount: boolean;
    switcherAccounts: SwitcherAccount[];
    comparisonRows: ComparisonRow[];
    analytics: AccountAnalytics | null;
    chartBand: ReturnType<typeof drawdownBand>;
    // Split from the same summary the Total Return tile prints, so the lines add up to it.
    bridge: ReturnBridge | null;
    income: IncomeView | null;
    luck: LuckRead | null;
    habits: HabitsRead | null;
    // Everything drawn from the ledger — hidden, not shown empty, when the ledger read failed.
    lotNotes: Record<string, Lot[]> | undefined;
    tradeLog: PortfolioTradeLog | null;
};

export const toPortfolioPageView = (
    reads: PortfolioPageReads,
): PortfolioPageView => {
    const {all, active, ledger, analytics} = reads;
    const {account, summary: portfolio} = active;
    return {
        account,
        portfolio,
        summaryLine: HOLDINGS_COPY.summary(portfolio.positions.length, countUnpriced(portfolio.positions), reads.marketOpen),
        multiAccount: all.length > 1,
        switcherAccounts: toSwitcherAccounts(all),
        comparisonRows: toComparisonRows(all, reads.comparisonStats),
        analytics,
        chartBand: analytics ? drawdownBand(analytics.drawdown) : null,
        bridge: analytics ? buildReturnBridge({
            totalReturn: portfolio.totalReturnAbs,
            positions: portfolio.positions,
            realizedPnl: analytics.realizedPnl,
            income: analytics.income,
            tradeCount: analytics.tradeCount,
        }) : null,
        income: reads.income,
        luck: reads.luck,
        habits: reads.habits,
        lotNotes: ledger ? openLotNotes(ledger) : undefined,
        tradeLog: ledger ? {
            trades: ledger.slice(-TRADE_HISTORY_LIMIT).reverse(),
            receipts: replayReceipts(ledger),
            buyNotesBySellId: buyNotesBySellId(ledger),
            exportHref: accountExportHref(account.id),
        } : null,
    };
};
