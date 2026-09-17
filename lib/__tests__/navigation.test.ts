// The registry drives three separate nav surfaces, and active-state is the one piece of
// logic in it that is easy to get subtly wrong — a naive startsWith lights two rows at
// once, and '/' lights on every page.

import {describe, expect, it} from 'vitest';

import {HEADER_NAV_ITEMS, NAV_ITEMS, isActiveNav} from '@/lib/navigation';

describe('NAV_ITEMS', () => {
    it('has no duplicate hrefs', () => {
        const hrefs = NAV_ITEMS.map((i) => i.href);
        expect(new Set(hrefs).size).toBe(hrefs.length);
    });

    it('points only at real routes', () => {
        // '/search' used to sit in NAV_ITEMS as a fake entry the header special-cased into
        // the command palette. It is not a route, and proxy.ts sent it through the session
        // gate — so middle-clicking it landed a signed-in user on a 404.
        for (const item of NAV_ITEMS) {
            expect(item.href, item.label).toMatch(/^\/[a-z-]*$/);
        }
        expect(NAV_ITEMS.map((i) => i.href)).not.toContain('/search');
    });

    it('gives every item an icon and a label', () => {
        for (const item of NAV_ITEMS) {
            expect(item.icon, item.href).toBeTruthy();
            expect(item.label, item.href).toBeTruthy();
        }
    });

    it('keeps the four account pages out of the header but in the registry', () => {
        // These are exactly the routes that were unreachable below 1024px.
        for (const href of ['/watchlist', '/friends', '/history', '/settings']) {
            const item = NAV_ITEMS.find((i) => i.href === href);
            expect(item, href).toBeDefined();
            expect(item?.inHeader, href).toBe(false);
        }
    });

    it('derives the header list from the same array', () => {
        expect(HEADER_NAV_ITEMS).toHaveLength(7);
        expect(HEADER_NAV_ITEMS.map((i) => i.href)).toContain('/news');
        for (const item of HEADER_NAV_ITEMS) {
            expect(NAV_ITEMS).toContain(item);
        }
    });
});

describe('isActiveNav', () => {
    it('matches the dashboard only on exactly /', () => {
        expect(isActiveNav('/', '/')).toBe(true);
        expect(isActiveNav('/topics', '/')).toBe(false);
        expect(isActiveNav('/portfolio', '/')).toBe(false);
    });

    it('matches a section and its children', () => {
        expect(isActiveNav('/topics', '/topics')).toBe(true);
        expect(isActiveNav('/topics/ai-chips', '/topics')).toBe(true);
        expect(isActiveNav('/friends/abc123', '/friends')).toBe(true);
    });

    it('does not match a sibling that merely shares a prefix', () => {
        // The bug a bare startsWith would reintroduce: /watchlist-archive lighting up
        // the /watchlist row, or /trades lighting /trade.
        expect(isActiveNav('/watchlist-archive', '/watchlist')).toBe(false);
        expect(isActiveNav('/trades', '/trade')).toBe(false);
    });

    it('lights exactly one row for every registry route', () => {
        for (const item of NAV_ITEMS) {
            const lit = NAV_ITEMS.filter((candidate) => isActiveNav(item.href, candidate.href));
            expect(lit.map((l) => l.href), item.href).toEqual([item.href]);
        }
    });
});
