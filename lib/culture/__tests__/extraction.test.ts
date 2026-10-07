import {describe, expect, it} from 'vitest';
import {REDDIT_IMPORTANCE_CAP} from '@/lib/brain/config';
import {cleanBrandName, parseCultureResponse, readCultureBatch, type BatchItemRef} from '@/lib/culture/extraction';
import {buildCultureExtractionPrompt, CULTURE_EXTRACTION_PROMPT} from '@/lib/culture/prompts';
import {CULTURE_SIGNALS} from '@/lib/culture/types';
import {findBanned} from '@/lib/learn/banned';

const answer = (items: unknown[]) => JSON.stringify({items});

const BATCH: BatchItemRef[] = [
    {n: 1, id: 'item-1', source: 'reddit'},
    {n: 2, id: 'item-2', source: 'news'},
    {n: 3, id: 'item-3', source: 'youtube'},
];

const deps = {allowedIds: new Set(['crocs', 'chipotle', 'celsius']), isCatalogName: (name: string) => name.toLowerCase() === 'crocs'};

describe('parseCultureResponse', () => {
    it('reads bare JSON and fenced JSON alike', () => {
        const items = [{n: 1, importance: 0.5, signal: 'hype', brands: [], newBrands: []}];
        expect(parseCultureResponse(answer(items))?.items).toHaveLength(1);
        expect(parseCultureResponse('```json\n' + answer(items) + '\n```')?.items).toHaveLength(1);
    });

    it('is null for garbage, truncated JSON or the wrong shape', () => {
        expect(parseCultureResponse('')).toBeNull();
        expect(parseCultureResponse('not json')).toBeNull();
        expect(parseCultureResponse('{"items":[{"n":1,')).toBeNull();
        expect(parseCultureResponse('{"articles":[]}')).toBeNull();
        expect(parseCultureResponse(answer([{n: 'one', importance: 0.5, signal: 'hype'}]))).toBeNull();
    });

    it('fills a missing brands or newBrands list', () => {
        const parsed = parseCultureResponse(answer([{n: 1, importance: 0.5, signal: 'hype'}]));
        expect(parsed?.items[0].brands).toEqual([]);
        expect(parsed?.items[0].newBrands).toEqual([]);
    });
});

describe('readCultureBatch', () => {
    it('keeps only ids the batch was shown, each once, clamped, at most six', () => {
        const parsed = parseCultureResponse(answer([{
            n: 2, importance: 0.7, signal: 'adoption',
            brands: [
                {id: 'crocs', sentiment: 2, relevance: -1},
                {id: 'crocs', sentiment: 0.1, relevance: 0.1},
                {id: 'NVDA', sentiment: 0.5, relevance: 0.5},
                {id: 'chipotle', sentiment: -0.4, relevance: 0.9},
            ],
        }]))!;
        const [item] = readCultureBatch(parsed, BATCH, deps);
        expect(item.itemId).toBe('item-2');
        expect(item.brands).toEqual([
            {key: 'crocs', sentiment: 1, relevance: 0},
            {key: 'chipotle', sentiment: -0.4, relevance: 0.9},
        ]);
        expect(item.signal).toBe('adoption');
        expect(item.importance).toBe(0.7);

        const many = parseCultureResponse(answer([{
            n: 2, importance: 0.7, signal: 'hype',
            brands: Array.from({length: 9}, (_, i) => ({id: ['crocs', 'chipotle', 'celsius'][i % 3] + (i >= 3 ? String(i) : ''), sentiment: 0, relevance: 1})),
        }]))!;
        expect(readCultureBatch(many, BATCH, {...deps, allowedIds: new Set(many.items[0].brands.map((b) => b.id))})[0].brands).toHaveLength(6);
    });

    it('uses an item number once and ignores a number it never sent', () => {
        const parsed = parseCultureResponse(answer([
            {n: 1, importance: 0.5, signal: 'hype', brands: [{id: 'crocs', sentiment: 0, relevance: 1}]},
            {n: 1, importance: 0.9, signal: 'hype', brands: [{id: 'chipotle', sentiment: 0, relevance: 1}]},
            {n: 9, importance: 0.9, signal: 'hype', brands: [{id: 'chipotle', sentiment: 0, relevance: 1}]},
        ]))!;
        const items = readCultureBatch(parsed, BATCH, deps);
        expect(items.map((i) => i.itemId)).toEqual(['item-1']);
        expect(items[0].brands[0].key).toBe('crocs');
    });

    it("caps a Reddit item's importance and clamps every importance", () => {
        const parsed = parseCultureResponse(answer([
            {n: 1, importance: 1, signal: 'hype', brands: []},
            {n: 2, importance: 4, signal: 'hype', brands: []},
            {n: 3, importance: -1, signal: 'hype', brands: []},
        ]))!;
        const [reddit, news, youtube] = readCultureBatch(parsed, BATCH, deps);
        expect(reddit.importance).toBe(REDDIT_IMPORTANCE_CAP);
        expect(news.importance).toBe(1);
        expect(youtube.importance).toBe(0);
    });

    it("reads an unknown signal as 'other'", () => {
        const parsed = parseCultureResponse(answer([{n: 1, importance: 0.5, signal: 'moonshot', brands: []}]))!;
        expect(readCultureBatch(parsed, BATCH, deps)[0].signal).toBe('other');
        for (const signal of CULTURE_SIGNALS) {
            const ok = parseCultureResponse(answer([{n: 1, importance: 0.5, signal, brands: []}]))!;
            expect(readCultureBatch(ok, BATCH, deps)[0].signal).toBe(signal);
        }
    });

    it('cleans suggested names, drops catalog brands and duplicates, keeps three', () => {
        const parsed = parseCultureResponse(answer([{
            n: 1, importance: 0.5, signal: 'hype', brands: [],
            newBrands: ['  Owala  ', 'owala', 'Crocs', '<script>', 'Liquid Death', 'Stanley 1913', 'Olipop', 'x'.repeat(80)],
        }]))!;
        expect(readCultureBatch(parsed, BATCH, deps)[0].newBrands).toEqual(['Owala', 'Liquid Death', 'Stanley 1913']);
    });

    it('still returns an item that named no brand, so it is not re-sent', () => {
        const parsed = parseCultureResponse(answer([{n: 3, importance: 0.5, signal: 'other', brands: [{id: 'nope', sentiment: 0, relevance: 1}]}]))!;
        const [item] = readCultureBatch(parsed, BATCH, deps);
        expect(item.itemId).toBe('item-3');
        expect(item.brands).toEqual([]);
    });
});

describe('cleanBrandName', () => {
    it('keeps a name as people write one and nothing else', () => {
        expect(cleanBrandName("Trader Joe's")).toBe("Trader Joe's");
        expect(cleanBrandName('Dr. Martens')).toBe('Dr. Martens');
        expect(cleanBrandName('H&M')).toBe('H&M');
        expect(cleanBrandName('  Owala\n ring ')).toBe('Owala ring');
        expect(cleanBrandName('a')).toBeNull();
        expect(cleanBrandName('<b>Owala</b>')).toBeNull();
        expect(cleanBrandName('$CROX')).toBeNull();
        expect(cleanBrandName(42)).toBeNull();
        expect(cleanBrandName('Very Long Brand Name That Goes On And On Forever')?.length).toBeLessThanOrEqual(40);
    });
});

describe('the extraction prompt', () => {
    it('describes, never advises, and asks for the shape the schema reads', () => {
        expect(findBanned(CULTURE_EXTRACTION_PROMPT, 'advice')).toEqual([]);
        expect(CULTURE_EXTRACTION_PROMPT).toContain('"newBrands"');
        for (const signal of CULTURE_SIGNALS) expect(CULTURE_EXTRACTION_PROMPT).toContain(signal);
    });

    it('fills the items and the brands as JSON, through a replacer', () => {
        const prompt = buildCultureExtractionPrompt(
            [{n: 1, source: 'reddit', title: 'Got $& Crocs', body: 'body'}],
            [{id: 'crocs', name: 'Crocs'}],
        );
        expect(prompt).toContain('"Got $& Crocs"');
        expect(prompt).toContain('"crocs — Crocs"');
        expect(prompt).not.toContain('{{items}}');
        expect(prompt).not.toContain('{{brands}}');
    });
});
