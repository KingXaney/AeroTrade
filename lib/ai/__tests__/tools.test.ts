// The chat tools with every server read they wrap stubbed: what each tool passes on, and what it
// hands the model back. The user id comes from buildTools' closure, never from the model or from a
// public server action's arguments.

import {beforeEach, describe, expect, it, vi} from 'vitest';
import type {ToolExecutionOptions} from 'ai';

const stubs = vi.hoisted(() => ({
    searchStocks: vi.fn(),
    getWatchlistSymbolsByUserId: vi.fn(),
    getNews: vi.fn(),
    getLatestSuggestions: vi.fn(),
}));

vi.mock('@/lib/actions/finnhub.actions', () => ({
    searchStocks: stubs.searchStocks,
    getQuote: vi.fn(),
    getCompanyProfile: vi.fn(),
    getFinancials: vi.fn(),
    getNews: stubs.getNews,
}));
vi.mock('@/lib/actions/watchlist.actions', () => ({
    addToWatchlist: vi.fn(),
    removeFromWatchlist: vi.fn(),
    getWatchlistForUser: vi.fn(),
    getWatchlistSymbolsByUserId: stubs.getWatchlistSymbolsByUserId,
}));
vi.mock('@/database/mongoose', () => ({connectToDatabase: async () => undefined}));
vi.mock('@/lib/brain/queries', () => ({getActiveTheses: vi.fn(), getBrainDigestData: vi.fn()}));
vi.mock('@/lib/topics/store', () => ({getTopicFeed: vi.fn(), getTopicsForUser: vi.fn(), getTopicsOverview: vi.fn()}));
vi.mock('@/lib/actions/topics.actions', () => ({createTopic: vi.fn(), deleteTopic: vi.fn()}));
vi.mock('@/lib/trading/account', () => ({
    aggregatePortfolios: vi.fn(),
    computePortfolio: vi.fn(),
    getTradeHistory: vi.fn(),
    readAccountsForUser: vi.fn(),
    toAccountSummary: vi.fn(),
}));
vi.mock('@/lib/strategies/queries', () => ({getLatestRun: vi.fn(), getStrategyLeaderboard: vi.fn()}));
vi.mock('@/lib/navigator/service', () => ({getLatestSuggestions: stubs.getLatestSuggestions}));
vi.mock('@/lib/ai/learner-hooks', () => ({priceLargestHoldings: vi.fn(), readLearnerValue: vi.fn()}));

import {buildTools} from '@/lib/ai/tools';
import {FEED_WATCHLIST_SYMBOL_CAP} from '@/lib/news/config';

const tools = buildTools('user-1');

const run = async (name: keyof typeof tools, input: unknown): Promise<unknown> => {
    const execute = tools[name].execute as unknown as (input: unknown, options: ToolExecutionOptions) => Promise<unknown>;
    return execute(input, {toolCallId: 'test', messages: []});
};

const stock = (symbol: string): Stock => ({symbol, name: `${symbol} Inc`, exchange: 'US', type: 'Common Stock'});

beforeEach(() => {
    vi.clearAllMocks();
});

describe('searchStock', () => {
    it('never hands the public search action a user id, and flags the closure user\'s watchlist itself', async () => {
        stubs.searchStocks.mockResolvedValue([stock('AAPL'), stock('APLE')]);
        stubs.getWatchlistSymbolsByUserId.mockResolvedValue(['AAPL']);

        const hits = await run('searchStock', {query: 'apple'});

        expect(stubs.searchStocks).toHaveBeenCalledWith('apple');
        expect(stubs.getWatchlistSymbolsByUserId).toHaveBeenCalledWith('user-1');
        expect(hits).toEqual([
            {...stock('AAPL'), isInWatchlist: true},
            {...stock('APLE'), isInWatchlist: false},
        ]);
    });

    it('returns at most ten hits', async () => {
        stubs.searchStocks.mockResolvedValue(Array.from({length: 25}, (_, i) => stock(`S${i}`)));
        stubs.getWatchlistSymbolsByUserId.mockResolvedValue([]);

        expect(await run('searchStock', {query: 's'})).toHaveLength(10);
    });
});

describe('getMarketNews', () => {
    const tickers = (n: number) => Array.from({length: n}, (_, i) => `S${i}`);

    it('takes no more symbols than the news feed fetches', () => {
        const schema = tools.getMarketNews.inputSchema as unknown as {safeParse: (v: unknown) => {success: boolean}};
        expect(schema.safeParse({symbols: tickers(FEED_WATCHLIST_SYMBOL_CAP)}).success).toBe(true);
        expect(schema.safeParse({symbols: tickers(FEED_WATCHLIST_SYMBOL_CAP + 1)}).success).toBe(false);
    });

    it('hands getNews at most the cap even when the schema is bypassed', async () => {
        stubs.getNews.mockResolvedValue([]);

        await run('getMarketNews', {symbols: tickers(20)});

        expect(stubs.getNews).toHaveBeenCalledWith(tickers(FEED_WATCHLIST_SYMBOL_CAP));
    });

    it('asks for general news when no symbols are given', async () => {
        stubs.getNews.mockResolvedValue([]);

        await run('getMarketNews', {symbols: []});

        expect(stubs.getNews).toHaveBeenCalledWith(undefined);
    });
});

describe('getAiSuggestions', () => {
    const item = (symbol: string, targetWeight: number): SuggestionItem => ({
        symbol, action: 'buy', targetWeight, currentWeight: 0, score: 1, reasons: ['why'], executed: true,
    });

    it('reads the closure user\'s sets through the Navigator\'s one read and shapes them', async () => {
        stubs.getLatestSuggestions.mockResolvedValue({
            global: {date: '2026-09-28', kind: 'preview', items: [item('SPY', 0.255)], rationaleMd: 'notes'},
            user: null,
        });

        const result = await run('getAiSuggestions', {});

        expect(stubs.getLatestSuggestions).toHaveBeenCalledWith('user-1');
        expect(result).toEqual({
            global: {
                date: '2026-09-28',
                preview: true,
                items: [{action: 'buy', symbol: 'SPY', targetWeightPct: 26, executed: true, reasons: ['why']}],
                rationale: 'notes',
            },
            yours: null,
        });
    });
});
