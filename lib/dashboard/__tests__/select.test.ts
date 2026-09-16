import {describe, expect, it} from 'vitest';
import {
    bestStrategy,
    newsBrainSummary,
    pickActiveAccount,
    toApplyAccounts,
    toComparisonRows,
    toSwitcherAccounts,
    topMovers,
} from '@/lib/dashboard/select';
import type {SuggestionSetView} from '@/lib/navigator/service';

const summary = (overrides: Partial<PortfolioSummary> = {}): PortfolioSummary => ({
    startingBalance: 100_000,
    cash: 40_000,
    positions: [],
    holdingsValue: 60_000,
    totalValue: 100_000,
    totalReturnAbs: 0,
    totalReturnPct: 0,
    ...overrides,
});

const entry = (id: string, name: string, totalReturnPct: number, extra: Partial<PortfolioSummary> = {}): AccountWithPortfolio => ({
    account: {id, name, inceptionAt: 1_700_000_000_000, createdAt: 1_700_000_000_000},
    summary: summary({totalReturnPct, ...extra}),
});

const stock = (symbol: string, changePercent?: number): StockWithData => ({
    userId: 'u1',
    symbol,
    company: `${symbol} Inc`,
    addedAt: new Date(0),
    changePercent,
});

const thesis = (key: string, displayName: string): BrainEntitySummary => ({
    key,
    type: 'ticker',
    displayName,
    weightFast: 1,
    weightSlow: 2,
    sentimentFast: 0.5,
    sentimentSlow: 0.4,
    thesisSince: 1,
    lastSeenAt: 2,
});

const set = (date: string, count: number, kind: SuggestionSetView['kind'] = 'executed'): SuggestionSetView => ({
    date,
    kind,
    items: Array.from({length: count}, (_, i) => ({
        symbol: `S${i}`,
        action: 'buy',
        targetWeight: 0.1,
        currentWeight: 0,
        score: 1,
        reasons: [],
        executed: kind === 'executed',
    })),
    rationaleMd: null,
});

const main = entry('a1', 'Main Strategy', 4.2);
const growth = entry('a2', 'Growth', 9.5, {totalValue: 109_500});
const value = entry('a3', 'Value', -2.1, {totalValue: 97_900});

describe('pickActiveAccount', () => {
    it('prefers the requested account when it exists', () => {
        expect(pickActiveAccount([main, growth, value], 'a2')).toBe(growth);
    });

    it('falls back to the first account otherwise', () => {
        expect(pickActiveAccount([main, growth], 'missing')).toBe(main);
        expect(pickActiveAccount([main, growth], undefined)).toBe(main);
        expect(pickActiveAccount([main, growth], null)).toBe(main);
        expect(pickActiveAccount([main, growth], '')).toBe(main);
        expect(pickActiveAccount([main, growth])).toBe(main);
    });

    it('is undefined when the user has no accounts', () => {
        expect(pickActiveAccount([])).toBeUndefined();
        expect(pickActiveAccount([], 'a1')).toBeUndefined();
    });
});

describe('bestStrategy', () => {
    it('does not throw on an empty list', () => {
        expect(() => bestStrategy([])).not.toThrow();
        expect(bestStrategy([])).toBeUndefined();
    });

    it('is undefined with a single account', () => {
        expect(bestStrategy([main])).toBeUndefined();
    });

    it('picks the highest return among several accounts', () => {
        expect(bestStrategy([main, growth, value])).toEqual({name: 'Growth', totalReturnPct: 9.5});
        expect(bestStrategy([value, main])).toEqual({name: 'Main Strategy', totalReturnPct: 4.2});
    });

    it('keeps the first account on a tie', () => {
        expect(bestStrategy([entry('x', 'First', 3), entry('y', 'Second', 3)])?.name).toBe('First');
    });

    it('handles all-negative returns', () => {
        expect(bestStrategy([entry('x', 'Bad', -8), entry('y', 'Less bad', -1)])?.name).toBe('Less bad');
    });
});

describe('topMovers', () => {
    const movers = [stock('AAPL', 1.5), stock('TSLA', -6.2), stock('NVDA'), stock('MSFT', 3.1), stock('AMD', -3.1), stock('META', 0.2)];

    it('ranks by absolute change, dropping unpriced symbols', () => {
        expect(topMovers(movers).map((m) => m.symbol)).toEqual(['TSLA', 'MSFT', 'AMD', 'AAPL']);
    });

    it('honours the limit', () => {
        expect(topMovers(movers, 2).map((m) => m.symbol)).toEqual(['TSLA', 'MSFT']);
        expect(topMovers(movers, 10)).toHaveLength(5);
        expect(topMovers(movers, 0)).toEqual([]);
        expect(topMovers(movers, -1)).toEqual([]);
    });

    it('keeps input order on ties and ignores non-finite changes', () => {
        const symbols = topMovers([stock('A', 2), stock('B', Number.NaN), stock('C', -2), stock('D', 2)]).map((m) => m.symbol);
        expect(symbols).toEqual(['A', 'C', 'D']);
    });

    it('does not mutate the input', () => {
        const frozen = Object.freeze([...movers]);
        expect(() => topMovers(frozen)).not.toThrow();
        expect(frozen.map((m) => m.symbol)).toEqual(['AAPL', 'TSLA', 'NVDA', 'MSFT', 'AMD', 'META']);
        expect(topMovers([])).toEqual([]);
    });
});

describe('account projections', () => {
    it('toApplyAccounts keeps only id and name', () => {
        expect(toApplyAccounts([main, growth])).toEqual([{id: 'a1', name: 'Main Strategy'}, {id: 'a2', name: 'Growth'}]);
        expect(toApplyAccounts([])).toEqual([]);
    });

    it('toSwitcherAccounts adds the return and the unpriced count', () => {
        expect(toSwitcherAccounts([main, growth])).toEqual([
            {id: 'a1', name: 'Main Strategy', totalReturnPct: 4.2, unpriced: 0, holdings: 0},
            {id: 'a2', name: 'Growth', totalReturnPct: 9.5, unpriced: 0, holdings: 0},
        ]);
        const stale = {symbol: 'X', company: 'X', quantity: 1, avgCost: 1, costBasis: 1, marketValue: 1, unrealizedPnl: 0, unrealizedPnlPct: 0, priceStale: true};
        const live = {...stale, symbol: 'Y', currentPrice: 2, marketValue: 2, unrealizedPnl: 1, unrealizedPnlPct: 100, priceStale: false};
        expect(toSwitcherAccounts([entry('a9', 'Mixed', 1, {positions: [stale, live]})])[0]).toMatchObject({unpriced: 1, holdings: 2});
    });

    it('toComparisonRows merges stats and nulls what is missing', () => {
        const rows = toComparisonRows([main, growth, value], {
            a1: {winRatePct: 60, maxDrawdownPct: 12.5},
            a3: {winRatePct: null, maxDrawdownPct: 3},
        });
        expect(rows).toEqual([
            {id: 'a1', name: 'Main Strategy', totalValue: 100_000, totalReturnPct: 4.2, winRatePct: 60, maxDrawdownPct: 12.5, unpriced: 0, holdings: 0},
            {id: 'a2', name: 'Growth', totalValue: 109_500, totalReturnPct: 9.5, winRatePct: null, maxDrawdownPct: null, unpriced: 0, holdings: 0},
            {id: 'a3', name: 'Value', totalValue: 97_900, totalReturnPct: -2.1, winRatePct: null, maxDrawdownPct: 3, unpriced: 0, holdings: 0},
        ]);
        expect(toComparisonRows([], {})).toEqual([]);
    });
});

describe('newsBrainSummary', () => {
    it('is empty without theses or suggestion sets', () => {
        expect(newsBrainSummary([], {user: null, global: null})).toEqual({topThesis: null, decisions: null});
    });

    it('takes the first (strongest) thesis', () => {
        const result = newsBrainSummary([thesis('ticker:nvda', 'NVDA'), thesis('theme:ai', 'AI')], {user: null, global: null});
        expect(result.topThesis).toBe('NVDA');
    });

    it('prefers the user\'s own set over the global one', () => {
        const result = newsBrainSummary([], {user: set('2026-08-17', 3), global: set('2026-08-24', 7, 'preview')});
        expect(result.decisions).toEqual({count: 3, date: '2026-08-17', kind: 'executed'});
    });

    it('falls back to the global set', () => {
        const result = newsBrainSummary([], {user: null, global: set('2026-08-24', 7, 'preview')});
        expect(result.decisions).toEqual({count: 7, date: '2026-08-24', kind: 'preview'});
    });

    it('reports an empty set as zero decisions rather than nothing', () => {
        expect(newsBrainSummary([], {user: set('2026-08-24', 0), global: null}).decisions?.count).toBe(0);
    });
});
