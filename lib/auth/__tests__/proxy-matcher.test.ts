// proxy.ts's matcher, read the way Next reads it — which paths the gate runs on — and what the
// gate then does with a visitor who has no session.

import {describe, expect, it} from 'vitest';
import {NextRequest} from 'next/server';
import {getRedirectUrl, getRewrittenUrl, unstable_doesMiddlewareMatch} from 'next/experimental/testing/server';
import {config, proxy} from '@/proxy';

const gated = (url: string) => unstable_doesMiddlewareMatch({config, url});
const visit = (path: string, cookie?: string) =>
    proxy(new NextRequest(`https://aerotrade.test${path}`, cookie ? {headers: {cookie}} : undefined));

describe('the proxy matcher', () => {
    it('lets the tab icon through, so a logged-out page still shows it', () => {
        expect(gated('/icon.svg')).toBe(false);
        expect(gated('/icon.svg?a1b2c3')).toBe(false);
    });

    it('leaves the auth pages, the landing page, the API and static files public', () => {
        for (const url of ['/sign-in', '/sign-up', '/forgot-password', '/reset-password?token=t', '/welcome', '/api/inngest', '/_next/static/chunk.js', '/assets/logo.svg']) {
            expect(gated(url), url).toBe(false);
        }
    });

    it('gates the app itself', () => {
        // "/" stays gated: the gate is what decides between the landing page and Home there.
        for (const url of ['/', '/dashboard', '/trade', '/stocks/AAPL', '/stocks/BRK.B', '/settings']) {
            expect(gated(url), url).toBe(true);
        }
    });
});

describe('the proxy, for a visitor with no session', () => {
    it('shows the landing page at the front door, keeping the address', () => {
        const response = visit('/');
        expect(getRewrittenUrl(response)).toBe('https://aerotrade.test/welcome');
        expect(getRedirectUrl(response)).toBeNull();
    });

    it('sends every other page of the app to sign in', () => {
        for (const path of ['/dashboard', '/portfolio', '/stocks/AAPL', '/learn?tab=glossary']) {
            const response = visit(path);
            expect(getRedirectUrl(response), path).toBe('https://aerotrade.test/sign-in');
            expect(getRewrittenUrl(response), path).toBeNull();
        }
    });

    it('keeps the landing page at "/" whatever the query says', () => {
        expect(getRewrittenUrl(visit('/?customize=1'))).toBe('https://aerotrade.test/welcome');
    });
});

describe('the proxy, for a visitor with a session cookie', () => {
    it('lets every page through, the front door included', () => {
        for (const path of ['/', '/portfolio']) {
            const response = visit(path, 'better-auth.session_token=abc.def');
            expect(getRedirectUrl(response), path).toBeNull();
            expect(getRewrittenUrl(response), path).toBeNull();
        }
    });
});
