// First-in, first-out lots over one account's trade ledger. Pure: the ledger is read once
// on the server (getTradeLedger) and handed in. A lot carries the buy's own note, so a sell
// can show what the learner wrote when they bought the shares it closed. Only a learner's
// fill (source 'user') has a note: an automated caller's reason is the machine's words and
// already shows on its own fill.
//
// FIFO here is a way of *pairing notes*, not the account's cost basis: the account books
// realized P&L against the average cost (executeOrder, applyFill), and nothing here changes
// or re-derives that number.

export type LedgerTrade = {
    id: string;
    symbol: string;
    side: 'buy' | 'sell';
    quantity: number;
    price: number;
    reason?: string;
    source?: TradeSource;
    realizedPnl?: number;
    createdAt: number;
};

export type Lot = {buyId: string; symbol: string; quantity: number; price: number; note?: string; createdAt: number};

type LotMatches = {
    // sell id -> the lots (or parts of lots) it closed, oldest first
    matches: Record<string, Lot[]>;
    // what is still held, oldest first
    open: Lot[];
};

// Stable by time: two fills in the same millisecond keep their ledger order.
export const byTime = <T extends {createdAt: number}>(ledger: readonly T[]): T[] =>
    ledger.map((row, index) => ({row, index}))
        .sort((a, b) => a.row.createdAt - b.row.createdAt || a.index - b.index)
        .map(({row}) => row);

export const matchLots = (ledger: readonly LedgerTrade[]): LotMatches => {
    const queues = new Map<string, Lot[]>();
    const matches: Record<string, Lot[]> = {};
    for (const trade of byTime(ledger)) {
        const queue = queues.get(trade.symbol) ?? [];
        queues.set(trade.symbol, queue);
        if (trade.side === 'buy') {
            queue.push({
                buyId: trade.id, symbol: trade.symbol, quantity: trade.quantity, price: trade.price,
                ...(trade.reason && trade.source === 'user' ? {note: trade.reason} : {}), createdAt: trade.createdAt,
            });
            continue;
        }
        // A sell beyond the recorded buys (shares from before the ledger) matches what it can.
        let left = trade.quantity;
        const closed: Lot[] = [];
        while (left > 0 && queue.length > 0) {
            const lot = queue[0];
            const take = Math.min(left, lot.quantity);
            closed.push({...lot, quantity: take});
            lot.quantity -= take;
            left -= take;
            if (lot.quantity === 0) queue.shift();
        }
        if (closed.length > 0) matches[trade.id] = closed;
    }
    const open = byTime([...queues.values()].flat());
    return {matches, open};
};

// sell id -> the distinct notes of the buys it closed, in the order they were bought.
export const buyNotesBySellId = (ledger: readonly LedgerTrade[]): Record<string, string[]> => {
    const out: Record<string, string[]> = {};
    for (const [sellId, lots] of Object.entries(matchLots(ledger).matches)) {
        const notes = [...new Set(lots.flatMap((lot) => (lot.note ? [lot.note] : [])))];
        if (notes.length > 0) out[sellId] = notes;
    }
    return out;
};

// symbol -> the open lots that carry a note, with the shares still held from each.
export const openLotNotes = (ledger: readonly LedgerTrade[]): Record<string, Lot[]> => {
    const out: Record<string, Lot[]> = {};
    for (const lot of matchLots(ledger).open) {
        if (!lot.note) continue;
        (out[lot.symbol] ??= []).push(lot);
    }
    return out;
};
