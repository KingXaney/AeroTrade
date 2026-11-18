// ⌘K runs whatever row is selected when Enter is pressed, and cmdk selects the first row that can
// be run after every keystroke. Typing "AAPL" and pressing Enter once followed a topic called
// AAPL: the Follow row came before the stocks, and an earlier query's stock rows stood in until
// the search for this one answered. These hold the two rules that stop it.

import {describe, expect, it} from 'vitest';

import {POPULAR_STOCKS_SHOWN, TOPIC_MIN_CHARS, paletteRows, type StockAnswer} from '@/lib/shell/palette';

const TOPIC_MAX = 40;
const popular = Array.from({length: 14}, (_, i) => `POP${i}`);
const rows = (term: string, answer: StockAnswer<string> | null = null) =>
    paletteRows({term, answer, popular, topicMax: TOPIC_MAX});

describe('the palette with nothing typed', () => {
    it('draws the popular stocks, cut to the first ten, and no topic row', () => {
        const view = rows('');
        expect(view).toEqual({query: '', searching: false, stocks: popular.slice(0, POPULAR_STOCKS_SHOWN), topic: 'none'});
        expect(view.stocks).toHaveLength(10);
    });

    it('reads spaces alone as nothing typed, whatever an earlier search answered', () => {
        expect(rows('   ', {query: 'AAPL', stocks: ['AAPL']})).toEqual(rows(''));
    });
});

describe('while the stock search for the query in the box is out', () => {
    it('draws no stock row and keeps the topic row waiting, before any answer', () => {
        expect(rows('AAPL')).toEqual({query: 'AAPL', searching: true, stocks: [], topic: 'waiting'});
    });

    it('never draws an earlier query\'s stocks under a new query', () => {
        // "AAP" answered, then an L was typed: Enter must not open the first hit for "AAP".
        const view = rows('AAPL', {query: 'AAP', stocks: ['AAP', 'AAPL']});
        expect(view.searching).toBe(true);
        expect(view.stocks).toEqual([]);
        expect(view.topic).toBe('waiting');
    });

    it('does not take the popular list for an answer', () => {
        expect(rows('TS').stocks).toEqual([]);
    });

    it('tells queries apart by case, as the search does', () => {
        expect(rows('aapl', {query: 'AAPL', stocks: ['AAPL']}).searching).toBe(true);
    });
});

describe('once the search has answered for this query', () => {
    it('draws its stocks, all of them, and lets the topic row run', () => {
        const stocks = Array.from({length: 25}, (_, i) => `HIT${i}`);
        expect(rows('nvidia', {query: 'nvidia', stocks})).toEqual({query: 'nvidia', searching: false, stocks, topic: 'ready'});
    });

    it('matches the answer to the trimmed text, so a trailing space is the same query', () => {
        const view = rows(' AAPL ', {query: 'AAPL', stocks: ['AAPL']});
        expect(view).toEqual({query: 'AAPL', searching: false, stocks: ['AAPL'], topic: 'ready'});
    });

    it('lets the topic row run alone when the search found nothing', () => {
        expect(rows('climate policy', {query: 'climate policy', stocks: []}))
            .toEqual({query: 'climate policy', searching: false, stocks: [], topic: 'ready'});
    });
});

describe('the topic row', () => {
    it('is offered from three characters to the longest topic name, and not outside them', () => {
        expect(TOPIC_MIN_CHARS).toBe(3);
        const answered = (term: string) => rows(term, {query: term.trim(), stocks: []}).topic;
        expect(answered('TS')).toBe('none');
        expect(answered('TSL')).toBe('ready');
        expect(answered('x'.repeat(TOPIC_MAX))).toBe('ready');
        expect(answered('x'.repeat(TOPIC_MAX + 1))).toBe('none');
        // The length is the trimmed text's: two letters and a space are still a ticker prefix.
        expect(answered('TS ')).toBe('none');
    });

    it('is not offered, waiting or not, for a query too short to be a subject', () => {
        expect(rows('TS').topic).toBe('none');
    });
});
