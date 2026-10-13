import {describe, expect, it} from 'vitest';
import {DAILY_DECAY_SLOW, ENTITY_STALE_DAYS, THESIS_WEIGHT_THRESHOLD} from '@/lib/brain/config';
import {SOURCE_FOLD_WEIGHTS} from '@/lib/culture/config';
import {planCultureFold, weightedImportance, type CultureEntityState} from '@/lib/culture/fold';
import type {CultureBrand, CultureFold} from '@/lib/culture/types';

const TODAY = '2026-10-06';
const NOW = Date.parse('2026-10-06T11:00:00Z');
const DAY_MS = 86_400_000;

const CATALOG: readonly CultureBrand[] = [
    {id: 'celsius', name: 'Celsius', category: 'drinks', aliases: ['Celsius'], owner: {company: 'Celsius Holdings', ticker: 'CELH', listing: 'us'}, wikipedia: ['Celsius_Holdings']},
    {id: 'poppi', name: 'Poppi', category: 'drinks', aliases: ['Poppi'], owner: {company: 'PepsiCo', ticker: 'PEP', listing: 'us'}, wikipedia: ['Poppi']},
    {id: 'prime', name: 'Prime', category: 'drinks', aliases: ['Prime Hydration'], owner: null, wikipedia: ['Prime']},
];

const doc = (key: string, over: Partial<CultureEntityState> = {}): CultureEntityState => ({
    key,
    weightFast: 0,
    sentimentSumFast: 0,
    weightSlow: 0,
    sentimentSumSlow: 0,
    decayedTo: TODAY,
    links: [],
    thesisSince: null,
    peakSlowWeight: 0,
    lastSeenAtMs: NOW,
    lastFoldRunId: null,
    attentionDay: null,
    ...over,
});

const item = (entities: CultureFold['entities'], importance = 1, source: CultureFold['source'] = 'reddit'): CultureFold =>
    ({kind: 'item', source, importance, entities});

const attention = (key: string, importance = 1, source: CultureFold['source'] = 'wikipedia'): CultureFold =>
    ({kind: 'attention', source, importance, entities: [{key, sentiment: 0, relevance: 1}]});

const plan = (docs: CultureEntityState[], folds: CultureFold[], runId = 'run-1') =>
    planCultureFold({docs, folds, today: TODAY, nowMs: NOW, runId, catalog: CATALOG});

describe('weightedImportance', () => {
    it('scales a fold by its source, news lowest', () => {
        expect(weightedImportance(item([], 1, 'wikipedia'))).toBe(1);
        expect(weightedImportance(item([], 1, 'news'))).toBe(SOURCE_FOLD_WEIGHTS.news);
        expect(SOURCE_FOLD_WEIGHTS.news).toBeLessThan(SOURCE_FOLD_WEIGHTS.reddit);
        expect(SOURCE_FOLD_WEIGHTS.reddit).toBeLessThan(SOURCE_FOLD_WEIGHTS.wikipedia);
    });
});

describe('planCultureFold', () => {
    it('creates an entity from the catalog and folds the weighted mass into both layers', () => {
        const {writes, entitiesTouched} = plan([], [item([{key: 'celsius', sentiment: 0.5, relevance: 1}], 1, 'reddit')]);
        expect(entitiesTouched).toBe(1);
        expect(writes).toHaveLength(1);
        expect(writes[0].key).toBe('celsius');
        expect(writes[0].set).toMatchObject({
            displayName: 'Celsius', category: 'drinks', ticker: 'CELH', listing: 'us',
            weightFast: SOURCE_FOLD_WEIGHTS.reddit, weightSlow: SOURCE_FOLD_WEIGHTS.reddit,
            sentimentSumSlow: 0.5 * SOURCE_FOLD_WEIGHTS.reddit,
            decayedTo: TODAY, lastFoldRunId: 'run-1', lastSeenAt: NOW,
        });
        expect(writes[0].set.attentionDay).toBeUndefined();
    });

    it('draws symmetric links from an item that names two brands, and none from attention', () => {
        const {writes} = plan([], [
            item([{key: 'celsius', sentiment: 0, relevance: 1}, {key: 'poppi', sentiment: 0, relevance: 0.5}], 1, 'wikipedia'),
            attention('prime'),
        ]);
        const byKey = Object.fromEntries(writes.map((w) => [w.key, w.set]));
        expect(byKey.celsius.links).toEqual([{key: 'poppi', weight: 0.5}]);
        expect(byKey.poppi.links).toEqual([{key: 'celsius', weight: 0.5}]);
        expect(byKey.prime.links).toEqual([]);
        expect(byKey.prime.attentionDay).toBe(TODAY);
    });

    it('is a no-op for an entity that already absorbed this run', () => {
        const existing = doc('celsius', {weightSlow: 3, weightFast: 3, lastFoldRunId: 'run-1'});
        const {writes, entitiesTouched} = plan([existing], [item([{key: 'celsius', sentiment: 0, relevance: 1}])], 'run-1');
        expect(entitiesTouched).toBe(1);
        expect(writes).toEqual([]);
        const again = plan([existing], [item([{key: 'celsius', sentiment: 0, relevance: 1}])], 'run-2');
        expect(again.writes[0].set.weightSlow).toBeGreaterThan(3);
    });

    it('folds attention for a brand once a day, and its items still', () => {
        const existing = doc('celsius', {weightSlow: 1, weightFast: 1, attentionDay: TODAY});
        const {writes, attentionFolded} = plan([existing], [attention('celsius'), item([{key: 'celsius', sentiment: 0, relevance: 1}], 1, 'reddit')]);
        expect(attentionFolded).toBe(0);
        expect(writes[0].set.weightSlow).toBeCloseTo(1 + SOURCE_FOLD_WEIGHTS.reddit, 9);
    });

    it('decays an entity nobody mentioned, and skips one already decayed to today', () => {
        const stale = doc('poppi', {weightSlow: 10, weightFast: 10, decayedTo: '2026-10-05'});
        const fresh = doc('prime', {weightSlow: 10, weightFast: 10, decayedTo: TODAY});
        const {writes} = plan([stale, fresh], []);
        expect(writes.map((w) => w.key)).toEqual(['poppi']);
        expect(writes[0].set.weightSlow).toBeCloseTo(10 * DAILY_DECAY_SLOW, 9);
        expect(writes[0].set.lastFoldRunId).toBeUndefined();
    });

    it('deletes a faded entity nobody has seen for a long time, and keeps a recent one', () => {
        const old = doc('poppi', {weightSlow: 0.001, weightFast: 0.001, lastSeenAtMs: NOW - (ENTITY_STALE_DAYS + 1) * DAY_MS});
        const recent = doc('prime', {weightSlow: 0.001, weightFast: 0.001, lastSeenAtMs: NOW - DAY_MS});
        const {writes, deletes} = plan([old, recent], []);
        expect(deletes).toEqual(['poppi']);
        expect(writes).toEqual([]);
    });

    it('enters a thesis when the slow weight clears the line', () => {
        const near = doc('celsius', {weightSlow: THESIS_WEIGHT_THRESHOLD - 0.5, weightFast: 1});
        const {writes} = plan([near], [item([{key: 'celsius', sentiment: 0, relevance: 1}], 1, 'wikipedia')]);
        expect(writes[0].set.thesisSince).toBe(NOW);
        expect(writes[0].set.peakSlowWeight).toBeCloseTo(THESIS_WEIGHT_THRESHOLD + 0.5, 9);
    });

    it('ignores a fold for a key the catalog does not have, and a zero-weight fold', () => {
        const {writes, entitiesTouched} = plan([], [
            item([{key: 'not-a-brand', sentiment: 0, relevance: 1}]),
            item([{key: 'celsius', sentiment: 0, relevance: 1}], 0),
        ]);
        expect(writes).toEqual([]);
        expect(entitiesTouched).toBe(0);
    });

    it('never mutates its inputs', () => {
        const existing = doc('celsius', {weightSlow: 2, weightFast: 2, links: [{key: 'poppi', weight: 1}]});
        const snapshot = JSON.stringify(existing);
        plan([existing], [item([{key: 'celsius', sentiment: 1, relevance: 1}, {key: 'poppi', sentiment: 0, relevance: 1}])]);
        expect(JSON.stringify(existing)).toBe(snapshot);
    });
});
