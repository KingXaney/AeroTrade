import {describe, expect, it} from 'vitest';
import {parseTiingoDaily, TIINGO_PUBLISH_MINUTES, tiingoCutoff, tiingoPricesUrl} from '@/lib/prices/tiingo';
import {easternToInstant} from '@/lib/prices/market-hours';

// One row as Tiingo's end-of-day endpoint returns it: a midnight-UTC date label, unadjusted and
// adjusted prices, the cash dividend with its ex-date on the row and the split factor.
const row = (date: string, close: number, extra: Record<string, unknown> = {}) => ({
    date: `${date}T00:00:00.000Z`,
    close,
    open: close - 1,
    high: close + 1,
    low: close - 2,
    volume: 1_000,
    adjClose: close * 0.9,
    adjOpen: (close - 1) * 0.9,
    adjHigh: (close + 1) * 0.9,
    adjLow: (close - 2) * 0.9,
    adjVolume: 1_000,
    divCash: 0,
    splitFactor: 1,
    ...extra,
});

const at = (date: string, hh: number, mm: number): Date => new Date(easternToInstant(date, hh, mm));

describe('tiingoPricesUrl', () => {
    it('names the ticker lower-case, asks for daily bars from the date, and carries no token', () => {
        expect(tiingoPricesUrl('SPY', {from: '2024-01-01'}))
            .toBe('https://api.tiingo.com/tiingo/daily/spy/prices?startDate=2024-01-01&resampleFreq=daily');
        expect(tiingoPricesUrl('brk.b', {from: '2024-01-01', to: '2024-02-01'}, 'http://localhost:8787/'))
            .toBe('http://localhost:8787/tiingo/daily/brk.b/prices?startDate=2024-01-01&resampleFreq=daily&endDate=2024-02-01');
        expect(tiingoPricesUrl('SPY', {from: '2024-01-01'})).not.toMatch(/token/i);
    });
});

describe('parseTiingoDaily', () => {
    it('reads each row into a bar: the date label as the session, the dividend as the row states it', () => {
        const bars = parseTiingoDaily([
            row('2026-03-20', 500, {divCash: 1.73}),
            row('2026-03-19', 498),
        ], {excludeFrom: '2026-03-21'});
        expect(bars.map((bar) => bar.date)).toEqual(['2026-03-19', '2026-03-20']);
        expect(bars[1]).toEqual({date: '2026-03-20', close: 500, open: 499, high: 501, low: 498, volume: 1_000, adjClose: 450, dividend: 1.73});
        expect(bars[0].dividend).toBe(0);
    });

    it('never moves a date through a zone: midnight UTC is 8 pm Eastern the evening before', () => {
        expect(parseTiingoDaily([row('2026-01-02', 100)], {excludeFrom: '2026-01-03'})[0]?.date).toBe('2026-01-02');
    });

    it('leaves out the session the cutoff names and anything after it', () => {
        const bars = parseTiingoDaily([row('2026-03-19', 1), row('2026-03-20', 2), row('2026-03-23', 3)], {excludeFrom: '2026-03-20'});
        expect(bars.map((bar) => bar.date)).toEqual(['2026-03-19']);
    });

    it('treats the payload as untrusted: a bad shape is nothing, a bad row is skipped, a repeat keeps the later row', () => {
        expect(parseTiingoDaily({detail: 'Not found.'}, {excludeFrom: '2030-01-01'})).toEqual([]);
        expect(parseTiingoDaily('[]', {excludeFrom: '2030-01-01'})).toEqual([]);
        const bars = parseTiingoDaily([
            null,
            'row',
            {date: 42, close: 1},
            {date: 'yesterday', close: 1},
            row('2026-03-19', 0),
            row('2026-03-19', -5),
            {date: '2026-03-20T00:00:00.000Z', close: 10},
            {date: '2026-03-20T00:00:00.000Z', close: 11, divCash: -1, adjClose: 'n/a', volume: 'many'},
        ], {excludeFrom: '2030-01-01'});
        expect(bars).toEqual([{date: '2026-03-20', close: 11, dividend: 0}]);
    });
});

describe('tiingoCutoff', () => {
    it('keeps today out until Tiingo has published the close, then lets it in', () => {
        expect(TIINGO_PUBLISH_MINUTES).toBe(17 * 60 + 30);
        expect(tiingoCutoff(at('2026-10-06', 10, 0))).toBe('2026-10-06');
        expect(tiingoCutoff(at('2026-10-06', 17, 29))).toBe('2026-10-06');
        expect(tiingoCutoff(at('2026-10-06', 17, 30))).toBe('2026-10-07');
        expect(tiingoCutoff(at('2026-10-06', 23, 0))).toBe('2026-10-07');
    });

    it('on a weekend or a holiday nothing is pending, so every stored session is in', () => {
        expect(tiingoCutoff(at('2026-10-10', 10, 0))).toBe('2026-10-11');
        expect(tiingoCutoff(at('2026-12-25', 10, 0))).toBe('2026-12-26');
    });
});
