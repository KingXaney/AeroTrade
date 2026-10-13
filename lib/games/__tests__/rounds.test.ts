// A reported round: kept only when a person could have played it, filed under its settings key;
// a record is the reader's own top score; the sparkline draws the last rounds.

import {describe, expect, it} from 'vitest';
import {problemStream, ZETAMAC_DEFAULTS, type SprintSettings} from '@/lib/games/arithmetic';
import {cellOf} from '@/lib/games/arithmetic-cells';
import {replayKelly, type Bet} from '@/lib/games/kelly';
import {replayMarket} from '@/lib/games/market-making';
import {scattersFor} from '@/lib/games/correlation';
import {isNewRecord, keptRound, recordOf, sparkline} from '@/lib/games/rounds';

// A sprint as the page reports it: the seed's own problems counted per operation, one timing each.
const played = (seed: number, settings: SprintSettings, n: number, ms = 2000, slips = 0) => {
    const next = problemStream(seed, settings);
    const detail = {add: 0, subtract: 0, multiply: 0, divide: 0};
    for (let i = 0; i < n; i++) detail[next().op] += 1;
    return {game: 'arithmetic', settings, seed, score: n, wrong: n * slips, durationMs: settings.duration * 1000, detail,
        problems: Array.from({length: n}, () => ({ms, slips}))};
};
const SEED = 21;
const sprint = (over: Record<string, unknown> = {}) => ({...played(SEED, ZETAMAC_DEFAULTS, 40), ...over});

describe('keptRound', () => {
    it('keeps a sprint under its settings key, with what it says about the reader\'s kinds', () => {
        const report = sprint();
        const kept = keptRound(report);
        expect(kept).toMatchObject({game: 'arithmetic', key: 'zetamac', score: 40, wrong: 0, durationMs: 120_000, detail: report.detail});
        const skill = kept!.skill!;
        expect(Object.values(skill).reduce((sum, stat) => sum + (stat?.n ?? 0), 0)).toBe(40);
        expect(Object.values(skill).reduce((sum, stat) => sum + (stat?.ms ?? 0), 0)).toBe(80_000);
        expect(keptRound(played(SEED, {...ZETAMAC_DEFAULTS, duration: 60}, 20))?.key).toBe('ops=asmd;add=2-100x2-100;mul=2-12x2-100;t=60');
        // Slips travel as the round's wrong count and land on the kinds.
        const slipped = keptRound(played(SEED, ZETAMAC_DEFAULTS, 10, 3000, 1));
        expect(slipped).toMatchObject({wrong: 10});
        expect(Object.values(slipped!.skill!).reduce((sum, stat) => sum + (stat?.slips ?? 0), 0)).toBe(10);
    });

    it('refuses a sprint no one could play', () => {
        expect(keptRound(played(SEED, ZETAMAC_DEFAULTS, 481))).toBeNull();
        expect(keptRound(sprint({durationMs: 200_000}))).toBeNull();
        expect(keptRound(sprint({detail: {add: 1, subtract: 1, multiply: 1, divide: 1}}))).toBeNull();
        expect(keptRound(sprint({score: -1}))).toBeNull();
        expect(keptRound(sprint({score: 2.5}))).toBeNull();
        expect(keptRound(sprint({settings: {...ZETAMAC_DEFAULTS, duration: 45}}))).toBeNull();
        expect(keptRound({...sprint(), game: 'chess'})).toBeNull();
        expect(keptRound(null)).toBeNull();
    });

    it('refuses a sprint whose timings, slips or problems do not add up, or whose seed tells another story', () => {
        const report = sprint();
        expect(keptRound({...report, problems: report.problems.slice(1)})).toBeNull();
        expect(keptRound({...report, problems: report.problems.map(() => ({ms: 4000, slips: 0}))})).toBeNull();   // 160 s of answers in 120 s
        expect(keptRound({...report, problems: report.problems.map(() => ({ms: -1, slips: 0}))})).toBeNull();
        expect(keptRound({...report, wrong: 1})).toBeNull();                                                  // slips say 0
        const {add, subtract, ...rest} = report.detail;
        expect(keptRound({...report, detail: {...rest, add: subtract, subtract: add}})).toBeNull();           // the same total, another story
        expect(keptRound({...report, seed: SEED + 1})).toBeNull();
        expect(keptRound({...report, seed: undefined})).toBeNull();
        expect(keptRound({...report, problems: undefined})).toBeNull();
    });

    it('keeps a practice round under the key of its kinds, drawn from those kinds only', () => {
        const settings: SprintSettings = {cells: ['times-7', 'add-3d-carry'], duration: 60};
        const kept = keptRound(played(SEED, settings, 20));
        expect(kept).toMatchObject({key: 'practice:add-3d-carry,times-7;t=60', score: 20});
        expect(Object.keys(kept!.skill!).sort()).toEqual(['add-3d-carry', 'times-7']);
        const next = problemStream(SEED, settings);
        for (let i = 0; i < 50; i++) expect(['times-7', 'add-3d-carry']).toContain(cellOf(next()));
        expect(keptRound(played(SEED, {cells: ['times-7', 'times-7'], duration: 60} as SprintSettings, 5))?.key).toBe('practice:times-7;t=60');
        expect(keptRound({...played(SEED, settings, 5), settings: {cells: ['times-99'], duration: 60}})).toBeNull();
        expect(keptRound({...played(SEED, settings, 5), settings: {cells: [], duration: 60}})).toBeNull();
        expect(keptRound({...played(SEED, settings, 5), settings: {cells: ['times-1', 'times-2', 'times-3', 'times-4', 'times-5', 'times-6', 'times-7', 'times-8', 'times-9'], duration: 60}})).toBeNull();
        expect(keptRound({...played(SEED, settings, 5), settings: {cells: ['times-7'], duration: 45}})).toBeNull();
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
