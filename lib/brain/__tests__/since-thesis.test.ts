// "since thesis: NVDA +4.1% · SPY +6.0%": which theses get a line (tickers only, the ten
// heaviest), the thesis instant read as an ET date, and both legs measured over the same
// sessions — or no line at all when either leg cannot be.

import {describe, expect, it} from 'vitest';
import {
    SINCE_THESIS_MAX,
    earliestSince,
    sinceThesisBySymbol,
    sinceThesisLegs,
    sinceThesisTargets,
    type ThesisRef,
} from '@/lib/brain/since-thesis';
import {totalReturnIndex, type IndexPoint} from '@/lib/prices/total-return';
import type {Bar} from '@/lib/prices/signals';

const thesis = (key: string, weightSlow: number, since: string | null, type: ThesisRef['type'] = 'ticker'): ThesisRef =>
    ({key, type, weightSlow, thesisSince: since === null ? null : Date.parse(since)});

const points = (rows: [string, number][]): IndexPoint[] => rows.map(([date, value]) => ({date, value}));

describe('sinceThesisTargets', () => {
    it('keeps ticker theses only, the heaviest first, at most ten', () => {
        const theses = [
            thesis('sector:technology', 50, '2026-09-01T11:30:00Z', 'sector'),
            thesis('theme:ai-capex', 40, '2026-09-01T11:30:00Z', 'theme'),
            thesis('LOW', 1, '2026-09-01T11:30:00Z'),
            thesis('NONE', 30, null),
            ...Array.from({length: 11}, (_, i) => thesis(`T${i}`, 20 - i, '2026-09-02T11:30:00Z')),
        ];
        const targets = sinceThesisTargets(theses);
        expect(targets).toHaveLength(SINCE_THESIS_MAX);
        expect(targets.map((t) => t.symbol)).toEqual(['T0', 'T1', 'T2', 'T3', 'T4', 'T5', 'T6', 'T7', 'T8', 'T9']);
    });

    it('reads the thesis instant as the ET date it fell on', () => {
        const [morning, lateNight] = sinceThesisTargets([
            thesis('NVDA', 10, '2026-09-08T11:30:00Z'),     // 07:30 ET, the brain's run
            thesis('AMD', 9, '2026-09-08T02:00:00Z'),       // 22:00 ET the evening before
        ]);
        expect(morning).toEqual({symbol: 'NVDA', since: '2026-09-08'});
        expect(lateNight).toEqual({symbol: 'AMD', since: '2026-09-07'});
        expect(earliestSince([morning, lateNight])).toBe('2026-09-07');
        expect(earliestSince([])).toBeNull();
    });
});

describe('sinceThesisLegs', () => {
    const spy = points([['2026-09-04', 100], ['2026-09-08', 101], ['2026-09-09', 102], ['2026-09-10', 107.06]]);

    it('measures both legs from the first close on or after the thesis date to the last close both have', () => {
        const nvda = points([['2026-09-08', 50], ['2026-09-09', 51], ['2026-09-10', 52.05], ['2026-09-11', 60]]);
        expect(sinceThesisLegs('2026-09-06', nvda, spy)).toEqual({
            from: '2026-09-08', to: '2026-09-10', symbolPct: expect.closeTo(4.1, 6), spyPct: expect.closeTo(6, 6),
        });
    });

    it('hides the line when a leg is missing or has not moved a session', () => {
        const nvda = points([['2026-09-08', 50], ['2026-09-09', 51]]);
        expect(sinceThesisLegs('2026-09-11', nvda, spy)).toBeNull();                  // no close since the thesis
        expect(sinceThesisLegs('2026-09-09', nvda, spy)).toBeNull();                  // one session only
        expect(sinceThesisLegs('2026-09-08', [], spy)).toBeNull();                    // no bars for the name
        expect(sinceThesisLegs('2026-09-08', nvda, [])).toBeNull();                   // no SPY
        expect(sinceThesisLegs('2026-09-08', nvda, points([['2026-09-09', 1], ['2026-09-10', 2]]))).toBeNull();   // SPY misses the base session
        expect(sinceThesisLegs('2026-09-08', points([['2026-09-08', 0], ['2026-09-09', 51]]), spy)).toBeNull();   // an unusable close
    });
});

describe('sinceThesisBySymbol', () => {
    it('keys a line per thesis that has both legs, reinvesting stored dividends on the name too', () => {
        const bars = (rows: [string, number, number?][]): Bar[] => rows.map(([date, close, dividend]) => ({date, close, ...(dividend ? {dividend} : {})}));
        const spyIndex = points([['2026-09-08', 100], ['2026-09-09', 100], ['2026-09-10', 106]]);
        const bySymbol = new Map<string, Bar[]>([
            ['NVDA', bars([['2026-09-08', 100], ['2026-09-09', 102], ['2026-09-10', 104.1]])],
            ['AMD', bars([['2026-09-10', 80]])],
        ]);
        const result = sinceThesisBySymbol([{symbol: 'NVDA', since: '2026-09-08'}, {symbol: 'AMD', since: '2026-09-08'}, {symbol: 'XYZ', since: '2026-09-08'}], bySymbol, spyIndex);
        expect(Object.keys(result)).toEqual(['NVDA']);
        expect(result.NVDA.symbolPct).toBeCloseTo(4.1, 6);
        expect(result.NVDA.spyPct).toBeCloseTo(6, 6);
        expect(totalReturnIndex(bySymbol.get('NVDA') ?? [])).toHaveLength(3);
    });
});
