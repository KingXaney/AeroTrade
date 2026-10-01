// Fill receipts: what each fill did to the account, replayed from the ledger through the same
// applyFill (lib/trading/fill) that executeOrder and the strategy simulator fill with, never a
// second copy of the fill arithmetic. Pure.
//
// Deltas and position state only. Absolute cash is not replayed: interest and dividends move
// cash between fills (AccountIncome, not PaperTrade), so a cash balance rebuilt from trades
// alone would be wrong. Starting the replay with unlimited cash also means no historical buy
// is refused here for want of money the account really had.

import {applyFill, type SimAccount} from "@/lib/trading/fill";
import {byTime, type LedgerTrade} from "@/lib/trading/lots";

export type FillReceipt = {
    symbol: string;
    side: 'buy' | 'sell';
    cashDelta: number;
    sharesBefore: number;
    sharesAfter: number;
    avgCostBefore: number | null;
    avgCostAfter: number | null;
    realizedPnl?: number;
};

const holding = (account: SimAccount, symbol: string) => account.positions.find((position) => position.symbol === symbol);

export const replayReceipts = (ledger: readonly LedgerTrade[]): Record<string, FillReceipt> => {
    let account: SimAccount = {cash: Number.POSITIVE_INFINITY, positions: []};
    const out: Record<string, FillReceipt> = {};
    for (const trade of byTime(ledger)) {
        const before = holding(account, trade.symbol);
        const fill = applyFill(account, {symbol: trade.symbol, side: trade.side, quantity: trade.quantity}, trade.price);
        // A sell the ledger cannot back (history from before accounts had ids): no receipt,
        // and the replayed position stays as it was.
        if (!fill.ok) continue;
        account = fill.account;
        const after = holding(account, trade.symbol);
        out[trade.id] = {
            symbol: trade.symbol,
            side: trade.side,
            cashDelta: trade.side === 'buy' ? -fill.total : fill.total,
            sharesBefore: before?.quantity ?? 0,
            sharesAfter: after?.quantity ?? 0,
            avgCostBefore: before?.avgCost ?? null,
            avgCostAfter: after?.avgCost ?? null,
            ...(fill.realizedPnl !== undefined ? {realizedPnl: fill.realizedPnl} : {}),
        };
    }
    return out;
};
