import {describe, expect, it} from 'vitest';
import {replayReceipts} from '@/lib/trading/receipts';
import type {LedgerTrade} from '@/lib/trading/lots';

let clock = 0;
const trade = (id: string, side: 'buy' | 'sell', symbol: string, quantity: number, price: number, realizedPnl?: number): LedgerTrade => ({
    id, side, symbol, quantity, price, createdAt: ++clock * 1000, ...(realizedPnl !== undefined ? {realizedPnl} : {}),
});

describe('replayReceipts', () => {
    it('states each fill as a cash delta and the position before and after', () => {
        const receipts = replayReceipts([
            trade('b1', 'buy', 'AAPL', 10, 150),
            trade('b2', 'buy', 'AAPL', 10, 180),
            trade('s1', 'sell', 'AAPL', 5, 200),
            trade('s2', 'sell', 'AAPL', 15, 170),
        ]);
        expect(receipts.b1).toEqual({symbol: 'AAPL', side: 'buy', cashDelta: -1500, sharesBefore: 0, sharesAfter: 10, avgCostBefore: null, avgCostAfter: 150});
        expect(receipts.b2).toEqual({symbol: 'AAPL', side: 'buy', cashDelta: -1800, sharesBefore: 10, sharesAfter: 20, avgCostBefore: 150, avgCostAfter: 165});
        expect(receipts.s1).toEqual({symbol: 'AAPL', side: 'sell', cashDelta: 1000, sharesBefore: 20, sharesAfter: 15, avgCostBefore: 165, avgCostAfter: 165, realizedPnl: 175});
        expect(receipts.s2).toEqual({symbol: 'AAPL', side: 'sell', cashDelta: 2550, sharesBefore: 15, sharesAfter: 0, avgCostBefore: 165, avgCostAfter: null, realizedPnl: 75});
    });

    it('reproduces the realized P&L the live order path stored', () => {
        // executeOrder books (price - avgCost) * qty through applyFill, so the replay agrees.
        // Written out by hand on purpose: replayReceipts IS a fold of applyFill, so a fixture folded
        // through applyFill would hold it to itself and pass whatever the fill arithmetic did.
        const ledger = [trade('b1', 'buy', 'MSFT', 3, 301.17), trade('b2', 'buy', 'MSFT', 7, 288.4), trade('s1', 'sell', 'MSFT', 4, 310.05)];
        const stored = (310.05 - (3 * 301.17 + 7 * 288.4) / 10) * 4;
        expect(replayReceipts(ledger).s1.realizedPnl).toBeCloseTo(stored, 9);
    });

    it('is independent of cash: no buy is ever refused for want of it (cash moves with income the ledger cannot see)', () => {
        const receipts = replayReceipts([trade('b1', 'buy', 'NVDA', 1_000_000, 1_000)]);
        expect(receipts.b1.cashDelta).toBe(-1_000_000_000);
    });

    it('gives no receipt to a sell the ledger cannot back, and carries on after it', () => {
        const receipts = replayReceipts([
            trade('s0', 'sell', 'AAPL', 5, 100),
            trade('b1', 'buy', 'AAPL', 2, 100),
            trade('s1', 'sell', 'AAPL', 1, 110),
        ]);
        expect(receipts.s0).toBeUndefined();
        expect(receipts.s1).toMatchObject({sharesBefore: 2, sharesAfter: 1, realizedPnl: 10});
    });

    it('keeps symbols apart and replays in time order', () => {
        const b = trade('b', 'buy', 'MSFT', 2, 300);
        const a = trade('a', 'buy', 'AAPL', 1, 100);
        const receipts = replayReceipts([b, a].reverse());
        expect(receipts.a.sharesBefore).toBe(0);
        expect(receipts.b.sharesBefore).toBe(0);
    });

    it('is empty for an empty ledger', () => {
        expect(replayReceipts([])).toEqual({});
    });
});
