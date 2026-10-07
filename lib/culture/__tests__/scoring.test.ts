import {describe, expect, it} from 'vitest';
import {CULTURE_PROFILES, CULTURE_TERMS, CULTURE_VOLATILITY_HAIRCUT, MIN_PRICE_BARS, PROFILE_IDS, TERM_FEEDS, type CultureFeed} from '@/lib/culture/config';
import {effectiveWeights, scoreCultureUniverse, type CultureScoringInput} from '@/lib/culture/scoring';

const ALL_FEEDS: CultureFeed[] = ['price', 'wikipedia', 'mentions', 'press', 'appstore', 'earnings'];

const input = (symbol: string, patch: Partial<CultureScoringInput> = {}): CultureScoringInput => ({
    symbol,
    brands: [{id: symbol.toLowerCase(), name: symbol}],
    attentionAnomaly: 0.1,
    attentionTrend: 0.05,
    attentionPersistence: 2,
    quietAttention: 0.05,
    categoryShare: 0.5,
    attentionSinceReport: 0.1,
    attentionSlow: 2,
    sentimentSlow: 0.1,
    appRank: null,
    hasThesis: false,
    signals: {r63: 0.02, r126: 0.05, r252: 0.1, vol63: 0.2, ma200dist: 0.05},
    barsCount: 300,
    quoted: true,
    brandsCovered: 1,
    ...patch,
});

describe('the profiles', () => {
    it('each sum to one over the eleven terms, and price-only has one term', () => {
        for (const id of PROFILE_IDS) {
            const weights = CULTURE_PROFILES[id].weights;
            expect(Object.keys(weights).sort()).toEqual([...CULTURE_TERMS].sort());
            expect(CULTURE_TERMS.reduce((sum, term) => sum + weights[term], 0)).toBeCloseTo(1, 9);
        }
        expect(CULTURE_TERMS.filter((term) => CULTURE_PROFILES.price.weights[term] > 0)).toEqual(['momentumLong']);
        expect(CULTURE_PROFILES.spike.weights.momentumLong).toBeGreaterThan(0.3);
        expect(CULTURE_PROFILES.quiet.weights.momentumLong).toBeGreaterThan(0.3);
        for (const term of CULTURE_TERMS) expect(TERM_FEEDS[term].length).toBeGreaterThan(0);
    });
});

describe('effectiveWeights', () => {
    it('keeps the profile’s proportions over the feeds present and zeroes the rest', () => {
        const full = effectiveWeights('spike', ALL_FEEDS);
        expect(CULTURE_TERMS.reduce((sum, term) => sum + full[term], 0)).toBeCloseTo(1, 9);
        expect(full.attentionAnomaly).toBeCloseTo(0.2, 9);

        const priceAndWiki = effectiveWeights('spike', ['price', 'wikipedia']);
        expect(priceAndWiki.attentionSlow).toBe(0);
        expect(priceAndWiki.appRank).toBe(0);
        expect(priceAndWiki.momentumLong).toBeCloseTo(0.4 / 0.7, 9);
        expect(priceAndWiki.attentionAnomaly).toBeCloseTo(0.2 / 0.7, 9);

        const noEarnings = effectiveWeights('quiet', ['price', 'wikipedia', 'mentions', 'press', 'appstore']);
        expect(noEarnings.attentionSinceReport).toBe(0);
        expect(noEarnings.quietAttention).toBeCloseTo(0.15 / 0.95, 9);
        expect(effectiveWeights('quiet', ['price', 'wikipedia']).quietAttention).toBe(0);
    });
});

describe('scoreCultureUniverse', () => {
    it('names the picker first, ranks each term over the symbols that have it, and leaves an unmeasured one neutral', () => {
        const scored = scoreCultureUniverse([
            input('AAA', {attentionAnomaly: Math.log(2)}),
            input('BBB', {attentionAnomaly: 0}),
            input('CCC', {attentionAnomaly: null}),
        ], {profile: 'spike', feeds: ALL_FEEDS});
        expect(scored.every((s) => s.reasons[0] === 'picker Spike')).toBe(true);
        expect(scored[0].reasons).toContain('attention +100.0% vs baseline (rank 1/2)');
        expect(scored[1].reasons).toContain('attention +0.0% vs baseline (rank 2/2)');
        expect(scored[2].reasons).toContain('attention unmeasured — neutral');
        const without = scoreCultureUniverse([input('AAA', {attentionAnomaly: Math.log(2)}), input('BBB', {attentionAnomaly: 0})], {profile: 'spike', feeds: ALL_FEEDS});
        // The unmeasured symbol sits outside the rank: the others' scores are untouched by it.
        expect(scored[0].score).toBeCloseTo(without[0].score, 9);
        expect(scored[1].score).toBeCloseTo(without[1].score, 9);
    });

    it('writes the Quiet picker’s terms with their shapes', () => {
        const [scored] = scoreCultureUniverse([
            input('AAA', {attentionPersistence: 9, quietAttention: Math.log(1.31), categoryShare: 2.1, attentionSinceReport: Math.log(1.25), appRank: 1, hasThesis: true, thesisLabel: 'Celsius'}),
            input('BBB'),
        ], {profile: 'quiet', feeds: ALL_FEEDS});
        expect(scored.reasons).toEqual(expect.arrayContaining([
            'picker Quiet', 'attention held 9 weeks (rank 1/2)', 'quiet attention +31.0% (rank 1/2)', 'category share +2.1 pts (rank 1/2)',
            'since last report +25.0% (rank 1/2)', 'slow attention 2.0 (rank 1/2)', 'brand sentiment +0.1', '6-month momentum +5.0%', 'attention thesis Celsius',
        ]));
        expect(scored.reasons).not.toContain('attention +10.5% vs baseline (rank 1/2)');
        expect(scored.reasons.some((r) => r.startsWith('app rank'))).toBe(false);
    });

    it('reads the neutral reasons, the app rank and the missing report', () => {
        const [scored] = scoreCultureUniverse([
            input('AAA', {attentionPersistence: null, quietAttention: null, categoryShare: null, attentionSinceReport: null, attentionSlow: null}),
        ], {profile: 'quiet', feeds: ALL_FEEDS});
        expect(scored.reasons).toEqual(expect.arrayContaining([
            'attention persistence unmeasured — neutral', 'quiet attention unmeasured — neutral', 'category share unmeasured — neutral',
            'no report date — neutral', 'no attention coverage — neutral',
        ]));
        expect(scored.reasons.some((r) => r.startsWith('brand sentiment'))).toBe(false);
        const [withApp] = scoreCultureUniverse([input('AAA', {appRank: 1 - Math.log(12) / Math.log(200)})], {profile: 'spike', feeds: ALL_FEEDS});
        expect(withApp.reasons).toContain('app rank #12');
    });

    it('ignores every attention term under the price-only profile', () => {
        const universe = [input('AAA', {attentionAnomaly: 5, attentionSlow: 50, hasThesis: true}), input('BBB', {attentionAnomaly: -5, attentionSlow: 0})];
        const [a, b] = scoreCultureUniverse(universe, {profile: 'price', feeds: ALL_FEEDS});
        expect(a.score).toBeCloseTo(b.score, 9);
        expect(a.reasons).toEqual(['picker Price only', '6-month momentum +5.0%']);
    });

    it('caps a positive score under the 200-day average, haircuts the top-quintile volatility, and judges eligibility', () => {
        const universe = (volOfVOL: number) => [
            input('CAP', {signals: {r63: 0.1, r126: 0.2, r252: 0.3, vol63: 0.12, ma200dist: -0.1}}),
            input('VOL', {signals: {r63: 0.1, r126: 0.2, r252: 0.3, vol63: volOfVOL, ma200dist: 0.1}}),
            input('OK', {signals: {r63: 0.05, r126: 0.1, r252: 0.2, vol63: 0.13, ma200dist: 0.1}}),
            input('BARS', {barsCount: MIN_PRICE_BARS - 1, signals: {r63: 0.02, r126: 0.05, r252: 0.1, vol63: 0.14, ma200dist: 0.05}}),
            input('QUOTE', {quoted: false, signals: {r63: 0.02, r126: 0.05, r252: 0.1, vol63: 0.15, ma200dist: 0.05}}),
            input('NOSERIES', {brandsCovered: 0, signals: {r63: 0.02, r126: 0.05, r252: 0.1, vol63: 0.16, ma200dist: 0.05}}),
            input('LOW', {signals: {r63: -0.1, r126: -0.2, r252: -0.3, vol63: 0.11, ma200dist: 0.05}}),
        ];
        const scored = scoreCultureUniverse(universe(0.9), {profile: 'spike', feeds: ALL_FEEDS});
        const byKey = Object.fromEntries(scored.map((s) => [s.symbol, s]));
        expect(byKey.CAP.score).toBeLessThanOrEqual(0);
        expect(byKey.CAP.reasons).toContain('below 200d MA — capped');
        expect(byKey.VOL.reasons).toContain('high volatility haircut');
        // The same universe with VOL the calmest name: its score is the haircut's inverse.
        const calm = scoreCultureUniverse(universe(0.05), {profile: 'spike', feeds: ALL_FEEDS}).find((s) => s.symbol === 'VOL')!;
        expect(calm.reasons).not.toContain('high volatility haircut');
        expect(byKey.VOL.score).toBeCloseTo(calm.score * CULTURE_VOLATILITY_HAIRCUT, 9);
        expect(byKey.VOL.score).toBeGreaterThan(0);
        expect(byKey.OK.eligible).toBe(true);
        expect(byKey.BARS.eligible).toBe(false);
        expect(byKey.BARS.reasons).toContain(`ineligible (${MIN_PRICE_BARS - 1} bars, quoted, attention covered)`);
        expect(byKey.QUOTE.reasons).toContain('ineligible (300 bars, no quote, attention covered)');
        expect(byKey.NOSERIES.reasons).toContain('ineligible (300 bars, quoted, no attention series)');
        expect(byKey.LOW.score).toBeLessThan(byKey.OK.score);
    });

    it('is deterministic and keeps between four and twelve reasons per symbol', () => {
        const universe = [input('AAA'), input('BBB', {attentionAnomaly: 1}), input('CCC', {hasThesis: true, appRank: 0.5})];
        const first = scoreCultureUniverse(universe, {profile: 'spike', feeds: ALL_FEEDS});
        const second = scoreCultureUniverse(universe, {profile: 'spike', feeds: ALL_FEEDS});
        expect(second).toEqual(first);
        for (const s of first) {
            expect(s.reasons.length).toBeGreaterThanOrEqual(4);
            expect(s.reasons.length).toBeLessThanOrEqual(12);
        }
    });
});
