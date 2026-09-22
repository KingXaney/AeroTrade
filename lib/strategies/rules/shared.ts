// What every rule module has in common: reason-string formatting, the board
// scaffolding (one row per universe symbol, stale ones excluded, held strays
// noted) and the two recurring shapes — a full monthly re-rank and a daily
// slot-filler with exits-before-entries. Pure; reads nothing outside ctx.

import type {Bar} from '@/lib/prices/signals';
import {CASH_FLOOR, slotWeight} from '@/lib/strategies/config';
import {isRebalanceDue} from '@/lib/strategies/calendar';
import {rank} from '@/lib/strategies/indicators';
import type {
    Decision,
    Holding,
    RowState,
    SignalRow,
    StrategyContext,
    StrategyDefinition,
    Target,
} from '@/lib/strategies/types';
import {UNIVERSES} from '@/lib/strategies/universe';

// A single-ETF rule puts everything but the cash floor into its pick.
export const FULL_WEIGHT = 1 - CASH_FLOOR;

const PRICE_DECIMALS = 2;
const PCT_DECIMALS = 1;

export const fmtPrice = (value: number): string => value.toFixed(PRICE_DECIMALS);

// Fractions in, signed percentages out; a value that rounds to zero is never "-0.0%".
export const fmtPct = (fraction: number): string => {
    const magnitude = Math.abs(fraction * 100).toFixed(PCT_DECIMALS);
    const negative = fraction < 0 && Number(magnitude) !== 0;
    return `${negative ? '-' : '+'}${magnitude}%`;
};

// Unsigned: a weight or a volatility is a magnitude, not a change.
export const fmtPctUnsigned = (fraction: number): string => `${(fraction * 100).toFixed(PCT_DECIMALS)}%`;

export const fmtRank = (position: number, total: number): string => `#${position}/${total}`;

export const staleNote = (asOf: string): string => `stale: no bar for ${asOf}`;

export const universeOf = (def: StrategyDefinition): readonly string[] => UNIVERSES[def.universe];

// Rule parameters live in the catalog so the explainer's table and the code cannot
// drift apart; a missing one is a catalog bug, not a runtime condition.
export const readParam = (def: StrategyDefinition, key: string): number => {
    const value = Number(def.params[key]);
    if (!Number.isFinite(value)) throw new Error(`strategy ${def.id}: missing numeric param "${key}"`);
    return value;
};

export const heldPositions = (ctx: StrategyContext): ReadonlyMap<string, Holding> =>
    new Map(ctx.holdings.filter((holding) => holding.quantity > 0).map((holding) => [holding.symbol, holding]));

export const lastClose = (bars: readonly Bar[]): number | null => {
    const bar = bars[bars.length - 1];
    return bar && Number.isFinite(bar.close) ? bar.close : null;
};

export const nullValues = (def: StrategyDefinition): SignalRow['values'] =>
    Object.fromEntries(def.signalColumns.map((column) => [column.key, null]));

// Share of equity a holding represents at its last close (null when unpriced).
export const holdingWeight = (ctx: StrategyContext, holding: Holding | undefined): number | null =>
    holding && holding.lastClose !== null && ctx.equity > 0
        ? (holding.quantity * holding.lastClose) / ctx.equity
        : null;

export type PartialDecision = {
    rebalanceTriggered: boolean;
    targets: readonly Target[];
    rows: ReadonlyMap<string, SignalRow>;
    dataIssues: readonly string[];
};

// Turns a rule's per-symbol rows into the published decision: universe order, a
// stale row for every universe symbol the rule could not evaluate, and a "held"
// row for anything held outside the universe (the engine handles its exit).
export const finishDecision = (def: StrategyDefinition, ctx: StrategyContext, partial: PartialDecision): Decision => {
    const universe = universeOf(def);
    const held = heldPositions(ctx);
    const dataIssues = [...partial.dataIssues];
    const board: SignalRow[] = universe.map((symbol) => {
        const row = partial.rows.get(symbol);
        if (row) return row;
        if (held.has(symbol)) dataIssues.push(`${symbol}: held but ${staleNote(ctx.asOf)}; kept`);
        return {symbol, state: 'excluded', values: nullValues(def), note: staleNote(ctx.asOf)};
    });
    for (const symbol of held.keys()) {
        if (!universe.includes(symbol)) {
            board.push({symbol, state: 'held', values: nullValues(def), note: 'left the universe'});
        }
    }
    return {
        rebalanceTriggered: partial.rebalanceTriggered,
        targets: partial.targets,
        board,
        dataIssues,
    };
};

// ---------------------------------------------------------------------------
// Full re-rank on due days (12-1 momentum, low volatility): the top `slots` by
// score are targeted, held names outside them exit, everything else watches.

export type RankedSpec = {
    score: (bars: readonly Bar[]) => number | null;
    direction: 'asc' | 'desc';
    // Board note for a symbol whose score is null (not enough history).
    needsNote: string;
    values: (close: number, score: number | null, position: number | null, total: number) => SignalRow['values'];
    selectReason: (score: number, position: number, total: number, held: boolean) => string;
    exitReason: (score: number, position: number, total: number) => string;
};

export const decideRanked = (def: StrategyDefinition, ctx: StrategyContext, spec: RankedSpec): Decision => {
    const held = heldPositions(ctx);
    const due = isRebalanceDue(def.cadence, ctx.tradeDate, ctx.lastRebalanceDate);
    const rows = new Map<string, SignalRow>();
    const dataIssues: string[] = [];
    const scored: {symbol: string; score: number; close: number}[] = [];

    for (const symbol of universeOf(def)) {
        if (!ctx.eligible.has(symbol)) continue;
        const bars = ctx.bars.get(symbol) ?? [];
        const close = lastClose(bars);
        if (close === null) continue;
        const score = spec.score(bars);
        if (score === null) {
            rows.set(symbol, {symbol, state: 'excluded', values: spec.values(close, null, null, 0), note: spec.needsNote});
            if (held.has(symbol)) dataIssues.push(`${symbol}: held but ${spec.needsNote}; kept`);
            continue;
        }
        scored.push({symbol, score, close});
    }

    const ranked = rank(scored, (item) => item.score, spec.direction);
    const total = ranked.length;
    const targets: Target[] = [];
    ranked.forEach((item, index) => {
        const position = index + 1;
        const isHeld = held.has(item.symbol);
        let state: RowState = isHeld ? 'held' : 'watch';
        if (due) {
            if (index < def.slots) {
                targets.push({
                    symbol: item.symbol,
                    weight: slotWeight(def.slots),
                    reason: spec.selectReason(item.score, position, total, isHeld),
                });
                state = isHeld ? 'held' : 'enter';
            } else if (isHeld) {
                targets.push({symbol: item.symbol, weight: 0, reason: spec.exitReason(item.score, position, total)});
                state = 'exit';
            }
        }
        rows.set(item.symbol, {symbol: item.symbol, state, values: spec.values(item.close, item.score, position, total)});
    });

    return finishDecision(def, ctx, {rebalanceTriggered: due, targets, rows, dataIssues});
};

// ---------------------------------------------------------------------------
// Daily slot filler (RSI-2, Donchian): exits are decided first, then the open
// slots — counted against every holding, stale ones included — are filled by
// the strongest candidates. Held names that stay get no target, so the engine
// never resizes them.

export type SlotEvaluation = {
    close: number;
    values: SignalRow['values'];
    // Set when the symbol cannot be scored today; a held one is kept.
    excluded?: string;
    // Exit reason when the exit rule fires (only acted on for held names).
    exit?: string;
    // Entry candidate (only acted on for unheld names).
    entry?: {score: number; reason: string};
};

export const decideSlots = (
    def: StrategyDefinition,
    ctx: StrategyContext,
    evaluate: (bars: readonly Bar[]) => SlotEvaluation | null,
    direction: 'asc' | 'desc',
): Decision => {
    const held = heldPositions(ctx);
    const rows = new Map<string, SignalRow>();
    const dataIssues: string[] = [];
    const targets: Target[] = [];
    const candidates: {symbol: string; score: number; reason: string; values: SignalRow['values']}[] = [];
    let exitsToday = 0;

    for (const symbol of universeOf(def)) {
        if (!ctx.eligible.has(symbol)) continue;
        const evaluation = evaluate(ctx.bars.get(symbol) ?? []);
        if (evaluation === null) continue;
        const isHeld = held.has(symbol);
        if (isHeld && evaluation.exit) {
            targets.push({symbol, weight: 0, reason: evaluation.exit});
            exitsToday += 1;
            rows.set(symbol, {symbol, state: 'exit', values: evaluation.values});
            continue;
        }
        if (evaluation.excluded) {
            rows.set(symbol, {symbol, state: 'excluded', values: evaluation.values, note: evaluation.excluded});
            if (isHeld) dataIssues.push(`${symbol}: held but ${evaluation.excluded}; kept`);
            continue;
        }
        if (isHeld) {
            rows.set(symbol, {symbol, state: 'held', values: evaluation.values});
            continue;
        }
        if (evaluation.entry) {
            candidates.push({symbol, score: evaluation.entry.score, reason: evaluation.entry.reason, values: evaluation.values});
        } else {
            rows.set(symbol, {symbol, state: 'watch', values: evaluation.values});
        }
    }

    // An exited name is already in `held`, so it can never be a candidate today.
    const openSlots = Math.max(0, def.slots - (held.size - exitsToday));
    rank(candidates, (item) => item.score, direction).forEach((candidate, index) => {
        if (index < openSlots) {
            targets.push({symbol: candidate.symbol, weight: slotWeight(def.slots), reason: candidate.reason});
            rows.set(candidate.symbol, {symbol: candidate.symbol, state: 'enter', values: candidate.values});
        } else {
            rows.set(candidate.symbol, {
                symbol: candidate.symbol,
                state: 'watch',
                values: candidate.values,
                note: 'signal, but no open slot',
            });
        }
    });

    return finishDecision(def, ctx, {rebalanceTriggered: true, targets, rows, dataIssues});
};
