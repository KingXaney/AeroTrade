// The chat panel's usage caption: three rate-limit rows, read without spending, shaped into what
// is left and which window refuses next. Pure — never lib/rate-limit, lib/actions or the session.

import {describe, expect, it} from 'vitest';
import {DAY_MS, HOUR_MS, resolveChatLimits} from '@/lib/chat/limits';
import {
    CHAT_WINDOW_ORDER, describeChatUsage, isLow, parseChatUsage, toChatUsage, type ChatUsageWindow, type PeekRow,
} from '@/lib/chat/usage';

const limits = resolveChatLimits({});
const now = Date.UTC(2026, 9, 2, 14, 0, 0);
const row = (count: number, inMs: number): PeekRow => ({count, expiresAt: now + inMs});
const none = {hour: null, day: null, global: null};

describe('toChatUsage', () => {
    it('reads a fresh account as every window whole, no reset, and the hour as the tightest wall', () => {
        const usage = toChatUsage(none, limits, now);
        expect(usage.hour).toEqual({used: 0, limit: 30, left: 30, resetsAt: null});
        expect(usage.day).toEqual({used: 0, limit: 60, left: 60, resetsAt: null});
        expect(usage.global).toEqual({used: 0, limit: 200, left: 200, resetsAt: null});
        expect(usage.binding).toBe('hour');
        expect(usage.at).toBe(now);
    });

    it('never lets left go negative when the counter ran past the limit', () => {
        // takeRateLimit counts the refused request too: a spent hour is stored as 31.
        const usage = toChatUsage({...none, hour: row(31, 50 * 60_000)}, limits, now);
        expect(usage.hour.used).toBe(31);
        expect(usage.hour.left).toBe(0);
        expect(usage.hour.resetsAt).toBe(now + 50 * 60_000);
        expect(usage.binding).toBe('hour');
    });

    it('counts an expired row as a fresh window (strictly expiresAt > now)', () => {
        for (const expired of [row(30, -1), row(30, 0)]) {
            const usage = toChatUsage({...none, hour: expired}, limits, now);
            expect(usage.hour.left).toBe(30);
            expect(usage.hour.used).toBe(0);
            expect(usage.hour.resetsAt).toBeNull();
        }
    });

    it('binds to the first spent window in the route order, else the fewest left, ties to the earlier', () => {
        expect(CHAT_WINDOW_ORDER).toEqual(['hour', 'day', 'global']);
        const at = (rows: Partial<Record<'hour' | 'day' | 'global', PeekRow>>) => toChatUsage({...none, ...rows}, limits, now).binding;
        expect(at({hour: row(30, HOUR_MS), day: row(60, DAY_MS)})).toBe('hour');
        expect(at({hour: row(25, HOUR_MS), day: row(60, DAY_MS)})).toBe('day');
        expect(at({hour: row(25, HOUR_MS), day: row(10, DAY_MS), global: row(200, DAY_MS)})).toBe('global');
        expect(at({hour: row(2, HOUR_MS), day: row(35, DAY_MS)})).toBe('day');
        expect(at({hour: row(20, HOUR_MS), day: row(50, DAY_MS)})).toBe('hour');
    });
});

describe('isLow', () => {
    const w = (left: number, limit: number): ChatUsageWindow => ({used: limit - left, limit, left, resetsAt: now});

    it('is a fifth of the window, rounded down, and always true at zero', () => {
        expect(isLow(w(6, 30))).toBe(true);
        expect(isLow(w(7, 30))).toBe(false);
        expect(isLow(w(12, 60))).toBe(true);
        expect(isLow(w(13, 60))).toBe(false);
        expect(isLow(w(40, 200))).toBe(true);
        expect(isLow(w(41, 200))).toBe(false);
        expect(isLow(w(0, 1))).toBe(true);
        expect(isLow(w(1, 1))).toBe(false);
    });
});

describe('describeChatUsage', () => {
    const caption = (rows: Partial<Record<'hour' | 'day' | 'global', PeekRow>>) =>
        describeChatUsage(toChatUsage({...none, ...rows}, limits, now));

    it('shows a fresh account its day allowance and the shared budget, with no reset and no hour', () => {
        const fresh = caption({});
        expect(fresh).toEqual({text: '60 of 60 messages left today · 200 of 200 shared', exhausted: false, binding: 'hour'});
        expect(fresh.text).not.toMatch(/resets|this hour/);
    });

    it('decrements after one message and reports the day window turning', () => {
        const after = caption({hour: row(1, HOUR_MS - 60_000), day: row(1, DAY_MS - 60_000), global: row(1, DAY_MS - 60_000)});
        expect(after.text).toBe('59 of 60 messages left today · 199 of 200 shared · resets in 23h 59m');
        expect(after.exhausted).toBe(false);
    });

    it('adds the hour clause, with the hour window reset, only while the hour is binding and low', () => {
        const low = caption({hour: row(25, 40 * 60_000), day: row(25, 9 * HOUR_MS), global: row(25, 9 * HOUR_MS)});
        expect(low).toEqual({text: '35 of 60 messages left today · 175 of 200 shared · 5 left this hour · resets in 40m', exhausted: false, binding: 'hour'});
        // Low but not binding: the day has fewer left, so the hour clause is hidden.
        const dayTighter = caption({hour: row(25, 40 * 60_000), day: row(57, 9 * HOUR_MS), global: row(57, 9 * HOUR_MS)});
        expect(dayTighter.text).toBe('3 of 60 messages left today · 143 of 200 shared · resets in 9h');
        expect(dayTighter.binding).toBe('day');
    });

    it('reads the browser QA state — a spent hour, nothing else opened — as a warning on the hour', () => {
        const spent = caption({hour: row(31, 59 * 60_000)});
        expect(spent).toEqual({text: '60 of 60 messages left today · 200 of 200 shared · 0 left this hour · resets in 59m', exhausted: true, binding: 'hour'});
    });

    it('reads a spent day as exhausted, with the day reset', () => {
        const spent = caption({hour: row(1, 59 * 60_000), day: row(61, 9 * HOUR_MS), global: row(61, 9 * HOUR_MS)});
        expect(spent).toEqual({text: '0 of 60 messages left today · 139 of 200 shared · resets in 9h', exhausted: true, binding: 'day'});
    });

    it('warns about the shared budget, with its own reset, while it is the wall and low', () => {
        const low = caption({hour: row(2, 50 * 60_000), day: row(18, 9 * HOUR_MS), global: row(188, 3 * HOUR_MS)});
        expect(low).toEqual({text: '42 of 60 messages left today · 12 of 200 shared · resets in 3h', exhausted: false, binding: 'global'});
        const spent = caption({hour: row(2, 50 * 60_000), day: row(1, 9 * HOUR_MS), global: row(201, 3 * HOUR_MS)});
        expect(spent).toEqual({text: '59 of 60 messages left today · 0 of 200 shared · resets in 3h', exhausted: true, binding: 'global'});
    });

    it('prints one reset clause at most, and never a hole', () => {
        const renderings = [
            caption({}), caption({hour: row(31, 59 * 60_000)}), caption({day: row(61, 9 * HOUR_MS)}),
            caption({hour: row(2, 50 * 60_000), day: row(18, 9 * HOUR_MS), global: row(188, 3 * HOUR_MS)}),
        ];
        for (const {text} of renderings) {
            expect((text.match(/resets in/g) ?? []).length, text).toBeLessThanOrEqual(1);
            expect(text, text).not.toMatch(/undefined|NaN|null|Infinity/);
        }
    });
});

describe('parseChatUsage', () => {
    it('round-trips the view and rejects anything else', () => {
        const view = toChatUsage({...none, hour: row(3, HOUR_MS)}, limits, now);
        expect(parseChatUsage(view)).toEqual(view);
        expect(parseChatUsage(JSON.parse(JSON.stringify(view)))).toEqual(view);
        for (const bad of [{}, null, 'x', 42, {...view, binding: 'week'}, {...view, day: {...view.day, left: -1}}, {...view, at: 'now'}]) {
            expect(parseChatUsage(bad), JSON.stringify(bad)).toBeNull();
        }
    });
});
