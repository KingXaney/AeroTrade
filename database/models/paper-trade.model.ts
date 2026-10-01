import {Document, model, models, Schema} from "mongoose";
import {TRADE_REASON_MAX} from "@/lib/trading/config";

export interface PaperTradeDoc extends Document {
    userId: string;
    accountId?: string;  // String(_id) of the owning PaperAccount; absent only on pre-migration rows
    symbol: string;
    company: string;
    side: 'buy' | 'sell';
    quantity: number;
    price: number;
    total: number;
    realizedPnl?: number;
    source?: TradeSource;  // no schema default on purpose — Mongoose applies defaults on hydration, which would repaint every pre-existing row as 'user'
    reason?: string;       // an automated fill's own explanation (quant strategies), or the learner's own note on a user trade
    idempotencyKey?: string; // one fill per key per account — a job step replay finds the earlier fill
    createdAt: Date;
}

const PaperTradeSchema = new Schema<PaperTradeDoc>({
    userId: {type: String, required: true, index: true},
    accountId: {type: String, index: true},
    symbol: {type: String, required: true, uppercase: true, trim: true},
    company: {type: String, default: ''},
    side: {type: String, required: true, enum: ['buy', 'sell']},
    quantity: {type: Number, required: true, min: 0},
    price: {type: Number, required: true, min: 0},
    total: {type: Number, required: true},
    realizedPnl: {type: Number},
    source: {type: String, enum: ['user', 'ai-navigator', 'ai-suggestion', 'strategy']},
    reason: {type: String, maxlength: TRADE_REASON_MAX},
    idempotencyKey: {type: String},
    createdAt: {type: Date, default: Date.now, index: true},
});

// One account's current epoch in fill order: the ledger walks it forwards and the bounded
// history (the newest N) backwards, so neither sorts in memory; _id breaks a tie between fills
// stamped in the same millisecond the same way both directions. Replaces {accountId, createdAt:
// -1}, which served only the descending read and left the ledger a blocking SORT (a deployment
// that already built it keeps it until `npm run migrate:accounts` drops it; nothing reads it by
// name). Every index here is also listed in scripts/migration-indexes.mjs, held equal by a test.
PaperTradeSchema.index({accountId: 1, createdAt: 1, _id: 1});
// The learn surfaces ask "has this user ever placed an order themselves" and, later,
// for the first such fill — both keyed on the source, in order.
PaperTradeSchema.index({userId: 1, source: 1, createdAt: 1});
// …and for the first such SELL: with side in the key it is one index probe, not a walk
// through every buy of a user who has never sold.
PaperTradeSchema.index({userId: 1, source: 1, side: 1, createdAt: 1});
// Partial, not sparse: a sparse compound index would still index every row (accountId is
// always present) and collide on the missing key.
PaperTradeSchema.index({accountId: 1, idempotencyKey: 1}, {unique: true, partialFilterExpression: {idempotencyKey: {$exists: true}}});

const PaperTrade = models?.PaperTrade || model<PaperTradeDoc>('PaperTrade', PaperTradeSchema);

export default PaperTrade;
