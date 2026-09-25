// Page-facing shapes and the pure presenters that rank, label and format them.
// Client-safe: types plus arithmetic on plain data, nothing from the DB or the engine.

import {formatPrice} from "@/lib/utils";
import type {Cadence, SeriesPoint, SeriesStats, SignalColumn, SignalFormat, SignalRow, StrategyFamily, StrategyId} from "@/lib/strategies/types";

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
    // Downsampled % return since inception, for the leaderboard sparkline. Its last
    // point equals totalReturnPct by construction (see downsample/toSparkPct below).
    spark: number[];
};

export type SimulatedRecord = {
    from: string;
    to: string;
    stats: SeriesStats;
    closeFills: number;
    // As LiveRecord.spark, over the backtest window; ends at stats.totalReturnPct.
    spark: number[];
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

// ── Sparklines ──────────────────────────────────────────────────────────────────
// A leaderboard is a comparison device, so every curve in a column shares ONE y-domain.
// Eight independently auto-scaled sparks would give a +2% strategy the same triumphant
// climb as a +137% one — the same disease as a column of em-dashes, drawn prettier.

export const SPARK_POINTS = 40;
// Below this many points a column draws nothing at all. Four segments is an EKG
// artifact, not a curve, and a half-drawn column is exactly what we are deleting.
export const MIN_SPARK_POINTS = 10;

// Index decimation to at most n points. The endpoints are ALWAYS preserved, which is
// what lets the last spark point equal the printed total return exactly.
export const downsample = <T>(points: readonly T[], n: number): T[] => {
    if (n <= 0 || points.length === 0) return [];
    if (points.length <= n) return [...points];
    if (n === 1) return [points[points.length - 1]];
    const step = (points.length - 1) / (n - 1);
    return Array.from({length: n}, (_, i) => points[Math.round(i * step)]);
};

// Values → % return from the first value, so curves on different capital bases compare.
export const toSparkPct = (values: readonly number[]): number[] => {
    if (values.length === 0) return [];
    const base = values[0];
    if (!(base > 0)) return values.map(() => 0);
    return values.map((v) => (v / base - 1) * 100);
};

// Zero is always in frame, matching computeMaxDrawdown's and PerformanceChart's basis.
export const sparkDomain = (series: readonly (readonly number[])[]): {min: number; max: number} | null => {
    const values = series.flat();
    if (values.length === 0) return null;
    return {min: Math.min(...values, 0), max: Math.max(...values, 0)};
};

// All-or-nothing per column: true only when every *started* row can draw a curve.
export const columnHasSpark = <T>(rows: readonly T[], pick: (row: T) => readonly number[] | null): boolean => {
    const drawable = rows.map(pick).filter((s): s is readonly number[] => s !== null);
    return drawable.length > 0 && drawable.every((s) => s.length >= MIN_SPARK_POINTS);
};

// How the ranking says "this number is partly at cost". One note per panel when it holds
// for everything (the QA harness has no quote key, so that is the usual case), a marker
// plus one legend when it holds for some. Never one warning per row: amber on all eight
// rows stops reading as a warning and starts reading as wallpaper.
export type UnpricedNote = {mode: 'panel'; text: string} | {mode: 'marker'; legend: string};

export const unpricedNote = (rows: readonly {live: LiveRecord | null}[]): UnpricedNote | null => {
    const started = rows.map((r) => r.live).filter((l): l is LiveRecord => l !== null);
    const affected = started.filter((l) => l.unpriced > 0);
    if (affected.length === 0) return null;
    const everythingIsStale = affected.length === started.length && affected.every((l) => l.unpriced >= l.holdings);
    return everythingIsStale
        ? {mode: 'panel', text: 'Returns are unpriced — no live quotes, so every holding is valued at cost.'}
        : {mode: 'marker', legend: '* partly unpriced — valued at cost until the next quote'};
};

// A column whose every value is absent is not information. `false` and `0` are values.
export const visibleSignalColumns = (columns: readonly SignalColumn[], board: readonly SignalRow[]): SignalColumn[] => {
    if (board.length === 0) return [...columns];
    return columns.filter((c) => board.some((row) => row.values[c.key] !== null && row.values[c.key] !== undefined));
};

// One line for the detail page's "latest decision" summary.
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

// Round first, then decide the sign and the colour, so a $3 loss on $100,000 reads "0.00%"
// in neutral rather than "-0.00%" in red. (-0).toFixed(2) is already "0.00".
export const roundPct = (value: number, digits = 2): number => Math.round(value * 10 ** digits) / 10 ** digits;

export const formatPct = (value: number | null, digits = 2): string => {
    if (value === null) return '—';
    const rounded = roundPct(value, digits);
    return `${rounded > 0 ? '+' : ''}${rounded.toFixed(digits)}%`;
};

export const formatDrawdown = (value: number | null): string => {
    if (value === null) return '—';
    const rounded = roundPct(value);
    return rounded > 0 ? `−${rounded.toFixed(2)}%` : '0.00%';
};

// The colour input for getChangeColorClass: zero after rounding reads neutral.
export const signedForColor = (value: number | null): number | undefined =>
    value === null ? undefined : roundPct(value) || undefined;

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
