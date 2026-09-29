import {describe, expect, it} from 'vitest';
import {affordableShares, checkOrder, describeOrderEffect, estRealizedPnl, presetQuantities, sanitizeTradeNote} from '@/lib/trading/order-math';
import {TRADE_REASON_MAX} from '@/lib/strategies/config';

const positions = [
    {symbol: 'AAPL', quantity: 10, marketValue: 1_800, avgCost: 150},
    {symbol: 'MSFT', quantity: 5, marketValue: 2_000, avgCost: 300},
];

describe('describeOrderEffect', () => {
    it('sizes a buy against the whole account and names the largest position after it', () => {
        const effect = describeOrderEffect({side: 'buy', symbol: 'aapl', quantity: 10, price: 150, cash: 96_200, positions});
        expect(effect).toEqual({side: 'buy', estTotal: 1_500, shareOfAccount: 0.015, largestAfter: {symbol: 'AAPL', weight: 0.033}, cashAfter: 94_700, cashAfterWeight: 0.947});
    });

    it('reports a new symbol that becomes the largest position', () => {
        const effect = describeOrderEffect({side: 'buy', symbol: 'NVDA', quantity: 40, price: 100, cash: 96_200, positions});
        expect(effect?.side === 'buy' && effect.largestAfter).toEqual({symbol: 'NVDA', weight: 0.04});
    });

    it('has nothing to say about a buy with no price', () => {
        expect(describeOrderEffect({side: 'buy', symbol: 'AAPL', quantity: 10, price: null, cash: 96_200, positions})).toBeNull();
        expect(describeOrderEffect({side: 'buy', symbol: 'AAPL', quantity: 0, price: 150, cash: 96_200, positions})).toBeNull();
    });

    it('describes a sell by shares left and the estimated realized result, price or no price', () => {
        expect(describeOrderEffect({side: 'sell', symbol: 'AAPL', quantity: 5, price: 200, cash: 0, positions}))
            .toEqual({side: 'sell', quantity: 5, owned: 10, sharesAfter: 5, avgCost: 150, estRealizedPnl: 250});
        expect(describeOrderEffect({side: 'sell', symbol: 'AAPL', quantity: 5, price: null, cash: 0, positions}))
            .toEqual({side: 'sell', quantity: 5, owned: 10, sharesAfter: 5, avgCost: 150, estRealizedPnl: null});
        expect(describeOrderEffect({side: 'sell', symbol: 'AAPL', quantity: 50, price: 200, cash: 0, positions})?.side === 'sell').toBe(true);
        expect(describeOrderEffect({side: 'sell', symbol: 'ZZZ', quantity: 5, price: 200, cash: 0, positions})).toBeNull();
    });
});

describe('estRealizedPnl', () => {
    it('is (price − average cost) × shares, or unknown without a price', () => {
        expect(estRealizedPnl(200, 180, 5)).toBe(100);
        expect(estRealizedPnl(150, 180, 2)).toBe(-60);
        expect(estRealizedPnl(null, 180, 5)).toBeNull();
        expect(estRealizedPnl(200, undefined, 5)).toBeNull();
    });
});

describe('affordableShares', () => {
    it('is whole shares at the price, or null when the price is unknown', () => {
        expect(affordableShares(1000, 150)).toBe(6);
        expect(affordableShares(1000, null)).toBeNull();
        expect(affordableShares(1000, 0)).toBeNull();
        expect(affordableShares(0, 150)).toBeNull();
    });
});

describe('presetQuantities', () => {
    it('sell presets are fractions of what is owned, never below one share', () => {
        expect(presetQuantities('sell', {cash: 0, price: null, owned: 10})).toEqual([
            {label: '25%', value: 2}, {label: '50%', value: 5}, {label: '75%', value: 7}, {label: 'Max', value: 10},
        ]);
        expect(presetQuantities('sell', {cash: 0, price: null, owned: 1})?.map((p) => p.value)).toEqual([1, 1, 1, 1]);
    });

    it('sell presets need a position', () => {
        expect(presetQuantities('sell', {cash: 5000, price: 10, owned: 0})).toBeNull();
    });

    it('buy presets are fractions of what the cash affords', () => {
        expect(presetQuantities('buy', {cash: 1000, price: 100, owned: 0})).toEqual([
            {label: '25%', value: 2}, {label: '50%', value: 5}, {label: '75%', value: 7}, {label: 'Max', value: 10},
        ]);
    });

    it('buy presets need a price and at least one affordable share', () => {
        expect(presetQuantities('buy', {cash: 1000, price: null, owned: 0})).toBeNull();
        expect(presetQuantities('buy', {cash: 50, price: 100, owned: 0})).toBeNull();
    });
});

describe('checkOrder', () => {
    const base = {price: 100, cash: 1000, owned: 5};

    it('rejects a non-positive or fractional quantity', () => {
        expect(checkOrder({side: 'buy', quantity: 0, ...base}).ok).toBe(false);
        expect(checkOrder({side: 'buy', quantity: 0.5, ...base}).message).toBe('Enter a whole number of shares');
        expect(checkOrder({side: 'buy', quantity: Number.NaN, ...base}).ok).toBe(false);
    });

    it('estimates cost at the last price', () => {
        expect(checkOrder({side: 'buy', quantity: 3, ...base})).toEqual({ok: true, message: null, estTotal: 300});
    });

    it('flags a buy that clearly exceeds buying power', () => {
        const c = checkOrder({side: 'buy', quantity: 11, ...base});
        expect(c.ok).toBe(false);
        expect(c.message).toBe('Not enough buying power — need $1100.00, have $1000.00');
        expect(c.estTotal).toBe(1100);
    });

    it('never blocks a buy because the price is unknown', () => {
        // executeOrder re-checks with the live quote; the harness has no quote provider.
        expect(checkOrder({side: 'buy', quantity: 1_000_000, ...base, price: null})).toEqual({ok: true, message: null, estTotal: null});
    });

    it('flags a sell of more than is owned, and a sell of nothing owned', () => {
        expect(checkOrder({side: 'sell', quantity: 6, ...base}).message).toBe('You only own 5 shares');
        expect(checkOrder({side: 'sell', ...base, owned: 1, quantity: 2}).message).toBe('You only own 1 share');
        expect(checkOrder({side: 'sell', quantity: 1, ...base, owned: 0}).ok).toBe(false);
    });

    it('a sell within the position is fine even with no price', () => {
        expect(checkOrder({side: 'sell', quantity: 5, ...base, price: null})).toEqual({ok: true, message: null, estTotal: null});
    });
});

describe('sanitizeTradeNote', () => {
    it('trims, collapses whitespace and strips control characters', () => {
        expect(sanitizeTradeNote('  earnings\n\n  beat\t\u0000 guidance \u0007 ')).toBe('earnings beat guidance');
    });

    it('clips to TRADE_REASON_MAX characters', () => {
        const note = sanitizeTradeNote('x'.repeat(250));
        expect(note).toHaveLength(TRADE_REASON_MAX);
    });

    it('never cuts an emoji in half at the limit (a lone surrogate is not valid text to store)', () => {
        const note = sanitizeTradeNote('a' + '\u{1F4C8}'.repeat(150));
        expect(note).toBeDefined();
        expect((note ?? '').length).toBeLessThanOrEqual(TRADE_REASON_MAX);
        expect(note).toMatch(/^a(\u{1F4C8})+$/u);
    });

    it('returns undefined for anything that is not a non-blank string', () => {
        for (const input of [undefined, null, 42, {}, ['a'], '', '   ', '\n\t']) {
            expect(sanitizeTradeNote(input), String(input)).toBeUndefined();
        }
    });

    it('leaves markup as text: rendering escapes it, the note is never parsed', () => {
        expect(sanitizeTradeNote('earnings <b>beat</b>')).toBe('earnings <b>beat</b>');
    });
});
