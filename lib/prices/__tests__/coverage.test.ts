import {describe, expect, it} from 'vitest';
import {LISTING_COVERAGE_SLACK_DAYS, coversWindow, mergeCoverage} from '@/lib/prices/coverage';

describe('mergeCoverage', () => {
    it('adopts the first payload and ignores an empty one', () => {
        expect(mergeCoverage(null, {from: '2026-08-01', through: '2026-09-01'})).toEqual({from: '2026-08-01', through: '2026-09-01'});
        expect(mergeCoverage({from: '2026-08-01', through: '2026-09-01'}, null)).toEqual({from: '2026-08-01', through: '2026-09-01'});
    });

    it('joins overlapping ranges in either direction', () => {
        const stored = {from: '2021-09-28', through: '2026-09-10'};
        expect(mergeCoverage(stored, {from: '2026-08-26', through: '2026-09-24'})).toEqual({from: '2021-09-28', through: '2026-09-24'});
        expect(mergeCoverage({from: '2026-08-26', through: '2026-09-24'}, stored)).toEqual({from: '2021-09-28', through: '2026-09-24'});
    });

    // The dates in a hole were never parsed. Bridging it would claim zero dividends there.
    it('never bridges a gap: the older range is dropped', () => {
        expect(mergeCoverage({from: '2021-09-28', through: '2026-06-30'}, {from: '2026-08-26', through: '2026-09-24'}))
            .toEqual({from: '2026-08-26', through: '2026-09-24'});
    });
});

describe('coversWindow', () => {
    // The culture backtest's window: six years and a bit before a 2026-10-13 launch.
    const FROM = '2020-06-01';
    const THROUGH = '2026-10-09';

    it('needs the dividends vouched for over the whole window', () => {
        expect(coversWindow({from: '2016-11-01', through: '2026-10-09'}, null, FROM, THROUGH)).toBe(true);
        expect(coversWindow({from: '2016-11-01', through: '2026-10-08'}, null, FROM, THROUGH)).toBe(false);
        expect(coversWindow({from: '2020-06-02', through: '2026-10-09'}, null, FROM, THROUGH)).toBe(false);
        expect(coversWindow(null, null, FROM, THROUGH)).toBe(false);
    });

    // DoorDash listed on 2020-12-09: a payload from its first session vouches from its second,
    // and nothing could be paid on a share before it existed.
    it('needs them only from the listing for a company listed inside the window', () => {
        expect(coversWindow({from: '2020-12-10', through: THROUGH}, '2020-12-09', FROM, THROUGH)).toBe(true);
        // A missing early session still covers, inside the slack.
        expect(coversWindow({from: '2020-12-14', through: THROUGH}, '2020-12-09', FROM, THROUGH)).toBe(true);
        expect(LISTING_COVERAGE_SLACK_DAYS).toBe(7);
        // A payload that starts long after the listing does not.
        expect(coversWindow({from: '2023-01-03', through: THROUGH}, '2020-12-09', FROM, THROUGH)).toBe(false);
        // The listing never lowers the bar for a company listed before the window.
        expect(coversWindow({from: '2021-01-04', through: THROUGH}, '1996-05-09', FROM, THROUGH)).toBe(false);
    });

    it('still needs the window\'s end however recent the listing', () => {
        expect(coversWindow({from: '2025-06-13', through: '2026-09-30'}, '2025-06-12', FROM, THROUGH)).toBe(false);
    });
});
