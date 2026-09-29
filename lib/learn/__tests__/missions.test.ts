import {describe, expect, it} from 'vitest';
import {findBanned} from '@/lib/learn/banned';
import {daysBetween, type OnboardingFacts} from '@/lib/learn/facts';
import {MISSION_COPY, MISSIONS_FOOTER} from '@/lib/learn/copy/missions';
import {deriveMissions, missionsComplete, onboardingActive, ONBOARDING_MAX_DAYS} from '@/lib/learn/missions';

const fresh: OnboardingFacts = {
    today: '2026-09-27',
    accountCreatedOn: '2026-09-27',
    hasUserTrade: false,
    followedStrategies: [],
    topicOpened: false,
    hasWatchlist: false,
    navigatorEnrolled: false,
    missionsDismissedAt: null,
};

const complete: OnboardingFacts = {
    ...fresh,
    hasUserTrade: true,
    followedStrategies: ['buy-and-hold-spy'],
    topicOpened: true,
    hasWatchlist: true,
    navigatorEnrolled: true,
};

describe('MISSION_COPY', () => {
    it('is five missions with unique ids and in-app links', () => {
        expect(MISSION_COPY).toHaveLength(5);
        expect(new Set(MISSION_COPY.map((m) => m.id)).size).toBe(5);
        for (const mission of MISSION_COPY) {
            expect(mission.href).toMatch(/^\/[a-z?=A-Z]*$/);
            expect(mission.lesson.length).toBeGreaterThanOrEqual(2);
            expect(mission.lesson.length).toBeLessThanOrEqual(4);
        }
    });

    it('describes and never advises, and names no stock but the benchmark fund', () => {
        for (const mission of MISSION_COPY) {
            const text = [mission.title, ...mission.lesson].join(' ');
            expect(findBanned(text, 'copy'), mission.id).toEqual([]);
            const tickers = text.match(/\b[A-Z]{3,5}\b/g) ?? [];
            expect(tickers.filter((t) => !['SPY', 'RSI', 'ETF'].includes(t)), mission.id).toEqual([]);
        }
        expect(findBanned(MISSIONS_FOOTER(2, 5), 'copy')).toEqual([]);
    });

    it('quotes the Navigator rails from the config, not from memory', () => {
        const navigator = MISSION_COPY.find((m) => m.id === 'enrol-navigator')!;
        expect(navigator.lesson.join(' ')).toMatch(/20% of the account/);
        expect(navigator.lesson.join(' ')).toMatch(/10% in cash/);
        expect(navigator.lesson.join(' ')).toMatch(/25% below/);
    });
});

describe('deriveMissions', () => {
    it('flips each mission on exactly its own fact, in copy order', () => {
        expect(deriveMissions(fresh).map((m) => m.done)).toEqual([false, false, false, false, false]);
        expect(deriveMissions({...fresh, hasUserTrade: true}).map((m) => m.done)).toEqual([true, false, false, false, false]);
        expect(deriveMissions({...fresh, followedStrategies: ['golden-cross']}).map((m) => m.done)).toEqual([false, true, false, false, false]);
        expect(deriveMissions({...fresh, topicOpened: true}).map((m) => m.done)).toEqual([false, false, true, false, false]);
        expect(deriveMissions({...fresh, hasWatchlist: true}).map((m) => m.done)).toEqual([false, false, false, true, false]);
        expect(deriveMissions({...fresh, navigatorEnrolled: true}).map((m) => m.done)).toEqual([false, false, false, false, true]);
        expect(deriveMissions(fresh).map((m) => m.id)).toEqual(MISSION_COPY.map((m) => m.id));
    });

    it('is complete only when all five are done', () => {
        expect(missionsComplete(fresh)).toBe(false);
        expect(missionsComplete({...complete, navigatorEnrolled: false})).toBe(false);
        expect(missionsComplete(complete)).toBe(true);
    });
});

describe('onboardingActive', () => {
    it('shows the checklist to a new account with missions left', () => {
        expect(onboardingActive(fresh)).toBe(true);
        expect(onboardingActive({...fresh, accountCreatedOn: null})).toBe(true);
    });

    it('hides it once dismissed, once complete, or after the first month', () => {
        expect(onboardingActive({...fresh, missionsDismissedAt: '2026-09-27T10:00:00.000Z'})).toBe(false);
        expect(onboardingActive(complete)).toBe(false);
        expect(onboardingActive({...fresh, accountCreatedOn: '2026-08-01'})).toBe(false);
        expect(onboardingActive({...fresh, accountCreatedOn: '2026-08-28'}, '2026-09-27')).toBe(true);
        expect(ONBOARDING_MAX_DAYS).toBe(30);
    });
});

describe('daysBetween', () => {
    it('counts calendar days across a month boundary', () => {
        expect(daysBetween('2026-08-28', '2026-09-27')).toBe(30);
        expect(daysBetween('2026-09-27', '2026-09-27')).toBe(0);
        expect(daysBetween('2026-09-28', '2026-09-27')).toBe(-1);
    });
});
