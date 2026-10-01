import {describe, expect, it} from 'vitest';
import {findBanned} from '@/lib/learn/banned';
import {ACCOUNT_COPY, orderEffectLine, queueLine} from '@/lib/learn/copy/trade';
import {describeOrderEffect} from '@/lib/trading/order-math';

const positions = [
    {symbol: 'AAPL', quantity: 10, marketValue: 1_800, avgCost: 150},
    {symbol: 'MSFT', quantity: 5, marketValue: 2_000, avgCost: 300},
];

describe('orderEffectLine', () => {
    it('states a buy as shares of the account, the largest position after, and the cash left', () => {
        const effect = describeOrderEffect({side: 'buy', symbol: 'AAPL', quantity: 10, price: 150, cash: 96_200, positions});
        expect(orderEffectLine(effect!)).toBe('1.5% of the account · largest position after: AAPL 3.3% · cash left $94,700 (95%)');
        expect(orderEffectLine(effect!, true)).toBe('1.5% of the account · largest position after: AAPL 3.3%');
    });

    it('adds what the cash left would earn in a month at the cash APY, after the cash left', () => {
        const effect = describeOrderEffect({side: 'buy', symbol: 'AAPL', quantity: 10, price: 150, cash: 96_200, positions, apy: 0.0392});
        expect(orderEffectLine(effect!)).toBe('1.5% of the account · largest position after: AAPL 3.3% · cash left $94,700 (95%) · earning ≈$300/month at 3.92% APY');
        // Under $10 a whole-dollar figure would read as nothing: cents instead.
        const small = describeOrderEffect({side: 'buy', symbol: 'AAPL', quantity: 10, price: 150, cash: 2_000, positions, apy: 0.0392});
        expect(orderEffectLine(small!).endsWith(' · cash left $500 (8.6%) · earning ≈$1.58/month at 3.92% APY')).toBe(true);
    });

    it('keeps the clause off the compact ticket, which already drops the cash left', () => {
        const effect = describeOrderEffect({side: 'buy', symbol: 'AAPL', quantity: 10, price: 150, cash: 96_200, positions, apy: 0.0392});
        expect(orderEffectLine(effect!, true)).toBe('1.5% of the account · largest position after: AAPL 3.3%');
    });

    it('omits the clause when no rate is known, and never prints 0% for it', () => {
        for (const apy of [undefined, null]) {
            const line = orderEffectLine(describeOrderEffect({side: 'buy', symbol: 'AAPL', quantity: 10, price: 150, cash: 96_200, positions, apy})!);
            expect(line).toBe('1.5% of the account · largest position after: AAPL 3.3% · cash left $94,700 (95%)');
            expect(line).not.toMatch(/APY|earning|0\.00%/);
        }
        // A rate that really is zero after the spread is stated as such.
        const zero = describeOrderEffect({side: 'buy', symbol: 'AAPL', quantity: 10, price: 150, cash: 96_200, positions, apy: 0});
        expect(orderEffectLine(zero!).endsWith(' · earning ≈$0.00/month at 0.00% APY')).toBe(true);
    });

    it('states a sell as shares left and the estimated realized result', () => {
        const effect = describeOrderEffect({side: 'sell', symbol: 'AAPL', quantity: 5, price: 200, cash: 96_200, positions});
        expect(orderEffectLine(effect!)).toBe('5 of 10 shares · 5 left · est. realized +$250 vs avg cost $150.00');
        const unpriced = describeOrderEffect({side: 'sell', symbol: 'AAPL', quantity: 5, price: null, cash: 96_200, positions});
        expect(orderEffectLine(unpriced!)).toBe('5 of 10 shares · 5 left');
    });

    it('never advises, whatever the size of the order', () => {
        for (const quantity of [1, 10, 100, 600]) {
            for (const side of ['buy', 'sell'] as const) {
                for (const apy of [null, 0, 0.0001, 0.0392, 0.055]) {
                    const effect = describeOrderEffect({side, symbol: 'AAPL', quantity, price: 150, cash: 96_200, positions, apy});
                    if (!effect) continue;
                    for (const compact of [false, true]) {
                        expect(findBanned(orderEffectLine(effect, compact), 'copy'), `${side} ${quantity} ${apy} ${compact}`).toEqual([]);
                    }
                }
            }
        }
        expect(findBanned(queueLine('Mon 9:30 AM ET'), 'copy')).toEqual([]);
        expect(findBanned(ACCOUNT_COPY.about, 'copy')).toEqual([]);
    });
});
