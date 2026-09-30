// Trading habits: measurements of the learner's own fills, lot by lot (FIFO via matchLots). Only
// fills the learner placed (source 'user') count; under three closed lots there is nothing to
// describe and computeHabits is null, never a row of zeros.

import {describe, expect, it} from 'vitest';
import {
    cadenceControls,
    closedLots,
    computeHabits,
    HABITS_MIN_CLOSED_LOTS,
    HAD_YOU_HELD_MAX_SYMBOLS,
    hadYouHeldSymbols,
    PACE_WINDOW_DAYS,
} from '@/lib/trading/habits';
import type {LedgerTrade} from '@/lib/trading/lots';
import {STRATEGIES} from '@/lib/strategies/catalog';

const DAY = 86_400_000;
// Noon ET on Monday Sep 28 2026 (16:00 UTC).
const NOW = Date.UTC(2026, 8, 28, 16);
let seq = 0;
const fill = (side: 'buy' | 'sell', symbol: string, quantity: number, price: number, daysAgo: number, source: TradeSource = 'user'): LedgerTrade =>
    ({id: `t${++seq}`, side, symbol, quantity, price, source, createdAt: NOW - daysAgo * DAY});

// Two winners closed (AAPL after 5 days, SPY after 1), one loser closed (MSFT after 10), an open
// winner (NVDA, priced above cost), an open loser (KO), an open lot with no quote (QALRN), and a
// strategy round trip that must not count.
const LEDGER: LedgerTrade[] = [
    fill('buy', 'AAPL', 10, 100, 20),
    fill('buy', 'MSFT', 10, 200, 18),
    fill('sell', 'AAPL', 10, 120, 15),
    fill('buy', 'SPY', 4, 500, 9),
    fill('sell', 'MSFT', 10, 180, 8),
    fill('sell', 'SPY', 4, 510, 8),
    fill('buy', 'NVDA', 5, 100, 6),
    fill('buy', 'KO', 20, 60, 5),
    fill('buy', 'QALRN', 3, 600, 1),
    fill('buy', 'XLK', 50, 200, 3, 'strategy'),
    fill('sell', 'XLK', 50, 150, 2, 'strategy'),
];
const PRICES = new Map([['NVDA', 130], ['KO', 55], ['AAPL', 150], ['MSFT', 190]]);
const base = {ledger: LEDGER, prices: PRICES, now: NOW, inceptionAt: NOW - 60 * DAY, startingBalance: 100_000};

describe('closedLots', () => {
    it('pairs each learner sell with the buys it closed, oldest first, and ignores automated fills', () => {
        const lots = closedLots(LEDGER);
        expect(lots.map((lot) => [lot.symbol, lot.quantity, lot.buyPrice, lot.sellPrice])).toEqual([
            ['AAPL', 10, 100, 120], ['MSFT', 10, 200, 180], ['SPY', 4, 500, 510],
        ]);
        expect(lots[0].soldAt - lots[0].boughtAt).toBe(5 * DAY);
    });
});

describe('computeHabits', () => {
    it('is null under three closed lots, however many fills there are', () => {
        expect(HABITS_MIN_CLOSED_LOTS).toBe(3);
        expect(computeHabits({...base, ledger: LEDGER.slice(0, 5)})).toBeNull();
        expect(computeHabits({...base, ledger: []})).toBeNull();
        // a strategy's closed lots never make up the count
        const strategyOnly = [fill('buy', 'A', 1, 1, 9, 'strategy'), fill('sell', 'A', 1, 2, 8, 'strategy'),
            fill('buy', 'B', 1, 1, 9, 'strategy'), fill('sell', 'B', 1, 2, 8, 'strategy'),
            fill('buy', 'C', 1, 1, 9, 'ai-navigator'), fill('sell', 'C', 1, 2, 8, 'ai-navigator')];
        expect(computeHabits({...base, ledger: strategyOnly})).toBeNull();
    });

    it('measures how long winners and losers were held, as medians in days', () => {
        const habits = computeHabits(base);
        expect(habits?.closedLots).toBe(3);
        // winners: AAPL 5 days, SPY 1 day → median 3; loser: MSFT 10 days
        expect(habits?.hold).toEqual({winnerDays: 3, loserDays: 10, winners: 2, losers: 1});
    });

    it('counts the share of winners and losers sold, open lots judged at the last quote and unpriced ones left out', () => {
        const habits = computeHabits(base);
        // winners: AAPL + SPY sold, NVDA open → 2 of 3; losers: MSFT sold, KO open → 1 of 2
        expect(habits?.sold).toEqual({winners: {sold: 2, total: 3}, losers: {sold: 1, total: 2}, unpricedOpen: 1});
        // without quotes every open lot is left out, and says so
        expect(computeHabits({...base, prices: new Map()})?.sold)
            .toEqual({winners: {sold: 2, total: 2}, losers: {sold: 1, total: 1}, unpricedOpen: 3});
    });

    it('counts the learner\'s fills and trading days over the last 30 days, and the sessions in that window', () => {
        const habits = computeHabits(base);
        // user fills within 30 days: all nine (the strategy's two are not the learner's)
        expect(habits?.pace).toMatchObject({fills: 9, windowDays: PACE_WINDOW_DAYS, full: true});
        expect(habits?.pace.days).toBe(8);
        expect(habits?.pace.sessions).toBeGreaterThanOrEqual(19);
        expect(habits?.pace.sessions).toBeLessThanOrEqual(22);
    });

    it('clips the window at the account\'s inception', () => {
        const habits = computeHabits({...base, inceptionAt: NOW - 12 * DAY});
        expect(habits?.pace).toMatchObject({windowDays: 12, full: false});
        expect(habits?.pace.fills).toBe(6);
    });

    it('states turnover as the dollars sold in the window against the starting balance, in cents', () => {
        const habits = computeHabits(base);
        // 1,200 + 1,800 + 2,040 = 5,040 sold
        expect(habits?.turnover).toEqual({soldCents: 504_000, startingCents: 10_000_000});
    });

    it('prices "had you held" from the last quotes of the most recently sold names only', () => {
        const habits = computeHabits(base);
        // SPY has no quote: AAPL 10 × 150 + MSFT 10 × 190 = 3,400 now vs 1,200 + 1,800 = 3,000 sold for
        expect(habits?.hadYouHeld).toEqual({soldForCents: 300_000, worthNowCents: 340_000, symbols: ['MSFT', 'AAPL'], capped: false});
        expect(computeHabits({...base, prices: new Map([['KO', 55]])})?.hadYouHeld).toBeNull();
    });
});

describe('hadYouHeldSymbols', () => {
    it('lists the names sold, newest sale first, capped so the quote reads stay bounded', () => {
        expect(hadYouHeldSymbols(LEDGER)).toEqual({symbols: ['SPY', 'MSFT', 'AAPL'], capped: false});
        const many: LedgerTrade[] = [];
        for (let i = 0; i < 8; i += 1) many.push(fill('buy', `S${i}`, 1, 10, 30 - i), fill('sell', `S${i}`, 1, 11, 20 - i));
        const {symbols, capped} = hadYouHeldSymbols(many);
        expect(symbols).toHaveLength(HAD_YOU_HELD_MAX_SYMBOLS);
        expect(symbols[0]).toBe('S7');
        expect(capped).toBe(true);
    });
});

describe('cadenceControls', () => {
    it('groups the catalog\'s rules by the cadences they actually trade on, fastest first', () => {
        const controls = cadenceControls(STRATEGIES);
        expect(controls.map((c) => c.cadence)).toEqual(['daily', 'monthly', 'quarterly', 'once']);
        expect(controls.reduce((sum, c) => sum + c.names.length, 0)).toBe(STRATEGIES.length);
        expect(controls.find((c) => c.cadence === 'once')?.names).toEqual(['Buy & Hold SPY']);
        expect(cadenceControls([{name: 'X', cadence: 'monthly'}]).map((c) => c.cadence)).toEqual(['monthly']);
    });
});
