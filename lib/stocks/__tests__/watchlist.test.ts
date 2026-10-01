import {describe, expect, it} from 'vitest';
import {mergeWatchlistRows} from '@/lib/stocks/watchlist';
import type {StockWithData, WatchlistEntry} from '@/lib/stocks/types';

const saved = (symbol: string, company: string, day: number): WatchlistEntry =>
    ({symbol, company, addedAt: new Date(Date.UTC(2026, 8, day))});

const quoted = (symbol: string, company: string): StockWithData =>
    ({userId: '', symbol, company, addedAt: new Date(0), currentPrice: 100, priceFormatted: '$100.00'});

describe('mergeWatchlistRows', () => {
    it('lays the saved company name and date over each quoted row, matching symbols by case', () => {
        const rows = mergeWatchlistRows(
            [saved('aapl', 'Apple (mine)', 3), saved('MSFT', 'Microsoft', 4)],
            [quoted('AAPL', 'Apple Inc'), quoted('MSFT', 'Microsoft Corp')],
            'user-1',
        );
        expect(rows.map((r) => [r.symbol, r.company, r.addedAt.toISOString(), r.userId, r.currentPrice])).toEqual([
            ['AAPL', 'Apple (mine)', '2026-09-03T00:00:00.000Z', 'user-1', 100],
            ['MSFT', 'Microsoft', '2026-09-04T00:00:00.000Z', 'user-1', 100],
        ]);
    });

    it('keeps the quote\'s company when the saved one is empty, and its own date when unsaved', () => {
        const [row, unsaved] = mergeWatchlistRows([saved('NVDA', '', 5)], [quoted('NVDA', 'NVIDIA'), quoted('AMD', 'AMD')], 'u');
        expect(row.company).toBe('NVIDIA');
        expect(row.addedAt.toISOString()).toBe('2026-09-05T00:00:00.000Z');
        expect(unsaved.addedAt.getTime()).toBe(0);
    });
});
