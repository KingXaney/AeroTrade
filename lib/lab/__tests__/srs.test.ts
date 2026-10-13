import {describe, expect, it} from 'vitest';
import {EASE_MAX, EASE_MIN, grade, INTERVAL_MAX_DAYS, isDue, newCardState, type CardState} from '@/lib/lab/srs';

const fresh = (): CardState => newCardState('2026-10-13');

describe('the review scheduler', () => {
    it('climbs the good ladder: 1, 6, 15, 38 days', () => {
        let s = grade(fresh(), 'good', '2026-10-13');
        expect(s).toEqual({ease: 2.5, intervalDays: 1, dueOn: '2026-10-14', reps: 1, lapses: 0});
        s = grade(s, 'good', '2026-10-14');
        expect([s.intervalDays, s.dueOn, s.reps]).toEqual([6, '2026-10-20', 2]);
        s = grade(s, 'good', '2026-10-20');
        expect([s.intervalDays, s.dueOn]).toEqual([15, '2026-11-04']);
        s = grade(s, 'good', '2026-11-04');
        expect([s.intervalDays, s.dueOn]).toEqual([38, '2026-12-12']);
    });

    it('lands easy later than good from the same state, and raises the ease', () => {
        const e = grade(fresh(), 'easy', '2026-10-13');
        expect([e.intervalDays, e.ease, e.dueOn]).toEqual([4, 2.65, '2026-10-17']);
        const base = grade(grade(fresh(), 'good', '2026-10-13'), 'good', '2026-10-14');
        expect(grade(base, 'easy', '2026-10-20').intervalDays).toBeGreaterThan(grade(base, 'good', '2026-10-20').intervalDays);
    });

    it('moves hard by a day at least and lowers the ease', () => {
        let s = grade(fresh(), 'hard', '2026-10-13');
        expect([s.intervalDays, s.ease]).toEqual([1, 2.35]);
        s = grade(s, 'hard', '2026-10-14');
        expect([s.intervalDays, s.ease, s.dueOn]).toEqual([2, 2.2, '2026-10-16']);
    });

    it('relearns on again: due today, reps reset, a lapse counted, ease down', () => {
        const mature: CardState = {ease: 2.5, intervalDays: 15, dueOn: '2026-10-12', reps: 3, lapses: 0};
        const again = grade(mature, 'again', '2026-10-12');
        expect(again).toEqual({ease: 2.3, intervalDays: 0, dueOn: '2026-10-12', reps: 0, lapses: 1});
        expect(isDue(again, '2026-10-12')).toBe(true);
        expect(grade(again, 'good', '2026-10-12').intervalDays).toBe(1);
    });

    it('keeps the ease and the interval inside their bounds, and never mutates its input', () => {
        const low: CardState = {ease: 1.4, intervalDays: 3, dueOn: '2026-10-12', reps: 2, lapses: 0};
        expect(grade(low, 'again', '2026-10-12').ease).toBe(EASE_MIN);
        expect(grade({...low, ease: 1.3}, 'hard', '2026-10-12').ease).toBe(EASE_MIN);
        expect(grade({...low, ease: 2.95}, 'easy', '2026-10-12').ease).toBe(EASE_MAX);
        const long: CardState = {ease: 3.0, intervalDays: 300, dueOn: '2026-10-12', reps: 9, lapses: 0};
        expect(grade(long, 'good', '2026-10-12').intervalDays).toBe(INTERVAL_MAX_DAYS);
        const before = {...long};
        grade(long, 'easy', '2026-10-12');
        expect(long).toEqual(before);
    });

    it('is a pure function of state, grade and day', () => {
        const s = fresh();
        expect(grade(s, 'good', '2026-10-31')).toEqual(grade(s, 'good', '2026-10-31'));
        expect(grade(s, 'good', '2026-10-31').dueOn).toBe('2026-11-01');
    });
});
