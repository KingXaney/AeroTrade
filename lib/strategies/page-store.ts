// Read side for /strategies, the detail pages and the dashboard widget. Plain server
// module; every read is scoped to the sentinel owner and cached per request.

import {cache} from "react";
import {connectToDatabase} from "@/database/mongoose";
import AccountSnapshot from "@/database/models/account-snapshot.model";
import StrategyBacktest from "@/database/models/strategy-backtest.model";
import StrategyRun from "@/database/models/strategy-run.model";
import PriceBar from "@/database/models/price-bar.model";
import {getJobHealth, type JobHealth} from "@/lib/brain/store";
import {
    buildPriceMap,
    computePortfolio,
    getAccountAnalytics,
    getComparisonStats,
    getTradeHistory,
    getTradeLedger,
    readAccountsForUser,
    toAccountSummary,
} from "@/lib/trading/account";
import {countUnpriced, mergeLivePoint} from "@/lib/trading/analytics";
import {getEasternDateString} from "@/lib/dates";
import {getBenchmarkIndex} from "@/lib/prices/benchmark-store";
import {appendLive, indexReturnPct} from "@/lib/prices/total-return";
import {STRATEGIES, strategyBySlug} from "@/lib/strategies/catalog";
import {STRATEGY_OWNER_ID} from "@/lib/strategies/config";
import {getFollowedStrategies} from "@/lib/strategies/follows";
import {getStrategyStates, type StrategyStateView} from "@/lib/strategies/store";
import type {ReplayRun} from "@/lib/strategies/learn/replay";
import type {QuizRun} from "@/lib/learn/quiz";
import type {SymbolBoardRead} from "@/lib/stocks/rules-see";
import type {SeriesStats, SignalRow, StrategyDefinition, StrategyId} from "@/lib/strategies/types";
import {BENCHMARK_SYMBOL, strategiesWatching} from "@/lib/strategies/universe";
import {whatIfLab, type StoredWhatIfVariant, type WhatIfLabView} from "@/lib/strategies/whatif";
import {
    describeLastRun,
    downsample,
    rankLeaderboard,
    selectWidgetRows,
    SPARK_POINTS,
    toSparkPct,
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

const toBoardRow = (row: SignalRow): SignalRow =>
    ({symbol: row.symbol, state: row.state, values: row.values ?? {}, ...(row.note ? {note: row.note} : {})});

const toOrderView = (o: LeanRun['orders'][number]): StrategyRunView['orders'][number] => ({
    symbol: o.symbol, side: o.side, quantity: o.quantity, kind: o.kind, reason: o.reason, executed: o.executed,
    price: typeof o.price === 'number' ? o.price : null,
    message: o.message ?? null,
});

const toRunView = (run: LeanRun): StrategyRunView => ({
    date: run.date,
    asOf: run.asOf,
    mode: run.mode,
    status: run.status,
    staleCount: run.staleCount,
    universeSize: run.universeSize,
    rebalanceTriggered: run.rebalanceTriggered,
    board: run.board.map(toBoardRow),
    orders: run.orders.map(toOrderView),
    skippedOrders: run.skippedOrders ?? [],
    dataIssues: run.dataIssues ?? [],
    equity: run.equity,
    summary: run.summary,
});

// One strategy's newest run: the first entry of a backward walk down the {strategyId, date}
// index — one document, its board included (at most the rule's universe). The detail page's
// latest decision and the chat's getQuantStrategies read it; never fanned out over all eight.
export const getLatestRun = async (strategyId: StrategyId): Promise<StrategyRunView | null> => {
    await connectToDatabase();
    const run = await StrategyRun.findOne({strategyId}).sort({date: -1}).lean<LeanRun | null>();
    return run ? toRunView(run) : null;
};

type LeanReplay = {date: string; asOf: string; board?: SignalRow[]; orders?: LeanRun['orders']};

// The board rows and planned orders behind a page's fills, keyed by run date. Only the
// traded symbols' rows are projected: a hundred fills against RSI-2's forty-row boards
// would otherwise ship 4,000 rows for the dozen that get opened.
export const getBoardRowsForFills = async (
    strategyId: string,
    fills: readonly {date: string; symbol: string}[],
): Promise<Record<string, ReplayRun>> => {
    if (fills.length === 0) return {};
    const dates = Array.from(new Set(fills.map((f) => f.date)));
    const symbols = Array.from(new Set(fills.map((f) => f.symbol.toUpperCase())));
    const rows = await StrategyRun.aggregate<LeanReplay>([
        {$match: {strategyId, date: {$in: dates}}},
        {$project: {
            _id: 0,
            date: 1,
            asOf: 1,
            board: {$filter: {input: '$board', as: 'row', cond: {$in: ['$$row.symbol', symbols]}}},
            orders: {$filter: {input: '$orders', as: 'o', cond: {$in: ['$$o.symbol', symbols]}}},
        }},
    ]);
    return Object.fromEntries(rows.map((r) => [r.date, {
        asOf: r.asOf,
        board: (r.board ?? []).map(toBoardRow),
        orders: (r.orders ?? []).map(toOrderView),
    }]));
};

type LeanQuizRun = {strategyId: StrategyId; date: string; board?: SignalRow[]; orders?: {symbol: string; side: 'buy' | 'sell'; reason: string}[]};

// The Daily quiz's read: the newest usable run per strategy dated from `since` up to (not
// including) `before`, as one point read per strategy on the {strategyId, date} index (eight
// at most, each scanning no further back than `since`) — never the board-carrying aggregate
// over every run. A skipped day or an empty board is passed over for the day before it;
// orders are projected to what the reveal quotes.
const usableRunFilter = (strategyId: StrategyId, since: string, before: string) =>
    ({strategyId, date: {$gte: since, $lt: before}, status: {$ne: 'skipped'}, 'board.0': {$exists: true}});

export const getRecentRuns = async (
    strategyIds: readonly StrategyId[],
    {since, before}: {since: string; before: string},
): Promise<Partial<Record<StrategyId, QuizRun>>> => {
    await connectToDatabase();
    const runs = await Promise.all(strategyIds.map((strategyId) => StrategyRun
        .findOne(usableRunFilter(strategyId, since, before))
        .sort({date: -1})
        .select({_id: 0, strategyId: 1, date: 1, board: 1, 'orders.symbol': 1, 'orders.side': 1, 'orders.reason': 1})
        .lean<LeanQuizRun | null>()));
    return Object.fromEntries(runs.flatMap((run) => (run ? [[run.strategyId, {
        date: run.date,
        board: (run.board ?? []).map(toBoardRow),
        orders: (run.orders ?? []).map((o) => ({symbol: o.symbol, side: o.side, reason: o.reason})),
    } satisfies QuizRun]] : [])));
};

// The same eight point reads, projected to the date alone (no board crosses the wire): which
// run getRecentRuns would return per strategy — the stamp the quiz's day memo is keyed on.
export const getRecentRunDates = async (
    strategyIds: readonly StrategyId[],
    {since, before}: {since: string; before: string},
): Promise<Partial<Record<StrategyId, string>>> => {
    await connectToDatabase();
    const runs = await Promise.all(strategyIds.map((strategyId) => StrategyRun
        .findOne(usableRunFilter(strategyId, since, before))
        .sort({date: -1})
        .select({_id: 0, strategyId: 1, date: 1})
        .lean<{strategyId: StrategyId; date: string} | null>()));
    return Object.fromEntries(runs.flatMap((run) => (run ? [[run.strategyId, run.date]] : [])));
};

type LeanSymbolRun = {date: string; asOf: string; board?: SignalRow[]};

// The stock page's "What the rules see": for each strategy watching `symbol`, its newest run —
// the run that strategy's own signal board shows — with the board projected by $elemMatch to
// this symbol's one row. One findOne per watching strategy (four at most, each the first entry
// of a backward walk down the {strategyId, date} index) in one Promise.all; never the
// board-carrying aggregate. A strategy with no run yet is left out; a run whose board has no
// row for the symbol comes back with `row: null`.
export const getBoardRowsForSymbol = cache(async (symbol: string): Promise<SymbolBoardRead[]> => {
    const wanted = symbol.trim().toUpperCase();
    const watching = strategiesWatching(wanted);
    if (watching.length === 0) return [];
    await connectToDatabase();
    const runs = await Promise.all(watching.map((def) => StrategyRun
        .findOne({strategyId: def.id}, {_id: 0, date: 1, asOf: 1, board: {$elemMatch: {symbol: wanted}}})
        .sort({date: -1})
        .lean<LeanSymbolRun | null>()));
    return watching.flatMap((def, i) => {
        const run = runs[i];
        if (!run) return [];
        const row = run.board?.[0];
        return [{strategyId: def.id, date: run.date, asOf: run.asOf, row: row ? toBoardRow(row) : null}];
    });
});

type LeanBacktestStats = {strategyId: string; from: string; to: string; stats: SeriesStats; closeFills: number; points?: {value: number}[]};

// Only points.value is projected. A backtest holds ~756 points, so that is ~48 KB read
// from Mongo inside a cache()d server call; only the 40-point downsample reaches the client.
const getBacktestStats = async (): Promise<Map<string, SimulatedRecord>> => {
    const docs = await StrategyBacktest
        .find({}, {strategyId: 1, from: 1, to: 1, stats: 1, closeFills: 1, 'points.value': 1})
        .lean<LeanBacktestStats[]>();
    return new Map(docs.map((d) => [d.strategyId, {
        from: d.from,
        to: d.to,
        stats: d.stats,
        closeFills: d.closeFills,
        spark: toSparkPct(downsample((d.points ?? []).map((p) => p.value), SPARK_POINTS)),
    }]));
};

// SPY's TOTAL return since each account's inception — the accounts earn interest and
// dividends, so the benchmark reinvests its own. The base is the first index point on or
// after inception; the latest leg is moved by SPY's live quote when one is in hand, so it
// sits on the same basis as the account's live valuation.
const benchmarkReturnsSince = async (inceptionDates: readonly string[], liveClose?: number): Promise<Map<string, number | null>> => {
    if (inceptionDates.length === 0) return new Map();
    const earliest = [...inceptionDates].sort()[0];
    const today = getEasternDateString();
    const {points, lastClose} = await getBenchmarkIndex(earliest);
    const index = appendLive(points, lastClose, liveClose, today);
    return new Map(inceptionDates.map((inception) => [inception, indexReturnPct(index, inception, today)]));
};

type SnapshotSeries = {days: number; points: SnapshotPoint[]};

// The count and the curve in one pass, so the sparkline and "N daily snapshots" can
// never disagree about how much history there is.
const snapshotSeriesByAccount = async (accountIds: readonly string[]): Promise<Map<string, SnapshotSeries>> => {
    const rows = await AccountSnapshot.aggregate<{_id: string; days: number; points: SnapshotPoint[]}>([
        {$match: {accountId: {$in: [...accountIds]}}},
        {$sort: {date: 1}},
        {$group: {_id: '$accountId', days: {$sum: 1}, points: {$push: {date: '$date', value: '$totalValue'}}}},
    ]);
    return new Map(rows.map((r) => [r._id, {days: r.days, points: r.points}]));
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

    // One shared quote map over held symbols (plus SPY for the benchmark leg), never the
    // 59-symbol universe.
    const heldSymbols = Array.from(new Set([...accounts.flatMap((a) => a.positions.map((p) => p.symbol.toUpperCase())), BENCHMARK_SYMBOL]));
    const priceMap = await buildPriceMap(heldSymbols);
    const spyLive = priceMap.get(BENCHMARK_SYMBOL)?.price;
    const portfolios = new Map(accounts.map((a) => [
        String(a._id),
        computePortfolio({cash: a.cash, startingBalance: a.startingBalance, positions: a.positions.map((p) => ({
            symbol: p.symbol, company: p.company || p.symbol, quantity: p.quantity, avgCost: p.avgCost,
        }))}, priceMap),
    ]));
    const liveValues = Object.fromEntries(Array.from(portfolios.entries()).map(([id, p]) => [id, p.totalValue]));
    const inceptionByAccount = new Map(accounts.map((a) => [String(a._id), getEasternDateString(new Date(toAccountSummary(a).inceptionAt))]));

    // No run read here on purpose: the ranking stopped printing a "last action" column
    // (eight identical strings), and that was its only reader — so no StrategyRun document
    // carrying a board array sits on this page's hot path.
    const [stats, backtests, benchmarkReturns, snapshots] = await Promise.all([
        getComparisonStats(STRATEGY_OWNER_ID, liveValues),
        getBacktestStats(),
        benchmarkReturnsSince(Array.from(new Set(inceptionByAccount.values())), spyLive),
        snapshotSeriesByAccount(Array.from(accountById.keys())),
    ]);
    const today = getEasternDateString();
    const followedSet = new Set(followed);

    const rows: StrategyLeaderboardRow[] = STRATEGIES.map((def) => {
        const state = stateById.get(def.id) ?? null;
        const account = state ? accountById.get(state.accountId) : undefined;
        const portfolio = state ? portfolios.get(state.accountId) : undefined;
        let live: LiveRecord | null = null;
        if (state && account && portfolio) {
            const inception = inceptionByAccount.get(state.accountId) ?? state.launchDate;
            const snapshot = snapshots.get(state.accountId);
            live = {
                totalValue: portfolio.totalValue,
                totalReturnPct: portfolio.totalReturnPct,
                benchmarkReturnPct: benchmarkReturns.get(inception) ?? null,
                maxDrawdownPct: stats[state.accountId]?.maxDrawdownPct ?? null,
                winRatePct: stats[state.accountId]?.winRatePct ?? null,
                fills: stats[state.accountId]?.tradeCount ?? 0,
                holdings: portfolio.positions.length,
                unpriced: countUnpriced(portfolio.positions),
                snapshotDays: snapshot?.days ?? 0,
                inceptionAt: toAccountSummary(account).inceptionAt,
                // Today's live valuation is folded in the same way getComparisonStats does
                // for drawdown, so the curve ends where totalReturnPct says it does.
                spark: toSparkPct(downsample(
                    mergeLivePoint(snapshot?.points ?? [], {date: today, value: portfolio.totalValue}).map((p) => p.value),
                    SPARK_POINTS,
                )),
            };
        }
        return {
            id: def.id,
            name: def.name,
            family: def.family,
            cadence: def.cadence,
            launchDate: state?.launchDate ?? null,
            lastError: state?.lastError ?? null,
            live,
            simulated: backtests.get(def.id) ?? null,
            followed: followedSet.has(def.id),
            beginnerLine: def.explainer.beginnerLine,
        };
    });
    return {rows: rankLeaderboard(rows), started: rows.some((r) => r.live !== null)};
};

// Errors propagate on purpose: the route's error boundary (and the widget's failed state)
// must render, not a "has not run yet" that would be a lie.
export const getStrategyLeaderboard = cache(async (userId: string | null): Promise<StrategyLeaderboard> => buildLeaderboard(userId));

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
    // Real 16:10 snapshots on record (the chart's series also carries today's live point).
    snapshotDays: number;
    // One-line summary of the latest run, from describeLastRun.
    lastActionLine: string;
    // The stored board row and planned order behind each strategy fill on this page, by run date.
    replays: Record<string, ReplayRun>;
    // The what-if lab: the precomputed grid beside this backtest (null: the rule has no knob).
    whatIf: WhatIfLabView | null;
};

export const getStrategyDetail = cache(async (slug: string, userId: string | null): Promise<StrategyDetail | null> => {
    const def = strategyBySlug(slug);
    if (!def) return null;
    await connectToDatabase();
    const [states, followed] = await Promise.all([
        getStrategyStates(),
        userId ? getFollowedStrategies(userId) : Promise.resolve([] as string[]),
    ]);
    const state = states.find((s) => s.strategyId === def.id) ?? null;
    const [analytics, trades, latestRun, backtestDoc, snapshotDays] = await Promise.all([
        state ? getAccountAnalytics(STRATEGY_OWNER_ID, state.accountId) : Promise.resolve(null),
        state ? getTradeHistory(STRATEGY_OWNER_ID, state.accountId, DETAIL_TRADE_LIMIT) : Promise.resolve([] as PaperTradeRecord[]),
        getLatestRun(def.id),
        // One document: the page's backtest and the ≤4 what-if variants stored with it.
        StrategyBacktest.findOne({strategyId: def.id})
            .lean<(StrategyBacktestView & {computedAt: Date; variants?: StoredWhatIfVariant[]; variantsVersion?: string; variantsFor?: Date}) | null>(),
        state ? snapshotSeriesByAccount([state.accountId]) : Promise.resolve(new Map<string, SnapshotSeries>()),
    ]);
    const inception = analytics ? getEasternDateString(new Date(analytics.account.inceptionAt)) : null;
    // The same basis as the account's live valuation: SPY's quote if held, else one quote.
    const spyLive = analytics
        ? (analytics.summary.positions.find((p) => p.symbol === BENCHMARK_SYMBOL)?.currentPrice
            ?? (await buildPriceMap([BENCHMARK_SYMBOL])).get(BENCHMARK_SYMBOL)?.price)
        : undefined;
    const benchmarkReturns = inception ? await benchmarkReturnsSince([inception], spyLive) : new Map<string, number | null>();
    // A second, bounded read: it needs the fills, which the pass above produced.
    const replays = await getBoardRowsForFills(def.id, trades
        .filter((t) => t.source === 'strategy')
        .map((t) => ({date: getEasternDateString(new Date(t.createdAt)), symbol: t.symbol})));
    {
        return {
            def,
            state,
            analytics,
            trades,
            latestRun,
            lastActionLine: describeLastRun(latestRun),
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
            snapshotDays: state ? (snapshotDays.get(state.accountId)?.days ?? 0) : 0,
            replays,
            whatIf: whatIfLab(def, backtestDoc),
        };
    }
});

// A strategy's whole live ledger, for its CSV export: the system account's current epoch, oldest
// first, uncapped (getTradeLedger — an export is complete by definition, unlike the page's
// DETAIL_TRADE_LIMIT tail). Null for a slug the catalog does not know; no trades before the
// first run opens the account. A failed read throws, so the route answers 500, never an empty file.
export const getStrategyLedger = async (slug: string): Promise<{def: StrategyDefinition; trades: PaperTradeRecord[]} | null> => {
    const def = strategyBySlug(slug);
    if (!def) return null;
    const state = (await getStrategyStates()).find((s) => s.strategyId === def.id);
    return {def, trades: state ? await getTradeLedger(STRATEGY_OWNER_ID, state.accountId) : []};
};

export type StrategiesSystemStatus = {
    job: JobHealth | null;
    latestBarDate: string | null;
    started: boolean;
    launchDate: string | null;
    lastRunDate: string | null;
    errors: {strategyId: string; message: string}[];
};

export const getStrategiesSystemStatus = cache(async (): Promise<StrategiesSystemStatus> => {
    {
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
    }
});
