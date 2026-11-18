// Recording the trade row of a fill the account has already taken. Server-only (NOT 'use server').
//
// executeOrder writes the account and the row it is about to insert in ONE update
// (PaperAccount.pendingFill), then calls this. It is idempotent: the row's _id was chosen before
// either write, so inserting it twice is one row (a duplicate key means done), and the field is
// unset only while it still names that row. Whoever next needs the account's books whole — the
// next order, the nightly income job, the split job — settles a fill that was left behind.

import PaperAccount from "@/database/models/paper-account.model";
import PaperTrade from "@/database/models/paper-trade.model";
import {pendingTradeRow, type PendingFillLike} from "@/lib/trading/pending";

const isDuplicateKey = (error: unknown): boolean =>
    typeof error === 'object' && error !== null && (error as {code?: number}).code === 11000;

export const settlePendingFill = async (account: {_id: unknown; userId: string; pendingFill?: PendingFillLike | null}): Promise<void> => {
    const row = pendingTradeRow(String(account._id), account.pendingFill);
    if (row === null) return;
    try {
        await PaperTrade.create({...row, userId: account.userId});
    } catch (error) {
        if (!isDuplicateKey(error)) throw error;
    }
    await PaperAccount.updateOne({_id: account._id, 'pendingFill.tradeId': row._id}, {$unset: {pendingFill: 1}});
};
