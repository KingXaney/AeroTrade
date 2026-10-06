import {describe, expect, it} from 'vitest';
import {isDailyQuotaExhausted} from '@/lib/ai/infer';

// The error a failed step.ai.infer carries when Gemini's free tier is out of requests for the day
// (seen 2026-10-06, quotaValue 20 on gemini-2.5-flash-lite), and the ones that must not be
// mistaken for it: a per-minute limit lifts in seconds, an outage lifts on its own.
const DAILY = '429 RESOURCE_EXHAUSTED: You exceeded your current quota. quotaId: GenerateRequestsPerDayPerProjectPerModel-FreeTier, model: gemini-2.5-flash-lite, quotaValue: 20';
const MINUTE = '429 RESOURCE_EXHAUSTED: quotaId: GenerateRequestsPerMinutePerProjectPerModel-FreeTier, quotaValue: 15';

describe('isDailyQuotaExhausted', () => {
    it('recognises the day\'s quota being used up, however the error is wrapped', () => {
        expect(isDailyQuotaExhausted(new Error(DAILY))).toBe(true);
        expect(isDailyQuotaExhausted(DAILY)).toBe(true);
        expect(isDailyQuotaExhausted(new Error('Step failed', {cause: DAILY}))).toBe(true);
        expect(isDailyQuotaExhausted(new Error('Step failed', {cause: {status: 429, detail: DAILY}}))).toBe(true);
    });

    it('leaves a per-minute limit, an outage and anything else to the ordinary retries', () => {
        expect(isDailyQuotaExhausted(new Error(MINUTE))).toBe(false);
        expect(isDailyQuotaExhausted(new Error('503 UNAVAILABLE: The model is overloaded'))).toBe(false);
        expect(isDailyQuotaExhausted(new Error('SyntaxError: Unexpected token'))).toBe(false);
        expect(isDailyQuotaExhausted(null)).toBe(false);
        expect(isDailyQuotaExhausted(undefined)).toBe(false);
        expect(isDailyQuotaExhausted({})).toBe(false);
    });
});
