import {describe, expect, it} from 'vitest';
import {extendWithQuote, indexReturnPct, totalReturnIndex} from '@/lib/prices/total-return';
import {DIVIDEND_PAY_LAG_DAYS} from '@/lib/prices/config';
import type {Bar} from '@/lib/prices/signals';

const bars = (rows: [string, number, number?][]): Bar[] =>
    rows.map(([date, close, dividend]) => ({date, close, ...(dividend !== undefined ? {dividend} : {})}));

describe('totalReturnIndex', () => {
    it('is the price series when nothing is paid', () => {
        const index = totalReturnIndex(bars([['2026-09-14', 100], ['2026-09-15', 102], ['2026-09-16', 99]]));
        expect(index.map((p) => p.value)).toEqual([100, 102, 99]);
    });

    // Paid DIVIDEND_PAY_LAG_DAYS after the ex-date, credited at the next open: the first session
    // strictly after the pay date is where an account holding the fund sees the cash.
    it('reinvests a dividend on the first session after its pay date, not on the ex-date', () => {
        expect(DIVIDEND_PAY_LAG_DAYS).toBe(5);
        const index = totalReturnIndex(bars([
            ['2026-09-17', 100],
            ['2026-09-18', 98, 2],      // ex-date: price drops by the dividend
            ['2026-09-21', 98],
            ['2026-09-22', 98],
            ['2026-09-23', 98],         // pay date 09-23: cash lands at the next open
            ['2026-09-24', 98],
        ]));
        expect(index.map((p) => p.value)).toEqual([100, 98, 98, 98, 98, 100]);
    });

    it('does not pay a dividend whose pay date is past the last bar', () => {
        const index = totalReturnIndex(bars([['2026-09-17', 100], ['2026-09-18', 98, 2], ['2026-09-21', 98]]));
        expect(index.at(-1)?.value).toBe(98);
    });

    // Yahoo's adjclose reinvests at the ex-date close; this index reinvests on the pay date, the
    // way an account receives the cash. With the price flat in between the two agree exactly.
    it('matches the adjclose ratio when the price is flat between ex-date and pay date', () => {
        const closes: [string, number, number?][] = [['2026-06-01', 100], ['2026-06-02', 97, 3], ['2026-06-12', 97], ['2026-06-15', 101]];
        const index = totalReturnIndex(bars(closes));
        const adjRatio = 101 / (100 * (1 - 3 / 100));
        expect(index.at(-1)!.value / index[0].value).toBeCloseTo(adjRatio, 12);
    });
});

describe('extendWithQuote and indexReturnPct', () => {
    const index = [{date: '2026-09-23', value: 200}, {date: '2026-09-24', value: 210}];

    it('moves the last point by the live quote over the last close', () => {
        expect(extendWithQuote(index, 105, 107.1)).toBeCloseTo(214.2, 10);
        expect(extendWithQuote(index, 105, undefined)).toBe(210);
        expect(extendWithQuote([], 105, 107)).toBeNull();
    });

    it('reads the base on or after `from` and the end on or before `to`', () => {
        expect(indexReturnPct(index, '2026-09-22', '2026-09-25')).toBeCloseTo(5, 10);
        expect(indexReturnPct(index, '2026-09-25', '2026-09-26')).toBeNull();
    });
});
