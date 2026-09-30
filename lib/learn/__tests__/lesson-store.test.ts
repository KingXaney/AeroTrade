// The digest's read of the day's concept, with the models stubbed: learners who follow the same
// keyword sets (in any order) share one aggregate within a run; another set, or another run,
// reads its own.

import {beforeEach, describe, expect, it, vi} from 'vitest';

const db = vi.hoisted(() => ({topics: new Map<string, number[]>(), aggregates: [] as number[][]}));

vi.mock('@/database/mongoose', () => ({connectToDatabase: async () => undefined}));
vi.mock('@/database/models/topic.model', () => ({
    default: {find: ({userId}: {userId: string}) => ({select: () => ({lean: async () => (db.topics.get(userId) ?? []).map((keywordSetHash) => ({keywordSetHash}))})})},
}));
vi.mock('@/database/models/topic-article.model', () => ({
    default: {aggregate: async (pipeline: {$match?: {keywordSetHash?: {$in: number[]}}}[]) => {
        db.aggregates.push(pipeline[0].$match?.keywordSetHash?.$in ?? []);
        return [];
    }},
}));

import {readLessonForDigest} from '@/lib/learn/lesson-store';

describe('readLessonForDigest', () => {
    beforeEach(() => {
        db.aggregates = [];
        db.topics = new Map([['a', [3, 1, 2]], ['b', [2, 3, 1, 1]], ['c', [7]], ['none', []]]);
    });

    it('reads one aggregate per distinct keyword-set per run', async () => {
        const first = await readLessonForDigest('a', 'run-1');
        const second = await readLessonForDigest('b', 'run-1');
        await readLessonForDigest('c', 'run-1');
        expect(second).toEqual(first);
        expect(db.aggregates).toEqual([[1, 2, 3], [7]]);
    });

    it('reads again in the next run, and never for a learner with no topics', async () => {
        await readLessonForDigest('a', 'run-2');
        await readLessonForDigest('a', 'run-3');
        await readLessonForDigest('none', 'run-3');
        expect(db.aggregates).toEqual([[1, 2, 3], [1, 2, 3]]);
    });
});
