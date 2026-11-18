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
        expect(view).toEqual({query: '', searching: false, unavailable: false, stocks: popular.slice(0, POPULAR_STOCKS_SHOWN), topic: 'none'});
        expect(view.stocks).toHaveLength(10);
    });

    it('reads spaces alone as nothing typed, whatever an earlier search answered', () => {
        expect(rows('   ', {query: 'AAPL', stocks: ['AAPL']})).toEqual(rows(''));
    });
});

describe('while the stock search for the query in the box is out', () => {
    it('draws no stock row and keeps the topic row waiting, before any answer', () => {
        expect(rows('AAPL')).toEqual({query: 'AAPL', searching: true, unavailable: false, stocks: [], topic: 'waiting'});
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
        expect(rows('nvidia', {query: 'nvidia', stocks})).toEqual({query: 'nvidia', searching: false, unavailable: false, stocks, topic: 'ready'});
    });

    it('matches the answer to the trimmed text, so a trailing space is the same query', () => {
        const view = rows(' AAPL ', {query: 'AAPL', stocks: ['AAPL']});
        expect(view).toEqual({query: 'AAPL', searching: false, unavailable: false, stocks: ['AAPL'], topic: 'ready'});
    });

    it('lets the topic row run alone when the search found nothing', () => {
        expect(rows('climate policy', {query: 'climate policy', stocks: []}))
            .toEqual({query: 'climate policy', searching: false, unavailable: false, stocks: [], topic: 'ready'});
    });
});

// The search can fail to answer: the reader's count for the minute is spent, or Finnhub gave
// nothing back. That is not "no stocks found" — and with no stock row the topic row would be
// Enter's, so a ticker and Enter would follow a topic of its name after all.
describe('when the search did not answer for this query', () => {
    it('says so, draws no stock row and keeps the topic row waiting', () => {
        expect(rows('AAPL', {query: 'AAPL', stocks: null}))
            .toEqual({query: 'AAPL', searching: false, unavailable: true, stocks: [], topic: 'waiting'});
    });

    it('is still searching for a newer query than the one that went unanswered', () => {
        const view = rows('AAPL', {query: 'AAP', stocks: null});
        expect(view.searching).toBe(true);
        expect(view.unavailable).toBe(false);
    });

    it('offers no topic row for a query too short to be one', () => {
        expect(rows('TS', {query: 'TS', stocks: null})).toEqual({query: 'TS', searching: false, unavailable: true, stocks: [], topic: 'none'});
    });
});

describe('while the glossary is still on its way', () => {
    // ⌘K fetches the glossary when it opens (components/shell/SearchCommand.tsx). Until it lands
    // there are no Learn rows, and Enter on a term must not follow a topic of its name instead.
    const late = (term: string, answer: StockAnswer<string> | null) =>
        paletteRows({term, answer, popular, topicMax: TOPIC_MAX, glossaryReady: false});

    it('keeps the topic row waiting though the stock search has answered', () => {
        expect(late('drawdown', {query: 'drawdown', stocks: []}).topic).toBe('waiting');
    });

    it('still draws the stocks the search found: only the row that writes waits', () => {
        const view = late('nvidia', {query: 'nvidia', stocks: ['NVDA']});
        expect(view).toEqual({query: 'nvidia', searching: false, unavailable: false, stocks: ['NVDA'], topic: 'waiting'});
    });

    it('offers no topic row for a query too short to be one, as ever', () => {
        expect(late('TS', {query: 'TS', stocks: []}).topic).toBe('none');
    });

    it('lets the row run once the glossary is ready, which is the default', () => {
        const answer = {query: 'drawdown', stocks: []};
        expect(paletteRows({term: 'drawdown', answer, popular, topicMax: TOPIC_MAX, glossaryReady: true}).topic).toBe('ready');
        expect(rows('drawdown', answer).topic).toBe('ready');
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
