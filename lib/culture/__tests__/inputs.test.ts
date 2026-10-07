import {describe, expect, it} from 'vitest';
import {BRAND_SHARE_CAP} from '@/lib/culture/config';
import {brandFeatures, brandShares, detectFeeds, rollupTicker, toScoringInputs, withCrossBrandFeatures, type BrandFeatures, type BrandSeriesInput} from '@/lib/culture/inputs';
import {cultureTickers} from '@/lib/culture/universe';
import {addCalendarDays} from '@/lib/dates';
import type {AttentionPoint, CultureBrand, CultureEntitySummary} from '@/lib/culture/types';
import type {Bar} from '@/lib/prices/signals';

const AS_OF = '2026-10-05';

const series = (days: number, valueAt: (back: number) => number): AttentionPoint[] =>
    Array.from({length: days}, (_, i) => {
        const back = days - 1 - i;
        return {date: addCalendarDays(AS_OF, -back), value: valueAt(back)};
    });

const brand = (id: string, ticker: string | null, category: CultureBrand['category'] = 'drinks'): CultureBrand =>
    ({id, name: id, category, aliases: [id], owner: ticker ? {company: ticker, ticker, listing: 'us'} : null, wikipedia: [id]});

const entity = (key: string, weightSlow: number, sentimentSlow = 0, thesis = false): CultureEntitySummary =>
    ({key, displayName: key, category: 'drinks', ticker: null, listing: null, weightFast: 0, weightSlow, sentimentFast: 0, sentimentSlow, thesisSince: thesis ? 1 : null, lastSeenAt: 1});

const input = (b: CultureBrand, over: Partial<BrandSeriesInput> = {}): BrandSeriesInput =>
    ({brand: b, wikipedia: series(400, () => 100), appstore: [], news: [], entity: null, reportDate: null, ...over});

const features = (id: string, over: Partial<BrandFeatures>): BrandFeatures => ({
    id, name: id, category: 'drinks', ticker: 'X', baseline: 100, recentSum: 2800, baseSum: 18_000, surprise: 0, trend: 0, persistence: 0,
    pressMentions: 0, quiet: null, categoryShare: null, sinceReport: null, appRank: null, attentionSlow: null, sentimentSlow: 0, thesis: false, ...over,
});

describe('brandShares', () => {
    it('weighs brands by baseline, caps the heaviest and spreads the excess', () => {
        const shares = brandShares([features('a', {baseline: 70}), features('b', {baseline: 30})]);
        expect(shares.get('a')).toBeCloseTo(BRAND_SHARE_CAP, 9);
        expect(shares.get('b')).toBeCloseTo(1 - BRAND_SHARE_CAP, 9);
        const three = brandShares([features('a', {baseline: 80}), features('b', {baseline: 10}), features('c', {baseline: 10})]);
        expect(three.get('a')).toBeCloseTo(0.5, 9);
        expect(three.get('b')).toBeCloseTo(0.25, 9);
        expect(three.get('c')).toBeCloseTo(0.25, 9);
    });

    it('splits equally when nothing has views, and skips a brand without a baseline', () => {
        const zero = brandShares([features('a', {baseline: 0}), features('b', {baseline: 0})]);
        expect(zero.get('a')).toBe(0.5);
        expect(brandShares([features('a', {baseline: null}), features('b', {baseline: 5})]).get('a')).toBeUndefined();
        expect(brandShares([])).toEqual(new Map());
    });
});

describe('rollupTicker', () => {
    it('moves an owner by a small brand’s surge only by that brand’s capped share', () => {
        const pep = rollupTicker([features('pepsi', {baseline: 900, surprise: 0}), features('poppi', {baseline: 100, surprise: Math.log(4)})]);
        const single = rollupTicker([features('celsius', {baseline: 100, surprise: Math.log(4)})]);
        expect(single.attentionAnomaly).toBeCloseTo(Math.log(4), 9);
        // Pepsi is capped at half, so Poppi carries the other half: the surge counts half.
        expect(pep.attentionAnomaly).toBeCloseTo(Math.log(4) / 2, 9);
        expect(pep.attentionAnomaly as number).toBeLessThan(single.attentionAnomaly as number);
    });

    it('sums the heaviest three brands’ slow attention, weighs sentiment by it, and names the heaviest thesis', () => {
        const rolled = rollupTicker([
            features('a', {attentionSlow: 5, sentimentSlow: 1, thesis: true}),
            features('b', {attentionSlow: 3, sentimentSlow: -1, thesis: true}),
            features('c', {attentionSlow: 2}),
            features('d', {attentionSlow: 1}),
            features('e', {attentionSlow: null}),
        ]);
        expect(rolled.attentionSlow).toBe(10);
        expect(rolled.sentimentSlow).toBeCloseTo((5 - 3) / 11, 9);
        expect(rolled.hasThesis).toBe(true);
        expect(rolled.thesisLabel).toBe('a');
        expect(rolled.brandsCovered).toBe(5);
        const none = rollupTicker([features('x', {attentionSlow: null, surprise: null})]);
        expect(none.attentionSlow).toBeNull();
        expect(none.brandsCovered).toBe(0);
        expect(none.hasThesis).toBe(false);
    });

    it('takes the best app rank among its brands', () => {
        expect(rollupTicker([features('a', {appRank: 0.2}), features('b', {appRank: 0.9}), features('c', {appRank: null})]).appRank).toBe(0.9);
        expect(rollupTicker([features('a', {appRank: null})]).appRank).toBeNull();
    });
});

describe('withCrossBrandFeatures', () => {
    it('quiets a surprise by the brand’s press rank: uncovered keeps it whole, the most covered loses it', () => {
        const rows = withCrossBrandFeatures([
            features('loud', {surprise: 1, pressMentions: 50}),
            features('mid', {surprise: 1, pressMentions: 10}),
            features('low', {surprise: 1, pressMentions: 1}),
            features('quiet', {surprise: 1, pressMentions: 0}),
            features('falling', {surprise: -0.5, pressMentions: 0}),
        ], {hasPress: true});
        const byId = Object.fromEntries(rows.map((r) => [r.id, r]));
        expect(byId.quiet.quiet).toBe(1);
        expect(byId.low.quiet).toBeCloseTo(1, 9);
        expect(byId.loud.quiet).toBeCloseTo(0, 9);
        expect(byId.mid.quiet).toBeCloseTo(0.5, 9);
        expect(byId.falling.quiet).toBe(-0.5);
    });

    it('leaves quiet unmeasured without a press feed or a surprise', () => {
        expect(withCrossBrandFeatures([features('a', {surprise: 1, pressMentions: 0})], {hasPress: false})[0].quiet).toBeNull();
        expect(withCrossBrandFeatures([features('a', {surprise: null})], {hasPress: true})[0].quiet).toBeNull();
    });

    it('reads category share against the whole category, private rivals included', () => {
        const rows = withCrossBrandFeatures([
            features('listed', {category: 'drinks', recentSum: 2800, baseSum: 18_000}),
            features('private-rival', {category: 'drinks', ticker: null, recentSum: 5600, baseSum: 18_000}),
            features('other', {category: 'snacks', recentSum: 100, baseSum: 600}),
        ], {hasPress: false});
        const byId = Object.fromEntries(rows.map((r) => [r.id, r]));
        // The listed brand kept its views while the rival doubled: its share fell from half to a third.
        expect(byId.listed.categoryShare).toBeCloseTo((2800 / 8400 - 18_000 / 36_000) * 100, 9);
        expect(byId['private-rival'].categoryShare).toBeCloseTo((5600 / 8400 - 0.5) * 100, 9);
        expect(byId.other.categoryShare).toBeCloseTo(0, 9);
        expect(withCrossBrandFeatures([features('a', {baseline: null})], {hasPress: false})[0].categoryShare).toBeNull();
    });
});

describe('brandFeatures, detectFeeds and toScoringInputs', () => {
    const pepsi = brand('pepsi', 'PEP');
    const poppi = brand('poppi', 'PEP');
    const celsius = brand('celsius', 'CELH');
    const prime = brand('prime', null);
    const catalog = [pepsi, poppi, celsius, prime];

    it('reads a brand’s features from its series and entity', () => {
        const f = brandFeatures(input(celsius, {
            wikipedia: series(400, (back) => (back < 28 ? 299 : 99)),
            appstore: [{date: AS_OF, value: 100}],
            news: series(10, () => 2),
            entity: entity('celsius', 4, 0.5, true),
            reportDate: null,
        }), AS_OF);
        expect(f.surprise).toBeCloseTo(Math.log(3), 9);
        expect(f.baseline).toBe(99);
        expect(f.appRank).toBe(1);
        expect(f.pressMentions).toBe(20);
        expect(f).toMatchObject({attentionSlow: 4, sentimentSlow: 0.5, thesis: true, ticker: 'CELH', sinceReport: null});
    });

    it('detects the feeds the data carries', () => {
        const brands = new Map([['celsius', input(celsius)]]);
        expect(detectFeeds(brands)).toEqual(['price', 'wikipedia']);
        brands.set('poppi', input(poppi, {entity: entity('poppi', 1), news: series(3, () => 1), appstore: [{date: AS_OF, value: 5}], reportDate: '2026-09-01'}));
        expect(detectFeeds(brands)).toEqual(['price', 'wikipedia', 'mentions', 'press', 'appstore', 'earnings']);
        expect(detectFeeds(new Map([['prime', input(prime, {wikipedia: []})]]))).toEqual(['price']);
    });

    it('builds one scoring input per ticker with windowed bars, its quote and its brands', () => {
        const bar = (back: number, close: number): Bar => ({date: addCalendarDays(AS_OF, -back), close});
        const bars = new Map<string, Bar[]>([
            ['CELH', [bar(900, 1), ...Array.from({length: 300}, (_, i) => bar(299 - i, 10 + i / 100))]],
            ['PEP', Array.from({length: 50}, (_, i) => bar(49 - i, 150))],
        ]);
        const brands = new Map(catalog.map((b) => [b.id, input(b, {entity: b.id === 'celsius' ? entity('celsius', 2) : null})]));
        const {inputs, feeds} = toScoringInputs({tickers: cultureTickers(catalog), quoted: new Set(['CELH']), bars, brands, asOf: AS_OF});
        expect(feeds).toEqual(['price', 'wikipedia', 'mentions']);
        expect(inputs.map((i) => i.symbol)).toEqual(['CELH', 'PEP']);
        const celh = inputs[0];
        expect(celh.barsCount).toBe(300);
        expect(celh.quoted).toBe(true);
        expect(celh.brands).toEqual([{id: 'celsius', name: 'celsius'}]);
        expect(celh.attentionSlow).toBe(2);
        expect(celh.signals.r252).not.toBeNull();
        const pep = inputs[1];
        expect(pep.barsCount).toBe(50);
        expect(pep.quoted).toBe(false);
        expect(pep.brands.map((b) => b.id)).toEqual(['pepsi', 'poppi']);
        expect(pep.attentionSlow).toBeNull();
        expect(pep.brandsCovered).toBe(2);
    });
});
