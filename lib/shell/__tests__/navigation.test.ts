// The registry drives every nav surface, and active-state is the one piece of logic in it that
// is easy to get subtly wrong — a naive startsWith lights two rows at once, and '/' lights on
// every page.

import {describe, expect, it} from 'vitest';
import {existsSync} from 'node:fs';
import {fileURLToPath} from 'node:url';

import {ACCOUNT_PAGES, NAV_PAGES, NAV_SECTIONS, isActiveNav, navPagesFor, navSectionsFor, searchPages, sectionFor} from '@/lib/shell/navigation';

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
        for (const href of ['/topics', '/', '/brain', '/strategies', '/portfolio', '/trade', '/news',
            '/watchlist', '/friends', '/history', '/learn', '/settings']) {
            expect(hrefs, href).toContain(href);
        }
        // The Markets overview and the trade desk became one page on 2026-10-13; the old
        // address is a redirect in next.config.ts, not a page.
        expect(hrefs).not.toContain('/markets');
    });

    it('files the trade desk and the watchlist under the one Markets icon, the desk first', () => {
        const markets = NAV_SECTIONS.find((s) => s.id === 'markets');
        expect(markets?.pages.map((p) => p.href)).toEqual(['/trade', '/watchlist']);
        expect(markets?.match).toEqual(['/stocks']);
        expect(NAV_SECTIONS.map((s) => s.id)).not.toContain('trade');
        expect(NAV_SECTIONS).toHaveLength(7);
        // The desk takes the section's name in ⌘K and keeps its own as the tab, so both words find it.
        const desk = NAV_PAGES.find((p) => p.href === '/trade');
        expect(desk?.label).toBe('Markets');
        expect(desk?.tab).toBe('Trade');
        expect(NAV_PAGES.find((p) => p.href === '/watchlist')?.label).toBe('Watchlist');
        expect(searchPages('trade').map((p) => p.href)).toEqual(['/trade']);
        expect(searchPages('mark').map((p) => p.href)).toEqual(['/trade', '/watchlist']);
        expect(searchPages('watch').map((p) => p.href)).toEqual(['/watchlist']);
        expect(sectionFor('/trade')?.id).toBe('markets');
        expect(sectionFor('/watchlist')?.id).toBe('markets');
    });

    it('keeps the lab for its owner: one owner-only page, dropped for everyone else', () => {
        const ownerOnly = NAV_PAGES.filter((page) => page.owner).map((page) => page.href);
        expect(ownerOnly).toEqual(['/learn']);
        const everyone = navPagesFor({owner: false});
        expect(everyone.map((page) => page.href)).not.toContain('/learn');
        expect(everyone.find((page) => page.href === '/games')?.label).toBe('Learn');
        expect(everyone.map((page) => page.href)).toContain('/glossary');
        const owner = navPagesFor({owner: true});
        expect(owner.find((page) => page.href === '/learn')?.label).toBe('Learn');
        expect(owner.find((page) => page.href === '/games')?.label).toBe('Games');
        expect(owner.map((page) => page.href)).toContain('/glossary');
        // Learn keeps its other pages, and the rail icon goes to the first visible page.
        const learn = navSectionsFor({owner: false}).find((section) => section.id === 'learn');
        expect(learn?.pages[0].href).toBe('/games');
        expect(navSectionsFor({owner: true})).toBe(NAV_SECTIONS);
        // Lookups take the audience's lists.
        // A non-owner on /learn is on their way to the games; their lists own no such page.
        expect(sectionFor('/learn', navSectionsFor({owner: false}))).toBeUndefined();
        expect(sectionFor('/learn')?.id).toBe('learn');
        expect(sectionFor('/glossary')?.id).toBe('learn');
        // A section's first page takes its name, so "learn" leads with the lab for the owner and
        // with the games for everyone else; the section's other pages follow by section name.
        expect(searchPages('learn', 5, owner).map((page) => page.href)).toEqual(['/learn', '/games', '/poker', '/poker-night', '/glossary']);
        expect(searchPages('learn', 5, everyone).map((page) => page.href)).toEqual(['/games', '/poker', '/poker-night', '/glossary']);
        expect(searchPages('glossary', 5, everyone).map((page) => page.href)).toEqual(['/glossary']);
        expect(isActiveNav('/learn/units/cv-vit-dinov2', '/learn')).toBe(true);
    });

    it('keeps both brains, the trading agent world and the strategies for the owner alone', () => {
        const ownerSections = NAV_SECTIONS.filter((section) => section.owner).map((section) => section.id);
        expect(ownerSections).toEqual(['strategies', 'brain']);
        const sections = navSectionsFor({owner: false});
        expect(sections.map((section) => section.id)).toEqual(NAV_SECTIONS.map((s) => s.id).filter((id) => !ownerSections.includes(id)));
        // No icon is ever left leading nowhere.
        for (const section of sections) expect(section.pages.length, section.id).toBeGreaterThan(0);
        const everyone = navPagesFor({owner: false}).map((page) => page.href);
        for (const href of ['/strategies', '/brain', '/culture', '/agent-world']) {
            expect(everyone, href).not.toContain(href);
            expect(sectionFor(href, sections), href).toBeUndefined();
            expect(navPagesFor({owner: true}).map((page) => page.href), href).toContain(href);
        }
        // ⌘K finds none of them for anyone else.
        const pages = navPagesFor({owner: false});
        for (const query of ['strat', 'brain', 'cult', 'agent', 'news brain']) expect(searchPages(query, 5, pages), query).toEqual([]);
        expect(searchPages('strat', 5, navPagesFor({owner: true})).map((page) => page.href)).toEqual(['/strategies']);
    });

    it('files the three brains under the one Brain icon, the news brain first', () => {
        // The rail is capped at eight icons and had eight when the culture brain arrived (seven
        // since Markets and Trade merged), so each later brain is a page of the Brain section: a
        // tab above its pages, a row in the drawer, a ⌘K hit. The trading agent world is the third.
        const brain = NAV_SECTIONS.find((s) => s.id === 'brain');
        expect(brain?.pages.map((p) => p.href)).toEqual(['/brain', '/culture', '/agent-world']);
        expect(NAV_PAGES.find((p) => p.href === '/brain')?.label).toBe('Brain');
        expect(NAV_PAGES.find((p) => p.href === '/culture')?.label).toBe('Culture brain');
        expect(NAV_PAGES.find((p) => p.href === '/agent-world')?.label).toBe('Trading agent world');
        expect(sectionFor('/culture')?.id).toBe('brain');
        expect(sectionFor('/agent-world')?.id).toBe('brain');
        expect(searchPages('cult').map((p) => p.href)).toEqual(['/culture']);
        expect(searchPages('agent').map((p) => p.href)).toEqual(['/agent-world']);
    });

    it('keeps the account pages in the account menu, off the rail', () => {
        expect(ACCOUNT_PAGES.map((p) => p.href)).toEqual(['/friends', '/settings']);
        for (const page of ACCOUNT_PAGES) expect(sectionFor(page.href), page.href).toBeUndefined();
    });

    it("names a section's first page after the section, its other tabs after themselves", () => {
        const label = (href: string) => NAV_PAGES.find((p) => p.href === href)?.label;
        expect(label('/portfolio')).toBe('Portfolio');
        expect(label('/history')).toBe('Activity');
        expect(label('/trade')).toBe('Markets');
        expect(label('/watchlist')).toBe('Watchlist');
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

    it("finds a section's first page by its own tab name too", () => {
        // "Today" is Home's first tab, "Headlines" News's: the ⌘K name is the section's, the
        // tab's own word still finds it.
        expect(searchPages('today').map((p) => p.href)).toEqual(['/']);
        expect(searchPages('head').map((p) => p.href)).toEqual(['/news']);
        expect(searchPages('trade').map((p) => p.href)).toEqual(['/trade']);
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
