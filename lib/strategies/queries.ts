// Read side for /strategies, the detail pages and the dashboard widget. Plain server
// module; every read is scoped to the sentinel owner and cached per request.

import {cache} from "react";
import {connectToDatabase} from "@/database/mongoose";
import AccountSnapshot from "@/database/models/account-snapshot.model";
import BenchmarkSnapshot from "@/database/models/benchmark-snapshot.model";
import StrategyBacktest from "@/database/models/strategy-backtest.model";
import StrategyRun from "@/database/models/strategy-run.model";
import PriceBar from "@/database/models/price-bar.model";
import {getJobHealth, type JobHealth} from "@/lib/brain/queries";
import {
    buildPriceMap,
    computePortfolio,
    getAccountAnalytics,
    getComparisonStats,
    getTradeHistory,
    readAccountsForUser,
    toAccountSummary,
} from "@/lib/trading/account";
import {countUnpriced} from "@/lib/trading/analytics";
import {getEasternDateString} from "@/lib/utils";
import {STRATEGIES, strategyBySlug} from "@/lib/strategies/catalog";
import {STRATEGY_OWNER_ID} from "@/lib/strategies/config";
import {getFollowedStrategies} from "@/lib/strategies/follows";
import {getStrategyStates, type StrategyStateView} from "@/lib/strategies/store";
import type {SeriesStats, SignalRow, StrategyDefinition} from "@/lib/strategies/types";
import {BENCHMARK_SYMBOL} from "@/lib/strategies/universe";
import {
    describeLastRun,
    rankLeaderboard,
    selectWidgetRows,
    type LiveRecord,
    type SimulatedRecord,
    type StrategyLeaderboardRow,
    type StrategyRunView,
} from "@/lib/strategies/views";

export const STRATEGIES_JOB_ID = 'strategies-daily';
const DETAIL_TRADE_LIMIT = 100;

type LeanRun = {
    strategyId: string; date: string; asOf: string; mode: StrategyRunView['mode']; status: StrategyRunView['status'];
    staleCount: number; universeSize: number; rebalanceTriggered: boolean; board: SignalRow[];
    orders: {symbol: string; side: 'buy' | 'sell'; quantity: number; kind: 'enter' | 'add' | 'trim' | 'exit'; reason: string; executed: boolean; price?: number; message?: string}[];
    skippedOrders: {symbol: string; reason: string}[]; dataIssues: string[]; equity: number; summary: string;
};

const toRunView = (run: LeanRun): StrategyRunView => ({
    date: run.date,
    asOf: run.asOf,
    mode: run.mode,
    status: run.status,
    staleCount: run.staleCount,
    universeSize: run.universeSize,
    rebalanceTriggered: run.rebalanceTriggered,
    board: run.board.map((row) => ({symbol: row.symbol, state: row.state, values: row.values ?? {}, ...(row.note ? {note: row.note} : {})})),
    orders: run.orders.map((o) => ({
        symbol: o.symbol, side: o.side, quantity: o.quantity, kind: o.kind, reason: o.reason, executed: o.executed,
        price: typeof o.price === 'number' ? o.price : null,
        message: o.message ?? null,
    })),
    skippedOrders: run.skippedOrders ?? [],
    dataIssues: run.dataIssues ?? [],
    equity: run.equity,
    summary: run.summary,
});

// The latest run per strategy in one query.
const getLatestRuns = async (strategyIds: readonly string[]): Promise<Map<string, StrategyRunView>> => {
    const rows = await StrategyRun.aggregate<LeanRun>([
        {$match: {strategyId: {$in: [...strategyIds]}}},
        {$sort: {date: -1}},
        {$group: {_id: '$strategyId', doc: {$first: '$$ROOT'}}},
        {$replaceRoot: {newRoot: '$doc'}},
    ]);
    return new Map(rows.map((r) => [r.strategyId, toRunView(r)]));
};

type LeanBacktestStats = {strategyId: string; from: string; to: string; stats: SeriesStats; closeFills: number};

const getBacktestStats = async (): Promise<Map<string, SimulatedRecord>> => {
    const docs = await StrategyBacktest.find({}, {strategyId: 1, from: 1, to: 1, stats: 1, closeFills: 1}).lean<LeanBacktestStats[]>();
    return new Map(docs.map((d) => [d.strategyId, {from: d.from, to: d.to, stats: d.stats, closeFills: d.closeFills}]));
};

// SPY's return since each account's inception, from the same daily snapshots the
// performance chart uses: the first benchmark row on or after inception is the base.
const benchmarkReturnsSince = async (inceptionDates: readonly string[]): Promise<Map<string, number | null>> => {
    if (inceptionDates.length === 0) return new Map();
    const earliest = [...inceptionDates].sort()[0];
    const rows = await BenchmarkSnapshot.find({symbol: BENCHMARK_SYMBOL, date: {$gte: earliest}}).sort({date: 1}).lean<{date: string; close: number}[]>();
    const latest = rows.length > 0 ? rows[rows.length - 1] : null;
    return new Map(inceptionDates.map((inception) => {
        const base = rows.find((r) => r.date >= inception);
        const value = base && latest && base.close > 0 && latest.date > base.date ? (latest.close / base.close - 1) * 100 : null;
        return [inception, value];
    }));
};

const snapshotDaysByAccount = async (accountIds: readonly string[]): Promise<Map<string, number>> => {
    const rows = await AccountSnapshot.aggregate<{_id: string; days: number}>([
        {$match: {accountId: {$in: [...accountIds]}}},
        {$group: {_id: '$accountId', days: {$sum: 1}}},
    ]);
    return new Map(rows.map((r) => [r._id, r.days]));
};

export type StrategyLeaderboard = {
    rows: StrategyLeaderboardRow[];
    // Whether any live record has started (false = "has not run yet").
    started: boolean;
};

const buildLeaderboard = async (userId: string | null): Promise<StrategyLeaderboard> => {
    await connectToDatabase();
    const [states, accounts, followed] = await Promise.all([
        getStrategyStates(),
        readAccountsForUser(STRATEGY_OWNER_ID),
        userId ? getFollowedStrategies(userId) : Promise.resolve([] as string[]),
    ]);
    const stateById = new Map(states.map((s) => [s.strategyId, s]));
    const accountById = new Map(accounts.map((a) => [String(a._id), a]));

    // One shared quote map over held symbols only, never the 59-symbol universe.
    const heldSymbols = Array.from(new Set(accounts.flatMap((a) => a.positions.map((p) => p.symbol.toUpperCase()))));
    const priceMap = await buildPriceMap(heldSymbols);
    const portfolios = new Map(accounts.map((a) => [
        String(a._id),
        computePortfolio({cash: a.cash, startingBalance: a.startingBalance, positions: a.positions.map((p) => ({
            symbol: p.symbol, company: p.company || p.symbol, quantity: p.quantity, avgCost: p.avgCost,
        }))}, priceMap),
    ]));
    const liveValues = Object.fromEntries(Array.from(portfolios.entries()).map(([id, p]) => [id, p.totalValue]));
    const inceptionByAccount = new Map(accounts.map((a) => [String(a._id), getEasternDateString(new Date(toAccountSummary(a).inceptionAt))]));

    const [stats, runs, backtests, benchmarkReturns, snapshotDays] = await Promise.all([
        getComparisonStats(STRATEGY_OWNER_ID, liveValues),
        getLatestRuns(STRATEGIES.map((d) => d.id)),
        getBacktestStats(),
        benchmarkReturnsSince(Array.from(new Set(inceptionByAccount.values()))),
        snapshotDaysByAccount(Array.from(accountById.keys())),
    ]);
    const followedSet = new Set(followed);

    const rows: StrategyLeaderboardRow[] = STRATEGIES.map((def) => {
        const state = stateById.get(def.id) ?? null;
        const account = state ? accountById.get(state.accountId) : undefined;
        const portfolio = state ? portfolios.get(state.accountId) : undefined;
        let live: LiveRecord | null = null;
        if (state && account && portfolio) {
            const inception = inceptionByAccount.get(state.accountId) ?? state.launchDate;
            live = {
                totalValue: portfolio.totalValue,
                totalReturnPct: portfolio.totalReturnPct,
                benchmarkReturnPct: benchmarkReturns.get(inception) ?? null,
                maxDrawdownPct: stats[state.accountId]?.maxDrawdownPct ?? null,
                winRatePct: stats[state.accountId]?.winRatePct ?? null,
                holdings: portfolio.positions.length,
                unpriced: countUnpriced(portfolio.positions),
                snapshotDays: snapshotDays.get(state.accountId) ?? 0,
                inceptionAt: toAccountSummary(account).inceptionAt,
            };
        }
        const run = runs.get(def.id) ?? null;
        return {
            id: def.id,
            name: def.name,
            family: def.family,
            cadence: def.cadence,
            launchDate: state?.launchDate ?? null,
            lastError: state?.lastError ?? null,
            live,
            simulated: backtests.get(def.id) ?? null,
            lastAction: describeLastRun(run),
            followed: followedSet.has(def.id),
        };
    });
    return {rows: rankLeaderboard(rows), started: rows.some((r) => r.live !== null)};
};

export const getStrategyLeaderboard = cache(async (userId: string | null): Promise<StrategyLeaderboard> => {
    try {
        return await buildLeaderboard(userId);
    } catch (error) {
        console.error('Error building the strategy leaderboard:', error);
        return {rows: rankLeaderboard(STRATEGIES.map((def) => ({
            id: def.id, name: def.name, family: def.family, cadence: def.cadence, launchDate: null, lastError: null,
            live: null, simulated: null, lastAction: 'No run yet', followed: false,
        }))), started: false};
    }
});

export const getStrategyWidgetRows = async (userId: string, limit: number): Promise<StrategyLeaderboardRow[]> =>
    selectWidgetRows((await getStrategyLeaderboard(userId)).rows, limit);

export type StrategyBacktestView = {
    version: string;
    from: string;
    to: string;
    fillRule: 'next-open';
    closeFills: number;
    skippedDays: number;
    points: {date: string; value: number}[];
    benchmark: {date: string; value: number}[];
    trades: {date: string; symbol: string; side: 'buy' | 'sell'; quantity: number; price: number; total: number; realizedPnl?: number; reason: string; fill: 'open' | 'close'}[];
    stats: SeriesStats;
    computedAt: number;
};

export type StrategyDetail = {
    def: StrategyDefinition;
    state: StrategyStateView | null;
    analytics: AccountAnalytics | null;
    trades: PaperTradeRecord[];
    latestRun: StrategyRunView | null;
    backtest: StrategyBacktestView | null;
    followed: boolean;
    benchmarkReturnPct: number | null;
};

export const getStrategyDetail = cache(async (slug: string, userId: string | null): Promise<StrategyDetail | null> => {
    const def = strategyBySlug(slug);
    if (!def) return null;
    try {
        await connectToDatabase();
        const [states, followed] = await Promise.all([
            getStrategyStates(),
            userId ? getFollowedStrategies(userId) : Promise.resolve([] as string[]),
        ]);
        const state = states.find((s) => s.strategyId === def.id) ?? null;
        const [analytics, trades, runs, backtestDoc] = await Promise.all([
            state ? getAccountAnalytics(STRATEGY_OWNER_ID, state.accountId) : Promise.resolve(null),
            state ? getTradeHistory(STRATEGY_OWNER_ID, state.accountId, DETAIL_TRADE_LIMIT) : Promise.resolve([] as PaperTradeRecord[]),
            getLatestRuns([def.id]),
            StrategyBacktest.findOne({strategyId: def.id}).lean<(StrategyBacktestView & {computedAt: Date}) | null>(),
        ]);
        const inception = analytics ? getEasternDateString(new Date(analytics.account.inceptionAt)) : null;
        const benchmarkReturns = inception ? await benchmarkReturnsSince([inception]) : new Map<string, number | null>();
        return {
            def,
            state,
            analytics,
            trades,
            latestRun: runs.get(def.id) ?? null,
            backtest: backtestDoc ? {
                version: backtestDoc.version,
                from: backtestDoc.from,
                to: backtestDoc.to,
                fillRule: backtestDoc.fillRule,
                closeFills: backtestDoc.closeFills,
                skippedDays: backtestDoc.skippedDays,
                points: backtestDoc.points,
                benchmark: backtestDoc.benchmark,
                trades: backtestDoc.trades,
                stats: backtestDoc.stats,
                computedAt: new Date(backtestDoc.computedAt).getTime(),
            } : null,
            followed: followed.includes(def.id),
            benchmarkReturnPct: inception ? (benchmarkReturns.get(inception) ?? null) : null,
        };
    } catch (error) {
        console.error('Error loading strategy detail:', error);
        return {def, state: null, analytics: null, trades: [], latestRun: null, backtest: null, followed: false, benchmarkReturnPct: null};
    }
});

export type StrategiesSystemStatus = {
    job: JobHealth | null;
    latestBarDate: string | null;
    started: boolean;
    launchDate: string | null;
    lastRunDate: string | null;
    errors: {strategyId: string; message: string}[];
};

export const getStrategiesSystemStatus = cache(async (): Promise<StrategiesSystemStatus> => {
    try {
        await connectToDatabase();
        const [jobs, latestBar, states] = await Promise.all([
            getJobHealth([STRATEGIES_JOB_ID]),
            PriceBar.findOne({symbol: BENCHMARK_SYMBOL}).sort({date: -1}).select('date').lean<{date: string} | null>(),
            getStrategyStates(),
        ]);
        const lastRunDates = states.map((s) => s.lastRunDate).filter((d): d is string => d !== null).sort();
        const launchDates = states.map((s) => s.launchDate).sort();
        return {
            job: jobs[0] ?? null,
            latestBarDate: latestBar?.date ?? null,
            started: states.length > 0,
            launchDate: launchDates[0] ?? null,
            lastRunDate: lastRunDates.length > 0 ? lastRunDates[lastRunDates.length - 1] : null,
            errors: states.filter((s) => s.lastError).map((s) => ({strategyId: s.strategyId, message: s.lastError as string})),
        };
    } catch (error) {
        console.error('Error loading strategies status:', error);
        return {job: null, latestBarDate: null, started: false, launchDate: null, lastRunDate: null, errors: []};
    }
});
