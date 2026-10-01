// The digest's dateline is the ET day, like every other date the app prints: at 22:00 ET the
// UTC calendar has already moved on, and the email must not be dated tomorrow.

import {afterEach, describe, expect, it, vi} from 'vitest';

vi.mock('nodemailer', () => ({default: {createTransport: () => ({sendMail: vi.fn()})}}));

import {getFormattedTodayDate} from '@/lib/email/send';

describe('getFormattedTodayDate', () => {
    afterEach(() => vi.useRealTimers());

    it('names the Eastern day, not the UTC one', () => {
        vi.useFakeTimers();
        vi.setSystemTime(Date.UTC(2026, 8, 29, 2, 0)); // 22:00 EDT on Monday 28 September
        expect(getFormattedTodayDate()).toBe('Monday, September 28, 2026');
    });

    it('agrees with UTC once both calendars are on the same day', () => {
        vi.useFakeTimers();
        vi.setSystemTime(Date.UTC(2026, 9, 1, 16, 0)); // noon EDT
        expect(getFormattedTodayDate()).toBe('Thursday, October 1, 2026');
    });
});
