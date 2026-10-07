import {describe, expect, it} from 'vitest';
import {brandMentions, compileCatalog, countByBrand, isCatalogName, prioritizeQueue, type QueuedCultureItem} from '@/lib/culture/mentions';
import type {CultureBrand} from '@/lib/culture/types';

const brand = (id: string, aliases: CultureBrand['aliases']): CultureBrand =>
    ({id, name: id, category: 'drinks', aliases, owner: null, wikipedia: [id]});

const SMALL: readonly CultureBrand[] = [
    brand('chipotle', ['Chipotle']),
    brand('target', [{term: 'Target', cased: true}]),
    brand('gap', [{term: 'GAP', cased: true}, {term: 'Gap', cased: true}]),
    brand('crocs', ['Crocs']),
    brand('elf', ['e.l.f.', 'elf cosmetics']),
    brand('on-running', ['On Running', 'On Cloud']),
];

const compiled = compileCatalog(SMALL);

describe('brandMentions', () => {
    it('matches a plain alias as a whole word, whatever its case', () => {
        expect(brandMentions({title: 'I love chipotle', body: ''}, compiled)).toEqual(['chipotle']);
        expect(brandMentions({title: 'CHIPOTLE bowls', body: ''}, compiled)).toEqual(['chipotle']);
        expect(brandMentions({title: 'chipotlex', body: ''}, compiled)).toEqual([]);
        expect(brandMentions({title: 'Chipotle’s new menu', body: ''}, compiled)).toEqual(['chipotle']);
    });

    it('matches a cased alias only as written', () => {
        expect(brandMentions({title: 'Target run', body: ''}, compiled)).toEqual(['target']);
        expect(brandMentions({title: 'my target weight', body: ''}, compiled)).toEqual([]);
        expect(brandMentions({title: 'the GAP hoodie', body: ''}, compiled)).toEqual(['gap']);
        expect(brandMentions({title: 'Gap jeans', body: ''}, compiled)).toEqual(['gap']);
        expect(brandMentions({title: 'a gap in the market', body: ''}, compiled)).toEqual([]);
    });

    it('reads the body as well as the title, and counts a brand once', () => {
        expect(brandMentions({title: 'Haul', body: 'Crocs, more crocs, and Crocs again. Also Chipotle.'}, compiled)).toEqual(['chipotle', 'crocs']);
    });

    it('never fires on a cashtag', () => {
        expect(brandMentions({title: 'bought $crocs today', body: ''}, compiled)).toEqual([]);
    });

    it('handles dotted and multi-word aliases', () => {
        expect(brandMentions({title: 'e.l.f. lip oil is back', body: ''}, compiled)).toEqual(['elf']);
        expect(brandMentions({title: 'myself and I', body: ''}, compiled)).toEqual([]);
        expect(brandMentions({title: 'got the On Cloud 5', body: ''}, compiled)).toEqual(['on-running']);
        expect(brandMentions({title: 'put on running shoes', body: ''}, compiled)).toEqual(['on-running']);
        expect(brandMentions({title: 'later on', body: ''}, compiled)).toEqual([]);
    });

    it('is compiled once per catalog object', () => {
        expect(compileCatalog(SMALL)).toBe(compiled);
    });
});

describe('isCatalogName', () => {
    it('knows a name the catalog already has under any alias', () => {
        expect(isCatalogName('Chipotle', compiled)).toBe(true);
        expect(isCatalogName('elf cosmetics', compiled)).toBe(true);
        expect(isCatalogName('Owala', compiled)).toBe(false);
    });
});

describe('countByBrand', () => {
    it('counts items per brand per source and sums their scores', () => {
        const counts = countByBrand([
            {source: 'reddit', mentions: ['crocs', 'chipotle'], score: 120},
            {source: 'reddit', mentions: ['crocs'], score: 30},
            {source: 'news', mentions: ['crocs']},
            {source: 'youtube', mentions: [], score: 1000},
        ]);
        expect(counts.get('crocs')?.get('reddit')).toEqual({count: 2, scoreSum: 150});
        expect(counts.get('crocs')?.get('news')).toEqual({count: 1, scoreSum: 0});
        expect(counts.get('chipotle')?.get('reddit')).toEqual({count: 1, scoreSum: 120});
        expect(counts.has('target')).toBe(false);
    });
});

describe('prioritizeQueue', () => {
    const item = (id: string, source: QueuedCultureItem['source'], mentions: string[], score?: number, datetime = 0): QueuedCultureItem =>
        ({id, contentHash: 1, source, sourceName: source, title: id, body: '', mentions, score, datetime});

    it('puts co-mentions first, then behaviour before the press, then the loudest, and cuts at the limit', () => {
        const queue = prioritizeQueue([
            item('news-two', 'news', ['a', 'b']),
            item('reddit-none', 'reddit', [], 999),
            item('reddit-one-low', 'reddit', ['a'], 10),
            item('youtube-one', 'youtube', ['a'], 5000),
            item('reddit-one-high', 'reddit', ['a'], 500),
            item('news-one', 'news', ['a']),
            item('reddit-two', 'reddit', ['a', 'b'], 1),
            item('news-none-new', 'news', [], undefined, 20),
            item('news-none-old', 'news', [], undefined, 10),
        ], 8);
        expect(queue.map((q) => q.id)).toEqual([
            'reddit-two', 'news-two',
            'reddit-one-high', 'reddit-one-low', 'youtube-one', 'news-one',
            'reddit-none', 'news-none-new',
        ]);
    });

    it('never returns more than the limit, nor fewer than it has', () => {
        expect(prioritizeQueue([item('a', 'news', [])], 5)).toHaveLength(1);
        expect(prioritizeQueue([item('a', 'news', []), item('b', 'news', [])], 0)).toEqual([]);
    });
});
