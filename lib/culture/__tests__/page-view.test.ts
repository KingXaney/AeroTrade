import {describe, expect, it} from 'vitest';
import {CULTURE_CATEGORIES, type CultureEntitySummary} from '@/lib/culture/types';
import {boardMarks, comparisonRows, groupBrands, risingBrands, toBrandRow} from '@/lib/culture/page-view';
import {brandEvidenceHref, outboundHref} from '@/lib/culture/links';

const entity = (key: string, over: Partial<CultureEntitySummary> = {}): CultureEntitySummary => ({
    key, displayName: key, category: 'drinks', ticker: 'CELH', listing: 'us',
    weightFast: 1, weightSlow: 2, sentimentFast: 0, sentimentSlow: 0.2, thesisSince: null, lastSeenAt: 0,
    ...over,
});

describe('the brand board', () => {
    it('groups by category in the catalog\'s order, heaviest first, and drops an empty category', () => {
        const groups = groupBrands([
            entity('crocs', {category: 'footwear', ticker: 'CROX', weightSlow: 1}),
            entity('poppi', {ticker: 'PEP', weightSlow: 3}),
            entity('celsius', {weightSlow: 5}),
            entity('nike', {category: 'footwear', ticker: 'NKE', weightSlow: 4}),
        ], new Set());
        expect(groups.map((g) => g.category)).toEqual(['drinks', 'footwear']);
        expect(groups[0].rows.map((r) => r.key)).toEqual(['celsius', 'poppi']);
        expect(groups[1].rows.map((r) => r.key)).toEqual(['nike', 'crocs']);
        expect(groups[0].label).toBe('Drinks');
        expect(CULTURE_CATEGORIES.indexOf('drinks')).toBeLessThan(CULTURE_CATEGORIES.indexOf('footwear'));
    });

    it('breaks a tie on the name, so the order is stable between renders', () => {
        const groups = groupBrands([entity('poppi', {ticker: 'PEP'}), entity('celsius')], new Set());
        expect(groups[0].rows.map((r) => r.key)).toEqual(['celsius', 'poppi']);
    });

    it('reads the owner, the parent and the week\'s quote off each row', () => {
        const unquoted = new Set(['CELH']);
        const celsius = toBrandRow(entity('celsius'), unquoted);
        expect(celsius.company).toBe('Celsius Holdings');
        expect(celsius.unpriced).toBe(true);
        const liquidDeath = toBrandRow(entity('liquid-death', {ticker: null, listing: null}), unquoted);
        expect(liquidDeath.company).toBeNull();
        expect(liquidDeath.unpriced).toBe(false);
        // An entity the catalog no longer knows still renders, without an owner.
        const gone = toBrandRow(entity('no-such-brand', {ticker: 'XXXX'}), new Set(['XXXX']));
        expect(gone.company).toBeNull();
        expect(gone.parent).toBeNull();
        expect(gone.unpriced).toBe(true);
    });

    it('prints a legend line only for the marks some row carries', () => {
        const none = groupBrands([entity('celsius')], new Set());
        expect(boardMarks(none)).toEqual({thesis: false, privateBrand: false, unpriced: false});
        const all = groupBrands([
            entity('celsius', {thesisSince: 1}),
            entity('liquid-death', {ticker: null, listing: null}),
            entity('poppi', {ticker: 'PEP'}),
        ], new Set(['PEP']));
        expect(boardMarks(all)).toEqual({thesis: true, privateBrand: true, unpriced: true});
    });
});

describe('the rising list', () => {
    it('ranks the fast layer, keeps only brands that moved, and stops at the limit', () => {
        const rows = risingBrands([
            entity('a', {weightFast: 0, weightSlow: 9}),
            entity('b', {weightFast: 2}),
            entity('c', {weightFast: 3}),
            entity('d', {weightFast: 1}),
        ], 2);
        expect(rows.map((r) => r.key)).toEqual(['c', 'b']);
        expect(risingBrands([entity('a', {weightFast: 0})], 5)).toEqual([]);
        expect(risingBrands([entity('a')], 0)).toEqual([]);
    });
});

describe('the side-by-side strip', () => {
    it('keeps the registry\'s profile order whatever the returns say, then SPY over the earliest launch', () => {
        const rows = comparisonRows({
            spike: {returnPct: -3, benchmarkReturnPct: 1.5, since: '2026-10-05'},
            quiet: {returnPct: 8, benchmarkReturnPct: 2.5, since: '2026-10-12'},
        });
        expect(rows.map((r) => r.id)).toEqual(['spike', 'quiet', 'spy']);
        expect(rows.map((r) => r.label)).toEqual(['Spike', 'Quiet', 'SPY']);
        expect(rows[0]).toMatchObject({returnPct: -3, since: '2026-10-05'});
        // SPY's figure is the earliest-launched account's own benchmark leg: the same sessions.
        expect(rows[2]).toEqual({id: 'spy', label: 'SPY', returnPct: 1.5, since: '2026-10-05'});
    });

    it('prints a dash for a picker that has not started, and SPY with it', () => {
        expect(comparisonRows({})).toEqual([
            {id: 'spike', label: 'Spike', returnPct: null, since: null},
            {id: 'quiet', label: 'Quiet', returnPct: null, since: null},
            {id: 'spy', label: 'SPY', returnPct: null, since: null},
        ]);
        const one = comparisonRows({quiet: {returnPct: 2, benchmarkReturnPct: null, since: '2026-10-05'}});
        expect(one[0].returnPct).toBeNull();
        expect(one[2]).toEqual({id: 'spy', label: 'SPY', returnPct: null, since: '2026-10-05'});
    });
});

describe('the links', () => {
    it('addresses a brand\'s evidence on the brands view, anchored', () => {
        expect(brandEvidenceHref('celsius')).toBe('/culture?brand=celsius#evidence');
        expect(brandEvidenceHref('a b')).toBe('/culture?brand=a%20b#evidence');
    });

    it('makes an anchor of an http(s) link only', () => {
        expect(outboundHref('https://www.reddit.com/r/GenZ/comments/x/')).toBe('https://www.reddit.com/r/GenZ/comments/x/');
        expect(outboundHref(' http://example.com/a ')).toBe('http://example.com/a');
        expect(outboundHref('javascript:alert(1)')).toBeNull();
        expect(outboundHref('data:text/html,hi')).toBeNull();
        expect(outboundHref('//example.com')).toBeNull();
        expect(outboundHref('https://example.com/a b')).toBeNull();
        expect(outboundHref('')).toBeNull();
    });
});
