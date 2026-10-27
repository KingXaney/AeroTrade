// The one step between a model's rating and the paper account, and it is code: each rating maps to
// a target share of the account by a fixed table (config's RATING_TARGET_WEIGHTS), every target is
// capped and scaled under the rails, and the Navigator's allocator diffs the book against them
// into whole-share orders. The model never names a quantity. Pure.

import {AGENT_WORLD_RAILS, RATING_TARGET_WEIGHTS, type Rating} from "@/lib/agent-world/config";
import type {SessionOrder} from "@/lib/agent-world/types";
import {diffToOrders, type HeldPosition, type TargetWeight} from "@/lib/navigator/allocator";
import type {AllocatorRails} from "@/lib/navigator/config";

export type BookPosition = {symbol: string; quantity: number; avgCost: number; price: number | null};
// The account as the desk saw it: its value, its cash, its positions, and a live price for every
// symbol the session rated (held or not).
export type Book = {totalValue: number; cash: number; positions: BookPosition[]; priceBySymbol: Record<string, number>};

const PERCENT = 100;
const pct = (weight: number): string => `${Number((weight * PERCENT).toFixed(1))}%`;

// The reason an order carries on the ledger. It opens on "rated", never on the rating's own word,
// so no line of the trade log reads as an instruction (lib/learn/agent-world-reasons decodes it).
export const ratingReason = (rating: Rating, targetWeight: number): string => `rated ${rating} → target ${pct(targetWeight)}`;

const weightOf = (book: Book, position: BookPosition): number =>
    book.totalValue > 0 && position.price !== null ? (position.quantity * position.price) / book.totalValue : 0;

// The targets the ratings ask for. Hold and REVIEW ask for nothing (the position stays as it is);
// Underweight trims a holding and opens nothing; Sell of a name not held asks for nothing. Every
// target is capped at the rails' per-name weight, then all are scaled down together when they and
// the holdings left alone would eat into the cash floor.
export const targetsFromRatings = (ratings: Readonly<Record<string, Rating>>, book: Book, rails: AllocatorRails = AGENT_WORLD_RAILS): TargetWeight[] => {
    const held = new Map(book.positions.filter((p) => p.quantity > 0).map((p) => [p.symbol, p]));
    const targets: (TargetWeight & {rating: Rating})[] = [];
    for (const [symbol, rating] of Object.entries(ratings)) {
        const weight = RATING_TARGET_WEIGHTS[rating];
        if (weight === null) continue;
        const holding = held.get(symbol);
        if (!holding && (rating === 'Underweight' || weight === 0)) continue;
        const capped = Math.min(weight, rails.maxPositionWeight);
        targets.push({symbol, weight: capped, score: capped, reasons: [ratingReason(rating, capped)], rating});
    }
    const targeted = new Set(targets.map((t) => t.symbol));
    const kept = [...held.values()].filter((p) => !targeted.has(p.symbol)).reduce((sum, p) => sum + weightOf(book, p), 0);
    const room = Math.max(0, 1 - rails.minCashWeight - kept);
    const asked = targets.reduce((sum, t) => sum + t.weight, 0);
    const scale = asked > room && asked > 0 ? room / asked : 1;
    return targets.map(({rating, ...t}) => {
        const weight = t.weight * scale;
        return {...t, weight, score: weight, reasons: [ratingReason(rating, weight)]};
    });
};

// The session's orders: the allocator's whole-share diff of the book against the targets, each
// carrying the rating behind it, its target and the weight it held before.
export const agentWorldOrders = ({book, ratings, rails = AGENT_WORLD_RAILS}: {
    book: Book;
    ratings: Readonly<Record<string, Rating>>;
    rails?: AllocatorRails;
}): {orders: SessionOrder[]; targets: TargetWeight[]} => {
    const targets = targetsFromRatings(ratings, book, rails);
    const heldSymbols = new Set(book.positions.filter((p) => p.quantity > 0).map((p) => p.symbol));
    const positions: HeldPosition[] = [
        ...book.positions.filter((p) => p.quantity > 0).map((p) => ({
            symbol: p.symbol,
            quantity: p.quantity,
            avgCost: p.avgCost,
            price: book.priceBySymbol[p.symbol] ?? p.price,
            heldTradingDays: null,
            thesisBroken: false,
            score: null,
        })),
        // A target not yet held is priced by a quantity-0 row (the allocator's quote carrier).
        ...targets.filter((t) => !heldSymbols.has(t.symbol) && book.priceBySymbol[t.symbol] !== undefined).map((t) => ({
            symbol: t.symbol,
            quantity: 0,
            avgCost: 0,
            price: book.priceBySymbol[t.symbol],
            heldTradingDays: null,
            thesisBroken: false,
            score: null,
        })),
    ];
    const planned = diffToOrders({totalValue: book.totalValue, cash: book.cash, positions, targets, maxTrades: rails.maxTradesPerWeek, rails});
    const targetBySymbol = new Map(targets.map((t) => [t.symbol, t]));
    const orders = planned.flatMap((order): SessionOrder[] => {
        const rating = ratings[order.symbol];
        const target = targetBySymbol.get(order.symbol);
        if (!rating || !target) return [];
        const position = book.positions.find((p) => p.symbol === order.symbol);
        return [{
            symbol: order.symbol,
            side: order.side,
            quantity: order.quantity,
            reason: ratingReason(rating, target.weight),
            rating,
            targetWeight: target.weight,
            currentWeight: position ? weightOf(book, {...position, price: book.priceBySymbol[position.symbol] ?? position.price}) : 0,
        }];
    });
    return {orders, targets};
};

// The fill request one order becomes, through the path every account trades on. One fill per
// session, side and symbol: a replayed step or a re-sent approval finds the earlier fill.
export const orderRequest = (sessionId: string, accountId: string, order: SessionOrder, totalValue: number, rails: AllocatorRails = AGENT_WORLD_RAILS) => ({
    accountId,
    symbol: order.symbol,
    side: order.side,
    quantity: order.quantity,
    source: 'agent-world' as const,
    reason: order.reason,
    idempotencyKey: `agent-world:${sessionId}:${order.side}:${order.symbol}`,
    // The cash floor again at execution time: the price may have moved since the plan.
    ...(order.side === 'buy' ? {minCashAfter: rails.minCashWeight * totalValue} : {}),
});
