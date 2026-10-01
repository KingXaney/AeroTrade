// The /portfolio analytics reads: one account's figures against the SPY benchmark
// (getAccountAnalytics) and every account's win rate and drawdown for the comparison table
// (getComparisonStats). The maths is analytics.ts (pure); these assemble its inputs.
// Server-only (NOT 'use server').

import {connectToDatabase} from "@/database/mongoose";
import PaperAccount from "@/database/models/paper-account.model";
import PaperTrade from "@/database/models/paper-trade.model";
import AccountSnapshot from "@/database/models/account-snapshot.model";
import {BENCHMARK_SYMBOL} from "@/lib/prices/config";
import {getEasternDateString} from "@/lib/dates";
import {getBenchmarkIndex} from "@/lib/prices/benchmark-store";
import {appendLive} from "@/lib/prices/total-return";
import {
    benchmarkReturnBetween,
    buildPerfSeries,
    computeMaxDrawdown,
    computeRealizedPnl,
    computeWinStats,
    drawdownWindow,
    mergeLivePoint,
} from "@/lib/trading/analytics";
import {getOwnedAccount, toAccountSummary, toPlainPositions} from "@/lib/trading/accounts";
import {buildPriceMap, computePortfolio} from "@/lib/trading/valuation";
import {epochTradesOf, getTradeLedger} from "@/lib/trading/ledger";
import {getIncomeSummary} from "@/lib/income/page-store";
import type {AccountAnalytics, SnapshotPoint} from '@/lib/trading/types';

// Everything the /portfolio analytics section needs for one account: current
// summary, %-return series vs the SPY benchmark, drawdown and trade stats.
// The math lives in analytics.ts (pure); this assembles its inputs.
export const getAccountAnalytics = async (userId: string, accountId: string): Promise<AccountAnalytics | null> => {
    try {
        const account = await getOwnedAccount(userId, accountId);
        if (!account) return null;

        const summaryInfo = toAccountSummary(account);
        const inceptionDate = getEasternDateString(new Date(summaryInfo.inceptionAt));
        const key = String(account._id);

        const [snapshots, benchmark, trades] = await Promise.all([
            AccountSnapshot.find({accountId: key}).sort({date: 1}).lean(),
            getBenchmarkIndex(inceptionDate),
            getTradeLedger(userId, key),
        ]);

        const positions = toPlainPositions(account);
        // SPY rides along in the same quote map: the benchmark needs today's point too.
        const priceMap = await buildPriceMap([...positions.map((p) => p.symbol), BENCHMARK_SYMBOL]);
        const summary = computePortfolio(
            {cash: account.cash, startingBalance: account.startingBalance, positions},
            priceMap,
        );

        const snapshotPoints: SnapshotPoint[] = snapshots.map((s) => ({date: s.date, value: s.totalValue}));
        const today = getEasternDateString();
        // SPY total return, with today's point from the live quote so the chart's last point
        // compares like with like instead of today's account against yesterday's SPY.
        const benchmarkPoints: SnapshotPoint[] = appendLive(benchmark.points, benchmark.lastClose, priceMap.get(BENCHMARK_SYMBOL)?.price, today);
        const livePoint: SnapshotPoint = {date: today, value: summary.totalValue};

        const tradeStats = trades.map((t) => ({side: t.side as string, realizedPnl: t.realizedPnl}));
        const winStats = computeWinStats(tradeStats);
        // One window, dated, over the same points the chart draws: the tile's number, its hint
        // and the chart's shaded band all describe the same stretch.
        const series = buildPerfSeries(snapshotPoints, benchmarkPoints, livePoint);
        const drawdown = drawdownWindow(mergeLivePoint(snapshotPoints, livePoint));

        return {
            account: summaryInfo,
            summary,
            income: await getIncomeSummary(account),
            series,
            snapshotThrough: snapshotPoints.at(-1)?.date ?? null,
            maxDrawdownPct: drawdown?.pct ?? null,
            drawdown,
            benchmarkOverDrawdownPct: drawdown && drawdown.pct > 0
                ? benchmarkReturnBetween(series, drawdown.peakDate, drawdown.troughDate)
                : null,
            winRatePct: winStats.winRatePct,
            wins: winStats.wins,
            losses: winStats.losses,
            realizedPnl: computeRealizedPnl(tradeStats),
            tradeCount: trades.length,
        };
    } catch (error) {
        console.error('Error computing account analytics:', error);
        return null;
    }
};

type ComparisonStats = {winRatePct: number | null; maxDrawdownPct: number | null; tradeCount: number};

// Win rate + max drawdown (and the fill count behind the win rate) for every account of a
// user in bulk queries (feeds the account comparison table without N per-account round trips).
// liveValues (accountId -> current total value) folds today's live valuation
// into each drawdown series the same way getAccountAnalytics does. Trades are each
// account's current epoch (epochTradesOf), so the table's win rate is the tile's.
export const getComparisonStats = async (
    userId: string,
    liveValues?: Record<string, number>,
): Promise<Record<string, ComparisonStats>> => {
    try {
        await connectToDatabase();
        const epochTradesForUser = async () => {
            const accounts = await PaperAccount.find({userId}).select('inceptionAt').lean<{_id: unknown; inceptionAt?: Date}[]>();
            return PaperTrade.find(epochTradesOf(userId, accounts))
                .select('accountId side realizedPnl')
                .lean<{accountId?: string; side: string; realizedPnl?: number}[]>();
        };
        const [trades, snapshots] = await Promise.all([
            epochTradesForUser(),
            AccountSnapshot.find({userId}).sort({date: 1}).lean(),
        ]);

        const tradesByAccount = new Map<string, {side: string; realizedPnl?: number}[]>();
        for (const t of trades) {
            if (!t.accountId) continue;
            const list = tradesByAccount.get(t.accountId) ?? [];
            list.push({side: t.side, realizedPnl: t.realizedPnl});
            tradesByAccount.set(t.accountId, list);
        }
        const snapshotsByAccount = new Map<string, SnapshotPoint[]>();
        for (const s of snapshots) {
            const list = snapshotsByAccount.get(s.accountId) ?? [];
            list.push({date: s.date, value: s.totalValue});
            snapshotsByAccount.set(s.accountId, list);
        }

        const today = getEasternDateString();
        const ids = new Set([...tradesByAccount.keys(), ...snapshotsByAccount.keys(), ...Object.keys(liveValues ?? {})]);
        const result: Record<string, ComparisonStats> = {};
        for (const id of ids) {
            const live = liveValues?.[id];
            const points = mergeLivePoint(
                snapshotsByAccount.get(id) ?? [],
                typeof live === 'number' ? {date: today, value: live} : undefined,
            );
            const accountTrades = tradesByAccount.get(id) ?? [];
            result[id] = {
                winRatePct: computeWinStats(accountTrades).winRatePct,
                maxDrawdownPct: computeMaxDrawdown(points),
                tradeCount: accountTrades.length,
            };
        }
        return result;
    } catch (error) {
        console.error('Error computing comparison stats:', error);
        return {};
    }
};
