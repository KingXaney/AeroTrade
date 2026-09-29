import {describe, expect, it} from 'vitest';
import {findBanned} from '@/lib/learn/banned';
import {boughtForLine, LAST_FILL_COPY, NOTE_COPY, receiptLine, SELL_NOTES_COPY} from '@/lib/learn/copy/receipts';
import {replayReceipts} from '@/lib/trading/receipts';
import type {LedgerTrade} from '@/lib/trading/lots';

const SEP_3 = Date.UTC(2026, 8, 3, 15);
const ledger: LedgerTrade[] = [
    {id: 'b1', side: 'buy', symbol: 'AAPL', quantity: 10, price: 150, createdAt: SEP_3},
    {id: 'b2', side: 'buy', symbol: 'AAPL', quantity: 10, price: 180, createdAt: SEP_3 + 1},
    {id: 's1', side: 'sell', symbol: 'AAPL', quantity: 5, price: 200, createdAt: SEP_3 + 2},
    {id: 's2', side: 'sell', symbol: 'AAPL', quantity: 15, price: 100, createdAt: SEP_3 + 3},
    {id: 'b3', side: 'buy', symbol: 'MSFT', quantity: 1, price: 400, createdAt: SEP_3 + 4},
];
const receipts = replayReceipts(ledger);

describe('receiptLine', () => {
    it('reads a first buy, an added buy, a partial and a closing sell', () => {
        expect(receiptLine(receipts.b1)).toBe('Cash −$1,500.00 · AAPL 0 → 10 shares · avg cost — → $150.00');
        expect(receiptLine(receipts.b2)).toBe('Cash −$1,800.00 · AAPL 10 → 20 shares · avg cost $150.00 → $165.00');
        expect(receiptLine(receipts.s1)).toBe('Cash +$1,000.00 · AAPL 20 → 15 shares · avg cost $165.00 unchanged · realized +$175.00');
        expect(receiptLine(receipts.s2)).toBe('Cash +$1,500.00 · AAPL 15 → 0 shares · avg cost $165.00 → — · realized −$975.00');
        expect(receiptLine(receipts.b3)).toBe('Cash −$400.00 · MSFT 0 → 1 share · avg cost — → $400.00');
    });
});

describe('note lines', () => {
    it('quotes the learner and dates the lot in Eastern time', () => {
        expect(boughtForLine(['earnings', 'dip'])).toBe('bought for: “earnings” · “dip”');
        expect(SELL_NOTES_COPY.lot({buyId: 'b1', symbol: 'AAPL', quantity: 6, price: 100, note: 'earnings', createdAt: SEP_3}))
            .toBe('6 shares from Sep 3 at $100.00 — “earnings”');
        expect(LAST_FILL_COPY.title('buy', 10, 'AAPL', 150, SEP_3)).toBe('Bought 10 AAPL @ $150.00 · Sep 3');
        expect(LAST_FILL_COPY.note('earnings')).toBe('your why: “earnings”');
    });
});

describe('copy', () => {
    it('never advises, on any receipt or note line', () => {
        const lines = [
            ...Object.values(receipts).map(receiptLine),
            boughtForLine(['a note']),
            SELL_NOTES_COPY.heading, SELL_NOTES_COPY.order,
            SELL_NOTES_COPY.lot({buyId: 'b', symbol: 'AAPL', quantity: 1, price: 1, note: 'a note', createdAt: SEP_3}),
            NOTE_COPY.label, NOTE_COPY.placeholder, NOTE_COPY.counter(12, 200),
            LAST_FILL_COPY.heading, LAST_FILL_COPY.empty, LAST_FILL_COPY.note('a note'),
            ...(['buy', 'sell'] as const).map((side) => LAST_FILL_COPY.title(side, 3, 'AAPL', 10, SEP_3)),
        ];
        for (const line of lines) expect(findBanned(line, 'copy'), line).toEqual([]);
    });
});
