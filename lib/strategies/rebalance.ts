// Turns a rule's target weights into whole-share orders against the current book.
// Pure — the engine and the simulator both plan through here.
//
// Hysteresis is explicit: a held symbol the rule says nothing about is kept, and a
// rule that wants out returns weight 0. Nothing is ever sold on a stale or missing
// price — a blind sale is worse than a day's delay, so those become skips with a
// reason the page can show.

import {CASH_FLOOR, PRICE_BUFFER} from '@/lib/strategies/config';
import type {Holding, OrderKind, PlannedOrder, SkippedOrder, Target} from '@/lib/strategies/types';

const PERCENT = 100;

// Weights like 0.1237… are inexact in binary, so a drift meant to be an exact share
// count can arrive a hair under it and floor away a whole share. The epsilon absorbs
// that representation noise without ever adding a real share.
const SHARE_FLOOR_EPSILON = 1e-9;
const floorShares = (value: number): number => Math.floor(value + SHARE_FLOOR_EPSILON);

type Candidate = {
    symbol: string;
    side: 'buy' | 'sell';
    kind: OrderKind;
    quantity: number;
    price: number;
    // Dollars the rule wanted moved; drives priority in the cash walk.
    value: number;
    reason: string;
};

const KIND_PRIORITY: Record<OrderKind, number> = {exit: 0, trim: 1, enter: 2, add: 2};

// Sells first (exits fund everything, then trims), larger moves first, symbol A→Z
// as the only tie-break — the same order every time for the same inputs.
const compareCandidates = (a: Candidate, b: Candidate): number => {
    if (a.side !== b.side) return a.side === 'sell' ? -1 : 1;
    if (KIND_PRIORITY[a.kind] !== KIND_PRIORITY[b.kind]) return KIND_PRIORITY[a.kind] - KIND_PRIORITY[b.kind];
    if (a.value !== b.value) return b.value - a.value;
    return a.symbol < b.symbol ? -1 : a.symbol > b.symbol ? 1 : 0;
};

const rebalanceReason = (drift: number, equity: number, weight: number): string => {
    const driftPct = (drift / equity) * PERCENT;
    const sign = driftPct >= 0 ? '+' : '';
    return `rebalance ${sign}${driftPct.toFixed(1)}% drift toward ${(weight * PERCENT).toFixed(1)}% target`;
};

export const planOrders = (input: {
    equity: number;
    cash: number;
    holdings: readonly Holding[];
    targets: readonly Target[];
    prices: ReadonlyMap<string, number>;
    stale: ReadonlySet<string>;
    driftBand: number;
}): {orders: PlannedOrder[]; skipped: SkippedOrder[]} => {
    const {equity, holdings, targets, prices, stale, driftBand} = input;
    const orders: PlannedOrder[] = [];
    const skipped: SkippedOrder[] = [];
    if (!(equity > 0)) {
        return {orders, skipped};
    }

    // A rule emitting the same symbol twice is a bug worth surfacing; the last entry wins.
    const targetBySymbol = new Map<string, Target>();
    for (const target of targets) {
        if (targetBySymbol.has(target.symbol)) {
            skipped.push({symbol: target.symbol, reason: 'duplicate target'});
        }
        targetBySymbol.set(target.symbol, target);
    }

    const candidates: Candidate[] = [];
    const consider = (candidate: Candidate): void => {
        if (candidate.quantity < 1) {
            skipped.push({symbol: candidate.symbol, reason: 'below one share'});
            return;
        }
        candidates.push(candidate);
    };

    const bandValue = driftBand * equity;
    const bufferedPrice = (price: number): number => price * (1 + PRICE_BUFFER);
    const handled = new Set<string>();

    for (const holding of holdings) {
        if (holding.quantity <= 0 || handled.has(holding.symbol)) continue;
        handled.add(holding.symbol);
        const target = targetBySymbol.get(holding.symbol);
        if (target === undefined) {
            continue; // hysteresis: nothing was asked, nothing to skip
        }
        const price = prices.get(holding.symbol);
        if (stale.has(holding.symbol)) {
            skipped.push({symbol: holding.symbol, reason: 'stale'});
            continue;
        }
        if (holding.lastClose === null || price === undefined) {
            skipped.push({symbol: holding.symbol, reason: 'unpriced'});
            continue;
        }
        const currentValue = holding.quantity * price;
        if (target.weight <= 0) {
            consider({
                symbol: holding.symbol, side: 'sell', kind: 'exit', quantity: holding.quantity,
                price, value: currentValue, reason: target.reason,
            });
            continue;
        }
        const drift = target.weight * equity - currentValue;
        if (Math.abs(drift) <= bandValue) {
            continue; // inside the band: churn control
        }
        const reason = rebalanceReason(drift, equity, target.weight);
        if (drift < 0) {
            consider({
                symbol: holding.symbol, side: 'sell', kind: 'trim',
                quantity: Math.min(floorShares(-drift / price), holding.quantity),
                price, value: -drift, reason,
            });
        } else {
            consider({
                symbol: holding.symbol, side: 'buy', kind: 'add',
                quantity: floorShares(drift / bufferedPrice(price)),
                price, value: drift, reason,
            });
        }
    }

    for (const target of targetBySymbol.values()) {
        if (handled.has(target.symbol) || target.weight <= 0) continue;
        handled.add(target.symbol);
        if (stale.has(target.symbol)) {
            skipped.push({symbol: target.symbol, reason: 'stale target'});
            continue;
        }
        const price = prices.get(target.symbol);
        if (price === undefined) {
            skipped.push({symbol: target.symbol, reason: 'unpriced target'});
            continue;
        }
        const value = target.weight * equity;
        consider({
            symbol: target.symbol, side: 'buy', kind: 'enter',
            quantity: floorShares(value / bufferedPrice(price)),
            price, value, reason: target.reason,
        });
    }

    candidates.sort(compareCandidates);

    // Cash walk: sells fund buys in the same batch; buys are clipped so the account
    // never plans below its cash floor (the fill re-checks against the live price).
    const cashFloor = CASH_FLOOR * equity;
    let cash = input.cash;
    for (const candidate of candidates) {
        if (candidate.side === 'sell') {
            cash += candidate.quantity * candidate.price;
            orders.push({
                symbol: candidate.symbol, side: 'sell', quantity: candidate.quantity,
                kind: candidate.kind, reason: candidate.reason,
            });
            continue;
        }
        const affordable = floorShares((cash - cashFloor) / candidate.price);
        const quantity = Math.min(candidate.quantity, Math.max(affordable, 0));
        if (quantity < 1) {
            skipped.push({symbol: candidate.symbol, reason: 'cash floor'});
            continue;
        }
        cash -= quantity * candidate.price;
        orders.push({
            symbol: candidate.symbol, side: 'buy', quantity,
            kind: candidate.kind, reason: candidate.reason,
        });
    }

    return {orders, skipped};
};
