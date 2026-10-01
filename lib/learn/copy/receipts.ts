// The order note ("why") and the fill receipt: every sentence around a learner's own trade.
// Numbers and the learner's own words, never a verdict on either. Held to the no-advice list
// by lib/learn/__tests__/receipts-copy.test.ts. The learner's note is quoted, never judged.

import type {FillReceipt} from "@/lib/trading/receipts";
import type {Lot} from "@/lib/trading/lots";
import {signedMoney} from "@/lib/learn/copy/portfolio";

const MONEY = new Intl.NumberFormat('en-US', {style: 'currency', currency: 'USD', minimumFractionDigits: 2, maximumFractionDigits: 2});
const money = (amount: number): string => MONEY.format(amount);
const shares = (n: number): string => `${n} ${n === 1 ? 'share' : 'shares'}`;
const quote = (note: string): string => `“${note}”`;

// Eastern time, as every fill time on the app is described.
const fillDay = (ms: number): string =>
    new Date(ms).toLocaleDateString('en-US', {timeZone: 'America/New_York', month: 'short', day: 'numeric'});

export const NOTE_COPY = {
    label: 'Why (optional)',
    placeholder: 'What you expect, in a line. It comes back when you sell.',
    counter: (used: number, max: number): string => `${used}/${max}`,
} as const;

// "Cash −$1,500.00 · AAPL 0 → 10 shares · avg cost — → $150.00"
// "Cash +$1,000.00 · AAPL 20 → 15 shares · avg cost $165.00 unchanged · realized +$175.00"
export const receiptLine = (receipt: FillReceipt): string => {
    const avg = (value: number | null): string => (value === null ? '—' : money(value));
    const parts = [
        `Cash ${signedMoney(receipt.cashDelta)}`,
        `${receipt.symbol} ${receipt.sharesBefore} → ${shares(receipt.sharesAfter)}`,
    ];
    if (receipt.avgCostBefore !== null && receipt.avgCostAfter !== null && receipt.avgCostBefore === receipt.avgCostAfter) {
        parts.push(`avg cost ${avg(receipt.avgCostAfter)} unchanged`);
    } else {
        parts.push(`avg cost ${avg(receipt.avgCostBefore)} → ${avg(receipt.avgCostAfter)}`);
    }
    if (receipt.realizedPnl !== undefined) parts.push(`realized ${signedMoney(receipt.realizedPnl)}`);
    return parts.join(' · ');
};

// Under a sell: the notes of the buys it closed (first in, first out).
export const boughtForLine = (notes: readonly string[]): string => `bought for: ${notes.map(quote).join(' · ')}`;

export const SELL_NOTES_COPY = {
    heading: 'What you wrote when you bought',
    // "6 shares from Sep 3 at $100.00 — “earnings”"
    lot: (lot: Lot): string => `${shares(lot.quantity)} from ${fillDay(lot.createdAt)} at ${money(lot.price)} — ${quote(lot.note ?? '')}`,
    // Sells close the oldest shares first when notes are paired with a sale.
    order: 'Oldest shares first',
} as const;

export const LAST_FILL_COPY = {
    heading: 'Last fill',
    empty: 'No fills in this account yet. The first order you place shows up here with its receipt.',
    // "Bought 10 AAPL @ $150.00 · Sep 3"
    title: (side: 'buy' | 'sell', quantity: number, symbol: string, price: number, createdAt: number): string =>
        `${side === 'buy' ? 'Bought' : 'Sold'} ${quantity} ${symbol} @ ${money(price)} · ${fillDay(createdAt)}`,
    note: (note: string): string => `your why: ${quote(note)}`,
} as const;
