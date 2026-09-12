// What the chat assistant is allowed to say about someone's money. Two things matter:
// the numbers must be clean enough to read aloud, and a missing price must never be
// presentable as a real one.

import {describe, expect, it} from 'vitest';

import {
    findAccountByName,
    toChatPortfolio,
    toChatPosition,
    toChatTrade,
} from '@/lib/trading/portfolio-view';

const position = (over: Partial<EnrichedPosition> = {}): EnrichedPosition => ({
    symbol: 'NVDA',
    company: 'NVIDIA Corp',
    quantity: 10,
    avgCost: 100,
    currentPrice: 120,
    changePercent: 1.5,
    costBasis: 1000,
    marketValue: 1200,
    unrealizedPnl: 200,
    unrealizedPnlPct: 20,
    priceStale: false,
    ...over,
});

const summary = (over: Partial<PortfolioSummary> = {}): PortfolioSummary => ({
    startingBalance: 100_000,
    cash: 98_800,
    positions: [position()],
    holdingsValue: 1200,
    totalValue: 100_000,
    totalReturnAbs: 0,
    totalReturnPct: 0,
    ...over,
});

const entry = (name: string, s: PortfolioSummary): AccountWithPortfolio => ({
    account: {id: name, name, inceptionAt: 1_700_000_000_000, createdAt: 1_700_000_000_000},
    summary: s,
});

describe('number hygiene', () => {
    it('rounds money to cents so the model cannot quote float noise', () => {
        const p = toChatPosition(position({avgCost: 12.3456789, marketValue: 1234.5600000001, unrealizedPnl: 0.1 + 0.2}));
        expect(p.avgCost).toBe(12.35);
        expect(p.marketValue).toBe(1234.56);
        expect(p.unrealizedPnl).toBe(0.3);
    });

    it('rounds percentages to two places', () => {
        expect(toChatPosition(position({unrealizedPnlPct: 20.126789})).unrealizedPnlPct).toBe(20.13);
    });
});

describe('missing prices', () => {
    it('reports an unpriced position as null, never as zero', () => {
        // computePortfolio falls back marketValue to cost basis when a quote is missing,
        // which reads as a perfectly flat position. currentPrice is the only honest signal.
        const p = toChatPosition(position({currentPrice: undefined, marketValue: 1000, unrealizedPnl: 0, unrealizedPnlPct: 0, priceStale: true}));
        expect(p.currentPrice).toBeNull();
        expect(p.unrealizedPnl).toBeNull();
        expect(p.unrealizedPnlPct).toBeNull();
        expect(p.priceStale).toBe(true);
    });

    it('counts priced vs unpriced so the prompt can hedge the total', () => {
        const s = summary({positions: [position(), position({symbol: 'AMD', currentPrice: undefined, priceStale: true})]});
        const view = toChatPortfolio([entry('Main', s)], s);
        expect(view.valuation).toEqual({pricedSymbols: 1, unpricedSymbols: 1});
    });

    it('counts by the priceStale flag, not by the presence of a price', () => {
        // enrichPosition keeps the two in lockstep; the view must key off the flag so a
        // future producer cannot smuggle a stale position past the hedge with a number.
        const s = summary({positions: [position({currentPrice: 120, priceStale: true})]});
        expect(toChatPortfolio([entry('Main', s)], s).valuation).toEqual({pricedSymbols: 0, unpricedSymbols: 1});
    });

    it('reports a fully priced portfolio as having nothing unpriced', () => {
        const s = summary();
        expect(toChatPortfolio([entry('Main', s)], s).valuation.unpricedSymbols).toBe(0);
    });
});

describe('shape', () => {
    it('always marks itself as paper money', () => {
        const s = summary();
        const view = toChatPortfolio([entry('Main', s)], s);
        expect(view.paper).toBe(true);
        expect(view.currency).toBe('USD');
    });

    it('omits recentTrades unless asked for', () => {
        const s = summary();
        expect(toChatPortfolio([entry('Main', s)], s).recentTrades).toBeUndefined();
        expect(toChatPortfolio([entry('Main', s)], s, []).recentTrades).toEqual([]);
    });

    it('emits dates as ISO strings, matching the other tools', () => {
        const s = summary();
        const view = toChatPortfolio([entry('Main', s)], s);
        expect(view.accounts[0].inceptionAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    });

    it('drops realizedPnl when the trade has none rather than sending undefined', () => {
        const buy = toChatTrade({
            id: 't1', symbol: 'NVDA', company: 'NVIDIA', side: 'buy',
            quantity: 1, price: 100, total: 100, createdAt: 1_700_000_000_000,
        });
        expect('realizedPnl' in buy).toBe(false);
    });

    it('is JSON-serializable end to end', () => {
        const s = summary();
        const view = toChatPortfolio([entry('Main', s)], s, []);
        expect(() => JSON.parse(JSON.stringify(view))).not.toThrow();
    });
});

describe('findAccountByName', () => {
    const accounts = [{name: 'Main Strategy'}, {name: 'AI Navigator'}, {name: 'Momentum'}];

    it('prefers an exact case-insensitive match over a substring one', () => {
        // 'Main' substring-matches 'Main Strategy'; an exact name must always win.
        const list = [{name: 'Main Strategy'}, {name: 'Main'}];
        expect(findAccountByName(list, 'main')?.name).toBe('Main');
    });

    it('falls back to a substring match', () => {
        expect(findAccountByName(accounts, 'navigator')?.name).toBe('AI Navigator');
        expect(findAccountByName(accounts, 'moment')?.name).toBe('Momentum');
    });

    it('returns undefined for no match or an empty reference', () => {
        expect(findAccountByName(accounts, 'nonsense')).toBeUndefined();
        expect(findAccountByName(accounts, '   ')).toBeUndefined();
        expect(findAccountByName([], 'Main')).toBeUndefined();
    });
});
