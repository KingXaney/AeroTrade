import {describe, expect, it} from 'vitest';
import {buyNotesBySellId, matchLots, openLotNotes, type LedgerTrade} from '@/lib/trading/lots';

let clock = 0;
const trade = (id: string, side: 'buy' | 'sell', symbol: string, quantity: number, price: number, reason?: string, source: TradeSource = 'user'): LedgerTrade => ({
    id, side, symbol, quantity, price, source, createdAt: ++clock * 1000, ...(reason ? {reason} : {}),
});

describe('matchLots', () => {
    it('consumes the oldest buy first and splits a lot across sells', () => {
        const ledger = [
            trade('b1', 'buy', 'AAPL', 10, 100, 'earnings'),
            trade('b2', 'buy', 'AAPL', 5, 120, 'dip'),
            trade('s1', 'sell', 'AAPL', 12, 130),
            trade('s2', 'sell', 'AAPL', 2, 140),
        ];
        const {matches, open} = matchLots(ledger);
        expect(matches.s1).toEqual([
            {buyId: 'b1', symbol: 'AAPL', quantity: 10, price: 100, note: 'earnings', createdAt: 1000},
            {buyId: 'b2', symbol: 'AAPL', quantity: 2, price: 120, note: 'dip', createdAt: 2000},
        ]);
        expect(matches.s2).toEqual([{buyId: 'b2', symbol: 'AAPL', quantity: 2, price: 120, note: 'dip', createdAt: 2000}]);
        expect(open).toEqual([{buyId: 'b2', symbol: 'AAPL', quantity: 1, price: 120, note: 'dip', createdAt: 2000}]);
    });

    it('keeps symbols apart and sorts an out-of-order ledger by time', () => {
        const b = trade('b', 'buy', 'MSFT', 3, 300);
        const a = trade('a', 'buy', 'AAPL', 4, 100);
        const s = trade('s', 'sell', 'AAPL', 4, 110);
        const {matches, open} = matchLots([s, b, a]);
        expect(matches.s.map((lot) => lot.buyId)).toEqual(['a']);
        expect(open.map((lot) => [lot.symbol, lot.quantity])).toEqual([['MSFT', 3]]);
    });

    it('matches what it can when a sell outruns the recorded buys (history from before the ledger)', () => {
        const {matches, open} = matchLots([trade('b', 'buy', 'AAPL', 2, 100), trade('s', 'sell', 'AAPL', 5, 110)]);
        expect(matches.s).toEqual([expect.objectContaining({buyId: 'b', quantity: 2})]);
        expect(open).toEqual([]);
    });

    it('is empty for an empty ledger', () => {
        expect(matchLots([])).toEqual({matches: {}, open: []});
    });
});

describe('whose words a note is', () => {
    // An automated caller's reason ("enter: score 0.82") is the machine's, not the learner's:
    // it already shows on its own fill and must never read as "what you wrote when you bought".
    it('pairs only the learner\'s own notes, never an automated reason', () => {
        const ledger = [
            trade('b1', 'buy', 'AAPL', 2, 100, 'enter: score 0.82', 'ai-navigator'),
            trade('b2', 'buy', 'AAPL', 2, 100, 'rsi dip', 'strategy'),
            trade('b3', 'buy', 'AAPL', 2, 100, 'legacy row'),
            trade('s1', 'sell', 'AAPL', 3, 110),
        ];
        ledger[2] = {...ledger[2], source: undefined};
        expect(buyNotesBySellId(ledger)).toEqual({});
        expect(openLotNotes(ledger)).toEqual({});
        expect(matchLots(ledger).open.map((lot) => [lot.buyId, lot.quantity, lot.note])).toEqual([['b2', 1, undefined], ['b3', 2, undefined]]);
    });
});

describe('buyNotesBySellId', () => {
    it('lists each distinct note of the buys a sell closed, oldest first, and omits sells with none', () => {
        const ledger = [
            trade('b1', 'buy', 'AAPL', 1, 100, 'earnings'),
            trade('b2', 'buy', 'AAPL', 1, 100, 'earnings'),
            trade('b3', 'buy', 'AAPL', 1, 100),
            trade('b4', 'buy', 'AAPL', 1, 100, 'dip'),
            trade('s1', 'sell', 'AAPL', 4, 110),
            trade('b5', 'buy', 'MSFT', 1, 100),
            trade('s2', 'sell', 'MSFT', 1, 110),
        ];
        expect(buyNotesBySellId(ledger)).toEqual({s1: ['earnings', 'dip']});
    });
});

describe('openLotNotes', () => {
    it('groups the noted open lots by symbol, with their remaining shares', () => {
        const ledger = [
            trade('b1', 'buy', 'AAPL', 10, 100, 'earnings'),
            trade('b2', 'buy', 'AAPL', 5, 120),
            trade('b3', 'buy', 'NVDA', 2, 400, 'data centres'),
            trade('s1', 'sell', 'AAPL', 4, 130),
        ];
        expect(openLotNotes(ledger)).toEqual({
            AAPL: [{buyId: 'b1', symbol: 'AAPL', quantity: 6, price: 100, note: 'earnings', createdAt: expect.any(Number)}],
            NVDA: [{buyId: 'b3', symbol: 'NVDA', quantity: 2, price: 400, note: 'data centres', createdAt: expect.any(Number)}],
        });
    });

    it('drops a noted lot once it is sold in full', () => {
        const ledger = [trade('b1', 'buy', 'AAPL', 3, 100, 'earnings'), trade('s1', 'sell', 'AAPL', 3, 90)];
        expect(openLotNotes(ledger)).toEqual({});
    });
});
