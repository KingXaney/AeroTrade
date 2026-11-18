// ⌘K's stock rows and topic row for the text in the box (components/shell/SearchCommand.tsx).
// Import-free, so the rule is unit-tested: lib/shell/__tests__/palette.test.ts.
//
// cmdk selects the first row that can be run after every keystroke, and Enter runs the selected
// row — so what the palette draws, and in which order, is what Enter does. The palette draws
// pages, glossary entries, stocks, then the topic row, and two rules here keep Enter honest:
//   - the stock search trails the typing (a debounce, then the request). Until it has answered
//     for the query now in the box there is no stock row to trust: an earlier query's rows are
//     not drawn, and the topic row waits, since running it is a write — a followed topic takes
//     one of the reader's topic slots and a section of their daily email;
//   - once it has answered, the topic row can be run, and being last it is Enter's row only when
//     the query found no page, no glossary entry and no stock;
//   - the glossary is fetched when the palette opens, not with the page. Until it has landed no
//     glossary entry can be found, so the topic row waits for it too;
//   - a search that did not answer (the reader's count for the minute is spent, Finnhub gave
//     nothing back) found nothing out. It is not "no stocks found", and the topic row goes on
//     waiting: with no stock row it would be Enter's.

// Anything shorter reads as a ticker prefix, not a topic.
export const TOPIC_MIN_CHARS = 3;

// With nothing typed the palette lists the popular stocks, cut to this many.
export const POPULAR_STOCKS_SHOWN = 10;

// What the stock search answered, and the query it answered for. `stocks: null`: it did not
// answer — which is not an answer of no stocks.
export type StockAnswer<S> = {query: string; stocks: readonly S[] | null};

// The "Follow topic" / "Open topic" row: not offered for this query, drawn but not yet runnable,
// or runnable.
export type TopicRow = 'none' | 'waiting' | 'ready';

export type PaletteRows<S> = {
    query: string;          // the text in the box, trimmed
    searching: boolean;     // the stock search for this query has not answered yet
    unavailable: boolean;   // it was asked for this query and did not answer
    stocks: readonly S[];   // the stock rows to draw
    topic: TopicRow;
};

export const paletteRows = <S>({term, answer, popular, topicMax, glossaryReady = true}: {
    term: string;
    answer: StockAnswer<S> | null;   // the newest answer the search gave, for whichever query
    popular: readonly S[];
    topicMax: number;                // the longest topic name (lib/topics/config NAME_MAX)
    glossaryReady?: boolean;         // the glossary has landed, or could not be fetched
}): PaletteRows<S> => {
    const query = term.trim();
    if (!query) return {query, searching: false, unavailable: false, stocks: popular.slice(0, POPULAR_STOCKS_SHOWN), topic: 'none'};
    const asked = answer !== null && answer.query === query;
    const found = asked ? answer.stocks : null;
    const offered = query.length >= TOPIC_MIN_CHARS && query.length <= topicMax;
    return {
        query,
        searching: !asked,
        unavailable: asked && found === null,
        stocks: found ?? [],
        topic: !offered ? 'none' : found !== null && glossaryReady ? 'ready' : 'waiting',
    };
};
