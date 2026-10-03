import {describe, expect, it} from 'vitest';
import {
    REFRESH_COOLDOWN_MS,
    UNSEEN_COUNT_CAP,
    UNSEEN_WINDOW_HOURS,
    UNSEEN_WINDOW_SECONDS,
    refreshCooldownMessage,
    refreshCooldownRemainingMs,
    refreshCooldownUntil,
    unseenFloor,
} from '@/lib/topics/config';

const NOW = 1_800_000_000_000;
const NOW_S = NOW / 1000;
const HOUR_MS = 60 * 60 * 1000;

// A topic never opened used to count every stored article, up to the TTL — "thousands unread" on
// the rail. The count now starts at the later of the reader's last look and the window's start.
describe('unseenFloor', () => {
    it('counts back a day, the daily email\'s window, to at most 99+', () => {
        expect(UNSEEN_WINDOW_HOURS).toBe(24);
        expect(UNSEEN_WINDOW_SECONDS).toBe(24 * 60 * 60);
        expect(UNSEEN_COUNT_CAP).toBe(99);
    });

    it('starts at the window when the topic was never opened', () => {
        expect(unseenFloor(null, NOW_S)).toBe(NOW_S - UNSEEN_WINDOW_SECONDS);
    });

    it('starts at a recent look, in whole seconds', () => {
        expect(unseenFloor(NOW - HOUR_MS, NOW_S)).toBe(Math.floor((NOW - HOUR_MS) / 1000));
        expect(unseenFloor(NOW - HOUR_MS + 500, NOW_S)).toBe(Math.floor((NOW - HOUR_MS) / 1000));
    });

    it('lets the window win over an old look', () => {
        expect(unseenFloor(NOW - 3 * 24 * HOUR_MS, NOW_S)).toBe(NOW_S - UNSEEN_WINDOW_SECONDS);
    });

    it('never counts from before a look, even one stamped ahead of this clock', () => {
        expect(unseenFloor(NOW + HOUR_MS, NOW_S)).toBe(NOW_S + 3600);
    });
});

describe('refreshCooldownRemainingMs', () => {
    it('is zero when there is no claim', () => {
        expect(refreshCooldownRemainingMs(null, NOW)).toBe(0);
        expect(refreshCooldownRemainingMs(undefined, NOW)).toBe(0);
    });

    it('counts down from the claim and clamps at zero', () => {
        expect(refreshCooldownRemainingMs(NOW, NOW)).toBe(REFRESH_COOLDOWN_MS);
        expect(refreshCooldownRemainingMs(NOW - 4 * 60_000, NOW)).toBe(REFRESH_COOLDOWN_MS - 4 * 60_000);
        expect(refreshCooldownRemainingMs(NOW - REFRESH_COOLDOWN_MS, NOW)).toBe(0);
        expect(refreshCooldownRemainingMs(NOW - 2 * REFRESH_COOLDOWN_MS, NOW)).toBe(0);
    });

    it('accepts a Date and rejects an invalid one', () => {
        expect(refreshCooldownRemainingMs(new Date(NOW - 60_000), NOW)).toBe(REFRESH_COOLDOWN_MS - 60_000);
        expect(refreshCooldownRemainingMs(new Date(NaN), NOW)).toBe(0);
    });
});

describe('refreshCooldownUntil', () => {
    it('is null with no claim or an invalid one', () => {
        expect(refreshCooldownUntil(null)).toBeNull();
        expect(refreshCooldownUntil(undefined)).toBeNull();
        expect(refreshCooldownUntil(new Date(NaN))).toBeNull();
    });

    it('is the instant the claim expires, from a number or a Date', () => {
        expect(refreshCooldownUntil(NOW)).toBe(NOW + REFRESH_COOLDOWN_MS);
        expect(refreshCooldownUntil(new Date(NOW))).toBe(NOW + REFRESH_COOLDOWN_MS);
    });

    it('returns an expired claim as a past instant rather than guessing the clock', () => {
        // The button clamps; keeping this pure is what lets SSR and hydration agree.
        expect(refreshCooldownUntil(NOW - 2 * REFRESH_COOLDOWN_MS)).toBe(NOW - REFRESH_COOLDOWN_MS);
    });
});

describe('refreshCooldownMessage', () => {
    it('rounds up to whole minutes and never says "0 minutes"', () => {
        expect(refreshCooldownMessage(0)).toBe('Refreshed recently — try again in a minute.');
        expect(refreshCooldownMessage(30_000)).toBe('Refreshed recently — try again in a minute.');
        expect(refreshCooldownMessage(61_000)).toBe('Refreshed recently — try again in 2 minutes.');
        expect(refreshCooldownMessage(REFRESH_COOLDOWN_MS)).toBe('Refreshed recently — try again in 10 minutes.');
    });
});
