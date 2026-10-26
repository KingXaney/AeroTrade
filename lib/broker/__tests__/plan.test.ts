// The mirror's plan: the source's weights laid over the Alpaca account's equity — exits whole,
// small differences left alone, sells first, buys within the cash, dollars where fractional,
// whole shares elsewhere, untradable symbols skipped and said.

import {describe, expect, it} from 'vitest';
import {MIRROR_DRIFT_BAND, MIRROR_MAX_ORDERS, MIRROR_MIN_ORDER_DOLLARS} from '@/lib/broker/config';
import {clientOrderId, planMirror, targetWeights, type MirrorAsset, type MirrorPosition} from '@/lib/broker/plan';

const asset = (patch: Partial<MirrorAsset> = {}): MirrorAsset => ({tradable: true, fractionable: true, ...patch});
const position = (symbol: string, qty: number, price: number): MirrorPosition => ({symbol, qty, price, marketValue: qty * price});

describe('targetWeights', () => {
    it('is each holding\'s share of the account\'s value, cash left as the remainder', () => {
        const weights = targetWeights({totalValue: 100_000, positions: [{symbol: 'nvda', marketValue: 30_000}, {symbol: 'XLK', marketValue: 20_000}, {symbol: 'ZERO', marketValue: 0}]});
        expect([...weights]).toEqual([['NVDA', 0.3], ['XLK', 0.2]]);
        expect(targetWeights({totalValue: 0, positions: [{symbol: 'A', marketValue: 5}]}).size).toBe(0);
    });
});

describe('planMirror', () => {
    const prices = new Map([['NVDA', 200], ['XLK', 100], ['BRK.B', 500], ['ADDYY', 120], ['OLD', 50]]);
    const assets = new Map([['NVDA', asset()], ['XLK', asset()], ['BRK.B', asset({fractionable: false})], ['ADDYY', asset({tradable: false})], ['OLD', asset()]]);

    it('buys the source\'s weights into an empty account, by dollars, within the cash buffer', () => {
        const plan = planMirror({targets: new Map([['NVDA', 0.3], ['XLK', 0.2]]), equity: 50_000, cash: 50_000, positions: [], assets, prices});
        expect(plan.orders).toEqual([
            {symbol: 'NVDA', side: 'buy', notional: 15_000, reason: 'enter'},
            {symbol: 'XLK', side: 'buy', notional: 10_000, reason: 'enter'},
        ]);
        expect(plan.skipped).toEqual([]);
    });

    it('sells a symbol the source no longer holds, whole, before any buy', () => {
        const plan = planMirror({targets: new Map([['NVDA', 0.5]]), equity: 10_000, cash: 0, positions: [position('OLD', 200, 50)], assets, prices});
        expect(plan.orders[0]).toEqual({symbol: 'OLD', side: 'sell', qty: 200, reason: 'exit'});
        expect(plan.orders[1]).toMatchObject({symbol: 'NVDA', side: 'buy', reason: 'enter'});
    });

    it('leaves a difference under the band or the dollar floor alone', () => {
        const equity = 100_000;
        const near = equity * 0.3 - equity * MIRROR_DRIFT_BAND / 2;
        const plan = planMirror({targets: new Map([['NVDA', 0.3]]), equity, cash: equity - near, positions: [position('NVDA', near / 200, 200)], assets, prices});
        expect(plan.orders).toEqual([]);
        const tiny = planMirror({targets: new Map([['XLK', (MIRROR_MIN_ORDER_DOLLARS - 1) / 1000]]), equity: 1000, cash: 1000, positions: [], assets, prices});
        expect(tiny.orders).toEqual([]);
    });

    it('trims an overweight holding by dollars, and tops up an underweight one', () => {
        const plan = planMirror({targets: new Map([['NVDA', 0.2], ['XLK', 0.4]]), equity: 100_000, cash: 30_000, positions: [position('NVDA', 250, 200), position('XLK', 200, 100)], assets, prices});
        expect(plan.orders).toEqual([
            {symbol: 'NVDA', side: 'sell', notional: 30_000, reason: 'trim'},
            {symbol: 'XLK', side: 'buy', notional: 20_000, reason: 'add'},
        ]);
    });

    it('trades a symbol that is not fractionable in whole shares, and skips one under a share', () => {
        const plan = planMirror({targets: new Map([['BRK.B', 0.1]]), equity: 12_000, cash: 12_000, positions: [], assets, prices});
        expect(plan.orders).toEqual([{symbol: 'BRK.B', side: 'buy', qty: 2, reason: 'enter'}]);
        const small = planMirror({targets: new Map([['BRK.B', 0.03]]), equity: 12_000, cash: 12_000, positions: [], assets, prices});
        expect(small.orders).toEqual([]);
        expect(small.skipped).toEqual([{symbol: 'BRK.B', reason: 'under-one-share'}]);
    });

    it('skips a symbol Alpaca cannot trade, or has no price or asset for, and says so', () => {
        const plan = planMirror({targets: new Map([['ADDYY', 0.1], ['MYSTERY', 0.1]]), equity: 10_000, cash: 10_000, positions: [], assets, prices});
        expect(plan.orders).toEqual([]);
        expect(plan.skipped).toEqual([{symbol: 'ADDYY', reason: 'not-tradable'}, {symbol: 'MYSTERY', reason: 'no-asset'}]);
    });

    it('scales the buys down to the cash the sells free, less the buffer', () => {
        const plan = planMirror({targets: new Map([['NVDA', 0.6], ['XLK', 0.6]]), equity: 10_000, cash: 10_000, positions: [], assets, prices});
        const spent = plan.orders.reduce((sum, o) => sum + (o.notional ?? 0), 0);
        expect(spent).toBeCloseTo(9_900, 6);
        expect(plan.orders.map((o) => o.notional)).toEqual([4_950, 4_950]);
    });

    it('sends at most the cap', () => {
        const symbols = Array.from({length: MIRROR_MAX_ORDERS + 5}, (_, i) => `S${i}`);
        const plan = planMirror({
            targets: new Map(symbols.map((s) => [s, 0.03])), equity: 1_000_000, cash: 1_000_000, positions: [],
            assets: new Map(symbols.map((s) => [s, asset()])), prices: new Map(symbols.map((s) => [s, 10])),
        });
        expect(plan.orders).toHaveLength(MIRROR_MAX_ORDERS);
        expect(plan.skipped.filter((s) => s.reason === 'over-cap')).toHaveLength(5);
    });

    it('rounds dollars to cents and never sends a zero', () => {
        const plan = planMirror({targets: new Map([['XLK', 1 / 3]]), equity: 10_000, cash: 10_000, positions: [], assets, prices});
        expect(plan.orders[0].notional).toBe(3333.33);
    });
});

describe('clientOrderId', () => {
    it('names the link, the day, the side and the symbol, within Alpaca\'s 128 characters', () => {
        const id = clientOrderId('6720f00ddeadbeef12345678', '2026-10-26', 'buy', 'BRK.B');
        expect(id).toBe('aero-12345678-2026-10-26-buy-BRK.B');
        expect(id.length).toBeLessThanOrEqual(128);
    });
});
