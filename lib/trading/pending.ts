// The trade a fill is about to record, as the rows around it read it. Pure.
//
// A fill is two writes: the account (cash, positions) and the trade row. The account write
// carries the row it is about to insert (PaperAccount.pendingFill, lib/trading/pending-fill.ts),
// so a failure between the two loses nothing: the row is inserted later from the account's own
// copy. Until then every per-account trade read shows the fill anyway, by adding the pending
// row to what it read.

export type PendingFillLike = {
    tradeId: unknown;
    symbol: string;
    company?: string;
    side: 'buy' | 'sell';
    quantity: number;
    price: number;
    total: number;
    realizedPnl?: number;
    source?: string;
    reason?: string;
    idempotencyKey?: string;
    createdAt: Date | string | number;
};

export type PendingTradeRow = {
    _id: unknown;
    accountId: string;
    symbol: string;
    company: string;
    side: 'buy' | 'sell';
    quantity: number;
    price: number;
    total: number;
    realizedPnl?: number;
    source?: string;
    reason?: string;
    idempotencyKey?: string;
    createdAt: Date;
};

// The pending fill as the trade row it will become; null when there is none.
export const pendingTradeRow = (accountId: string, pending: PendingFillLike | null | undefined): PendingTradeRow | null => (pending
    ? {
        _id: pending.tradeId,
        accountId,
        symbol: pending.symbol,
        company: pending.company || pending.symbol,
        side: pending.side,
        quantity: pending.quantity,
        price: pending.price,
        total: pending.total,
        ...(typeof pending.realizedPnl === 'number' ? {realizedPnl: pending.realizedPnl} : {}),
        ...(pending.source ? {source: pending.source} : {}),
        ...(pending.reason ? {reason: pending.reason} : {}),
        ...(pending.idempotencyKey ? {idempotencyKey: pending.idempotencyKey} : {}),
        createdAt: new Date(pending.createdAt),
    }
    : null);

// `rows` with the pending rows that are not among them yet, kept in the rows' own order (oldest
// first, or newest first). The same array when there is nothing to add.
export const withPendingRows = <T extends {_id: unknown; createdAt: Date | string | number}>(
    rows: T[],
    pending: readonly (T | null)[],
    order: 'asc' | 'desc',
): T[] => {
    const missing = pending.filter((row): row is T => row !== null && !rows.some((have) => String(have._id) === String(row._id)));
    if (missing.length === 0) return rows;
    const at = (row: T): number => new Date(row.createdAt).getTime();
    return [...rows, ...missing].sort((a, b) => (order === 'asc' ? at(a) - at(b) : at(b) - at(a)));
};
