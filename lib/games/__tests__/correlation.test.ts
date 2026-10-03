// Guess the correlation: scatters that replay from their seed, Pearson's r as the truth, guesses on
// the slider's 0.01 steps, and a score that is the mean miss in thousandths.

import {describe, expect, it} from 'vitest';
import {
    CORRELATION_ROUNDS,
    POINTS,
    RHO_LIMIT,
    isValidGuess,
    replayCorrelation,
    sampleCorrelation,
    scattersFor,
    scoreGuesses,
} from '@/lib/games/correlation';

describe('sampleCorrelation', () => {
    it('is 1 for a line up, −1 for a line down, 0 for no spread', () => {
        expect(sampleCorrelation([{x: 1, y: 2}, {x: 2, y: 4}, {x: 3, y: 6}])).toBeCloseTo(1, 12);
        expect(sampleCorrelation([{x: 1, y: 3}, {x: 2, y: 2}, {x: 3, y: 1}])).toBeCloseTo(-1, 12);
        expect(sampleCorrelation([{x: 1, y: 5}, {x: 2, y: 5}, {x: 3, y: 5}])).toBe(0);
    });
});

describe('the scatters', () => {
    it('replay from their seed: ten of fifty points, the truth their own r', () => {
        expect(scattersFor(4)).toEqual(scattersFor(4));
        const scatters = scattersFor(4);
        expect(scatters).toHaveLength(CORRELATION_ROUNDS);
        for (const scatter of scatters) {
            expect(scatter.points).toHaveLength(POINTS);
            expect(Math.abs(scatter.rho)).toBeLessThanOrEqual(RHO_LIMIT);
            expect(scatter.r).toBeCloseTo(sampleCorrelation(scatter.points), 12);
        }
    });

    it('draw r near the ρ they were made from', () => {
        let total = 0;
        let n = 0;
        for (let seed = 1; seed <= 50; seed++) for (const s of scattersFor(seed)) {
            total += Math.abs(s.r - s.rho);
            n++;
        }
        expect(total / n).toBeLessThan(0.12);
    });
});

describe('guesses and the score', () => {
    it('takes the slider\'s steps from −1 to 1 only', () => {
        for (const guess of [-1, -0.37, 0, 0.5, 1]) expect(isValidGuess(guess)).toBe(true);
        for (const guess of [1.01, -1.2, 0.333, NaN, Infinity]) expect(isValidGuess(guess)).toBe(false);
    });

    it('scores the mean miss in thousandths, with the close guesses and the longest run of them', () => {
        const scatters = scattersFor(9);
        const exact = scatters.map((s) => Math.round(s.r * 100) / 100);
        const perfect = scoreGuesses(scatters, exact);
        expect(perfect.score).toBeLessThanOrEqual(5);
        expect(perfect).toMatchObject({close: 10, longestRun: 10});
        const missEveryOther = exact.map((g, i) => (i % 2 ? Math.max(-1, Math.min(1, Math.round((g + (g > 0 ? -0.5 : 0.5)) * 100) / 100)) : g));
        const mixed = scoreGuesses(scatters, missEveryOther);
        expect(mixed.close).toBe(5);
        expect(mixed.longestRun).toBe(1);
        expect(mixed.score).toBeGreaterThan(200);
    });

    it('replays a game only with ten valid guesses', () => {
        expect(replayCorrelation(9, Array(10).fill(0))).not.toBeNull();
        expect(replayCorrelation(9, Array(9).fill(0))).toBeNull();
        expect(replayCorrelation(9, [...Array(9).fill(0), 0.333])).toBeNull();
    });
});
