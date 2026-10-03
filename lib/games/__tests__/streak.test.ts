// The daily-puzzle streak, derived from solved days alone: alive through yesterday until today
// ends, reset by a missed day, never moved by a month or year end or a DST change.

import {describe, expect, it} from 'vitest';
import {addCalendarDays} from '@/lib/dates';
import {STREAK_WEEKS, streakFrom} from '@/lib/games/streak';

const TODAY = '2026-10-07';
const back = (n: number) => addCalendarDays(TODAY, -n);
const days = (...offsets: number[]) => offsets.map(back);

describe('streakFrom', () => {
    it('is zero with nothing solved', () => {
        expect(streakFrom([], TODAY)).toMatchObject({current: 0, longest: 0, total: 0, todayDone: false, atRisk: false});
    });

    it('counts consecutive days ending today once today is solved', () => {
        expect(streakFrom(days(0, 1, 2), TODAY)).toMatchObject({current: 3, longest: 3, todayDone: true, atRisk: false});
    });

    it('keeps a streak alive through yesterday, at risk until today is solved', () => {
        expect(streakFrom(days(1, 2, 3), TODAY)).toMatchObject({current: 3, todayDone: false, atRisk: true});
    });

    it('resets after a missed day, keeping the longest', () => {
        expect(streakFrom(days(2, 3, 4, 5), TODAY)).toMatchObject({current: 0, longest: 4, atRisk: false});
        expect(streakFrom(days(0, 2, 3, 4), TODAY)).toMatchObject({current: 1, longest: 3, todayDone: true});
    });

    it('ignores repeats, future days and anything that is not a date', () => {
        const streak = streakFrom([back(0), back(0), back(1), addCalendarDays(TODAY, 1), '2026-13-01x', ''], TODAY);
        expect(streak).toMatchObject({current: 2, total: 2});
    });

    it('runs across a month end, a year end and a DST change', () => {
        expect(streakFrom(['2026-12-30', '2026-12-31', '2027-01-01'], '2027-01-01').current).toBe(3);
        expect(streakFrom(['2026-02-28', '2026-03-01'], '2026-03-01').current).toBe(2);
        expect(streakFrom(['2026-03-07', '2026-03-08', '2026-03-09'], '2026-03-09').current).toBe(3);
        expect(streakFrom(['2026-10-31', '2026-11-01', '2026-11-02'], '2026-11-02').current).toBe(3);
    });

    it('lays the last seven days out oldest first, today last', () => {
        const {week} = streakFrom(days(0, 3), TODAY);
        expect(week.map((d) => d.date)).toEqual(days(6, 5, 4, 3, 2, 1, 0));
        expect(week.map((d) => d.solved)).toEqual([false, false, false, true, false, false, true]);
        expect(week.filter((d) => d.today).map((d) => d.date)).toEqual([TODAY]);
    });

    it('fills whole weeks from Sunday, the last one holding today and its future days', () => {
        // 2026-10-07 is a Wednesday.
        const {weeks} = streakFrom(days(0, 10), TODAY);
        expect(weeks).toHaveLength(STREAK_WEEKS);
        expect(weeks.every((week) => week.length === 7)).toBe(true);
        const last = weeks[STREAK_WEEKS - 1];
        expect(last[0].date).toBe('2026-10-04');
        expect(last[3]).toMatchObject({date: TODAY, today: true, solved: true, future: false});
        expect(last.slice(4).every((d) => d.future && !d.solved)).toBe(true);
        expect(weeks.flat().filter((d) => d.solved).map((d) => d.date)).toEqual(days(10, 0));
        expect(weeks[0][0].date).toBe(addCalendarDays('2026-10-04', -7 * (STREAK_WEEKS - 1)));
    });
});
