// A week's decision items, as the picks view and the database read them: one per order
// (filled or not), then one per position kept. Pure; mirrors the Navigator's buildOrderItem
// and buildHoldItems with the brands that put a symbol in the universe attached.

import {REASONS_PER_ITEM} from "@/lib/culture/config";
import {HOLDING_REASON, type HeldPosition, type PlannedOrder, type TargetWeight} from "@/lib/navigator/allocator";
import type {ScoredSymbol} from "@/lib/navigator/scoring";

export type DecisionAction = 'buy' | 'sell' | 'hold';

export type CultureDecisionItem = {
    symbol: string;
    action: DecisionAction;
    quantity?: number;
    targetWeight: number;
    currentWeight: number;
    score: number;
    reasons: string[];
    brands: {id: string; name: string}[];
    executed: boolean;
    executionPrice?: number;
    error?: string;
};

export type OrderOutcome = {success: boolean; message?: string; price?: number};

// A stored item read back as the view's own shape (the optional fields only when set).
export const copyDecisionItem = (item: CultureDecisionItem): CultureDecisionItem => ({
    symbol: item.symbol,
    action: item.action,
    ...(typeof item.quantity === 'number' ? {quantity: item.quantity} : {}),
    targetWeight: item.targetWeight,
    currentWeight: item.currentWeight,
    score: item.score,
    reasons: [...item.reasons],
    brands: item.brands.map((b) => ({id: b.id, name: b.name})),
    executed: item.executed,
    ...(typeof item.executionPrice === 'number' ? {executionPrice: item.executionPrice} : {}),
    ...(item.error ? {error: item.error} : {}),
});

const weightOf = (position: HeldPosition | undefined, totalValue: number): number =>
    position && position.price !== null && totalValue > 0 ? (position.quantity * position.price) / totalValue : 0;

export const buildCultureItems = ({orders, outcomes, positions, totalValue, targets, scored, brandsBySymbol}: {
    orders: readonly PlannedOrder[];
    // By order index; a preview passes {success: false} for each.
    outcomes: readonly OrderOutcome[];
    positions: readonly HeldPosition[];
    totalValue: number;
    targets: readonly TargetWeight[];
    scored: readonly ScoredSymbol[];
    brandsBySymbol: ReadonlyMap<string, {id: string; name: string}[]>;
}): CultureDecisionItem[] => {
    const targetBySymbol = new Map(targets.map((t) => [t.symbol, t]));
    const scoreBySymbol = new Map(scored.map((s) => [s.symbol, s]));
    const items: CultureDecisionItem[] = orders.map((order, index) => {
        const outcome = outcomes[index] ?? {success: false};
        const held = positions.find((p) => p.symbol === order.symbol);
        return {
            symbol: order.symbol,
            action: order.side,
            quantity: order.quantity,
            targetWeight: targetBySymbol.get(order.symbol)?.weight ?? 0,
            currentWeight: weightOf(held, totalValue),
            score: scoreBySymbol.get(order.symbol)?.score ?? 0,
            reasons: [order.reason, ...(scoreBySymbol.get(order.symbol)?.reasons ?? []).slice(0, REASONS_PER_ITEM - 1)],
            brands: brandsBySymbol.get(order.symbol) ?? [],
            executed: outcome.success,
            ...(outcome.success && typeof outcome.price === 'number' ? {executionPrice: outcome.price} : {}),
            ...(!outcome.success && outcome.message ? {error: outcome.message} : {}),
        };
    });
    const ordered = new Set(orders.map((o) => o.symbol));
    for (const position of positions) {
        if (position.quantity <= 0 || ordered.has(position.symbol)) continue;
        const target = targetBySymbol.get(position.symbol);
        const current = weightOf(position, totalValue);
        items.push({
            symbol: position.symbol,
            action: 'hold',
            targetWeight: target?.weight ?? current,
            currentWeight: current,
            score: scoreBySymbol.get(position.symbol)?.score ?? position.score ?? 0,
            reasons: (scoreBySymbol.get(position.symbol)?.reasons ?? [HOLDING_REASON]).slice(0, REASONS_PER_ITEM),
            brands: brandsBySymbol.get(position.symbol) ?? [],
            executed: false,
        });
    }
    return items;
};

// A week the picker could not decide: its decision stored the week's eligibility, found no owner
// it could buy, and executed nothing. Missing data, not a judgement — so the week is not used up:
// the next weekly run (Tuesday's retry) releases its claim and decides it again
// (lib/jobs/functions/culture.runCultureWeekly). Nothing traded, so a second decision can double
// nothing. A decision made before eligibility was stored is never void.
export const isVoidWeek = (decision: {eligibility?: {eligible: number} | null; items: readonly {executed: boolean}[]} | null): boolean =>
    decision !== null && decision.eligibility != null && decision.eligibility.eligible === 0 && decision.items.every((item) => !item.executed);

