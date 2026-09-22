// The daily job's persistence: system-owned accounts, run claims, decision inputs and
// the run/backtest records. Plain server module (never 'use server') — the Inngest job
// is the only writer, and every account it touches is owned by STRATEGY_OWNER_ID.

import {connectToDatabase} from "@/database/mongoose";
import PaperAccount from "@/database/models/paper-account.model";
import PaperTrade from "@/database/models/paper-trade.model";
import PriceBar from "@/database/models/price-bar.model";
import StrategyBacktest from "@/database/models/strategy-backtest.model";
import StrategyRun, {type StrategyRunOrderDoc} from "@/database/models/strategy-run.model";
import StrategyState from "@/database/models/strategy-state.model";
import {type Bar} from "@/lib/prices/signals";
import {getBarsForSymbols} from "@/lib/prices/store";
import {getOwnedAccount, seedDayZeroSnapshot} from "@/lib/trading/account";
import {STRATEGIES, effectiveVersion} from "@/lib/strategies/catalog";
import {STRATEGY_OWNER_ID, STRATEGY_STARTING_BALANCE} from "@/lib/strategies/config";
import type {DayResult, SimulationResult, StrategyDefinition} from "@/lib/strategies/types";
import {UNIVERSES} from "@/lib/strategies/universe";

export type StrategyStateView = {
    strategyId: string;
    accountId: string;
    status: 'active' | 'paused';
    version: string;
    launchDate: string;
    lastRunDate: string | null;
    lastTradeDate: string | null;
    lastRebalanceDate: string | null;
    lastError: string | null;
};

// Bars older than this never reach a decision (LOOKBACK_BARS trading days ≈ 370
// calendar days; the margin covers long holiday stretches).
const LIVE_LOOKBACK_CALENDAR_DAYS = 420;
const MS_PER_DAY = 24 * 60 * 60 * 1000;

const minusDays = (date: string, days: number): string =>
    new Date(new Date(`${date}T00:00:00Z`).getTime() - days * MS_PER_DAY).toISOString().slice(0, 10);

const toView = (doc: {
    strategyId: string; accountId: string; status: 'active' | 'paused'; version: string; launchDate: string;
    lastRunDate?: string; lastTradeDate?: string; lastRebalanceDate?: string; lastError?: string;
}): StrategyStateView => ({
    strategyId: doc.strategyId,
    accountId: doc.accountId,
    status: doc.status,
    version: doc.version,
    launchDate: doc.launchDate,
    lastRunDate: doc.lastRunDate ?? null,
    lastTradeDate: doc.lastTradeDate ?? null,
    lastRebalanceDate: doc.lastRebalanceDate ?? null,
    lastError: doc.lastError ?? null,
});

export const getStrategyStates = async (): Promise<StrategyStateView[]> => {
    await connectToDatabase();
    const docs = await StrategyState.find({}).lean();
    return docs.map(toView);
};

// One system-owned PaperAccount per catalog entry, created directly (the createPaperAccount
// action is session-bound). Idempotent: the {userId, name} unique index makes a racing
// second create fail and the find below picks up the winner's account.
export const ensureStrategyAccounts = async (today: string): Promise<StrategyStateView[]> => {
    await connectToDatabase();
    const views: StrategyStateView[] = [];
    for (const def of STRATEGIES) {
        const state = await StrategyState.findOne({strategyId: def.id}).lean();
        const accountAlive = state ? await PaperAccount.exists({_id: state.accountId, userId: STRATEGY_OWNER_ID}) : null;
        let accountId = state && accountAlive ? state.accountId : null;
        if (!accountId) {
            const existing = await PaperAccount.findOne({userId: STRATEGY_OWNER_ID, name: def.name});
            if (existing) {
                accountId = String(existing._id);
            } else {
                const created = await PaperAccount.create({
                    userId: STRATEGY_OWNER_ID,
                    name: def.name,
                    cash: STRATEGY_STARTING_BALANCE,
                    startingBalance: STRATEGY_STARTING_BALANCE,
                    inceptionAt: new Date(),
                    positions: [],
                });
                await seedDayZeroSnapshot(created);
                accountId = String(created._id);
            }
        }
        const doc = await StrategyState.findOneAndUpdate(
            {strategyId: def.id},
            {
                $set: {accountId, version: effectiveVersion(def)},
                $setOnInsert: {strategyId: def.id, status: 'active', launchDate: today},
            },
            {upsert: true, new: true},
        ).lean();
        if (doc) views.push(toView(doc));
    }
    return views;
};

// Atomic per-day claim: replays and the 10:30 retry skip a strategy that already ran.
export const claimRun = async (strategyId: string, today: string): Promise<boolean> => {
    await connectToDatabase();
    const doc = await StrategyState.findOneAndUpdate(
        {strategyId, status: 'active', lastRunDate: {$ne: today}},
        {$set: {lastRunDate: today}},
    );
    return doc !== null;
};

// Undo a day's claim when the strategy could not decide (its universe was too stale), so
// the late-morning rerun is allowed to try again with fresher bars.
export const releaseRun = async (strategyId: string, today: string): Promise<void> => {
    await connectToDatabase();
    await StrategyState.updateOne({strategyId, lastRunDate: today}, {$unset: {lastRunDate: ''}});
};

export const getLatestBarDates = async (symbols: readonly string[]): Promise<Map<string, string>> => {
    await connectToDatabase();
    const rows = await PriceBar.aggregate<{_id: string; latest: string}>([
        {$match: {symbol: {$in: [...symbols]}}},
        {$group: {_id: '$symbol', latest: {$max: '$date'}}},
    ]);
    return new Map(rows.map((r) => [r._id, r.latest]));
};

export type DecisionInput = {
    barsBySymbol: Map<string, Bar[]>;
    positions: {symbol: string; quantity: number; avgCost: number}[];
    cash: number;
    isFirstRun: boolean;
};

// Everything buildContext needs for one strategy: a bounded bar window for its universe
// plus whatever it holds, and the account as it stands. Null when the account is gone.
export const loadDecisionInput = async (def: StrategyDefinition, state: StrategyStateView, asOf: string, today: string): Promise<DecisionInput | null> => {
    const account = await getOwnedAccount(STRATEGY_OWNER_ID, state.accountId);
    if (!account) return null;
    const positions = account.positions.map((p) => ({symbol: p.symbol.toUpperCase(), quantity: p.quantity, avgCost: p.avgCost}));
    const symbols = Array.from(new Set([...UNIVERSES[def.universe], ...positions.map((p) => p.symbol)]));
    const [barsBySymbol, tradeCount] = await Promise.all([
        getBarsForSymbols(symbols, {from: minusDays(today, LIVE_LOOKBACK_CALENDAR_DAYS), to: asOf}),
        PaperTrade.countDocuments({accountId: state.accountId}),
    ]);
    return {barsBySymbol, positions, cash: account.cash, isFirstRun: tradeCount === 0};
};

export type PlannedRunRecord = {
    strategyId: string;
    date: string;
    asOf: string;
    mode: 'live' | 'preview';
    universeSize: number;
    staleCount: number;
    equity: number;
    day: DayResult;
};

// A preview never overwrites a live row for the same date (the navigator's rule).
export const savePlannedRun = async (record: PlannedRunRecord): Promise<void> => {
    await connectToDatabase();
    const orders: StrategyRunOrderDoc[] = record.day.orders.map((o) => ({
        symbol: o.symbol, side: o.side, quantity: o.quantity, kind: o.kind, reason: o.reason, executed: false,
    }));
    const doc = {
        asOf: record.asOf,
        mode: record.day.skipped ? 'skipped' : record.mode,
        status: record.day.skipped ? 'skipped' : 'planned',
        staleCount: record.staleCount,
        universeSize: record.universeSize,
        rebalanceTriggered: record.day.decision.rebalanceTriggered,
        board: record.day.decision.board.map((row) => ({symbol: row.symbol, state: row.state, values: row.values, ...(row.note ? {note: row.note} : {})})),
        orders,
        skippedOrders: record.day.skippedOrders.map((s) => ({symbol: s.symbol, reason: s.reason})),
        dataIssues: [...record.day.decision.dataIssues, ...(record.day.skipped ? [record.day.skipped.detail] : [])],
        equity: record.equity,
        summary: record.day.skipped
            ? `Skipped — ${record.day.skipped.detail}`
            : `${orders.length} order(s) planned${record.mode === 'preview' ? ' (preview)' : ''}`,
    };
    const filter = record.mode === 'preview'
        ? {strategyId: record.strategyId, date: record.date, mode: {$ne: 'live'}}
        : {strategyId: record.strategyId, date: record.date};
    try {
        await StrategyRun.updateOne(filter, {$set: doc, $setOnInsert: {strategyId: record.strategyId, date: record.date}}, {upsert: true});
    } catch (error) {
        // A preview colliding with an existing live row trips the unique index — keep the live row.
        if ((error as {code?: number}).code !== 11000) throw error;
    }
};

export type OrderOutcome = {symbol: string; side: 'buy' | 'sell'; executed: boolean; price?: number; message?: string};

export const completeRun = async (input: {
    strategyId: string;
    date: string;
    outcomes: readonly OrderOutcome[];
    rebalanceTriggered: boolean;
}): Promise<void> => {
    await connectToDatabase();
    const run = await StrategyRun.findOne({strategyId: input.strategyId, date: input.date});
    if (run) {
        const byKey = new Map(input.outcomes.map((o) => [`${o.side}:${o.symbol}`, o]));
        for (const order of run.orders) {
            const outcome = byKey.get(`${order.side}:${order.symbol}`);
            if (!outcome) continue;
            order.executed = outcome.executed;
            if (outcome.price !== undefined) order.price = outcome.price;
            if (outcome.message) order.message = outcome.message;
        }
        const filled = input.outcomes.filter((o) => o.executed).length;
        run.status = 'done';
        run.summary = `${filled}/${input.outcomes.length} order(s) filled`;
        await run.save();
    }
    const failed = input.outcomes.filter((o) => !o.executed);
    const update: Record<string, unknown> = {};
    if (input.outcomes.some((o) => o.executed)) update.lastTradeDate = input.date;
    // A rebalance counts as done only when everything it planned filled (vacuously when it
    // planned nothing). A bounced entry is re-planned on the next fresh day; legs already at
    // target sit inside the drift band, so the re-plan does not churn.
    if (input.rebalanceTriggered && failed.length === 0) update.lastRebalanceDate = input.date;
    await StrategyState.updateOne(
        {strategyId: input.strategyId},
        failed.length > 0
            ? {$set: {...update, lastError: `${failed.length} of ${input.outcomes.length} order(s) failed: ${failed.map((o) => `${o.side} ${o.symbol} — ${o.message ?? 'unknown'}`).join('; ')}`.slice(0, 500)}}
            : {$set: update, $unset: {lastError: ''}},
    );
};

export const markStrategyError = async (strategyId: string, message: string): Promise<void> => {
    await connectToDatabase();
    await StrategyState.updateOne({strategyId}, {$set: {lastError: message.slice(0, 500)}});
};

// The whole run refused to trade (the benchmark itself had no fresh bar): one skipped
// row per strategy so the page can say why, and no claim so the retry can still run.
export const recordSkippedRuns = async (states: readonly StrategyStateView[], date: string, asOf: string, detail: string): Promise<void> => {
    await connectToDatabase();
    for (const state of states) {
        const def = STRATEGIES.find((d) => d.id === state.strategyId);
        await StrategyRun.updateOne(
            {strategyId: state.strategyId, date},
            {
                $set: {
                    asOf, mode: 'skipped', status: 'skipped', staleCount: 0,
                    universeSize: def ? UNIVERSES[def.universe].length : 0,
                    rebalanceTriggered: false, board: [], orders: [], skippedOrders: [],
                    dataIssues: [detail], equity: 0, summary: `Skipped — ${detail}`,
                },
                $setOnInsert: {strategyId: state.strategyId, date},
            },
            {upsert: true},
        );
        await StrategyState.updateOne({strategyId: state.strategyId}, {$set: {lastError: detail.slice(0, 500)}});
    }
};

export const backtestVersions = async (): Promise<Record<string, string>> => {
    await connectToDatabase();
    const docs = await StrategyBacktest.find({}, {strategyId: 1, version: 1}).lean();
    return Object.fromEntries(docs.map((d) => [d.strategyId, d.version]));
};

export const saveBacktest = async (strategyId: string, version: string, result: SimulationResult): Promise<void> => {
    await connectToDatabase();
    await StrategyBacktest.updateOne(
        {strategyId},
        {
            $set: {
                version,
                from: result.from,
                to: result.to,
                fillRule: result.fillRule,
                closeFills: result.closeFills,
                skippedDays: result.skippedDays,
                points: result.points,
                benchmark: result.benchmark,
                trades: result.trades,
                stats: result.stats,
                computedAt: new Date(),
            },
            $setOnInsert: {strategyId},
        },
        {upsert: true},
    );
};

// Full stored history for a simulation (bounded by what the backfill stored).
export const loadSimulationBars = async (def: StrategyDefinition, benchmark: string): Promise<Map<string, Bar[]>> =>
    getBarsForSymbols(Array.from(new Set([...UNIVERSES[def.universe], benchmark])));
