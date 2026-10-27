import {describe, expect, it} from 'vitest';
import {AGENT_WORLD_RAILS} from '@/lib/agent-world/config';
import {agentWorldOrders, orderRequest, ratingReason, targetsFromRatings, type Book} from '@/lib/agent-world/orders';

const cashOnly = (cash: number, prices: Record<string, number>): Book => ({totalValue: cash, cash, positions: [], priceBySymbol: prices});

describe('ratings into orders', () => {
    it('buys a fifth of an all-cash account in whole shares for a Buy, with the rating as the reason', () => {
        const {orders} = agentWorldOrders({book: cashOnly(100_000, {AAPL: 200}), ratings: {AAPL: 'Buy'}});
        expect(orders).toEqual([{symbol: 'AAPL', side: 'buy', quantity: 100, reason: 'rated Buy → target 20%', rating: 'Buy', targetWeight: 0.2, currentWeight: 0}]);
    });

    it('places nothing for a Hold or a REVIEW, and opens nothing on an Underweight or a Sell of a name not held', () => {
        const {orders} = agentWorldOrders({book: cashOnly(100_000, {AAPL: 200, MSFT: 400, NVDA: 100, AMZN: 150}), ratings: {AAPL: 'Hold', MSFT: 'REVIEW', NVDA: 'Underweight', AMZN: 'Sell'}});
        expect(orders).toEqual([]);
    });

    it('sells a whole holding on a Sell and trims one to its target on an Underweight', () => {
        const book: Book = {
            totalValue: 100_000,
            cash: 40_000,
            positions: [{symbol: 'AAPL', quantity: 150, avgCost: 180, price: 200}, {symbol: 'MSFT', quantity: 75, avgCost: 380, price: 400}],
            priceBySymbol: {AAPL: 200, MSFT: 400},
        };
        const {orders} = agentWorldOrders({book, ratings: {AAPL: 'Sell', MSFT: 'Underweight'}});
        expect(orders.map((o) => [o.symbol, o.side, o.quantity])).toEqual([['AAPL', 'sell', 150], ['MSFT', 'sell', 62]]);
        expect(orders[1].reason).toBe('rated Underweight → target 5%');
        expect(orders[1].currentWeight).toBeCloseTo(0.3);
    });

    it('caps each target at the rails and scales them down together to keep the cash floor', () => {
        const capped = targetsFromRatings({AAPL: 'Buy'}, cashOnly(100_000, {AAPL: 200}), {...AGENT_WORLD_RAILS, maxPositionWeight: 0.1});
        expect(capped.map((t) => t.weight)).toEqual([0.1]);
        const symbols = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I', 'J'];
        const all = targetsFromRatings(Object.fromEntries(symbols.map((s) => [s, 'Buy'])), cashOnly(100_000, Object.fromEntries(symbols.map((s) => [s, 50]))));
        expect(all.reduce((sum, t) => sum + t.weight, 0)).toBeCloseTo(1 - AGENT_WORLD_RAILS.minCashWeight);
        expect(all[0].reasons).toEqual(['rated Buy → target 9.5%']);
    });

    it('leaves a symbol with no price out, and a drift inside the band alone', () => {
        expect(agentWorldOrders({book: cashOnly(100_000, {}), ratings: {AAPL: 'Buy'}}).orders).toEqual([]);
        const book: Book = {totalValue: 100_000, cash: 81_000, positions: [{symbol: 'AAPL', quantity: 95, avgCost: 200, price: 200}], priceBySymbol: {AAPL: 200}};
        expect(agentWorldOrders({book, ratings: {AAPL: 'Buy'}}).orders).toEqual([]);
    });

    it('never opens a reason on the rating word itself', () => {
        expect(ratingReason('Sell', 0)).toBe('rated Sell → target 0%');
        expect(ratingReason('Overweight', 0.12)).toMatch(/^rated /);
    });
});

describe('the fill request', () => {
    it('fills once per session, side and symbol, keeping the cash floor on a buy', () => {
        const order = {symbol: 'AAPL', side: 'buy' as const, quantity: 100, reason: 'rated Buy → target 20%', rating: 'Buy' as const, targetWeight: 0.2, currentWeight: 0};
        expect(orderRequest('aw-2026-10-26', 'acc-1', order, 100_000)).toEqual({
            accountId: 'acc-1',
            symbol: 'AAPL',
            side: 'buy',
            quantity: 100,
            source: 'agent-world',
            reason: 'rated Buy → target 20%',
            idempotencyKey: 'agent-world:aw-2026-10-26:buy:AAPL',
            minCashAfter: 5000,
        });
        expect(orderRequest('aw-2026-10-26', 'acc-1', {...order, side: 'sell'}, 100_000)).not.toHaveProperty('minCashAfter');
    });
});
