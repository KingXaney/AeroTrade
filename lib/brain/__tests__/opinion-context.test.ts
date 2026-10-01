// The second opinion's one context reader, over a stub of the driver's Db. The server and the
// local CLI script both call it, so these pin what both send: the shapes, the rounding, the
// sentiment average (held to lib/brain/decay's), and the collection names (held to the models).

import {describe, expect, it} from 'vitest';
import type {Db} from 'mongodb';
import {
    GLOBAL_SUGGESTIONS_SCOPE,
    OPINION_COLLECTIONS,
    SECOND_OPINION_NARRATIVE_COUNT,
    SECOND_OPINION_THESIS_COUNT,
    readOpinionContext,
} from '@/lib/brain/opinion-context';
import {sentimentAvg} from '@/lib/brain/decay';
import BrainEntity from '@/database/models/brain-entity.model';
import NewsItem from '@/database/models/news-item.model';
import SuggestionSet, {GLOBAL_SUGGESTIONS_USER} from '@/database/models/suggestion-set.model';

type Row = Record<string, unknown>;

// Just enough of the driver: find(filter).sort({field: -1}).limit(n).toArray() and findOne.
const stubDb = (collections: Record<string, Row[]>): Db => ({
    collection: (name: string) => ({
        find: (filter: Row = {}) => {
            let rows = [...(collections[name] ?? [])];
            if ('thesisSince' in filter) rows = rows.filter((r) => r.thesisSince != null);
            const cursor = {
                sort: (spec: Record<string, number>) => {
                    const [field] = Object.keys(spec);
                    rows.sort((a, b) => Number(b[field] ?? 0) - Number(a[field] ?? 0));
                    return cursor;
                },
                limit: (n: number) => {
                    rows = rows.slice(0, n);
                    return cursor;
                },
                toArray: async () => rows,
            };
            return cursor;
        },
        findOne: async (filter: Row) => (collections[name] ?? []).find((r) => r.userId === filter.userId) ?? null,
    }),
}) as unknown as Db;

const entity = (key: string, weightSlow: number, sentimentSumSlow: number, thesisSince: Date | null = null): Row =>
    ({key, type: 'ticker', displayName: key, weightSlow, sentimentSumSlow, thesisSince});

describe('readOpinionContext', () => {
    it('reads the theses, narratives, latest global decisions and headlines in the prompt\'s shape', async () => {
        const since = new Date('2026-09-01T12:00:00Z');
        const db = stubDb({
            [OPINION_COLLECTIONS.entities]: [entity('NVDA', 9.876, 4.938, since), entity('AAPL', 3.333, -1, null), entity('ZERO', 1e-10, 1, since)],
            [OPINION_COLLECTIONS.suggestionSets]: [{userId: GLOBAL_SUGGESTIONS_SCOPE, date: '2026-09-28', items: [{symbol: 'NVDA', action: 'buy', targetWeight: 0.126, reasons: ['news']}, {symbol: 'XLE', action: 'hold'}]}],
            [OPINION_COLLECTIONS.news]: [{headline: 'H', source: 'Wire', sourceType: 'finance', publishedDate: '2026-09-28', datetime: 1}],
        });
        const context = await readOpinionContext(db);
        expect(context.theses).toEqual([
            {name: 'NVDA', type: 'ticker', weightSlow: 9.88, sentimentSlow: 0.5, activeSinceMs: since.getTime()},
            {name: 'ZERO', type: 'ticker', weightSlow: 0, sentimentSlow: 0, activeSinceMs: since.getTime()},
        ]);
        expect(context.narratives.map((n) => [n.key, n.sentimentSlow, n.thesisActive])).toEqual([['NVDA', 0.5, true], ['AAPL', -0.3, false], ['ZERO', 0, true]]);
        expect(context.decisions).toEqual({
            date: '2026-09-28',
            kind: 'executed',
            items: [{symbol: 'NVDA', action: 'buy', targetWeightPct: 13, reasons: ['news']}, {symbol: 'XLE', action: 'hold', targetWeightPct: 0, reasons: []}],
        });
        expect(context.headlines).toEqual([{headline: 'H', source: 'Wire', kind: 'finance', date: '2026-09-28'}]);
    });

    it('caps the theses and narratives it reads, and has no decisions before the first run', async () => {
        const many = Array.from({length: 40}, (_, i) => entity(`S${i}`, 40 - i, 0, new Date(0)));
        const context = await readOpinionContext(stubDb({[OPINION_COLLECTIONS.entities]: many}));
        expect(context.theses).toHaveLength(SECOND_OPINION_THESIS_COUNT);
        expect(context.narratives).toHaveLength(SECOND_OPINION_NARRATIVE_COUNT);
        expect(context.decisions).toBeNull();
    });

    it('averages sentiment exactly as the brain does', async () => {
        const cases: [number, number][] = [[1.5, 3], [1, 0], [1, 1e-10], [-2, 7]];
        const db = stubDb({[OPINION_COLLECTIONS.entities]: cases.map(([sum, weight], i) => entity(`E${i}`, weight, sum))});
        const {narratives} = await readOpinionContext(db);
        for (const [i, [sum, weight]] of cases.entries()) {
            const row = narratives.find((n) => n.key === `E${i}`);
            expect(row?.sentimentSlow).toBe(Number(sentimentAvg(sum, weight).toFixed(2)));
        }
    });
});

describe('the names it reads by', () => {
    it('match the models', () => {
        expect(BrainEntity.collection.collectionName).toBe(OPINION_COLLECTIONS.entities);
        expect(SuggestionSet.collection.collectionName).toBe(OPINION_COLLECTIONS.suggestionSets);
        expect(NewsItem.collection.collectionName).toBe(OPINION_COLLECTIONS.news);
        expect(GLOBAL_SUGGESTIONS_USER).toBe(GLOBAL_SUGGESTIONS_SCOPE);
    });
});
