// The limits tracker's pure parts: the registry names every provider the app meters with a
// dated cap and a docs link; the classifier reads a provider's refusal into a kind, or nothing
// for an error that is not a limit; the view gives one row per provider with its hits and a
// state that says only what was recorded.

import {describe, expect, it} from 'vitest';
import {classifyLimit} from '@/lib/limits/detect';
import {isLimitProviderId, LIMIT_PROVIDER_IDS, LIMIT_PROVIDERS, limitProvider} from '@/lib/limits/registry';
import {limitsView, sortedLimitRows, WEEK_MS, type LimitEvent} from '@/lib/limits/view';
import {JOB_LIST} from '@/lib/jobs/registry';

describe('the registry', () => {
    it('names every provider once, each with a dated cap, a docs link and its jobs from the job registry', () => {
        expect(new Set(LIMIT_PROVIDERS.map((p) => p.id)).size).toBe(LIMIT_PROVIDER_IDS.length);
        const jobIds = new Set(JOB_LIST.map((job) => job.id));
        for (const provider of LIMIT_PROVIDERS) {
            expect(provider.label.length, provider.id).toBeGreaterThan(2);
            expect(provider.cap.length, provider.id).toBeGreaterThan(10);
            expect(provider.capAsOf, provider.id).toMatch(/^\d{4}-\d{2}-\d{2}$/);
            expect(provider.docsUrl, provider.id).toMatch(/^https:\/\//);
            if (provider.dashboardUrl) expect(provider.dashboardUrl).toMatch(/^https:\/\//);
            for (const jobId of provider.jobs) expect(jobIds.has(jobId), `${provider.id} → ${jobId}`).toBe(true);
        }
        expect(limitProvider('gemini').label).toBe('Gemini');
        expect(isLimitProviderId('gemini')).toBe(true);
        expect(isLimitProviderId('openai')).toBe(false);
    });
});

describe('classifyLimit', () => {
    it("reads Gemini's daily quota as a quota and any other 429 as a rate", () => {
        const quota = new Error('[GoogleGenerativeAI Error]: 429 RESOURCE_EXHAUSTED: Quota exceeded for metric generate_content_free_tier_requests, limit: 20, model: gemini-2.5-flash-lite, quota_dimension: GenerateRequestsPerDayPerProjectPerModel');
        expect(classifyLimit('gemini', quota)).toBe('quota');
        expect(classifyLimit('gemini', new Error('429 RESOURCE_EXHAUSTED: GenerateRequestsPerMinutePerProjectPerModel'))).toBe('rate');
        expect(classifyLimit('gemini', new Error('API key not valid. Please pass a valid API key.'))).toBe('auth');
        expect(classifyLimit('gemini', new Error('503 UNAVAILABLE: The model is overloaded.'))).toBe('outage');
        expect(classifyLimit('gemini', new Error('Unexpected token < in JSON'))).toBeNull();
    });

    it('reads a status, from a signal or from the error text, for the HTTP providers', () => {
        expect(classifyLimit('finnhub', new Error('Finnhub API error: 429 Too Many Requests'))).toBe('rate');
        expect(classifyLimit('finnhub', {status: 429})).toBe('rate');
        expect(classifyLimit('finnhub', new Error("Couldn't fetch a live price for CELH"))).toBe('rate');
        expect(classifyLimit('finnhub', new Error('Finnhub API error: 404 Not Found'))).toBeNull();
        expect(classifyLimit('yahoo', {status: 429, message: 'Yahoo fetch failed for SPY: HTTP 429'})).toBe('rate');
        expect(classifyLimit('yahoo', {status: 502})).toBe('outage');
        expect(classifyLimit('yahoo', {status: 404})).toBeNull();
        expect(classifyLimit('reddit', new Error('Reddit responded with status 401 for r/teenagers'))).toBe('auth');
        expect(classifyLimit('reddit', new Error('Reddit token request failed with status 429'))).toBe('rate');
        expect(classifyLimit('sec', new Error('EDGAR responded 403 for AAPL'))).toBe('auth');
        expect(classifyLimit('arxiv', {status: 503})).toBe('outage');
        expect(classifyLimit('tiingo', {status: 429})).toBe('rate');
        expect(classifyLimit('wikipedia', {status: 429})).toBe('rate');
        expect(classifyLimit('google-news', {status: 429})).toBe('rate');
        expect(classifyLimit('huggingface', new Error('HTTP 502'))).toBe('outage');
    });

    it('reads the trading agent world\'s service, OpenBB and Paperclip, leaving their answers alone', () => {
        expect(classifyLimit('agent-world', {status: 409, message: 'busy'})).toBeNull();
        expect(classifyLimit('agent-world', {status: 503})).toBe('outage');
        expect(classifyLimit('agent-world', {message: 'runs: unreachable (fetch failed)'})).toBe('outage');
        expect(classifyLimit('openbb-yfinance', {status: 429, message: 'AAPL: Too Many Requests'})).toBe('rate');
        expect(classifyLimit('openbb-yfinance', {message: 'Too Many Requests. Rate limited. Try after a while.'})).toBe('rate');
        expect(classifyLimit('paperclip', {status: 409, message: 'checked out by another agent'})).toBeNull();
        expect(classifyLimit('paperclip', {status: 422, message: 'not the stage participant'})).toBeNull();
        expect(classifyLimit('paperclip', {status: 502})).toBe('outage');
        expect(classifyLimit('fred', {status: 429})).toBe('rate');
    });

    it("reads YouTube's quota reasons, Stooq's empty answer and the mailer's limits", () => {
        expect(classifyLimit('youtube', {status: 403, message: '{"error":{"errors":[{"reason":"quotaExceeded"}]}}'})).toBe('quota');
        expect(classifyLimit('youtube', {status: 403, message: 'rateLimitExceeded'})).toBe('rate');
        expect(classifyLimit('youtube', {status: 403, message: 'forbidden'})).toBe('auth');
        expect(classifyLimit('stooq', new Error('Stooq answered an empty file for spy.us'))).toBe('rate');
        expect(classifyLimit('mailer', new Error('550-5.4.5 Daily user sending limit exceeded'))).toBe('quota');
        expect(classifyLimit('mailer', new Error('535-5.7.8 Username and Password not accepted'))).toBe('auth');
        expect(classifyLimit('mailer', new Error('ECONNRESET'))).toBeNull();
    });
});

describe('limitsView', () => {
    const now = Date.UTC(2026, 9, 15, 15, 0, 0);
    const today = '2026-10-15';
    const event = (over: Partial<LimitEvent>): LimitEvent => ({provider: 'gemini', kind: 'quota', jobId: 'generate-topic-briefs', message: 'quota', at: now - 3_600_000, day: today, ...over});

    it('gives one row per provider in the registry order, counting today and the week, the newest hit last seen', () => {
        const rows = limitsView([
            event({}),
            event({at: now - 2 * 24 * 3_600_000, day: '2026-10-13', kind: 'rate', message: 'older'}),
            event({provider: 'finnhub', kind: 'rate', at: now - 6 * 24 * 3_600_000, day: '2026-10-09', jobId: null}),
            event({provider: 'finnhub', at: now - WEEK_MS - 1, day: '2026-10-07'}),   // past the week: not counted
            event({provider: 'yahoo', at: now + 60_000, day: today}),                  // in the future: not counted
        ], today, now);
        expect(rows.map((r) => r.id)).toEqual([...LIMIT_PROVIDER_IDS]);
        const gemini = rows.find((r) => r.id === 'gemini')!;
        expect(gemini).toMatchObject({state: 'hit-today', hitsToday: 1, hitsWeek: 2});
        expect(gemini.lastHit).toEqual({at: now - 3_600_000, kind: 'quota', jobId: 'generate-topic-briefs', message: 'quota'});
        expect(rows.find((r) => r.id === 'finnhub')).toMatchObject({state: 'hit-week', hitsToday: 0, hitsWeek: 1});
        expect(rows.find((r) => r.id === 'yahoo')).toMatchObject({state: 'clear', hitsToday: 0, hitsWeek: 0, lastHit: null});
    });

    it('sorts the hit rows first, newest first, then the rest in the registry order', () => {
        const rows = limitsView([event({provider: 'finnhub', at: now - 1000}), event({provider: 'gemini', at: now - 5000})], today, now);
        const sorted = sortedLimitRows(rows);
        expect(sorted.slice(0, 2).map((r) => r.id)).toEqual(['finnhub', 'gemini']);
        expect(sorted.slice(2).map((r) => r.id)).toEqual(LIMIT_PROVIDER_IDS.filter((id) => id !== 'finnhub' && id !== 'gemini'));
    });
});
