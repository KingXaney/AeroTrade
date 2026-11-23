// The fill an account has taken and not yet recorded, as the trade reads see it.

import {describe, expect, it} from 'vitest';
import {pendingTradeRow, withPendingRows} from '@/lib/trading/pending';

const pending = {
    tradeId: 'aaaaaaaaaaaaaaaaaaaaaaaa',
    symbol: 'AAPL',
    company: 'Apple Inc',
    side: 'buy' as const,
    quantity: 10,
    price: 200,
    total: 2000,
    source: 'user',
    createdAt: new Date('2026-11-17T15:00:00Z'),
};

describe('pendingTradeRow', () => {
    it('is the trade row the fill will become', () => {
        expect(pendingTradeRow('acct1', pending)).toEqual({
            _id: 'aaaaaaaaaaaaaaaaaaaaaaaa', accountId: 'acct1', symbol: 'AAPL', company: 'Apple Inc', side: 'buy',
            quantity: 10, price: 200, total: 2000, source: 'user', createdAt: new Date('2026-11-17T15:00:00Z'),
        });
    });

    it('carries only the optional fields the fill has, and names a company-less fill by its symbol', () => {
        const row = pendingTradeRow('acct1', {...pending, company: '', source: undefined, realizedPnl: -5, reason: 'why', idempotencyKey: 'k'});
        expect(row).toMatchObject({company: 'AAPL', realizedPnl: -5, reason: 'why', idempotencyKey: 'k'});
        expect(row).not.toHaveProperty('source');
    });

    it('is nothing when the account has no pending fill', () => {
        expect(pendingTradeRow('acct1', null)).toBeNull();
        expect(pendingTradeRow('acct1', undefined)).toBeNull();
    });
});

describe('withPendingRows', () => {
    const row = (id: string, iso: string) => ({_id: id, createdAt: new Date(iso)});
    const older = row('1', '2026-11-16T15:00:00Z');
    const newer = row('2', '2026-11-17T14:00:00Z');
    const waiting = row('3', '2026-11-17T15:00:00Z');

    it('hands back the same rows when nothing is pending, or the row has landed', () => {
        const rows = [older, newer];
        expect(withPendingRows(rows, [null], 'asc')).toBe(rows);
        expect(withPendingRows(rows, [row('2', '2026-11-17T14:00:00Z')], 'asc')).toBe(rows);
    });

    it('adds a pending row in the rows\' own order', () => {
        expect(withPendingRows([older, newer], [waiting], 'asc').map((r) => r._id)).toEqual(['1', '2', '3']);
        expect(withPendingRows([newer, older], [waiting], 'desc').map((r) => r._id)).toEqual(['3', '2', '1']);
    });

    it('matches ids whatever type they arrive as', () => {
        const rows = [{_id: {toString: () => '3'}, createdAt: new Date('2026-11-17T15:00:00Z')}];
        expect(withPendingRows(rows, [waiting], 'asc')).toBe(rows);
    });
});
