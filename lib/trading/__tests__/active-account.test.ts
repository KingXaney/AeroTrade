// The active-account rule (?account=, then the cookie, then the first account) and the
// account lists the pickers show.

import {describe, expect, it} from 'vitest';
import {
    pickActiveAccount,
    pickActiveAccountId,
    preferredAccountId,
    toApplyAccounts,
    toComparisonRows,
    toSwitcherAccounts,
} from '@/lib/trading/active-account';
import {ACTIVE_ACCOUNT_COOKIE} from '@/lib/trading/config';
import type {AccountWithPortfolio, PortfolioSummary} from '@/lib/trading/types';

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

const main = entry('a1', 'Main account', 4.2);
const growth = entry('a2', 'Growth', 9.5, {totalValue: 109_500});
const value = entry('a3', 'Value', -2.1, {totalValue: 97_900});

describe('preferredAccountId', () => {
    const jar = (value?: string) => ({get: (name: string) => (name === ACTIVE_ACCOUNT_COOKIE && value !== undefined ? {value} : undefined)});

    it('takes ?account= over the cookie', () => {
        expect(preferredAccountId('a2', jar('a3'))).toBe('a2');
    });

    it('falls back to the cookie, then to nothing', () => {
        expect(preferredAccountId(undefined, jar('a3'))).toBe('a3');
        expect(preferredAccountId(undefined, jar())).toBeUndefined();
    });
});

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

describe('pickActiveAccountId', () => {
    // The same rule over bare ids, so /trade can start the ledger read before pricing.
    it('agrees with pickActiveAccount for every preference', () => {
        const ids = ['a1', 'a2', 'a3'];
        for (const preferred of ['a2', 'missing', '', null, undefined]) {
            expect(pickActiveAccountId(ids, preferred)).toBe(pickActiveAccount([main, growth, value], preferred)?.account.id);
        }
        expect(pickActiveAccountId([], 'a1')).toBeUndefined();
    });
});

describe('account projections', () => {
    it('toApplyAccounts keeps only id and name', () => {
        expect(toApplyAccounts([main, growth])).toEqual([{id: 'a1', name: 'Main account'}, {id: 'a2', name: 'Growth'}]);
        expect(toApplyAccounts([])).toEqual([]);
    });

    it('toSwitcherAccounts adds the return and the unpriced count', () => {
        expect(toSwitcherAccounts([main, growth])).toEqual([
            {id: 'a1', name: 'Main account', totalReturnPct: 4.2, unpriced: 0, holdings: 0},
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
            {id: 'a1', name: 'Main account', totalValue: 100_000, totalReturnPct: 4.2, winRatePct: 60, maxDrawdownPct: 12.5, unpriced: 0, holdings: 0},
            {id: 'a2', name: 'Growth', totalValue: 109_500, totalReturnPct: 9.5, winRatePct: null, maxDrawdownPct: null, unpriced: 0, holdings: 0},
            {id: 'a3', name: 'Value', totalValue: 97_900, totalReturnPct: -2.1, winRatePct: null, maxDrawdownPct: 3, unpriced: 0, holdings: 0},
        ]);
        expect(toComparisonRows([], {})).toEqual([]);
    });
});
