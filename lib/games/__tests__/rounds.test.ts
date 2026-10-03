// A reported round: kept only when a person could have played it, filed under its settings key;
// a record is the reader's own top score; the sparkline draws the last rounds.

import {describe, expect, it} from 'vitest';
import {ZETAMAC_DEFAULTS} from '@/lib/games/arithmetic';
import {replayKelly, type Bet} from '@/lib/games/kelly';
import {replayMarket} from '@/lib/games/market-making';
import {scattersFor} from '@/lib/games/correlation';
import {isNewRecord, keptRound, recordOf, sparkline} from '@/lib/games/rounds';

const sprint = (over: Record<string, unknown> = {}) => ({
    game: 'arithmetic',
    settings: ZETAMAC_DEFAULTS,
    score: 40,
    wrong: 0,
    durationMs: 120_000,
    detail: {add: 10, subtract: 10, multiply: 10, divide: 10},
    ...over,
});

describe('keptRound', () => {
    it('keeps a sprint under its settings key', () => {
        expect(keptRound(sprint())).toEqual({game: 'arithmetic', key: 'zetamac', score: 40, wrong: 0, durationMs: 120_000,
            detail: {add: 10, subtract: 10, multiply: 10, divide: 10}});
        expect(keptRound(sprint({settings: {...ZETAMAC_DEFAULTS, duration: 60}, durationMs: 60_000}))?.key).toBe('ops=asmd;add=2-100x2-100;mul=2-12x2-100;t=60');
    });

    it('refuses a sprint no one could play', () => {
        expect(keptRound(sprint({score: 481, detail: {add: 481, subtract: 0, multiply: 0, divide: 0}}))).toBeNull();
        expect(keptRound(sprint({durationMs: 200_000}))).toBeNull();
        expect(keptRound(sprint({detail: {add: 1, subtract: 1, multiply: 1, divide: 1}}))).toBeNull();
        expect(keptRound(sprint({score: -1}))).toBeNull();
        expect(keptRound(sprint({score: 2.5}))).toBeNull();
        expect(keptRound(sprint({settings: {...ZETAMAC_DEFAULTS, duration: 45}}))).toBeNull();
        expect(keptRound({...sprint(), game: 'chess'})).toBeNull();
        expect(keptRound(null)).toBeNull();
    });

    it('keeps an interview round of at most eighty answers in eight minutes', () => {
        expect(keptRound({game: 'interview', score: 61, wrong: 9, durationMs: 480_000})).toMatchObject({key: 'interview', score: 61, wrong: 9});
        expect(keptRound({game: 'interview', score: 75, wrong: 10, durationMs: 400_000})).toBeNull();
        expect(keptRound({game: 'interview', score: 81, wrong: 0, durationMs: 400_000})).toBeNull();
        expect(keptRound({game: 'interview', score: 10, wrong: 0, durationMs: 600_000})).toBeNull();
    });
});

describe('a game the server replays', () => {
    it('scores a Kelly game from its seed and bets, whatever the report claims', () => {
        const bets: Bet[] = Array.from({length: 25}, () => ({side: 'heads', cents: 100}));
        const kept = keptRound({game: 'kelly', seed: 12, bets, durationMs: 60_000, score: 999_999});
        const replayed = replayKelly(12, bets);
        expect(kept).toMatchObject({key: 'kelly', score: replayed.bankroll});
        expect(kept?.detail.flips).toBe(25);
    });

    it('refuses a Kelly report whose bets the game would not have taken', () => {
        expect(keptRound({game: 'kelly', seed: 12, bets: [{side: 'heads', cents: 1_000_000}], durationMs: 1000})).toBeNull();
        expect(keptRound({game: 'kelly', seed: 12, bets: [], durationMs: 1000})).toBeNull();
        expect(keptRound({game: 'kelly', seed: -1, bets: [{side: 'heads', cents: 1}], durationMs: 1000})).toBeNull();
    });

    it('scores a market-making game at its settlement, and only a whole one', () => {
        const quotes = [{bid: 13, ask: 15}, {bid: 13, ask: 15}, {bid: 12, ask: 14}, {bid: 13, ask: 14}];
        expect(keptRound({game: 'market-making', seed: 3, quotes, durationMs: 90_000})).toMatchObject({key: 'market-making', score: replayMarket(3, quotes).pnl});
        expect(keptRound({game: 'market-making', seed: 3, quotes: quotes.slice(0, 3), durationMs: 90_000})).toBeNull();
        expect(keptRound({game: 'market-making', seed: 3, quotes: [{bid: 10, ask: 20}, ...quotes.slice(1)], durationMs: 90_000})).toBeNull();
    });

    it('scores Guess the correlation as the mean miss, lower being the record', () => {
        const truth = scattersFor(8).map((s) => Math.round(s.r * 100) / 100);
        const kept = keptRound({game: 'correlation', seed: 8, guesses: truth, durationMs: 50_000});
        expect(kept?.key).toBe('correlation');
        expect(kept?.score).toBeLessThanOrEqual(5);
        expect(keptRound({game: 'correlation', seed: 8, guesses: truth.slice(0, 9), durationMs: 50_000})).toBeNull();
        expect(recordOf('correlation', [80, 41, 120])).toBe(41);
        expect(isNewRecord('correlation', 40, 41)).toBe(true);
        expect(isNewRecord('correlation', 41, 41)).toBe(false);
    });
});

describe('records', () => {
    it('is the highest score, and none before the first round', () => {
        expect(recordOf('arithmetic', [])).toBeNull();
        expect(recordOf('arithmetic', [31, 48, 40])).toBe(48);
    });

    it('calls a score a new record only when it is higher', () => {
        expect(isNewRecord('arithmetic', 10, null)).toBe(true);
        expect(isNewRecord('arithmetic', 49, 48)).toBe(true);
        expect(isNewRecord('arithmetic', 48, 48)).toBe(false);
    });
});

describe('sparkline', () => {
    it('draws nothing for fewer than two rounds', () => {
        expect(sparkline([], 100, 20)).toBe('');
        expect(sparkline([5], 100, 20)).toBe('');
    });

    it('spans the box, oldest at the left and the highest at the top', () => {
        expect(sparkline([10, 20, 15], 100, 20)).toBe('0.0,20.0 50.0,0.0 100.0,10.0');
        expect(sparkline([7, 7], 10, 4)).toBe('0.0,4.0 10.0,4.0');
    });
});
