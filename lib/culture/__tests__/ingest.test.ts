// The daily job's pure pieces: how the queue is cut into model calls, what a batch asks, and
// the summary line the status strip shows.

import {describe, expect, it} from 'vitest';
import {CULTURE_EXTRACTION_BATCH_SIZE, CULTURE_MAX_EXTRACTION_CALLS_PER_DAY} from '@/lib/culture/config';
import {buildCultureBatchPrompt, cultureBatches, describeCultureRun, newsQueryChunks, type CultureRunParts} from '@/lib/culture/ingest';
import type {QueuedCultureItem} from '@/lib/culture/mentions';
import {findBanned} from '@/lib/learn/banned';

const queued = (id: string, mentions: string[]): QueuedCultureItem =>
    ({id, contentHash: 7, source: 'reddit', sourceName: 'r/GenZ', title: `title ${id}`, body: 'body', mentions, datetime: 1});

describe('cultureBatches', () => {
    it('cuts the queue into batches of the configured size, never past the daily budget', () => {
        const queue = Array.from({length: CULTURE_EXTRACTION_BATCH_SIZE * CULTURE_MAX_EXTRACTION_CALLS_PER_DAY + 5}, (_, i) => queued(String(i), []));
        const batches = cultureBatches(queue);
        expect(batches).toHaveLength(CULTURE_MAX_EXTRACTION_CALLS_PER_DAY);
        expect(batches.every((batch) => batch.length === CULTURE_EXTRACTION_BATCH_SIZE)).toBe(true);
        expect(cultureBatches([])).toEqual([]);
        expect(cultureBatches([queued('a', [])])).toEqual([[queued('a', [])]]);
    });
});

describe('buildCultureBatchPrompt', () => {
    it('numbers the items from one and lists only the brands the matcher found', () => {
        const {prompt, refs, allowedIds} = buildCultureBatchPrompt([queued('x', ['celsius', 'crocs']), queued('y', ['crocs'])]);
        expect(refs).toEqual([{n: 1, id: 'x', source: 'reddit'}, {n: 2, id: 'y', source: 'reddit'}]);
        expect(allowedIds).toEqual(['celsius', 'crocs']);
        expect(prompt).toContain('"celsius — Celsius"');
        expect(prompt).toContain('"crocs — Crocs"');
        expect(prompt).not.toContain('chipotle');
        expect(prompt).toContain('"n": 2');
    });
});

describe('newsQueryChunks', () => {
    it('splits the fixed queries into bounded chunks and drops none', () => {
        const chunks = newsQueryChunks(5);
        expect(chunks.flat().length).toBe(22);
        expect(chunks.every((chunk) => chunk.length <= 5)).toBe(true);
    });
});

describe('describeCultureRun', () => {
    const parts: CultureRunParts = {
        wikipedia: {written: 180, missing: 2, failed: 0},
        appstore: {mapped: 14, ok: true},
        youtube: {inserted: 50, skipped: false, ok: true},
        reddit: {inserted: 0, skipped: true},
        news: {inserted: 90, skipped: false, ok: false},
        social: {inserted: 0, adapter: null},
        items: 140,
        matched: 61,
        extracted: 60,
        aliasFolded: 1,
        attentionFolded: 9,
        entitiesTouched: 70,
        deleted: 0,
        suggestions: {added: 3, counted: 2},
        quotaHit: true,
    };

    it('names every source and every count, and reads as a report', () => {
        const line = describeCultureRun(parts);
        expect(line).toContain('wikipedia 180 docs, 2 titles missing');
        expect(line).toContain('app store 14 brands');
        expect(line).toContain('youtube 50 new');
        expect(line).toContain('reddit skipped (no app)');
        expect(line).toContain('news 90 new, a query failed');
        expect(line).toContain('140 items today, 61 naming a brand, 60 labelled by the model, 1 by alias');
        expect(line).toContain("the model's daily quota ran out");
        expect(line).toContain('9 attention surprises; 70 brands touched, 0 pruned; suggestions +3/2');
        expect(line).not.toContain('undefined');
        expect(findBanned(line, 'copy')).toEqual([]);
    });

    it('says when a source is off or failed', () => {
        const line = describeCultureRun({...parts, appstore: {mapped: 0, ok: false}, youtube: {inserted: 0, skipped: true, ok: true}, news: {inserted: 0, skipped: true, ok: true}, social: {inserted: 4, adapter: 'provider'}, quotaHit: false});
        expect(line).toContain('app store failed');
        expect(line).toContain('youtube skipped (no key)');
        expect(line).toContain('news off');
        expect(line).toContain('provider 4 new');
        expect(line).not.toContain('quota');
    });
});
