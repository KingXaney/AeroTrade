// What the chat's getQuantStrategies tool hands the model. The tool reads the /strategies
// leaderboard through its cached reader (getStrategyLeaderboard) and, for one strategy, that
// strategy's newest run (getLatestRun: one document); this module only shapes those results.
// Pure and import-light so the shape is unit-tested.
//
// The output is data for the model, never text for the page: numbers are rounded, each reason
// is decoded clause by clause through lib/learn/reasons.ts with the strategy's own definition
// (its clauses carry the glossary's definitions, via explain.ts's shapeReason), the board is
// cut to its top rows in the board's own order (sortBoard) with the top row read by the app's
// own narrator, and every call carries the same stance line. Neither the beginner line
// (invariant 12 fixes where it renders) nor the catalog's summaries travel.

import {echoText, MAX_ECHO_CHARS, shapeReason, type ExplainReason} from '@/lib/chat/explain';
import {narrateBoard} from '@/lib/strategies/learn/board-narration';
import {decodeReason} from '@/lib/learn/reasons';
import {STRATEGIES, strategyBySlug} from '@/lib/strategies/catalog';
import type {Cadence, RowState, SignalColumn, SignalRow, StrategyDefinition, StrategyFamily, StrategyId} from '@/lib/strategies/types';
import {
    excessReturnPct,
    sortBoard,
    visibleSignalColumns,
    type LiveRecord,
    type StrategyLeaderboardRow,
    type StrategyRunView,
} from '@/lib/strategies/views';
import {getEasternDateString} from '@/lib/dates';

export const QUANT_STANCE =
    "These are the app's eight rule-based paper strategies, read from its own records: each live record since its account started, SPY's total return over the same days, a simulated backtest kept apart from the live one, and a rule's latest decision with its own reasons decoded. Describe what each rule did and what its numbers measure. The list comes in the /strategies page's order, by live return; that order describes the past and names no winner.";

export const QUANT_NOTES = {
    unknown: 'No single strategy matches that name. These are the eight, by slug and name.',
    noneStarted: 'No strategy has a live record yet; the first run happens on the next trading morning.',
    notStarted: 'This strategy has no live record yet; its first run happens on the next trading morning.',
    unpriced: 'Some holdings had no live quote, so those returns count them at what they cost.',
    noRun: 'The app has no stored run for this strategy yet.',
    noOrders: 'The latest run placed no orders.',
    skipped: 'The latest run was skipped and decided nothing; its data issues say why.',
    preview: 'The latest run was a preview: its orders were planned, and none were placed.',
} as const;

// How much of one run travels: the board's top rows, and the first orders and issues.
export const QUANT_LIMITS = {orders: 10, skipped: 5, issues: 5, boardRows: 5} as const;

const MAX_NAME_ECHO = 60;
const MAX_TEXT_VALUE = 60;
const MIN_PARTIAL_MATCH = 3;

type QuantLive = {
    returnPct: number;
    spyReturnPct: number | null;
    vsSpyPct: number | null;
    maxDrawdownPct: number | null;
    fills: number;
    holdings: number;
    unpricedHoldings: number;
    // New York date the live record starts on.
    since: string;
};

type QuantSimulated = {returnPct: number | null; from: string; to: string; fills: number};

type QuantRow = {
    slug: StrategyId;
    name: string;
    family: StrategyFamily;
    cadence: Cadence;
    followed: boolean;
    live: QuantLive | null;
    simulated: QuantSimulated | null;
};

type QuantDecoded = {text: string; decoded: ExplainReason};

type QuantOrder = {
    side: 'buy' | 'sell';
    symbol: string;
    quantity: number;
    kind: 'enter' | 'add' | 'trim' | 'exit';
    filled: boolean;
    price: number | null;
    unfilledBecause?: string;
    reason: string;
    decoded: ExplainReason;
};

type QuantBoardValue = number | boolean | string | null;

type QuantBoardRow = {
    symbol: string;
    state: RowState;
    // Keyed by the board's column labels; a percentage column's label ends "(%)".
    values: Record<string, QuantBoardValue>;
    note?: QuantDecoded;
};

type QuantRun = {
    date: string;
    asOf: string;
    mode: StrategyRunView['mode'];
    status: StrategyRunView['status'];
    orders: QuantOrder[];
    ordersTotal: number;
    skipped: {symbol: string; reason: string; decoded: ExplainReason}[];
    dataIssues: QuantDecoded[];
    watching: {
        rows: QuantBoardRow[];
        totalRows: number;
        columns: {label: string; definition?: string}[];
        // The board's top row read in plain words, and how every other row reads.
        reading: {symbol: string; state: RowState; lines: string[]; otherRows: string} | null;
    };
};

type QuantListResult = {stance: string; strategies: QuantRow[]; notes: string[]};
type QuantStrategyResult = {stance: string; strategy: QuantRow & {slots: number}; latestRun: QuantRun | null; notes: string[]};
type QuantUnknownResult = {stance: string; strategy: null; asked: string; known: {slug: StrategyId; name: string}[]; notes: string[]};

// Rounded to cents of a percent; -0 folds to 0.
const round2 = (n: number): number => Math.round(n * 100) / 100 || 0;
const round2OrNull = (n: number | null): number | null => (n === null || !Number.isFinite(n) ? null : round2(n));

// "RSI-2", "rsi 2", "RSI(2)" → "rsi2". A fixed pattern applied to the text, never a pattern
// built from it (invariant 2).
const squash = (text: string): string => text.toLowerCase().replace(/[^a-z0-9]+/g, '');

// A slug, a name, or a spelling that squashes to one strategy's slug or name — or contains
// only one's; two candidates is no match, so the model is told the eight rather than a guess.
export const resolveStrategy = (query: string): StrategyDefinition | null => {
    const wanted = query.trim().toLowerCase();
    if (!wanted) return null;
    const exact = strategyBySlug(wanted) ?? STRATEGIES.find((def) => def.name.toLowerCase() === wanted);
    if (exact) return exact;
    const key = squash(wanted);
    if (key.length < MIN_PARTIAL_MATCH) return null;
    const whole = STRATEGIES.find((def) => squash(def.id) === key || squash(def.name) === key);
    if (whole) return whole;
    const partial = STRATEGIES.filter((def) => squash(def.id).includes(key) || squash(def.name).includes(key));
    return partial.length === 1 ? partial[0] : null;
};

const shapeLive = (live: LiveRecord): QuantLive => ({
    returnPct: round2(live.totalReturnPct),
    spyReturnPct: round2OrNull(live.benchmarkReturnPct),
    vsSpyPct: round2OrNull(excessReturnPct(live)),
    maxDrawdownPct: round2OrNull(live.maxDrawdownPct),
    fills: live.fills,
    holdings: live.holdings,
    unpricedHoldings: live.unpriced,
    since: getEasternDateString(new Date(live.inceptionAt)),
});

const shapeRow = (row: StrategyLeaderboardRow): QuantRow => ({
    slug: row.id,
    name: row.name,
    family: row.family,
    cadence: row.cadence,
    followed: row.followed,
    live: row.live ? shapeLive(row.live) : null,
    simulated: row.simulated
        ? {
            returnPct: round2OrNull(row.simulated.stats.totalReturnPct),
            from: row.simulated.from,
            to: row.simulated.to,
            fills: row.simulated.stats.tradeCount,
        }
        : null,
});

const catalogRow = (def: StrategyDefinition): QuantRow => ({
    slug: def.id, name: def.name, family: def.family, cadence: def.cadence, followed: false, live: null, simulated: null,
});

const decoded = (text: string, def: StrategyDefinition): QuantDecoded =>
    ({text: echoText(text, MAX_ECHO_CHARS), decoded: shapeReason(decodeReason(text, {def}))});

const columnLabel = (column: SignalColumn): string => (column.format === 'pct' ? `${column.label} (%)` : column.label);

// Stored as the board stores it (a percentage as a fraction); handed over as the board prints
// it, rounded: a fraction becomes a percentage, prices and readings keep two decimals.
const boardValue = (value: SignalRow['values'][string] | undefined, column: SignalColumn): QuantBoardValue => {
    if (value === null || value === undefined) return null;
    if (typeof value === 'number') {
        if (!Number.isFinite(value)) return null;
        return column.format === 'pct' ? round2(value * 100) : round2(value);
    }
    if (typeof value === 'boolean') return value;
    return echoText(String(value), MAX_TEXT_VALUE);
};

const shapeWatching = (def: StrategyDefinition, board: readonly SignalRow[]): QuantRun['watching'] => {
    const shown = sortBoard(board).slice(0, QUANT_LIMITS.boardRows);
    // visibleSignalColumns keeps every column for an empty board; nothing shown lists nothing.
    const columns = shown.length === 0 ? [] : visibleSignalColumns(def.signalColumns, shown);
    const reading = narrateBoard(def, {board});
    return {
        rows: shown.map((row) => ({
            symbol: row.symbol,
            state: row.state,
            values: Object.fromEntries(columns.map((column) => [columnLabel(column), boardValue(row.values[column.key], column)])),
            ...(row.note ? {note: decoded(row.note, def)} : {}),
        })),
        totalRows: board.length,
        columns: columns.map((column) => ({label: columnLabel(column), ...(column.help ? {definition: column.help} : {})})),
        reading: reading ? {symbol: reading.symbol, state: reading.state, lines: reading.lines, otherRows: reading.key} : null,
    };
};

const shapeRun = (def: StrategyDefinition, run: StrategyRunView): QuantRun => ({
    date: run.date,
    asOf: run.asOf,
    mode: run.mode,
    status: run.status,
    orders: run.orders.slice(0, QUANT_LIMITS.orders).map((order) => {
        const {text, decoded: reason} = decoded(order.reason, def);
        return {
            side: order.side,
            symbol: order.symbol,
            quantity: order.quantity,
            kind: order.kind,
            filled: order.executed,
            price: round2OrNull(order.price),
            ...(!order.executed && order.message ? {unfilledBecause: echoText(order.message, MAX_ECHO_CHARS)} : {}),
            reason: text,
            decoded: reason,
        };
    }),
    ordersTotal: run.orders.length,
    skipped: run.skippedOrders.slice(0, QUANT_LIMITS.skipped).map((skip) => {
        const {text, decoded: reason} = decoded(skip.reason, def);
        return {symbol: skip.symbol, reason: text, decoded: reason};
    }),
    dataIssues: run.dataIssues.slice(0, QUANT_LIMITS.issues).map((issue) => decoded(issue, def)),
    watching: shapeWatching(def, run.board),
});

const unpricedAnywhere = (rows: readonly QuantRow[]): boolean => rows.some((row) => (row.live?.unpricedHoldings ?? 0) > 0);

export const shapeQuantLeaderboard = (rows: readonly StrategyLeaderboardRow[]): QuantListResult => {
    const strategies = rows.map(shapeRow);
    const notes: string[] = [];
    if (!strategies.some((row) => row.live !== null)) notes.push(QUANT_NOTES.noneStarted);
    if (unpricedAnywhere(strategies)) notes.push(QUANT_NOTES.unpriced);
    return {stance: QUANT_STANCE, strategies, notes};
};

export const shapeQuantStrategy = ({def, row, run}: {
    def: StrategyDefinition;
    row: StrategyLeaderboardRow | null;
    run: StrategyRunView | null;
}): QuantStrategyResult => {
    const strategy = {...(row ? shapeRow(row) : catalogRow(def)), slots: def.slots};
    const notes: string[] = [];
    if (!strategy.live) notes.push(QUANT_NOTES.notStarted);
    if (unpricedAnywhere([strategy])) notes.push(QUANT_NOTES.unpriced);
    if (!run) notes.push(QUANT_NOTES.noRun);
    else if (run.mode === 'skipped') notes.push(QUANT_NOTES.skipped);
    else if (run.mode === 'preview') notes.push(QUANT_NOTES.preview);
    else if (run.orders.length === 0) notes.push(QUANT_NOTES.noOrders);
    return {stance: QUANT_STANCE, strategy, latestRun: run ? shapeRun(def, run) : null, notes};
};

export const shapeUnknownStrategy = (asked: string): QuantUnknownResult => ({
    stance: QUANT_STANCE,
    strategy: null,
    asked: echoText(asked, MAX_NAME_ECHO),
    known: STRATEGIES.map((def) => ({slug: def.id, name: def.name})),
    notes: [QUANT_NOTES.unknown],
});
