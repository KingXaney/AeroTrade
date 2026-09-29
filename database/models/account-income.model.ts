import {Document, model, models, Schema} from "mongoose";

// One credit to a paper account: a day's interest on idle cash, or a dividend on a holding.
// Kept apart from PaperTrade on purpose — a row there would count as a trade, feed win rate
// and realized P&L, land in the CSV export, and flip a strategy's first-run check.
export interface AccountIncomeDoc extends Document {
    accountId: string;
    userId: string;
    // The account's inceptionAt in ms. A reset re-anchors it, so a row computed just before a
    // reset can never be read as belonging to the account that replaced it.
    epoch: number;
    kind: 'interest' | 'dividend';
    date: string;              // ET date it accrued (interest) or was paid (dividend)
    symbol: string;            // '' for interest
    amount: number;
    apy?: number;
    exDate?: string;
    perShare?: number;
    quantity?: number;
    createdAt: Date;
}

const AccountIncomeSchema = new Schema<AccountIncomeDoc>({
    accountId: {type: String, required: true},
    userId: {type: String, required: true, index: true},
    epoch: {type: Number, required: true},
    kind: {type: String, required: true, enum: ['interest', 'dividend']},
    date: {type: String, required: true},
    symbol: {type: String, default: ''},
    amount: {type: Number, required: true},
    apy: {type: Number},
    exDate: {type: String},
    perShare: {type: Number},
    quantity: {type: Number},
    createdAt: {type: Date, default: Date.now},
});

// The idempotency key: a retried or overlapping run upserts onto the same row and keeps the
// amount first computed ($setOnInsert), which is the amount credited to cash.
AccountIncomeSchema.index({accountId: 1, epoch: 1, kind: 1, date: 1, symbol: 1}, {unique: true});

const AccountIncome = models?.AccountIncome || model<AccountIncomeDoc>('AccountIncome', AccountIncomeSchema);

export default AccountIncome;
