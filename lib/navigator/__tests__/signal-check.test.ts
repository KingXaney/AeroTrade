import {describe, expect, it} from 'vitest';
import {measureNavigatorSignals, navigatorSignalTable, toSignalSymbols, type SignalSymbol, type SignalWeek} from '@/lib/navigator/signal-check';
import type {ScoringInput} from '@/lib/navigator/scoring';
import type {Bar} from '@/lib/prices/signals';
import {getEasternWeekKey} from '@/lib/dates';

// Fourteen Mondays of the Navigator's record, twelve names whose next week's return is what their
// slow news weight said it would be, and one the week could not buy that says the opposite.
const WEEKS = 14;
const NAMES = Array.from({length: 12}, (_, j) => `N${j}`);
const mondays = Array.from({length: WEEKS}, (_, k) => new Date(Date.UTC(2026, 6, 6 + 7 * k)).toISOString().slice(0, 10));
const lead = (j: number, k: number) => (((j * 5 + k * 7) % 12) - 5.5) / 10;

const barsFor = (move: (k: number) => number): Bar[] => {
    let price = 50;
    return mondays.map((date, k) => {
        const bar = {date, open: price, close: price};
        price *= 1 + move(k);
        return bar;
    });
};
const bars = new Map<string, Bar[]>([
    ...NAMES.map((name, j) => [name, barsFor((k) => 0.01 * lead(j, k))] as const),
    ['NEW', barsFor((k) => (k % 2 === 0 ? -0.3 : 0.3))],
]);

const symbol = (name: string, patch: Partial<SignalSymbol>): SignalSymbol => ({
    symbol: name, newsWeightSlow: 1, sentimentSlow: 0.1, r63: 0.02, r126: 0.05, r252: 0.1, sectorTilt: null, thesis: false, score: 0.2, eligible: true, ...patch,
});
// The week keys are lib/dates' own, as the job writes them.
const weekOf = (k: number): SignalWeek => ({
    weekKey: getEasternWeekKey(mondays[k]),
    date: mondays[k],
    symbols: [
        ...NAMES.map((name, j) => symbol(name, {newsWeightSlow: 10 + lead(j, k), score: -lead(j, k)})),
        symbol('NEW', {newsWeightSlow: k % 2 === 0 ? 99 : 0, eligible: false}),
    ],
});

const recorded: SignalWeek[] = mondays.map((_, k) => weekOf(k));

describe('measureNavigatorSignals', () => {
    const rows = measureNavigatorSignals({weeks: recorded, bars});
    const row = (signal: string, h: number) => rows.find((r) => r.signal === signal && r.horizonWeeks === h);

    it('finds the term that ranked next week exactly, and the score that ranked it backwards', () => {
        expect(row('newsSlow', 1)).toMatchObject({weeks: WEEKS - 1, meanIc: expect.closeTo(1, 12), positiveShare: 1});
        expect(row('score', 1)?.meanIc).toBeCloseTo(-1, 12);
    });

    it('leaves out the names the week could not buy, and terms that did not vary', () => {
        expect(row('newsSlow', 1)?.meanIc).toBeCloseTo(1, 12);
        for (const signal of ['sentimentSlow', 'momentumLong', 'sectorSlow', 'thesis']) expect(rows.some((r) => r.signal === signal)).toBe(false);
    });

    it('needs eight weeks with a return that far ahead', () => {
        expect(row('newsSlow', 4)?.weeks).toBe(WEEKS - 4);
        expect(row('newsSlow', 8)).toBeUndefined();
    });

    it('treats a week the job did not run as a gap, never as a shorter horizon', () => {
        const missing = recorded.filter((_, k) => k !== 5);
        const gapped = measureNavigatorSignals({weeks: missing, bars});
        // Weeks 4 and 5 lose their one-week figure; nothing else changes.
        expect(gapped.find((r) => r.signal === 'newsSlow' && r.horizonWeeks === 1)?.weeks).toBe(WEEKS - 1 - 2);
        expect(gapped.find((r) => r.signal === 'newsSlow' && r.horizonWeeks === 1)?.meanIc).toBeCloseTo(1, 12);
    });

    it('says nothing before any week has a return to measure', () => {
        expect(measureNavigatorSignals({weeks: recorded.slice(0, 1), bars})).toEqual([]);
        expect(measureNavigatorSignals({weeks: [], bars})).toEqual([]);
    });
});

describe('toSignalSymbols', () => {
    const input = (patch: Partial<ScoringInput>): ScoringInput => ({
        symbol: 'XLE', newsWeightSlow: 46.6, sentimentSlow: 0.3, signals: {r63: 0.05, r126: 0.22, r252: 0.1, vol63: 0.2, ma200dist: 0.1},
        sectorTilt: 0.4, sectorLabel: 'energy', hasActiveThesis: true, articleCount: 12, sourceCount: 4, barsCount: 300, alwaysEligible: true, ...patch,
    });

    it('keeps what the scorer read and what it gave, with no sentiment where the brain has no entity', () => {
        const [xle, spy] = toSignalSymbols(
            [input({}), input({symbol: 'SPY', newsWeightSlow: null, sentimentSlow: 0, sectorTilt: 0, sectorLabel: undefined, hasActiveThesis: false})],
            [{symbol: 'XLE', score: 0.69, eligible: true, reasons: []}, {symbol: 'SPY', score: 0.31, eligible: true, reasons: []}],
        );
        expect(xle).toEqual({symbol: 'XLE', newsWeightSlow: 46.6, sentimentSlow: 0.3, r63: 0.05, r126: 0.22, r252: 0.1, sectorTilt: 0.4, thesis: true, score: 0.69, eligible: true});
        expect(spy).toMatchObject({newsWeightSlow: null, sentimentSlow: null, sectorTilt: null, thesis: false, score: 0.31});
    });
});

describe('navigatorSignalTable', () => {
    it('puts the whole score first, then the terms in the order the scorer weighs them', () => {
        const ic = (signal: string, meanIc: number) => ({signal, horizonWeeks: 1, meanIc, tStat: 1, weeks: 9, positiveShare: 0.5});
        const table = navigatorSignalTable([ic('thesis', 0.2), ic('momentumLong', -0.05), ic('score', 0.01), ic('newsSlow', 0.09)]);
        expect(table?.rows.map((row) => row.id)).toEqual(['score', 'newsSlow', 'momentumLong', 'thesis']);
        expect(table?.rows[0]).toMatchObject({label: 'Navigator, whole score', strong: true});
        expect(navigatorSignalTable([])).toBeNull();
    });
});
