// The mirror's plan (pure): the source account's weights laid over the Alpaca account's equity.
// Per symbol, the target value is its weight times equity; a symbol the source no longer holds is
// sold whole; a difference under the dollar floor or the drift band is left alone; sells come
// first, then buys within the cash the sells free less the buffer; a fractionable asset trades by
// dollars, any other in whole shares; a symbol Alpaca cannot trade is skipped and said.

import {MIRROR_CASH_BUFFER, MIRROR_DRIFT_BAND, MIRROR_MAX_ORDERS, MIRROR_MIN_ORDER_DOLLARS} from "@/lib/broker/config";

export type MirrorAsset = {tradable: boolean; fractionable: boolean};
export type MirrorPosition = {symbol: string; qty: number; price: number; marketValue: number};

export type MirrorOrder = {
    symbol: string;
    side: 'buy' | 'sell';
    // Exactly one of the two: dollars for a fractionable asset, whole shares otherwise (and for an exit).
    notional?: number;
    qty?: number;
    reason: 'enter' | 'add' | 'trim' | 'exit';
};

export type MirrorSkip = {symbol: string; reason: 'not-tradable' | 'no-asset' | 'no-price' | 'under-one-share' | 'over-cap'};

export type MirrorPlan = {orders: MirrorOrder[]; skipped: MirrorSkip[]};

// Each holding's share of the account's value (upper-cased symbols); what is not held is cash.
export const targetWeights = (portfolio: {totalValue: number; positions: readonly {symbol: string; marketValue: number}[]}): Map<string, number> => {
    const weights = new Map<string, number>();
    if (!(portfolio.totalValue > 0)) return weights;
    for (const position of portfolio.positions) {
        if (position.marketValue > 0) weights.set(position.symbol.toUpperCase(), position.marketValue / portfolio.totalValue);
    }
    return weights;
};

const cents = (value: number): number => Math.round(value * 100) / 100;

type Draft = {symbol: string; side: 'buy' | 'sell'; dollars: number; reason: MirrorOrder['reason']; whole: boolean; price: number; exitQty?: number};

export const planMirror = ({targets, equity, cash, positions, assets, prices}: {
    targets: ReadonlyMap<string, number>;
    equity: number;
    cash: number;
    positions: readonly MirrorPosition[];
    assets: ReadonlyMap<string, MirrorAsset>;
    prices: ReadonlyMap<string, number>;
}): MirrorPlan => {
    const held = new Map(positions.map((p) => [p.symbol.toUpperCase(), p]));
    const symbols = [...targets.keys(), ...[...held.keys()].filter((symbol) => !targets.has(symbol))];
    const threshold = Math.max(MIRROR_MIN_ORDER_DOLLARS, MIRROR_DRIFT_BAND * equity);
    const drafts: Draft[] = [];
    const skipped: MirrorSkip[] = [];

    for (const symbol of symbols) {
        const weight = targets.get(symbol) ?? 0;
        const position = held.get(symbol);
        const current = position?.marketValue ?? 0;
        const diff = weight * equity - current;
        // An exit sells every share held, whatever the band: the source holds none.
        if (weight === 0 && position && position.qty > 0) {
            drafts.push({symbol, side: 'sell', dollars: current, reason: 'exit', whole: true, price: position.price, exitQty: position.qty});
            continue;
        }
        if (Math.abs(diff) < threshold) continue;
        const asset = assets.get(symbol);
        if (!asset) {
            skipped.push({symbol, reason: 'no-asset'});
            continue;
        }
        if (!asset.tradable) {
            skipped.push({symbol, reason: 'not-tradable'});
            continue;
        }
        const price = prices.get(symbol) ?? position?.price ?? 0;
        if (!asset.fractionable && !(price > 0)) {
            skipped.push({symbol, reason: 'no-price'});
            continue;
        }
        drafts.push({
            symbol, side: diff < 0 ? 'sell' : 'buy', dollars: Math.abs(diff), whole: !asset.fractionable, price,
            reason: diff < 0 ? 'trim' : current > 0 ? 'add' : 'enter',
        });
    }

    const sells = drafts.filter((d) => d.side === 'sell');
    const buys = drafts.filter((d) => d.side === 'buy');
    // The buys share what the sells free, less the buffer, in proportion.
    const available = cash + sells.reduce((sum, d) => sum + d.dollars, 0) - MIRROR_CASH_BUFFER * equity;
    const wanted = buys.reduce((sum, d) => sum + d.dollars, 0);
    const scale = wanted > 0 && available < wanted ? Math.max(0, available) / wanted : 1;

    const orders: MirrorOrder[] = [];
    for (const draft of [...sells, ...buys]) {
        const dollars = draft.side === 'buy' ? draft.dollars * scale : draft.dollars;
        let order: MirrorOrder | null;
        if (draft.exitQty !== undefined) order = {symbol: draft.symbol, side: 'sell', qty: draft.exitQty, reason: 'exit'};
        else if (draft.whole) {
            const qty = Math.floor(dollars / draft.price);
            order = qty > 0 ? {symbol: draft.symbol, side: draft.side, qty, reason: draft.reason} : null;
            if (!order) skipped.push({symbol: draft.symbol, reason: 'under-one-share'});
        } else {
            const notional = cents(dollars);
            order = notional > 0 ? {symbol: draft.symbol, side: draft.side, notional, reason: draft.reason} : null;
        }
        if (!order) continue;
        if (orders.length >= MIRROR_MAX_ORDERS) {
            skipped.push({symbol: draft.symbol, reason: 'over-cap'});
            continue;
        }
        orders.push(order);
    }
    return {orders, skipped};
};

// Alpaca's client_order_id (at most 128 characters): the link, the day, the side and the symbol,
// so a sync retried the same day cannot send an order twice — Alpaca refuses a reused id.
export const clientOrderId = (linkId: string, day: string, side: 'buy' | 'sell', symbol: string): string =>
    `aero-${linkId.slice(-8)}-${day}-${side}-${symbol}`.slice(0, 128);
