// The Kelly coin game: a 60% coin that replays from its seed, even-money bets in whole cents, the
// game's three ends, the fixed rules beside it, and the growth rate that peaks at the Kelly fraction.

import {describe, expect, it} from 'vitest';
import {
    CAP_CENTS,
    KELLY_FRACTION,
    KELLY_START,
    MAX_FLIPS,
    START_CENTS,
    fixedFractionPath,
    flipsFor,
    isValidBet,
    logGrowth,
    playFlip,
    replayKelly,
    type Bet,
} from '@/lib/games/kelly';

describe('the coin', () => {
    it('replays from its seed and lands heads about 60% of the time', () => {
        expect(flipsFor(7)).toEqual(flipsFor(7));
        expect(flipsFor(7)).not.toEqual(flipsFor(8));
        let heads = 0;
        for (let seed = 1; seed <= 200; seed++) heads += flipsFor(seed).filter(Boolean).length;
        expect(heads / (200 * MAX_FLIPS)).toBeGreaterThan(0.59);
        expect(heads / (200 * MAX_FLIPS)).toBeLessThan(0.61);
    });
});

describe('a flip', () => {
    it('pays even money on the side bet', () => {
        expect(playFlip(KELLY_START, {side: 'heads', cents: 500}, true).bankroll).toBe(3000);
        expect(playFlip(KELLY_START, {side: 'heads', cents: 500}, false).bankroll).toBe(2000);
        expect(playFlip(KELLY_START, {side: 'tails', cents: 500}, false).bankroll).toBe(3000);
    });

    it('refuses a bet of nothing, of more than is left, of part of a cent, or after the end', () => {
        for (const cents of [0, -1, START_CENTS + 1, 1.5]) expect(isValidBet(KELLY_START, {side: 'heads', cents})).toBe(false);
        const bust = playFlip(KELLY_START, {side: 'heads', cents: START_CENTS}, false);
        expect(bust).toMatchObject({bankroll: 0, ended: 'bust'});
        expect(playFlip(bust, {side: 'heads', cents: 1}, true)).toBe(bust);
    });

    it('stops at the cap, and after the last flip', () => {
        const near = {...KELLY_START, bankroll: CAP_CENTS - 100};
        expect(playFlip(near, {side: 'heads', cents: 5000}, true)).toMatchObject({bankroll: CAP_CENTS, ended: 'cap'});
        const last = {...KELLY_START, flips: MAX_FLIPS - 1};
        expect(playFlip(last, {side: 'heads', cents: 1}, true).ended).toBe('flips');
    });
});

describe('a replayed game', () => {
    it('is the flips played one by one, and stops at a bet the game would refuse', () => {
        const flips = flipsFor(3);
        const bets: Bet[] = Array.from({length: 40}, (_, i) => ({side: i % 3 ? 'heads' : 'tails', cents: 100}));
        let state = KELLY_START;
        for (const [i, bet] of bets.entries()) state = playFlip(state, bet, flips[i]);
        expect(replayKelly(3, bets)).toEqual(state);
        expect(replayKelly(3, [{side: 'heads', cents: 100}, {side: 'heads', cents: 10_000_000}]).flips).toBe(1);
    });
});

describe('the fixed rules beside the game', () => {
    it('never pass the cap; everything on heads reaches it in four heads or is gone at the first tails', () => {
        for (let seed = 1; seed <= 40; seed++) {
            const flips = flipsFor(seed);
            expect(Math.max(...fixedFractionPath(flips, KELLY_FRACTION, MAX_FLIPS))).toBeLessThanOrEqual(CAP_CENTS);
            // $25 doubled four times is past $250.
            const allIn = fixedFractionPath(flips, 1, MAX_FLIPS);
            expect(allIn.at(-1)).toBe(flips.slice(0, 4).every(Boolean) ? CAP_CENTS : 0);
        }
    });
});

describe('logGrowth', () => {
    it('is zero for no bet, highest at the Kelly fraction, and −∞ for everything at once', () => {
        expect(logGrowth(0)).toBe(0);
        expect(logGrowth(1)).toBe(-Infinity);
        expect(KELLY_FRACTION).toBeCloseTo(0.2, 12);
        let best = 0;
        for (let f = 0; f < 1; f += 0.001) if (logGrowth(f) > logGrowth(best)) best = f;
        expect(best).toBeCloseTo(KELLY_FRACTION, 2);
        expect(logGrowth(KELLY_FRACTION)).toBeCloseTo(0.0201, 4);
        expect(logGrowth(KELLY_FRACTION / 2)).toBeGreaterThan(logGrowth(0.4));
    });
});
