// The daily brief as the email shows it: sections decided by the cited articles, chips only for
// the reader's own symbols, the AI Navigator built from its stored set, one-line headers, and an
// allow-list holding exactly the view's links.

import {describe, expect, it} from 'vitest';
import {buildDigestView, longDate, plainText, sectionOf, shortDate} from '@/lib/email/digest-view';
import {fallbackDigestSummary, parseDigestSummary, type DigestSource} from '@/lib/email/digest-summary';
import {DIGEST_COPY} from '@/lib/learn/copy/email';
import {FIXTURE_APP, FIXTURE_ARTICLES, FIXTURE_DAY, FIXTURE_MODEL_ANSWER, FIXTURE_NAVIGATOR, FIXTURE_SYMBOLS} from '@/lib/email/__fixtures__/digest';

const summary = () => parseDigestSummary(FIXTURE_MODEL_ANSWER, FIXTURE_ARTICLES, FIXTURE_SYMBOLS)!;
const view = (over: Partial<Parameters<typeof buildDigestView>[0]> = {}) => buildDigestView({
    day: FIXTURE_DAY, appUrl: `${FIXTURE_APP}/`, summary: summary(), readerSymbols: FIXTURE_SYMBOLS, navigator: FIXTURE_NAVIGATOR, ...over,
});
const source = (over: Partial<DigestSource>): DigestSource => ({headline: 'h', source: 'S', url: 'https://x.example.com/1', kind: 'finance', symbols: [], ...over});

describe('dates', () => {
    // The ET day the job computed, printed as itself: never shifted by the server's time zone.
    it('prints the ET day as given', () => {
        expect(longDate('2026-09-28')).toBe('Monday, September 28, 2026');
        expect(shortDate('2026-10-05')).toBe('Oct 5');
        expect(longDate('not a day')).toBe('not a day');
    });
});

describe('sectionOf', () => {
    it("puts a story about the reader's stocks first, else goes by its sources' kind", () => {
        expect(sectionOf({sources: [source({kind: 'reddit', symbols: ['NVDA']})]})).toBe('mine');
        expect(sectionOf({sources: [source({kind: 'rss'})]})).toBe('markets');
        expect(sectionOf({sources: [source({kind: 'web'})]})).toBe('feed');
        expect(sectionOf({sources: [source({kind: 'sec'})]})).toBe('filings');
        expect(sectionOf({sources: [source({kind: 'reddit'}), source({kind: 'reddit'}), source({kind: 'finance'})]})).toBe('social');
        // A tie goes to the earlier section.
        expect(sectionOf({sources: [source({kind: 'reddit'}), source({kind: 'finance'})]})).toBe('markets');
    });
});

describe('buildDigestView', () => {
    it('groups the stories into sections in a fixed order, each with its label', () => {
        const v = view();
        // Apple's 8-K is about a symbol the reader holds, so it is theirs, not Filings.
        expect(v.sections.map((s) => s.key)).toEqual(['mine', 'markets', 'feed', 'social']);
        expect(v.sections[0].label).toBe('Your stocks');
        expect(v.sections[0].stories.map((s) => s.title)).toEqual([
            'Nvidia climbs as chip orders outrun supply', 'Oil slips as OPEC+ adds supply', 'Apple files a current report on leadership',
        ]);
        expect(v.sections.find((s) => s.key === 'social')?.note).toBe(DIGEST_COPY.sectionNotes.social);
        expect(v.sections.find((s) => s.key === 'markets')?.note).toBeNull();
    });

    it("links a chip for each of the reader's own symbols to its stock page", () => {
        const nvidia = view().sections[0].stories[0];
        expect(nvidia.chips).toEqual([{label: 'NVDA', url: `${FIXTURE_APP}/stocks/NVDA`}]);
        expect(nvidia.sources).toEqual([
            {label: 'Reuters', url: 'https://news.example.com/nvidia-orders'},
            {label: 'Bloomberg', url: 'https://news.example.com/chip-suppliers'},
        ]);
        const markets = view().sections.find((s) => s.key === 'markets')!;
        expect(markets.stories.every((s) => s.chips.length === 0)).toBe(true);
    });

    it("builds the AI Navigator's table from its stored set, its rationale as plain text", () => {
        const nav = view().navigator!;
        expect(nav.rows).toEqual([
            {symbol: {label: 'NVDA', url: `${FIXTURE_APP}/stocks/NVDA`}, action: 'Bought, toward 12% of the account'},
            {symbol: {label: 'XLE', url: `${FIXTURE_APP}/stocks/XLE`}, action: 'Sold the whole position'},
            {symbol: {label: 'SPY', url: `${FIXTURE_APP}/stocks/SPY`}, action: 'Kept, toward 40% of the account'},
        ]);
        expect(nav.rationale).toBe("This week Chips led the news brain's themes, so the Navigator added to NVDA and sold XLE.");
        expect(nav.rationale).not.toContain('evil.example.com');
        expect(nav.link.url).toBe(`${FIXTURE_APP}/brain?view=navigator`);
        expect(view({navigator: null}).navigator).toBeNull();
        expect(view({navigator: {...FIXTURE_NAVIGATOR, items: [{action: 'buy', symbol: '<script>', targetWeightPct: 5, executed: true}]}}).navigator).toBeNull();
    });

    it('says when it fell back to the outlets’ own words', () => {
        const fallback = view({summary: fallbackDigestSummary(FIXTURE_ARTICLES, FIXTURE_SYMBOLS)});
        expect(fallback.headline).toBe(DIGEST_COPY.fallbackHeadline);
        expect(fallback.fallbackNote).toBe(DIGEST_COPY.fallbackNote);
        expect(fallback.subject).toBe('AeroTrade daily brief · Oct 5');
        expect(view().fallbackNote).toBeNull();
    });

    it('keeps the subject and preheader to one clipped line', () => {
        const v = view({summary: {...summary(), headline: 'Line one\r\nBcc: someone@example.com ' + 'x'.repeat(300)}});
        expect(v.subject).not.toMatch(/[\r\n]/);
        expect(v.subject.length).toBeLessThanOrEqual(110);
        expect(v.subject.startsWith('AeroTrade daily brief · Oct 5: Line one Bcc:')).toBe(true);
        expect(view().preheader).toBe(summary().bullets[0].text);
        expect(view().dateLine).toBe('Monday, October 5, 2026');
    });

    it('allows exactly the links the view holds', () => {
        const v = view();
        const held = [
            ...v.bullets.flatMap((b) => b.sources.map((s) => s.url)),
            ...v.sections.flatMap((s) => s.stories.flatMap((story) => [...story.sources, ...story.chips].map((l) => l.url))),
            ...v.navigator!.rows.map((r) => r.symbol.url), v.navigator!.link.url, v.cta.url, ...v.footerLinks.map((l) => l.url),
        ];
        expect(new Set(v.allowedUrls)).toEqual(new Set(held));
        expect(v.allowedUrls).toContain(`${FIXTURE_APP}/settings#notifications`);
        expect(v.cta.url).toBe(`${FIXTURE_APP}/news`);
    });
});

describe('plainText', () => {
    it('flattens markdown and clips', () => {
        expect(plainText('# Title\n- **bold** item\n> quote `code` [link](https://x.example.com)', 100)).toBe('Title bold item quote code link');
        expect(plainText('a'.repeat(50), 10)).toBe(`${'a'.repeat(9)}…`);
    });
});
