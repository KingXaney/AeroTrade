// proxy.ts's matcher, read the way Next reads it: which paths the logged-out redirect runs on.

import {describe, expect, it} from 'vitest';
import {unstable_doesMiddlewareMatch} from 'next/experimental/testing/server';
import {config} from '@/proxy';

const gated = (url: string) => unstable_doesMiddlewareMatch({config, url});

describe('the proxy matcher', () => {
    it('lets the tab icon through, so a logged-out page still shows it', () => {
        expect(gated('/icon.svg')).toBe(false);
        expect(gated('/icon.svg?a1b2c3')).toBe(false);
    });

    it('leaves the auth pages, the API and static files public', () => {
        for (const url of ['/sign-in', '/sign-up', '/forgot-password', '/reset-password?token=t', '/api/inngest', '/_next/static/chunk.js', '/assets/logo.svg']) {
            expect(gated(url), url).toBe(false);
        }
    });

    it('gates the app itself', () => {
        for (const url of ['/', '/trade', '/stocks/AAPL', '/stocks/BRK.B', '/settings']) {
            expect(gated(url), url).toBe(true);
        }
    });
});
