// The /portfolio view: what the page prints from its reads, and what hides when the ledger
// read failed.

import {describe, expect, it} from 'vitest';
import {toPortfolioPageView, type PortfolioPageReads} from '@/lib/trading/portfolio-page';
import {TRADE_HISTORY_LIMIT} from '@/lib/trading/config';
import type {AccountAnalytics, AccountWithPortfolio, EnrichedPosition, PaperTradeRecord, PortfolioSummary} from '@/lib/trading/types';

const position = (symbol: string, priceStale: boolean): EnrichedPosition => ({
    symbol, company: symbol, quantity: 10, avgCost: 100, costBasis: 1_000, marketValue: 1_100,
    unrealizedPnl: 100, unrealizedPnlPct: 10, priceStale,
});

const summary = (positions: EnrichedPosition[] = []): PortfolioSummary => ({
    startingBalance: 100_000, cash: 98_000, positions, holdingsValue: 2_000, totalValue: 100_000, totalReturnAbs: 0, totalReturnPct: 0,
});

const entry = (id: string, positions: EnrichedPosition[] = []): AccountWithPortfolio => ({
    account: {id, name: id.toUpperCase(), inceptionAt: 1_700_000_000_000, createdAt: 1_700_000_000_000},
    summary: summary(positions),
});

const trade = (i: number): PaperTradeRecord => ({
    id: `t${i}`, symbol: 'AAPL', company: 'Apple', side: 'buy', quantity: 1, price: 100, total: 100,
    source: 'user', createdAt: 1_700_000_000_000 + i * 60_000,
});

const reads = (over: Partial<PortfolioPageReads> = {}): PortfolioPageReads => {
    const active = entry('main', [position('AAPL', false), position('MSFT', true)]);
    return {
        all: [active], active, ledger: [], analytics: null, comparisonStats: {},
        income: null, luck: null, habits: null, marketOpen: true, ...over,
    };
};

describe('toPortfolioPageView', () => {
    it('states the holdings and how many stand at cost under the account name', () => {
        expect(toPortfolioPageView(reads()).summaryLine).toBe('2 holdings · 1 of 2 valued at cost');
        const priced = entry('main', [position('AAPL', false)]);
        expect(toPortfolioPageView(reads({active: priced, all: [priced], marketOpen: false})).summaryLine).toBe('1 holding · valued at last close');
    });

    it('compares accounts only when there is more than one', () => {
        expect(toPortfolioPageView(reads()).multiAccount).toBe(false);
        const view = toPortfolioPageView(reads({all: [entry('main'), entry('second')]}));
        expect(view.multiAccount).toBe(true);
        expect(view.comparisonRows.map((r) => r.id)).toEqual(['main', 'second']);
        expect(view.switcherAccounts).toHaveLength(2);
    });

    it('shows the ledger\'s newest fills first, capped at the trade log\'s page', () => {
        const ledger = Array.from({length: TRADE_HISTORY_LIMIT + 5}, (_, i) => trade(i));
        const log = toPortfolioPageView(reads({ledger})).tradeLog;
        expect(log?.trades).toHaveLength(TRADE_HISTORY_LIMIT);
        expect(log?.trades[0].id).toBe(`t${TRADE_HISTORY_LIMIT + 4}`);
        expect(log?.exportHref).toBe('/api/accounts/main/export');
        expect(Object.keys(log?.receipts ?? {})).toHaveLength(ledger.length);
    });

    it('hides everything drawn from a ledger that could not be read', () => {
        const view = toPortfolioPageView(reads({ledger: null}));
        expect(view.tradeLog).toBeNull();
        expect(view.lotNotes).toBeUndefined();
    });

    it('splits the return and dates the drawdown only with analytics in hand', () => {
        expect(toPortfolioPageView(reads()).bridge).toBeNull();
        expect(toPortfolioPageView(reads()).chartBand).toBeNull();
        const analytics = {
            realizedPnl: 0, tradeCount: 1, income: {interest: 12, dividends: 0},
            drawdown: {pct: 5, peakDate: '2026-09-01', peakValue: 100_000, troughDate: '2026-09-10', troughValue: 95_000, recovered: false, recoveryPctNeeded: 5.26},
        } as unknown as AccountAnalytics;
        const view = toPortfolioPageView(reads({analytics}));
        expect(view.analytics).toBe(analytics);
        expect(view.bridge).not.toBeNull();
        expect(view.chartBand).toMatchObject({from: '2026-09-01', to: '2026-09-10'});
    });
});
