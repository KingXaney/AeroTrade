import {describe, expect, it} from 'vitest';
import {backtestWindow, coverageWindow} from '@/lib/culture/backtest-window';
import {CULTURE_BACKFILL_CALENDAR_DAYS} from '@/lib/culture/config';
import {addCalendarDays} from '@/lib/dates';

describe('the culture backtest windows', () => {
    it('pays income from the backfill depth through the day before launch', () => {
        expect(backtestWindow('2026-10-13')).toEqual({from: addCalendarDays('2026-10-13', -CULTURE_BACKFILL_CALENDAR_DAYS), through: '2026-10-12'});
    });

    it('vouches for dividends through the last session before launch, never a weekend or a holiday', () => {
        // A Monday launch: the calendar window ends on Sunday, the coverage window on Friday.
        expect(backtestWindow('2026-10-12').through).toBe('2026-10-11');
        expect(coverageWindow('2026-10-12').through).toBe('2026-10-09');
        // A Tuesday launch: both end on Monday.
        expect(coverageWindow('2026-10-13').through).toBe('2026-10-12');
        // The day after Labor Day 2026 (Monday 2026-09-07): the last session is the Friday before.
        expect(coverageWindow('2026-09-08').through).toBe('2026-09-04');
        expect(coverageWindow('2026-10-12').from).toBe(backtestWindow('2026-10-12').from);
    });
});
