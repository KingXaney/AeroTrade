// The table's address and the link the host shares: production's own address in production, the
// request's origin anywhere else (a preview's link opens the preview's table), and only ever an
// http(s) origin.

import {describe, expect, it} from 'vitest';
import {cleanOrigin, originFromHeaders, shareUrlFor, tablePath} from '@/lib/poker-night/links';
import {PRODUCTION_URL} from '@/lib/site';

describe('links', () => {
    it('puts a table at /play/CODE', () => {
        expect(tablePath('K7QXM4')).toBe('/play/K7QXM4');
    });

    it('shares production\'s own address in production, whatever the request says', () => {
        expect(shareUrlFor('K7QXM4', {env: 'production', requestOrigin: 'https://evil.example'})).toBe(`${PRODUCTION_URL}/play/K7QXM4`);
        expect(shareUrlFor('K7QXM4', {env: 'production', requestOrigin: null})).toBe(`${PRODUCTION_URL}/play/K7QXM4`);
    });

    it('shares the request\'s origin on a preview and a local server', () => {
        expect(shareUrlFor('K7QXM4', {env: 'preview', requestOrigin: 'https://aero-git-x.vercel.app'})).toBe('https://aero-git-x.vercel.app/play/K7QXM4');
        expect(shareUrlFor('K7QXM4', {env: 'development', requestOrigin: 'http://localhost:3000/'})).toBe('http://localhost:3000/play/K7QXM4');
    });

    it('falls back on the site address when the origin is unusable', () => {
        const url = shareUrlFor('K7QXM4', {env: 'development', requestOrigin: 'javascript:alert(1)'});
        expect(url.endsWith('/play/K7QXM4')).toBe(true);
        expect(url).toMatch(/^https?:\/\//);
    });

    it('keeps only http(s) origins', () => {
        expect(cleanOrigin('https://a.example/path?q=1')).toBe('https://a.example');
        expect(cleanOrigin('http://localhost:3000')).toBe('http://localhost:3000');
        expect(cleanOrigin('ftp://a.example')).toBeNull();
        expect(cleanOrigin('/play')).toBeNull();
        expect(cleanOrigin('')).toBeNull();
        expect(cleanOrigin(null)).toBeNull();
    });

    it('reads a page\'s origin from its forwarded headers, else its host', () => {
        const h = (entries: Record<string, string>) => new Headers(entries);
        expect(originFromHeaders(h({'x-forwarded-host': 'aero.vercel.app', 'x-forwarded-proto': 'https', host: 'internal:1234'}))).toBe('https://aero.vercel.app');
        expect(originFromHeaders(h({host: 'localhost:3000'}))).toBe('http://localhost:3000');
        expect(originFromHeaders(h({host: 'a.example/evil'}))).toBeNull();
        expect(originFromHeaders(h({host: 'a.example', 'x-forwarded-proto': 'javascript'}))).toBe('http://a.example');
        expect(originFromHeaders(h({}))).toBeNull();
    });
});
