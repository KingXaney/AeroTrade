// Every shape the strategy engine, the rules, the simulator and the pages share.
// Dependency-free on purpose: nothing here imports a rule, the engine or the DB.

import type {Bar} from "@/lib/prices/signals";
import type {UniverseKey} from "@/lib/strategies/universe";

export type StrategyId =
    | 'buy-and-hold-spy'
    | 'sixty-forty'
    | 'golden-cross'
    | 'dual-momentum'
    | 'momentum-12-1'
    | 'rsi2-mean-reversion'
    | 'donchian-breakout'
    | 'low-volatility';

export type Cadence = 'once' | 'daily' | 'monthly' | 'quarterly';

export type StrategyFamily =
    | 'Baseline'
    | 'Allocation'
    | 'Trend following'
    | 'Momentum'
    | 'Mean reversion'
    | 'Breakout'
    | 'Defensive factor';

export type SignalFormat = 'price' | 'pct' | 'number' | 'bool' | 'rank' | 'text';

export type SignalColumn = {key: string; label: string; format: SignalFormat; help?: string};

export type RowState = 'held' | 'enter' | 'exit' | 'watch' | 'excluded';

// One row of the daily "what it is watching" board. Values are primitives only so
// they persist as-is and render straight from the catalog's columns.
export type SignalRow = {
    symbol: string;
    state: RowState;
    values: Record<string, number | string | boolean | null>;
    note?: string;
};

export type StrategyExplainer = {
    summary: string;
    how: readonly string[];
    why: readonly string[];
    fails: readonly string[];
    watching: string;
    beginnerLine: string;
    // Shown as the holdings empty state when the strategy is (partly) in cash.
    cashReason: string;
    caveats: readonly string[];
};

// Data only — the rule itself lives in lib/strategies/rules/<id>.ts so client
// components can import the catalog without dragging the engine along.
export type StrategyDefinition = {
    id: StrategyId;
    // Doubles as the PaperAccount name (unique per owner, ≤ 40 chars).
    name: string;
    family: StrategyFamily;
    cadence: Cadence;
    universe: UniverseKey;
    slots: number;
    version: string;
    params: Readonly<Record<string, number | string>>;
    driftBand: number;
    explainer: StrategyExplainer;
    signalColumns: readonly SignalColumn[];
};

export type Holding = {
    symbol: string;
    quantity: number;
    avgCost: number;
    // Close on asOf, or null when the symbol has no fresh bar (never sold blind).
    lastClose: number | null;
};

export type StrategyContext = {
    // Last completed bar date the decision may see.
    asOf: string;
    // The session the orders will fill in (live: today; simulated: the next bar).
    tradeDate: string;
    // Ascending bars ending at asOf, at most LOOKBACK_BARS each; universe ∪ held.
    bars: ReadonlyMap<string, readonly Bar[]>;
    // Universe symbols with a bar dated asOf.
    eligible: ReadonlySet<string>;
    // Universe symbols whose latest bar is older than asOf (missing ones count too).
    stale: ReadonlySet<string>;
    holdings: readonly Holding[];
    cash: number;
    // cash + Σ quantity × lastClose (cost basis when unpriced).
    equity: number;
    lastRebalanceDate: string | null;
    isFirstRun: boolean;
};

export type Target = {symbol: string; weight: number; reason: string};

export type Decision = {
    // True when the rule actually evaluated its allocation today (even with no orders).
    rebalanceTriggered: boolean;
    targets: readonly Target[];
    board: readonly SignalRow[];
    dataIssues: readonly string[];
};

export type Decide = (def: StrategyDefinition, ctx: StrategyContext) => Decision;

export type OrderKind = 'enter' | 'add' | 'trim' | 'exit';

export type PlannedOrder = {
    symbol: string;
    side: 'buy' | 'sell';
    quantity: number;
    kind: OrderKind;
    reason: string;
};

export type SkippedOrder = {symbol: string; reason: string};

export type DayResult = {
    decision: Decision;
    orders: readonly PlannedOrder[];
    skippedOrders: readonly SkippedOrder[];
    // Set when the day was not decided at all (too many stale symbols).
    skipped?: {reason: 'stale-data'; detail: string};
};

// A point on an equity or benchmark curve.
export type SeriesPoint = {date: string; value: number};

export type SimTrade = {
    date: string;
    symbol: string;
    side: 'buy' | 'sell';
    quantity: number;
    price: number;
    total: number;
    realizedPnl?: number;
    reason: string;
    fill: 'open' | 'close';
};

export type SeriesStats = {
    totalReturnPct: number | null;
    cagrPct: number | null;
    annualizedVolPct: number | null;
    maxDrawdownPct: number | null;
    winRatePct: number | null;
    wins: number;
    losses: number;
    tradeCount: number;
    benchmarkReturnPct: number | null;
    excessReturnPct: number | null;
};

export type SimulationResult = {
    from: string;
    to: string;
    fillRule: 'next-open';
    closeFills: number;
    skippedDays: number;
    points: readonly SeriesPoint[];
    benchmark: readonly SeriesPoint[];
    trades: readonly SimTrade[];
    rejections: readonly {date: string; symbol: string; side: 'buy' | 'sell'; reason: string}[];
    stats: SeriesStats;
};
