// When a held symbol counts as gone rather than as waiting on an outage.

import {describe, expect, it} from 'vitest';
import {easternToInstant} from '@/lib/prices/market-hours';
import {GONE_AFTER_SESSIONS, goneCutoff, isGone} from '@/lib/prices/gone';

// Thursday 2026-11-19, 16:10 ET. Three sessions back is Monday the 16th.
const NOW = easternToInstant('2026-11-19', 16, 10);

describe('gone', () => {
    it('counts three sessions', () => {
        expect(GONE_AFTER_SESSIONS).toBe(3);
        expect(goneCutoff(NOW)).toBe(easternToInstant('2026-11-16', 16, 0));
    });

    it('is not gone while a quote from the last three sessions exists', () => {
        expect(isGone(easternToInstant('2026-11-18', 16, 10), NOW)).toBe(false);
        expect(isGone(easternToInstant('2026-11-17', 10, 0), NOW)).toBe(false);
        expect(isGone(easternToInstant('2026-11-16', 16, 0), NOW)).toBe(false);
    });

    it('is gone once the last quote is older than that, or there never was one', () => {
        expect(isGone(easternToInstant('2026-11-16', 15, 59), NOW)).toBe(true);
        expect(isGone(easternToInstant('2026-11-10', 12, 0), NOW)).toBe(true);
        expect(isGone(null, NOW)).toBe(true);
    });

    it('skips a weekend and a holiday when it counts back', () => {
        // Monday 2026-11-30: three sessions back are Fri 27 (a half day), Wed 25, Tue 24 — Thursday the 26th is Thanksgiving.
        expect(goneCutoff(easternToInstant('2026-11-30', 10, 0))).toBe(easternToInstant('2026-11-24', 16, 0));
    });
});
