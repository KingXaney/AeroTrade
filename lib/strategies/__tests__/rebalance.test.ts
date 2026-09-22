import {describe, expect, it} from 'vitest';
import {CASH_FLOOR, DEFAULT_DRIFT_BAND, PRICE_BUFFER} from '@/lib/strategies/config';
import {planOrders} from '@/lib/strategies/rebalance';
import type {Holding, Target} from '@/lib/strategies/types';

const held = (symbol: string, quantity: number, lastClose: number | null = 100, avgCost = 90): Holding =>
    ({symbol, quantity, avgCost, lastClose});

const target = (symbol: string, weight: number, reason = `target ${symbol}`): Target => ({symbol, weight, reason});

const priced = (entries: Record<string, number>): ReadonlyMap<string, number> => new Map(Object.entries(entries));

const plan = (overrides: Partial<Parameters<typeof planOrders>[0]>) => planOrders({
    equity: 100_000,
    cash: 100_000,
    holdings: [],
    targets: [],
    prices: priced({}),
    stale: new Set(),
    driftBand: DEFAULT_DRIFT_BAND,
    ...overrides,
});

describe('planOrders — entries', () => {
    it('sizes an entry from the last close plus the price buffer', () => {
        // 0.5 × 100 000 = 50 000 / (100 × 1.01) = 495.05 → 495 whole shares.
        const {orders, skipped} = plan({targets: [target('AAPL', 0.5, 'enter: signal')], prices: priced({AAPL: 100})});
        expect(PRICE_BUFFER).toBe(0.01);
        expect(orders).toEqual([{symbol: 'AAPL', side: 'buy', quantity: 495, kind: 'enter', reason: 'enter: signal'}]);
        expect(skipped).toEqual([]);
    });

    it('does not lose a share to floating-point noise', () => {
        // 0.101 × 10 000 / (100 × 1.01) is exactly 10 shares on paper; in binary the
        // quotient can land a hair under 10 and floor to 9 without the epsilon.
        const {orders} = plan({equity: 10_000, cash: 10_000, targets: [target('X', 0.101)], prices: priced({X: 100})});
        expect(orders[0].quantity).toBe(10);
    });

    it('skips an entry that rounds below one share', () => {
        // 0.05 × 1 000 = 50 / 101 = 0.49 shares.
        const {orders, skipped} = plan({equity: 1_000, cash: 1_000, targets: [target('AAPL', 0.05)], prices: priced({AAPL: 100})});
        expect(orders).toEqual([]);
        expect(skipped).toEqual([{symbol: 'AAPL', reason: 'below one share'}]);
    });

    it('skips a stale target and an unpriced target with distinct reasons', () => {
        const {orders, skipped} = plan({
            targets: [target('AAPL', 0.2), target('MSFT', 0.2)],
            prices: priced({AAPL: 100}),
            stale: new Set(['AAPL']),
        });
        expect(orders).toEqual([]);
        expect(skipped).toEqual([
            {symbol: 'AAPL', reason: 'stale target'},
            {symbol: 'MSFT', reason: 'unpriced target'},
        ]);
    });

    it('ignores a weight-0 target for a symbol that is not held', () => {
        const {orders, skipped} = plan({targets: [target('AAPL', 0)], prices: priced({AAPL: 100})});
        expect(orders).toEqual([]);
        expect(skipped).toEqual([]);
    });

    it('does nothing when equity is not positive', () => {
        const result = plan({equity: 0, cash: 0, targets: [target('AAPL', 0.5)], prices: priced({AAPL: 100})});
        expect(result).toEqual({orders: [], skipped: []});
    });
});

describe('planOrders — held positions', () => {
    // 100 shares at 100 = 10 000 = 10 % of 100 000 equity; band = 2 % = 2 000.
    const book = {holdings: [held('AAPL', 100)], prices: priced({AAPL: 100}), cash: 90_000};

    it('keeps a held symbol the rule says nothing about', () => {
        const {orders, skipped} = plan({...book, targets: [target('MSFT', 0.1)], prices: priced({AAPL: 100, MSFT: 50})});
        expect(orders.map((order) => order.symbol)).toEqual(['MSFT']);
        expect(skipped).toEqual([]);
    });

    it('holds still inside the band on both sides, including exactly at the band', () => {
        // Drift +1 000 (11 %), −1 000 (9 %) and exactly +2 000 (12 %) all stay inside.
        for (const weight of [0.11, 0.09, 0.12, 0.08]) {
            const {orders, skipped} = plan({...book, targets: [target('AAPL', weight)]});
            expect(orders, `weight ${weight}`).toEqual([]);
            expect(skipped).toEqual([]);
        }
    });

    it('adds past the band, sized with the buffer, with the drift reason', () => {
        // Drift = 13 000 − 10 000 = 3 000 → 3 000 / 101 = 29.7 → 29.
        const {orders} = plan({...book, targets: [target('AAPL', 0.13)]});
        expect(orders).toEqual([{
            symbol: 'AAPL', side: 'buy', quantity: 29, kind: 'add',
            reason: 'rebalance +3.0% drift toward 13.0% target',
        }]);
    });

    it('trims past the band at the last close, never above the quantity held', () => {
        // Drift = 7 000 − 10 000 = −3 000 → 30 shares.
        const {orders} = plan({...book, targets: [target('AAPL', 0.07)]});
        expect(orders).toEqual([{
            symbol: 'AAPL', side: 'sell', quantity: 30, kind: 'trim',
            reason: 'rebalance -3.0% drift toward 7.0% target',
        }]);
        // A near-total trim still cannot exceed the position.
        const tiny = plan({...book, targets: [target('AAPL', 0.0001)]});
        expect(tiny.orders[0].quantity).toBeLessThanOrEqual(100);
    });

    it('honours a custom drift band', () => {
        const {orders} = plan({...book, driftBand: 0.05, targets: [target('AAPL', 0.13)]});
        expect(orders).toEqual([]);
    });

    it('exits the full position on weight 0 even when the drift is inside the band', () => {
        // 100 shares × 100 = 10 000 — that is well inside any band; weight 0 sells anyway.
        const {orders} = plan({...book, targets: [target('AAPL', 0, 'exit: close below 20-day low')]});
        expect(orders).toEqual([{
            symbol: 'AAPL', side: 'sell', quantity: 100, kind: 'exit', reason: 'exit: close below 20-day low',
        }]);
    });

    it('never sells a stale holding, whatever the target says', () => {
        const {orders, skipped} = plan({...book, stale: new Set(['AAPL']), targets: [target('AAPL', 0, 'exit')]});
        expect(orders).toEqual([]);
        expect(skipped).toEqual([{symbol: 'AAPL', reason: 'stale'}]);
    });

    it('never trades a holding without a fresh close or a price', () => {
        const noClose = plan({...book, holdings: [held('AAPL', 100, null)], targets: [target('AAPL', 0)]});
        expect(noClose.orders).toEqual([]);
        expect(noClose.skipped).toEqual([{symbol: 'AAPL', reason: 'unpriced'}]);

        const noPrice = plan({...book, prices: priced({}), targets: [target('AAPL', 0.5)]});
        expect(noPrice.orders).toEqual([]);
        expect(noPrice.skipped).toEqual([{symbol: 'AAPL', reason: 'unpriced'}]);
    });

    it('skips a trim that rounds below one share', () => {
        // 1 share at 10 000 = 10 % of equity; weight 0.05 → drift −5 000 → 0.5 share.
        const {orders, skipped} = plan({
            holdings: [held('BRK', 1, 10_000)], prices: priced({BRK: 10_000}), cash: 90_000,
            targets: [target('BRK', 0.05)],
        });
        expect(orders).toEqual([]);
        expect(skipped).toEqual([{symbol: 'BRK', reason: 'below one share'}]);
    });
});

describe('planOrders — ordering and the cash walk', () => {
    it('places sells before buys, exits before trims, then by value desc and symbol', () => {
        // Equity: cash 30 000 + AAPL 10 000 + MSFT 50 000 + GOOG 10 000 = 100 000.
        const {orders} = plan({
            cash: 30_000,
            holdings: [held('GOOG', 100), held('MSFT', 500), held('AAPL', 100)],
            prices: priced({AAPL: 100, MSFT: 100, GOOG: 100, NVDA: 100, AMZN: 100, ZZZ: 100, BBB: 100}),
            targets: [
                target('NVDA', 0.1),   // enter 10 000 → 99
                target('MSFT', 0.2),   // trim: 20 000 − 50 000 = −30 000 → 300 (bigger than the exit)
                target('AMZN', 0.2),   // enter 20 000 → 198
                target('AAPL', 0, 'exit: rule'), // exit 10 000 — still first
                target('ZZZ', 0.1),    // ties NVDA on value → A→Z
                target('BBB', 0.1),
            ],
        });
        expect(orders.map((order) => `${order.side} ${order.kind} ${order.symbol} ${order.quantity}`)).toEqual([
            'sell exit AAPL 100',
            'sell trim MSFT 300',
            'buy enter AMZN 198',
            'buy enter BBB 99',
            'buy enter NVDA 99',
            'buy enter ZZZ 99',
        ]);
    });

    it('orders exits among themselves by value desc then symbol', () => {
        const {orders} = plan({
            cash: 70_000,
            holdings: [held('AAA', 100), held('BBB', 100), held('CCC', 100, 100)],
            prices: priced({AAA: 100, BBB: 100, CCC: 100}),
            targets: [target('CCC', 0), target('BBB', 0), target('AAA', 0)],
        });
        expect(orders.map((order) => order.symbol)).toEqual(['AAA', 'BBB', 'CCC']);
        const bigger = plan({
            cash: 60_000,
            holdings: [held('AAA', 100), held('BBB', 300)],
            prices: priced({AAA: 100, BBB: 100}),
            targets: [target('AAA', 0), target('BBB', 0)],
        });
        expect(bigger.orders.map((order) => order.symbol)).toEqual(['BBB', 'AAA']);
    });

    it('lets sells fund the buys of the same batch', () => {
        // No cash at all; the exit brings in 50 000 and the entry spends half of it:
        // 0.5 × 50 000 / 101 = 247.5 → 247.
        const {orders, skipped} = plan({
            equity: 50_000,
            cash: 0,
            holdings: [held('OLD', 500)],
            prices: priced({OLD: 100, NEW: 100}),
            targets: [target('OLD', 0, 'exit'), target('NEW', 0.5)],
        });
        expect(orders.map((order) => `${order.side} ${order.symbol} ${order.quantity}`)).toEqual(['sell OLD 500', 'buy NEW 247']);
        expect(skipped).toEqual([]);
    });

    it('clips a buy to the cash floor and skips the next one entirely', () => {
        // Cash 5 000, floor 1 % of 100 000 = 1 000 → 4 000 spendable → 40 shares for
        // AAPL (first by symbol), then nothing left for MSFT.
        const {orders, skipped} = plan({
            cash: 5_000,
            holdings: [held('GOOG', 950)],
            prices: priced({GOOG: 100, AAPL: 100, MSFT: 100}),
            targets: [target('AAPL', 0.1), target('MSFT', 0.1)],
        });
        expect(CASH_FLOOR).toBe(0.01);
        expect(orders).toEqual([{symbol: 'AAPL', side: 'buy', quantity: 40, kind: 'enter', reason: 'target AAPL'}]);
        expect(skipped).toEqual([{symbol: 'MSFT', reason: 'cash floor'}]);
    });

    it('keeps the last of duplicate targets and records the duplicate', () => {
        const {orders, skipped} = plan({
            targets: [target('AAPL', 0.5, 'first'), target('AAPL', 0.3, 'second')],
            prices: priced({AAPL: 100}),
        });
        // 30 000 / 101 = 297.03 → 297.
        expect(orders).toEqual([{symbol: 'AAPL', side: 'buy', quantity: 297, kind: 'enter', reason: 'second'}]);
        expect(skipped).toEqual([{symbol: 'AAPL', reason: 'duplicate target'}]);
    });

    it('emits exactly one order per symbol', () => {
        const {orders} = plan({
            cash: 50_000,
            holdings: [held('AAPL', 100), held('MSFT', 400)],
            prices: priced({AAPL: 100, MSFT: 100, NVDA: 100}),
            targets: [target('AAPL', 0.3), target('MSFT', 0.1), target('NVDA', 0.2), target('NVDA', 0.25)],
        });
        const symbols = orders.map((order) => order.symbol);
        expect(new Set(symbols).size).toBe(symbols.length);
        expect(symbols.sort()).toEqual(['AAPL', 'MSFT', 'NVDA']);
    });

    it('formats drift reasons with one decimal and an explicit sign', () => {
        const add = plan({
            cash: 90_000, holdings: [held('AAPL', 100)], prices: priced({AAPL: 100}),
            targets: [target('AAPL', 0.1273)],
        });
        expect(add.orders[0].reason).toBe('rebalance +2.7% drift toward 12.7% target');
        const trim = plan({
            cash: 90_000, holdings: [held('AAPL', 100)], prices: priced({AAPL: 100}),
            targets: [target('AAPL', 0.0637)],
        });
        expect(trim.orders[0].reason).toBe('rebalance -3.6% drift toward 6.4% target');
    });
});
