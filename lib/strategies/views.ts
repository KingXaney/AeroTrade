// Page-facing shapes and the pure presenters that rank, label and format them.
// Client-safe: types plus arithmetic on plain data, nothing from the DB or the engine.

import {formatPrice} from "@/lib/utils";
import type {Cadence, SeriesPoint, SeriesStats, SignalFormat, SignalRow, StrategyFamily, StrategyId} from "@/lib/strategies/types";

export type LiveRecord = {
    totalValue: number;
    totalReturnPct: number;
    // Return of SPY since the account's inception, from the daily benchmark snapshots.
    benchmarkReturnPct: number | null;
    maxDrawdownPct: number | null;
    winRatePct: number | null;
    holdings: number;
    // Holdings with no live quote — the return is partly at cost.
    unpriced: number;
    snapshotDays: number;
    inceptionAt: number;
};

export type SimulatedRecord = {
    from: string;
    to: string;
    stats: SeriesStats;
    closeFills: number;
};

export type RunOrderView = {
    symbol: string;
    side: 'buy' | 'sell';
    quantity: number;
    kind: 'enter' | 'add' | 'trim' | 'exit';
    reason: string;
    executed: boolean;
    price: number | null;
    message: string | null;
};

export type StrategyRunView = {
    date: string;
    asOf: string;
    mode: 'live' | 'preview' | 'skipped';
    status: 'planned' | 'done' | 'skipped';
    staleCount: number;
    universeSize: number;
    rebalanceTriggered: boolean;
    board: SignalRow[];
    orders: RunOrderView[];
    skippedOrders: {symbol: string; reason: string}[];
    dataIssues: string[];
    equity: number;
    summary: string;
};

export type StrategyLeaderboardRow = {
    id: StrategyId;
    name: string;
    family: StrategyFamily;
    cadence: Cadence;
    launchDate: string | null;
    lastError: string | null;
    live: LiveRecord | null;
    simulated: SimulatedRecord | null;
    // One line from describeLastRun over the latest run.
    lastAction: string;
    followed: boolean;
};

export const excessReturnPct = (live: Pick<LiveRecord, 'totalReturnPct' | 'benchmarkReturnPct'>): number | null =>
    live.benchmarkReturnPct === null ? null : live.totalReturnPct - live.benchmarkReturnPct;

// Live return decides the ranking; strategies that have not started sit at the bottom
// in catalog order. Ties keep catalog order (the input order).
export const rankLeaderboard = <T extends {live: {totalReturnPct: number} | null}>(rows: readonly T[]): T[] => {
    const started = rows.filter((r) => r.live !== null);
    const pending = rows.filter((r) => r.live === null);
    const ranked = [...started].sort((a, b) => (b.live as {totalReturnPct: number}).totalReturnPct - (a.live as {totalReturnPct: number}).totalReturnPct);
    return [...ranked, ...pending];
};

// Followed strategies first (in leaderboard order), then the rest, capped.
export const selectWidgetRows = <T extends {followed: boolean}>(ranked: readonly T[], limit: number): T[] => {
    const followed = ranked.filter((r) => r.followed);
    const rest = ranked.filter((r) => !r.followed);
    return [...followed, ...rest].slice(0, Math.max(0, limit));
};

// How long the live record is; the leaderboard adds a note while every row is young.
export const LIVE_YOUNG_DAYS = 30;
export const liveAgeDays = (inceptionAt: number, now: number): number =>
    Math.max(0, Math.floor((now - inceptionAt) / (24 * 60 * 60 * 1000)));

export const everyLiveRecordYoung = (rows: readonly {live: LiveRecord | null}[], now: number): boolean => {
    const started = rows.filter((r) => r.live !== null);
    return started.length > 0 && started.every((r) => liveAgeDays((r.live as LiveRecord).inceptionAt, now) < LIVE_YOUNG_DAYS);
};

// One line for the leaderboard's "last action" cell.
export const describeLastRun = (run: StrategyRunView | null): string => {
    if (!run) return 'No run yet';
    if (run.status === 'skipped') return `Skipped ${run.date}`;
    const filled = run.orders.filter((o) => o.executed);
    if (run.mode === 'preview') return `Preview ${run.date}: ${run.orders.length} order(s) planned`;
    if (run.status === 'planned') return `${run.date}: ${run.orders.length} order(s) planned`;
    if (filled.length === 0) return run.rebalanceTriggered ? `Held on ${run.date}` : `Watched on ${run.date}`;
    const symbols = filled.slice(0, 3).map((o) => `${o.side === 'buy' ? '+' : '−'}${o.symbol}`).join(' ');
    return `${run.date}: ${symbols}${filled.length > 3 ? ` +${filled.length - 3} more` : ''}`;
};

const withSign = (value: number, digits: number): string => `${value >= 0 ? '+' : ''}${value.toFixed(digits)}`;

export const formatSignalValue = (value: number | string | boolean | null | undefined, format: SignalFormat): string => {
    if (value === null || value === undefined) return '—';
    switch (format) {
        case 'price':
            return typeof value === 'number' ? formatPrice(value) : String(value);
        case 'pct':
            return typeof value === 'number' ? `${withSign(value * 100, 1)}%` : String(value);
        case 'number':
            return typeof value === 'number' ? value.toFixed(Math.abs(value) >= 100 ? 0 : 1) : String(value);
        case 'rank':
            return typeof value === 'number' ? `#${value}` : String(value);
        case 'bool':
            return value === true ? 'yes' : value === false ? 'no' : String(value);
        case 'text':
            return String(value);
    }
};

// Which curve the detail page opens on: live once it can draw a line, else simulated.
export const pickPerfMode = (livePoints: number, simulatedPoints: number): 'live' | 'simulated' =>
    livePoints >= 2 || simulatedPoints < 2 ? 'live' : 'simulated';

export const toPerfSeries = (points: readonly SeriesPoint[], benchmark: readonly SeriesPoint[]): PerfPoint[] => {
    if (points.length === 0) return [];
    const base = points[0].value;
    const benchByDate = new Map(benchmark.map((b) => [b.date, b.value]));
    const benchBase = benchmark.length > 0 ? benchmark[0].value : null;
    return points.map((p) => {
        const bench = benchByDate.get(p.date);
        return {
            date: p.date,
            accountPct: base > 0 ? (p.value / base - 1) * 100 : 0,
            benchmarkPct: bench !== undefined && benchBase !== null && benchBase > 0 ? (bench / benchBase - 1) * 100 : null,
        };
    });
};
