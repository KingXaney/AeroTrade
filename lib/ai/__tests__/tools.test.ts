// The chat tools with every server read they wrap stubbed: what each tool passes on, and what it
// hands the model back. The user id comes from buildTools' closure, never from the model or from a
// public server action's arguments.

import {beforeEach, describe, expect, it, vi} from 'vitest';
import type {ToolExecutionOptions} from 'ai';

const stubs = vi.hoisted(() => ({
    searchStocks: vi.fn(),
    getWatchlistSymbolsByUserId: vi.fn(),
}));

vi.mock('@/lib/actions/finnhub.actions', () => ({
    searchStocks: stubs.searchStocks,
    getQuote: vi.fn(),
    getCompanyProfile: vi.fn(),
    getFinancials: vi.fn(),
    getNews: vi.fn(),
}));
vi.mock('@/lib/actions/watchlist.actions', () => ({
    addToWatchlist: vi.fn(),
    removeFromWatchlist: vi.fn(),
    getWatchlistForUser: vi.fn(),
    getWatchlistSymbolsByUserId: stubs.getWatchlistSymbolsByUserId,
}));
vi.mock('@/database/mongoose', () => ({connectToDatabase: async () => undefined}));
vi.mock('@/database/models/suggestion-set.model', () => ({default: {}, GLOBAL_SUGGESTIONS_USER: 'global'}));
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
vi.mock('@/lib/ai/learner-hooks', () => ({priceLargestHoldings: vi.fn(), readLearnerValue: vi.fn()}));

import {buildTools} from '@/lib/ai/tools';

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
