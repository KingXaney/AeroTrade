// The market-making game: dice and beliefs drawn from the seed, one informed trader a round, trades
// against a quote on the wrong side of a belief, the position limit, and the settlement.

import {describe, expect, it} from 'vitest';
import {
    MARKET_START,
    POSITION_LIMIT,
    ROUNDS,
    dealFor,
    fairValue,
    isValidQuote,
    playRound,
    pnlByKind,
    replayMarket,
    settlement,
    type Quote,
} from '@/lib/games/market-making';

const sumOf = (dice: readonly number[]) => dice.reduce((a, b) => a + b, 0);

describe('the deal', () => {
    it('replays from its seed: four dice, three traders a round, one of them informed to within one', () => {
        expect(dealFor(11)).toEqual(dealFor(11));
        for (let seed = 1; seed <= 200; seed++) {
            const deal = dealFor(seed);
            expect(deal.dice).toHaveLength(4);
            for (const die of deal.dice) expect(die >= 1 && die <= 6).toBe(true);
            expect(deal.beliefs).toHaveLength(ROUNDS);
            for (const traders of deal.beliefs) {
                expect(traders).toHaveLength(3);
                const informed = traders.filter((t) => t.kind === 'informed');
                expect(informed).toHaveLength(1);
                expect(Math.abs(informed[0].belief - sumOf(deal.dice))).toBeLessThanOrEqual(1);
            }
        }
    });

    it('values the sum at what is shown plus 3.5 a hidden die', () => {
        const dice = [6, 1, 3, 2];
        expect(fairValue(dice, 0)).toBe(14);
        expect(fairValue(dice, 1)).toBe(16.5);
        expect(fairValue(dice, 3)).toBe(13.5);
        expect(fairValue(dice, 4)).toBe(12);
    });
});

describe('adverse selection', () => {
    it('makes the informed trader\'s trades lose on average against a quote at the fair value', () => {
        let informed = 0;
        let trades = 0;
        for (let seed = 1; seed <= 400; seed++) {
            const deal = dealFor(seed);
            let state = MARKET_START;
            for (let round = 0; round < ROUNDS; round++) {
                const fair = Math.round(fairValue(deal.dice, round));
                state = playRound(state, deal, {bid: fair - 1, ask: fair + 1});
            }
            informed += pnlByKind(state, deal).informed;
            trades += state.trades.filter((t) => t.kind === 'informed').length;
        }
        expect(trades).toBeGreaterThan(100);
        expect(informed).toBeLessThan(0);
    });
});

describe('a round', () => {
    const deal = dealFor(5);
    const sum = sumOf(deal.dice);

    it('accepts whole-number quotes 1 to 4 apart', () => {
        expect(isValidQuote({bid: 12, ask: 13})).toBe(true);
        expect(isValidQuote({bid: 12, ask: 16})).toBe(true);
        for (const quote of [{bid: 12, ask: 12}, {bid: 12, ask: 17}, {bid: 12.5, ask: 14}, {bid: 14, ask: 12}]) expect(isValidQuote(quote)).toBe(false);
    });

    it('is never traded by the informed trader when the quote brackets the sum', () => {
        let state = MARKET_START;
        for (let round = 0; round < ROUNDS; round++) state = playRound(state, deal, {bid: sum - 2, ask: sum + 2});
        expect(state.trades.filter((t) => t.kind === 'informed')).toEqual([]);
        expect(state.done).toBe(true);
    });

    it('is traded by the informed trader when the whole quote sits off the sum', () => {
        const high = playRound(MARKET_START, deal, {bid: sum + 3, ask: sum + 4});
        const informedTrades = high.trades.filter((t) => t.kind === 'informed');
        expect(informedTrades).toEqual([expect.objectContaining({side: 'sold', price: sum + 3})]);
    });

    it('keeps cash and position, never past the limit', () => {
        let state = MARKET_START;
        // Asking far below every belief: everyone buys from you each round.
        for (let round = 0; round < ROUNDS; round++) state = playRound(state, deal, {bid: -5, ask: -4});
        expect(state.position).toBeGreaterThanOrEqual(-POSITION_LIMIT);
        expect(state.cash).toBe(state.trades.reduce((cash, t) => cash + (t.side === 'bought' ? t.price : -t.price), 0));
        expect(state.position).toBe(-state.trades.filter((t) => t.side === 'bought').length + state.trades.filter((t) => t.side === 'sold').length);
    });

    it('settles the position at the true sum', () => {
        const quotes: Quote[] = [{bid: 13, ask: 15}, {bid: 13, ask: 14}, {bid: 12, ask: 14}, {bid: 13, ask: 15}];
        let state = MARKET_START;
        for (const quote of quotes) state = playRound(state, deal, quote);
        expect(settlement(state, deal)).toBe(state.cash + state.position * sum);
        // The split by trader adds up to the whole.
        const split = pnlByKind(state, deal);
        expect(split.informed + split.noise).toBe(settlement(state, deal));
        expect(replayMarket(5, quotes)).toEqual({state, pnl: settlement(state, deal)});
    });
});
