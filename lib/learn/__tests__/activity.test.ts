// The days a reader did something on their Learn list, as one set: every source joins, a day
// counts once however many sources name it, and anything that is not an ET day label is dropped.

import {describe, expect, it} from 'vitest';
import {activityDays} from '@/lib/learn/activity';
import {streakFrom} from '@/lib/games/streak';

describe('activityDays', () => {
    it('joins the four sources, once per day, sorted', () => {
        const days = activityDays({
            sessionDays: ['2026-10-13', '2026-10-15'],
            solvedDays: ['2026-10-15', '2026-10-14'],
            roundDays: ['2026-10-12', '2026-10-13'],
            tickedDays: ['2026-10-11'],
        });
        expect(days).toEqual(['2026-10-11', '2026-10-12', '2026-10-13', '2026-10-14', '2026-10-15']);
    });

    it('drops what is not a day label', () => {
        expect(activityDays({sessionDays: ['nope', ''], solvedDays: ['2026-10-15T00:00:00Z'], roundDays: ['2026-10-15'], tickedDays: []})).toEqual(['2026-10-15']);
    });

    it('feeds the streak: a round on a day with no puzzle keeps the run alive', () => {
        const days = activityDays({sessionDays: [], solvedDays: ['2026-10-13', '2026-10-15'], roundDays: ['2026-10-14'], tickedDays: []});
        expect(streakFrom(days, '2026-10-15')).toMatchObject({current: 3, todayDone: true});
    });
});
