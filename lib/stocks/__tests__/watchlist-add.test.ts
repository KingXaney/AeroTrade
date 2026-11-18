// /watchlist's own add dialog: a pick there is a write, and Enter runs the selected row, so what
// it draws for the text in its box is held here — ⌘K's rule (lib/shell/palette.ts) plus the two
// things that are the dialog's own: a stock already on the list, and named suggestions.

import {describe, expect, it} from 'vitest';

import {POPULAR_STOCKS_SHOWN, type StockAnswer} from '@/lib/shell/palette';
import {POPULAR_STOCK_NAMES, POPULAR_STOCK_SYMBOLS} from '@/lib/stocks/popular';
import {addRows, popularStocks} from '@/lib/stocks/watchlist-add';
import type {Stock} from '@/lib/stocks/types';

const stock = (symbol: string, name = `${symbol} Corp`): Stock => ({symbol, name, exchange: '', type: 'Common Stock'});
const popular = Array.from({length: 14}, (_, i) => stock(`POP${i}`));
const rows = (term: string, {answer = null, tracked = []}: {answer?: StockAnswer<Stock> | null; tracked?: string[]} = {}) =>
    addRows({term, answer, tracked, popular});
const symbols = (view: ReturnType<typeof addRows>) => view.rows.map((row) => row.stock.symbol);

describe('the popular stocks the dialog suggests', () => {
    it('names every popular symbol, and nothing else', () => {
        expect(Object.keys(POPULAR_STOCK_NAMES).sort()).toEqual([...POPULAR_STOCK_SYMBOLS].sort());
        for (const symbol of POPULAR_STOCK_SYMBOLS) {
            const name = POPULAR_STOCK_NAMES[symbol];
            expect(name.trim(), symbol).toBe(name);
            expect(name.length, symbol).toBeGreaterThan(symbol.length);
        }
    });

    it('carries the company\'s name, which is what the watchlist saves beside the symbol', () => {
        const list = popularStocks();
        expect(list.map((s) => s.symbol)).toEqual(POPULAR_STOCK_SYMBOLS);
        expect(list.find((s) => s.symbol === 'AAPL')).toEqual({symbol: 'AAPL', name: 'Apple Inc', exchange: '', type: 'Common Stock'});
        expect(list.every((s) => s.name !== s.symbol)).toBe(true);
    });

    it('only suggests symbols the add action accepts', () => {
        // lib/actions/watchlist.actions.ts addToWatchlist: the ticker's shape, the name's length.
        for (const s of popularStocks()) {
            expect(s.symbol).toMatch(/^[A-Z0-9.\-]{1,12}$/);
            expect(s.name.length).toBeLessThanOrEqual(120);
        }
    });
});

describe('the add dialog with nothing typed', () => {
    it('suggests the popular stocks, cut to the first ten, none of them marked', () => {
        const view = rows('');
        expect(view.query).toBe('');
        expect(view.searching).toBe(false);
        expect(view.suggested).toBe(true);
        expect(symbols(view)).toEqual(popular.slice(0, POPULAR_STOCKS_SHOWN).map((s) => s.symbol));
        expect(view.rows.every((row) => !row.tracked)).toBe(true);
    });

    it('leaves out a stock already on the watchlist and suggests the next one instead', () => {
        const view = rows('', {tracked: ['POP0', 'pop3 ']});
        expect(symbols(view)).toEqual(['POP1', 'POP2', 'POP4', 'POP5', 'POP6', 'POP7', 'POP8', 'POP9', 'POP10', 'POP11']);
    });

    it('suggests nothing once every popular stock is on the watchlist', () => {
        const view = rows('  ', {tracked: popular.map((s) => s.symbol)});
        expect(view).toEqual({query: '', searching: false, suggested: true, rows: []});
    });
});

describe('while the search for the text in the box is out', () => {
    it('draws no row, so Enter adds nothing', () => {
        expect(rows('nvid')).toEqual({query: 'nvid', searching: true, suggested: false, rows: []});
    });

    it('never draws an earlier query\'s stocks under a new query', () => {
        // "AAP" answered, then an L was typed: Enter must not add the first hit for "AAP".
        const view = rows('AAPL', {answer: {query: 'AAP', stocks: [stock('AAP'), stock('AAPL')]}});
        expect(view.searching).toBe(true);
        expect(view.rows).toEqual([]);
    });
});

describe('once the search has answered for this query', () => {
    it('draws its stocks in the search\'s order', () => {
        const stocks = [stock('NVDA', 'NVIDIA CORP'), stock('NVD', 'GRANITESHARES 2X SHORT NVDA')];
        const view = rows(' nvd ', {answer: {query: 'nvd', stocks}});
        expect(view.query).toBe('nvd');
        expect(view.searching).toBe(false);
        expect(view.suggested).toBe(false);
        expect(view.rows).toEqual(stocks.map((s) => ({stock: s, tracked: false})));
    });

    it('keeps a stock already on the watchlist in the list, marked, whatever its case', () => {
        const view = rows('app', {answer: {query: 'app', stocks: [stock('AAPL'), stock('APP')]}, tracked: ['aapl']});
        expect(view.rows.map((row) => [row.stock.symbol, row.tracked])).toEqual([['AAPL', true], ['APP', false]]);
    });

    it('draws no row when the search found nothing', () => {
        expect(rows('zzzz', {answer: {query: 'zzzz', stocks: []}})).toEqual({query: 'zzzz', searching: false, suggested: false, rows: []});
    });
});
