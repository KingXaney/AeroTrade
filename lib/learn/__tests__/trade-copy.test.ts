import {describe, expect, it} from 'vitest';
import {findBanned} from '@/lib/learn/banned';
import {orderEffectLine, queueLine} from '@/lib/learn/copy/trade';
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

    it('states a sell as shares left and the estimated realized result', () => {
        const effect = describeOrderEffect({side: 'sell', symbol: 'AAPL', quantity: 5, price: 200, cash: 96_200, positions});
        expect(orderEffectLine(effect!)).toBe('5 of 10 shares · 5 left · est. realized +$250 vs avg cost $150.00');
        const unpriced = describeOrderEffect({side: 'sell', symbol: 'AAPL', quantity: 5, price: null, cash: 96_200, positions});
        expect(orderEffectLine(unpriced!)).toBe('5 of 10 shares · 5 left');
    });

    it('never advises, whatever the size of the order', () => {
        for (const quantity of [1, 10, 100, 600]) {
            for (const side of ['buy', 'sell'] as const) {
                const effect = describeOrderEffect({side, symbol: 'AAPL', quantity, price: 150, cash: 96_200, positions});
                if (!effect) continue;
                expect(findBanned(orderEffectLine(effect), 'copy'), `${side} ${quantity}`).toEqual([]);
            }
        }
        expect(findBanned(queueLine('Mon 9:30 AM ET'), 'copy')).toEqual([]);
    });
});
