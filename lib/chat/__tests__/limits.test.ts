import {describe, expect, it} from 'vitest';
import {
    CHAT_GLOBAL_DAILY_LIMIT,
    CHAT_GLOBAL_KEY,
    CHAT_USER_DAILY_LIMIT,
    CHAT_USER_HOURLY_LIMIT,
    chatUserDayKey,
    chatUserHourKey,
    DAY_MS,
    HOUR_MS,
    resolveChatLimits,
} from '@/lib/chat/limits';

describe('resolveChatLimits', () => {
    it('uses the defaults when nothing is set', () => {
        const limits = resolveChatLimits({});
        expect(limits.userHour).toEqual({limit: CHAT_USER_HOURLY_LIMIT, windowMs: HOUR_MS});
        expect(limits.userDay).toEqual({limit: CHAT_USER_DAILY_LIMIT, windowMs: DAY_MS});
        expect(limits.global).toEqual({limit: CHAT_GLOBAL_DAILY_LIMIT, windowMs: DAY_MS});
        expect(limits.warning).toBeUndefined();
    });

    it('reads the environment overrides', () => {
        const limits = resolveChatLimits({CHAT_USER_HOURLY_LIMIT: '10', CHAT_USER_DAILY_LIMIT: '25', CHAT_GLOBAL_DAILY_LIMIT: '500'});
        expect(limits.userHour.limit).toBe(10);
        expect(limits.userDay.limit).toBe(25);
        expect(limits.global.limit).toBe(500);
    });

    it('falls back with a warning on a bad value', () => {
        for (const bad of ['0', '-1', 'abc', '1.5']) {
            const limits = resolveChatLimits({CHAT_GLOBAL_DAILY_LIMIT: bad});
            expect(limits.global.limit, bad).toBe(CHAT_GLOBAL_DAILY_LIMIT);
            expect(limits.warning, bad).toMatch(/CHAT_GLOBAL_DAILY_LIMIT/);
        }
    });

    it('keeps one user below the shared budget for the day', () => {
        // The real invariant: a single stuck client cannot lock everyone else out.
        expect(CHAT_USER_DAILY_LIMIT).toBeLessThan(CHAT_GLOBAL_DAILY_LIMIT);
        expect(CHAT_USER_HOURLY_LIMIT).toBeLessThanOrEqual(CHAT_USER_DAILY_LIMIT);
    });

    it('keys the user windows on the session id and the global window on nobody', () => {
        expect(chatUserHourKey('u1')).toBe('chat:u1');
        expect(chatUserDayKey('u1')).toBe('chat:u1:day');
        expect(CHAT_GLOBAL_KEY).not.toMatch(/u1/);
    });
});
