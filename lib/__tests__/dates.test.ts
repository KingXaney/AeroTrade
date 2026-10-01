import {describe, expect, it} from 'vitest';
import {addCalendarDays, eachCalendarDay, getEasternDateString, getEasternWeekKey} from '@/lib/dates';

describe('addCalendarDays', () => {
    it('moves a date label by whole days across month and year ends', () => {
        expect(addCalendarDays('2026-09-29', -30)).toBe('2026-08-30');
        expect(addCalendarDays('2026-12-31', 1)).toBe('2027-01-01');
        expect(addCalendarDays('2026-03-01', -1)).toBe('2026-02-28');
        expect(addCalendarDays('2024-03-01', -1)).toBe('2024-02-29');
    });

    it('is not moved by a DST change', () => {
        expect(addCalendarDays('2026-03-07', 1)).toBe('2026-03-08');
        expect(addCalendarDays('2026-11-01', 1)).toBe('2026-11-02');
    });
});

describe('eachCalendarDay', () => {
    it('lists every day inclusive, and nothing when from is after to', () => {
        expect(eachCalendarDay('2026-02-27', '2026-03-02')).toEqual(['2026-02-27', '2026-02-28', '2026-03-01', '2026-03-02']);
        expect(eachCalendarDay('2026-03-02', '2026-03-01')).toEqual([]);
    });
});

describe('getEasternDateString', () => {
    it('names the Eastern day, not the UTC one', () => {
        expect(getEasternDateString(new Date('2026-07-01T03:30:00Z'))).toBe('2026-06-30');
        expect(getEasternDateString(new Date('2026-07-01T04:30:00Z'))).toBe('2026-07-01');
    });
});

describe('getEasternWeekKey', () => {
    it('keys every day of a week on its Monday', () => {
        expect(getEasternWeekKey('2026-09-28')).toBe('2026-09-28');
        expect(getEasternWeekKey('2026-10-01')).toBe('2026-09-28');
        expect(getEasternWeekKey('2026-10-04')).toBe('2026-09-28');
    });
});
