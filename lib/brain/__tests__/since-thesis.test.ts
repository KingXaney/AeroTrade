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
import {totalReturnIndex} from '@/lib/prices/total-return';
import type {Bar} from '@/lib/prices/signals';

const thesis = (key: string, weightSlow: number, since: string | null, type: ThesisRef['type'] = 'ticker'): ThesisRef =>
    ({key, type, weightSlow, thesisSince: since === null ? null : Date.parse(since)});

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

const bars = (rows: [string, number, number?][]): Bar[] => rows.map(([date, close, dividend]) => ({date, close, ...(dividend ? {dividend} : {})}));

describe('sinceThesisLegs', () => {
    const spy = bars([['2026-09-04', 100], ['2026-09-08', 101], ['2026-09-09', 102], ['2026-09-10', 107.06]]);

    it('measures both legs from the first close on or after the thesis date to the last close both have', () => {
        const nvda = bars([['2026-09-08', 50], ['2026-09-09', 51], ['2026-09-10', 52.05], ['2026-09-11', 60]]);
        expect(sinceThesisLegs('2026-09-06', nvda, spy)).toEqual({
            from: '2026-09-08', to: '2026-09-10', symbolPct: expect.closeTo(4.1, 6), spyPct: expect.closeTo(6, 6),
        });
    });

    it('hides the line when a leg is missing or has not moved a session', () => {
        const nvda = bars([['2026-09-08', 50], ['2026-09-09', 51]]);
        expect(sinceThesisLegs('2026-09-11', nvda, spy)).toBeNull();                  // no close since the thesis
        expect(sinceThesisLegs('2026-09-09', nvda, spy)).toBeNull();                  // one session only
        expect(sinceThesisLegs('2026-09-08', [], spy)).toBeNull();                    // no bars for the name
        expect(sinceThesisLegs('2026-09-08', nvda, [])).toBeNull();                   // no SPY
        expect(sinceThesisLegs('2026-09-08', nvda, bars([['2026-09-09', 1], ['2026-09-10', 2]]))).toBeNull();   // SPY misses the base session
        expect(sinceThesisLegs('2026-09-08', bars([['2026-09-08', 0], ['2026-09-09', 51]]), spy)).toBeNull();   // an unusable close
    });

    it('hides the line rather than end the two legs on different closes', () => {
        // The name has Sep 8, 9 and 11; SPY ends on Sep 10. The last close both have would be the
        // name's Sep 9 against SPY's Sep 10: two different ends, so no line rather than a mismatched one.
        const gappy = bars([['2026-09-08', 50], ['2026-09-09', 51], ['2026-09-11', 60]]);
        expect(sinceThesisLegs('2026-09-08', gappy, spy)).toBeNull();
        // With SPY's Sep 11 stored as well, both legs end there.
        const spyThrough11 = bars([['2026-09-04', 100], ['2026-09-08', 101], ['2026-09-09', 102], ['2026-09-10', 107.06], ['2026-09-11', 103.02]]);
        expect(sinceThesisLegs('2026-09-08', gappy, spyThrough11)).toEqual({
            from: '2026-09-08', to: '2026-09-11', symbolPct: expect.closeTo(20, 6), spyPct: expect.closeTo(2, 6),
        });
    });

    it('pays each leg only the dividends a holder from the base close is owed', () => {
        // Flat closes every session from Sep 1; the thesis close is Wed Sep 16.
        const flat = (exDates: Record<string, number>): Bar[] => {
            const out: Bar[] = [];
            for (let t = Date.parse('2026-09-01T12:00:00Z'); t <= Date.parse('2026-09-30T12:00:00Z'); t += 86_400_000) {
                const date = new Date(t).toISOString().slice(0, 10);
                if ([0, 6].includes(new Date(t).getUTCDay())) continue;
                out.push({date, close: 100, ...(exDates[date] ? {dividend: exDates[date]} : {})});
            }
            return out;
        };
        // An ex-date before the base (paid after it) or on the base day itself: the seller's.
        const early = sinceThesisLegs('2026-09-16', flat({'2026-09-15': 1, '2026-09-16': 2}), flat({'2026-09-15': 1, '2026-09-16': 2}));
        expect(early).toMatchObject({from: '2026-09-16', to: '2026-09-30', symbolPct: 0, spyPct: 0});
        // An ex-date after the base, paid by the last close: both legs are paid it, on the same footing.
        const paid = sinceThesisLegs('2026-09-16', flat({'2026-09-17': 1}), flat({'2026-09-17': 1}));
        expect(paid?.symbolPct).toBeCloseTo(1, 9);
        expect(paid?.spyPct).toBeCloseTo(1, 9);
    });
});

describe('sinceThesisBySymbol', () => {
    it('keys a line per thesis that has both legs, and none for one missing a leg', () => {
        const spyBars = bars([['2026-09-08', 100], ['2026-09-09', 100], ['2026-09-10', 106]]);
        const bySymbol = new Map<string, Bar[]>([
            ['NVDA', bars([['2026-09-08', 100], ['2026-09-09', 102], ['2026-09-10', 104.1]])],
            ['AMD', bars([['2026-09-10', 80]])],
        ]);
        const result = sinceThesisBySymbol([{symbol: 'NVDA', since: '2026-09-08'}, {symbol: 'AMD', since: '2026-09-08'}, {symbol: 'XYZ', since: '2026-09-08'}], bySymbol, spyBars);
        expect(Object.keys(result)).toEqual(['NVDA']);
        expect(result.NVDA.symbolPct).toBeCloseTo(4.1, 6);
        expect(result.NVDA.spyPct).toBeCloseTo(6, 6);
        expect(totalReturnIndex(bySymbol.get('NVDA') ?? [])).toHaveLength(3);
    });

    it('measures each thesis from its own date, whatever the others\' dates', () => {
        // SPY goes ex $1 on Sep 15 (paid Sep 20): owed to a holder from the Sep 14 close, not
        // to one from Sep 16's — so the two theses' SPY legs differ though SPY never moved.
        const flat: Bar[] = [];
        for (let t = Date.parse('2026-09-14T12:00:00Z'); t <= Date.parse('2026-09-29T12:00:00Z'); t += 86_400_000) {
            const date = new Date(t).toISOString().slice(0, 10);
            if (![0, 6].includes(new Date(t).getUTCDay())) flat.push({date, close: 100, ...(date === '2026-09-15' ? {dividend: 1} : {})});
        }
        const bySymbol = new Map([['AAA', flat.map(({date}) => ({date, close: 50}))], ['BBB', flat.map(({date}) => ({date, close: 50}))]]);
        const result = sinceThesisBySymbol([{symbol: 'AAA', since: '2026-09-14'}, {symbol: 'BBB', since: '2026-09-16'}], bySymbol, flat);
        expect(result.AAA.spyPct).toBeCloseTo(1, 9);
        expect(result.BBB.spyPct).toBe(0);
    });
});
