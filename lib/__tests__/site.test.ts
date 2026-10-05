import {describe, expect, it} from 'vitest';
import {isPreviewBuild, PRODUCTION_URL, SITE_NAME, siteUrl} from '@/lib/site';

describe('siteUrl', () => {
    it('is the production domain in production, whatever BETTER_AUTH_URL says', () => {
        expect(siteUrl({VERCEL_ENV: 'production', BETTER_AUTH_URL: 'https://retired.example.app'})).toBe(PRODUCTION_URL);
    });

    it('is the app’s own address elsewhere, without a trailing slash', () => {
        expect(siteUrl({VERCEL_ENV: 'preview', BETTER_AUTH_URL: 'https://branch.example.app/'})).toBe('https://branch.example.app');
        expect(siteUrl({BETTER_AUTH_URL: ' http://localhost:3100// '})).toBe('http://localhost:3100');
    });

    it('falls back to the local dev server', () => {
        expect(siteUrl({})).toBe('http://localhost:3000');
        expect(siteUrl({BETTER_AUTH_URL: '  '})).toBe('http://localhost:3000');
    });

    it('names the product and an https production address', () => {
        expect(SITE_NAME).toBe('AeroTrade');
        expect(PRODUCTION_URL).toMatch(/^https:\/\/[a-z0-9.-]+$/);
    });
});

describe('isPreviewBuild', () => {
    it('is true only on a Vercel preview build', () => {
        expect(isPreviewBuild({VERCEL_ENV: 'preview'})).toBe(true);
        expect(isPreviewBuild({VERCEL_ENV: 'production'})).toBe(false);
        expect(isPreviewBuild({VERCEL_ENV: 'development'})).toBe(false);
        expect(isPreviewBuild({})).toBe(false);
    });
});
