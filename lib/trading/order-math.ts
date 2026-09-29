// The order ticket's client-side arithmetic: what a preset means, and whether an
// order can obviously not fill. Pure on purpose so it is unit-tested; the server
// (executeOrder) re-checks everything with the live price and stays authoritative.

import {TRADE_REASON_MAX} from "@/lib/strategies/config";

export type OrderSide = 'buy' | 'sell';

export type OrderInputs = {
    side: OrderSide;
    quantity: number;          // whatever the user typed, already coerced to a number
    price: number | null;      // last quote, or null when none is available
    cash: number;              // buying power in the active account
    owned: number;             // shares of this symbol held in the active account
};

export type OrderCheck = {
    ok: boolean;               // false only for a *definite* problem; an unknown price never blocks
    message: string | null;    // what to tell the user, when there is something to say
    estTotal: number | null;   // cost or proceeds at the last price, when there is one
};

export type Preset = {label: string; value: number};

const FRACTIONS: readonly [string, number][] = [['25%', 0.25], ['50%', 0.5], ['75%', 0.75]];

const money = (n: number): string => `$${n.toFixed(2)}`;

// Whole shares the user could buy at `price` with `cash`; null when it can't be known.
export const affordableShares = (cash: number, price: number | null): number | null => {
    if (typeof price !== 'number' || !(price > 0) || !(cash > 0)) return null;
    return Math.floor(cash / price);
};

// Quick-fill buttons. Sell presets are fractions of what is owned (as the sell dialog
// already does); buy presets are fractions of what the cash affords at the last price.
// Null when there is nothing to fill from — no position, no price, or under one share.
export const presetQuantities = (side: OrderSide, {cash, price, owned}: Pick<OrderInputs, 'cash' | 'price' | 'owned'>): Preset[] | null => {
    const max = side === 'sell' ? Math.floor(owned) : affordableShares(cash, price);
    if (max === null || max < 1) return null;
    return [
        ...FRACTIONS.map(([label, f]) => ({label, value: Math.max(1, Math.floor(max * f))})),
        {label: 'Max', value: max},
    ];
};

export type PositionLike = {symbol: string; quantity: number; marketValue?: number; avgCost?: number};

export type OrderEffectInputs = {
    side: OrderSide;
    symbol: string;
    quantity: number;
    price: number | null;
    cash: number;
    positions: readonly PositionLike[];
};

export type OrderEffect =
    | {side: 'buy'; estTotal: number; shareOfAccount: number; largestAfter: {symbol: string; weight: number} | null; cashAfter: number; cashAfterWeight: number}
    | {side: 'sell'; quantity: number; owned: number; sharesAfter: number; avgCost: number | null; estRealizedPnl: number | null};

// (sell price − average cost) × shares, the same arithmetic executeOrder records.
export const estRealizedPnl = (price: number | null, avgCost: number | null | undefined, quantity: number): number | null =>
    typeof price === 'number' && price > 0 && typeof avgCost === 'number' && quantity > 0 ? (price - avgCost) * quantity : null;

// A position's value at the last quote, or at cost when no quote is in hand — the same
// fallback the portfolio uses, so the ticket and the tiles agree.
const valueOf = (p: PositionLike): number =>
    typeof p.marketValue === 'number' ? p.marketValue : typeof p.avgCost === 'number' ? p.avgCost * p.quantity : 0;

// What the order does to the account, at the last price. Advisory like checkOrder: the
// server is the authority on the fill. A buy with no price has no effect to describe.
export const describeOrderEffect = ({side, symbol, quantity, price, cash, positions}: OrderEffectInputs): OrderEffect | null => {
    const qty = Math.floor(quantity);
    if (!Number.isFinite(qty) || qty < 1) return null;
    const upper = symbol.toUpperCase();
    const held = positions.find((p) => p.symbol.toUpperCase() === upper);
    if (side === 'sell') {
        const owned = Math.floor(held?.quantity ?? 0);
        if (owned < 1) return null;
        const sold = Math.min(qty, owned);
        return {
            side: 'sell',
            quantity: sold,
            owned,
            sharesAfter: owned - sold,
            avgCost: typeof held?.avgCost === 'number' ? held.avgCost : null,
            estRealizedPnl: estRealizedPnl(price, held?.avgCost, sold),
        };
    }
    if (typeof price !== 'number' || !(price > 0)) return null;
    const estTotal = price * qty;
    const totalValue = cash + positions.reduce((sum, p) => sum + valueOf(p), 0);
    if (!(totalValue > 0)) return null;
    const after = positions.map((p) => ({symbol: p.symbol.toUpperCase(), value: valueOf(p) + (p.symbol.toUpperCase() === upper ? estTotal : 0)}));
    if (!held) after.push({symbol: upper, value: estTotal});
    const largest = after.reduce<{symbol: string; value: number} | null>((best, p) => (best === null || p.value > best.value ? p : best), null);
    const cashAfter = cash - estTotal;
    return {
        side: 'buy',
        estTotal,
        shareOfAccount: estTotal / totalValue,
        largestAfter: largest && largest.value > 0 ? {symbol: largest.symbol, weight: largest.value / totalValue} : null,
        cashAfter,
        cashAfterWeight: cashAfter / totalValue,
    };
};

export const checkOrder = ({side, quantity, price, cash, owned}: OrderInputs): OrderCheck => {
    const qty = Math.floor(quantity);
    const hasPrice = typeof price === 'number' && price > 0;
    const estTotal = hasPrice && qty > 0 ? price * qty : null;

    if (!Number.isFinite(qty) || qty < 1) {
        return {ok: false, message: 'Enter a whole number of shares', estTotal: null};
    }
    if (side === 'sell') {
        if (owned < 1) return {ok: false, message: "You don't own any shares of this symbol in this account", estTotal};
        if (qty > owned) return {ok: false, message: `You only own ${owned} share${owned === 1 ? '' : 's'}`, estTotal};
        return {ok: true, message: null, estTotal};
    }
    // Buy. Without a price the cost is unknown; that is not a reason to block — the QA
    // harness runs with no quote provider at all, and the server rejects for real.
    if (estTotal !== null && estTotal > cash) {
        return {ok: false, message: `Not enough buying power — need ${money(estTotal)}, have ${money(cash)}`, estTotal};
    }
    return {ok: true, message: null, estTotal};
};

// A learner's own "why" for an order: plain text, one line, bounded. Control characters
// (which includes newlines and tabs) become spaces before whitespace collapses, so a pasted
// paragraph reads as one line in the trade log. Markup is left as text — every surface
// renders the note as a React text node, never as HTML. The clip counts UTF-16 units like
// the textarea's maxLength does, and drops a surrogate half it would leave behind.
// Undefined means "no note".
const CONTROL_CHARS = /[\u0000-\u001f\u007f-\u009f]/g;
const TRAILING_HIGH_SURROGATE = /[\ud800-\udbff]$/;

export const sanitizeTradeNote = (input: unknown): string | undefined => {
    if (typeof input !== 'string') return undefined;
    const note = input.replace(CONTROL_CHARS, ' ').replace(/\s+/g, ' ').trim()
        .slice(0, TRADE_REASON_MAX).replace(TRAILING_HIGH_SURROGATE, '').trim();
    return note === '' ? undefined : note;
};
