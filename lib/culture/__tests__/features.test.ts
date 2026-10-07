import {describe, expect, it} from 'vitest';
import {APPSTORE_RELEVANCE, WIKI_RELEVANCE} from '@/lib/culture/config';
import {appstoreAnomaly, attentionFoldsFor, mean, median, wikipediaAnomaly} from '@/lib/culture/features';
import {addCalendarDays} from '@/lib/dates';
import type {AttentionPoint} from '@/lib/culture/types';

const AS_OF = '2026-10-05';

// A flat series of `days` points ending on `end`, each `value`, with the last `spikeDays`
// points at `spike` instead.
const series = (days: number, value: number, {end = AS_OF, spikeDays = 0, spike = value} = {}): AttentionPoint[] =>
    Array.from({length: days}, (_, i) => {
        const date = addCalendarDays(end, -(days - 1 - i));
        return {date, value: i >= days - spikeDays ? spike : value};
    });

describe('mean and median', () => {
    it('are what they say, and 0 on nothing', () => {
        expect(mean([1, 2, 6])).toBe(3);
        expect(median([5, 1, 3])).toBe(3);
        expect(median([4, 1, 3, 2])).toBe(2.5);
        expect(mean([])).toBe(0);
        expect(median([])).toBe(0);
    });
});

describe('wikipediaAnomaly', () => {
    it('is null without a month of baseline or a week of recent views', () => {
        expect(wikipediaAnomaly(series(20, 100), AS_OF)).toBeNull();
        expect(wikipediaAnomaly(series(60, 100, {end: addCalendarDays(AS_OF, -10)}), AS_OF)).toBeNull();
    });

    it('is no surprise on a flat series, and none below the baseline', () => {
        expect(wikipediaAnomaly(series(100, 300), AS_OF)).toMatchObject({ratio: 1, importance: 0});
        expect(wikipediaAnomaly(series(100, 300, {spikeDays: 7, spike: 100}), AS_OF)?.importance).toBe(0);
    });

    it('reaches full importance at a tripling and scales in between', () => {
        const tripled = wikipediaAnomaly(series(100, 299, {spikeDays: 7, spike: 899}), AS_OF)!;
        expect(tripled.ratio).toBeCloseTo(3, 6);
        expect(tripled.importance).toBeCloseTo(1, 6);
        const bigger = wikipediaAnomaly(series(100, 100, {spikeDays: 7, spike: 2000}), AS_OF)!;
        expect(bigger.importance).toBe(1);
        const half = wikipediaAnomaly(series(100, 299, {spikeDays: 7, spike: 299 * Math.sqrt(3) + Math.sqrt(3) - 1}), AS_OF)!;
        expect(half.importance).toBeCloseTo(0.5, 3);
    });

    it('judges the week against the median, so one old spike cannot flatten a surge', () => {
        const withOldSpike = series(100, 99, {spikeDays: 7, spike: 299}).map((p, i) => (i === 10 ? {...p, value: 50_000} : p));
        expect(wikipediaAnomaly(withOldSpike, AS_OF)?.importance).toBeCloseTo(1, 6);
    });

    it('tolerates gaps in the series', () => {
        const gappy = series(100, 99, {spikeDays: 7, spike: 299}).filter((_, i) => i % 3 !== 0);
        expect(gappy.length).toBeLessThan(100);
        expect(wikipediaAnomaly(gappy, AS_OF)?.importance).toBeCloseTo(1, 6);
    });
});

describe('appstoreAnomaly', () => {
    it('is null off the chart, and nothing for a steady number one', () => {
        expect(appstoreAnomaly([], AS_OF)).toBeNull();
        expect(appstoreAnomaly(series(5, 100, {end: addCalendarDays(AS_OF, -1)}), AS_OF)).toBeNull();
        expect(appstoreAnomaly(series(91, 100), AS_OF)).toMatchObject({climb: 0, importance: 0});
    });

    it('is full for a newcomer in the top fifty and partial for a smaller climb', () => {
        expect(appstoreAnomaly([{date: AS_OF, value: 96}], AS_OF)).toMatchObject({climb: 96, importance: 1});
        expect(appstoreAnomaly([{date: AS_OF, value: 25}], AS_OF)?.importance).toBeCloseTo(0.5, 6);
        // On the chart for forty days at 60, today 90: the median over ninety days counts the
        // fifty absent days as 0, so the climb is the whole 90.
        const forty = series(40, 60, {end: addCalendarDays(AS_OF, -1)});
        expect(appstoreAnomaly([...forty, {date: AS_OF, value: 90}], AS_OF)?.climb).toBe(90);
    });
});

describe('attentionFoldsFor', () => {
    it('folds one surprise per brand and source, with the source and its relevance', () => {
        const byBrand = new Map([
            ['celsius', {wikipedia: series(100, 99, {spikeDays: 7, spike: 299}), appstore: []}],
            ['duolingo', {wikipedia: series(100, 100), appstore: [{date: AS_OF, value: 96}]}],
            ['quiet', {wikipedia: series(100, 100), appstore: []}],
        ]);
        const folds = attentionFoldsFor(byBrand, AS_OF);
        expect(folds).toEqual([
            {kind: 'attention', source: 'wikipedia', importance: expect.closeTo(1, 6), entities: [{key: 'celsius', sentiment: 0, relevance: WIKI_RELEVANCE}]},
            {kind: 'attention', source: 'appstore', importance: 1, entities: [{key: 'duolingo', sentiment: 0, relevance: APPSTORE_RELEVANCE}]},
        ]);
    });
});
