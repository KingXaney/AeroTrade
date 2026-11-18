// The weekly Navigator run: which run is the retry, and what its stamp says.

import {describe, expect, it} from 'vitest';
import {easternToInstant} from '@/lib/prices/market-hours';
import {describeWeeklyRun, isRetryRun, type WeeklyRun} from '@/lib/navigator/weekly';

const run = (over: Partial<WeeklyRun>): WeeklyRun => ({enrolled: 1, traded: 1, orders: 3, heldBack: [], failed: [], open: true, ...over});

describe('isRetryRun', () => {
    const monday = easternToInstant('2026-11-16', 10, 0);
    const tuesday = easternToInstant('2026-11-17', 10, 0);

    it('is the scheduled Tuesday run, never Monday\'s', () => {
        expect(isRetryRun('inngest/scheduled.timer', tuesday)).toBe(true);
        expect(isRetryRun('inngest/scheduled.timer', monday)).toBe(false);
    });

    it('is never a run fired by hand', () => {
        expect(isRetryRun('app/run.ai.navigator', tuesday)).toBe(false);
        expect(isRetryRun(undefined, tuesday)).toBe(false);
    });
});

describe('describeWeeklyRun', () => {
    it('reads as before when everyone traded', () => {
        expect(describeWeeklyRun(run({}))).toBe('Navigator ran for 1/1 user(s), 3 order(s) executed');
    });

    it('says the market was closed and nothing was claimed', () => {
        expect(describeWeeklyRun(run({open: false, traded: 0, orders: 0})))
            .toBe('Market closed: week scored, no orders sent; 1 enrolment(s) wait for the next open run');
    });

    it('names the quotes that held an enrolment back', () => {
        expect(describeWeeklyRun(run({traded: 0, orders: 0, heldBack: [{userId: 'u1', symbols: ['XLK', 'NVDA']}]})))
            .toBe('Navigator ran for 0/1 user(s), 0 order(s) executed; 1 held back, no quote for NVDA, XLK: the week\'s claim was given back');
    });

    it('names a run that threw instead of counting it as done', () => {
        expect(describeWeeklyRun(run({enrolled: 2, failed: ['user-abcdef123456']})))
            .toBe('Navigator ran for 1/2 user(s), 3 order(s) executed; 1 failed: 123456');
    });
});
