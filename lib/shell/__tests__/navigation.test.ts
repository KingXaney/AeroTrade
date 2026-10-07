// The registry drives every nav surface, and active-state is the one piece of logic in it that
// is easy to get subtly wrong — a naive startsWith lights two rows at once, and '/' lights on
// every page.

import {describe, expect, it} from 'vitest';
import {existsSync} from 'node:fs';
import {fileURLToPath} from 'node:url';

import {ACCOUNT_PAGES, NAV_PAGES, NAV_SECTIONS, isActiveNav, searchPages, sectionFor} from '@/lib/shell/navigation';

const root = fileURLToPath(new URL('../../..', import.meta.url));
const pageFile = (href: string) => `${root}app/(root)${href === '/' ? '' : href}/page.tsx`;

describe('the navigation registry', () => {
    it('has no duplicate hrefs', () => {
        const hrefs = NAV_PAGES.map((p) => p.href);
        expect(new Set(hrefs).size).toBe(hrefs.length);
    });

    it('points only at pages that exist', () => {
        // '/search' once sat in the registry as a fake entry the header special-cased into the
        // command palette; proxy.ts sent it through the session gate, so a middle-click landed
        // on a 404. A tab is a page file, or it is not in the registry.
        for (const page of NAV_PAGES) {
            expect(page.href, page.label).toMatch(/^\/[a-z-]*$/);
            expect(existsSync(pageFile(page.href)), page.href).toBe(true);
        }
        expect(NAV_PAGES.map((p) => p.href)).not.toContain('/search');
    });

    it('gives every section and page an icon and a label', () => {
        for (const section of NAV_SECTIONS) {
            expect(section.icon, section.id).toBeTruthy();
            expect(section.label, section.id).toBeTruthy();
            expect(section.pages.length, section.id).toBeGreaterThan(0);
        }
        for (const page of NAV_PAGES) {
            expect(page.icon, page.href).toBeTruthy();
            expect(page.label, page.href).toBeTruthy();
        }
    });

    it('keeps the rail short', () => {
        // The shell this replaced carried 8 header tabs and 13 sidebar links on every page.
        expect(NAV_SECTIONS.length).toBeLessThanOrEqual(8);
        expect(new Set(NAV_SECTIONS.map((s) => s.id)).size).toBe(NAV_SECTIONS.length);
    });

    it('still reaches every page the old sidebar listed', () => {
        const hrefs = NAV_PAGES.map((p) => p.href);
        for (const href of ['/topics', '/', '/brain', '/strategies', '/portfolio', '/trade', '/markets', '/news',
            '/watchlist', '/friends', '/history', '/learn', '/settings']) {
            expect(hrefs, href).toContain(href);
        }
    });

    it('keeps the account pages in the account menu, off the rail', () => {
        expect(ACCOUNT_PAGES.map((p) => p.href)).toEqual(['/friends', '/settings']);
        for (const page of ACCOUNT_PAGES) expect(sectionFor(page.href), page.href).toBeUndefined();
    });

    it("names a section's first page after the section, its other tabs after themselves", () => {
        const label = (href: string) => NAV_PAGES.find((p) => p.href === href)?.label;
        expect(label('/portfolio')).toBe('Portfolio');
        expect(label('/history')).toBe('Activity');
        expect(label('/news')).toBe('News');
        expect(label('/')).toBe('Home');
        expect(label('/dashboard')).toBe('My dashboard');
        expect(label('/topics')).toBe('Topics');
    });
});

describe('isActiveNav', () => {
    it('matches Home only on exactly /', () => {
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
        for (const page of NAV_PAGES) {
            const lit = NAV_PAGES.filter((candidate) => isActiveNav(page.href, candidate.href));
            expect(lit.map((l) => l.href), page.href).toEqual([page.href]);
        }
    });
});

describe('sectionFor', () => {
    it('puts every tab in exactly one section', () => {
        for (const section of NAV_SECTIONS) {
            for (const page of section.pages) {
                expect(NAV_SECTIONS.filter((s) => s.pages.some((p) => isActiveNav(page.href, p.href))).map((s) => s.id), page.href)
                    .toEqual([section.id]);
                expect(sectionFor(page.href)?.id, page.href).toBe(section.id);
            }
        }
    });

    it('follows a page into its children and into the routes a section claims', () => {
        expect(sectionFor('/topics/ai-chips')?.id).toBe('news');
        expect(sectionFor('/strategies/rsi2-mean-reversion')?.id).toBe('strategies');
        // /stocks alone is not a page, so it is a match prefix and never a tab.
        expect(sectionFor('/stocks/AAPL')?.id).toBe('markets');
        expect(NAV_PAGES.map((p) => p.href)).not.toContain('/stocks');
    });

    it('claims nothing it does not own', () => {
        expect(sectionFor('/this-page-does-not-exist')).toBeUndefined();
        expect(sectionFor('/stocks-archive')).toBeUndefined();
    });

    it('keeps poker night\'s lobby under Learn and its tables outside every section', () => {
        expect(sectionFor('/poker-night')?.id).toBe('learn');
        // A table is full screen, with no shell: nothing on the rail lights for it.
        expect(sectionFor('/play/K7QXM4')).toBeUndefined();
        // The lobby and the solver share a prefix, not a tab.
        expect(isActiveNav('/poker-night', '/poker')).toBe(false);
        expect(isActiveNav('/poker', '/poker-night')).toBe(false);
    });
});

describe('searchPages', () => {
    it('finds a page by the start of a word in its name', () => {
        expect(searchPages('port').map((p) => p.href)).toEqual(['/portfolio', '/history']);
        expect(searchPages('act').map((p) => p.href)).toEqual(['/history']);
        expect(searchPages('SETT').map((p) => p.href)).toEqual(['/settings']);
    });

    it('offers nothing for an empty query or one that starts no word', () => {
        expect(searchPages('')).toEqual([]);
        expect(searchPages('   ')).toEqual([]);
        expect(searchPages('ortfolio')).toEqual([]);
    });

    it('treats the query as text, never as a pattern', () => {
        expect(searchPages('.*')).toEqual([]);
        expect(searchPages('(')).toEqual([]);
    });

    it('stops at its limit', () => {
        expect(searchPages('s', 2)).toHaveLength(2);
    });
});
