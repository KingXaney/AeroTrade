import {describe, expect, it} from 'vitest';
import {affordableShares, checkOrder, presetQuantities} from '@/lib/trading/order-math';

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
