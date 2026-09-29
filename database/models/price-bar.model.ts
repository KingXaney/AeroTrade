import {Document, model, models, Schema} from "mongoose";

export type PriceBarSource = 'yahoo' | 'stooq';

export interface PriceBarDoc extends Document {
    symbol: string;
    date: string;                 // 'YYYY-MM-DD'
    close: number;
    open?: number;
    high?: number;
    low?: number;
    volume?: number;
    adjClose?: number;            // dividend-adjusted total-return close (Yahoo only)
    dividend?: number;            // cash dividend per share, ex-date = this bar (Yahoo only; absent = unknown)
    source?: PriceBarSource;
}

// open/high/low/adjClose stay optional with no defaults: Stooq-era rows lack
// them, and a default would let close-only history masquerade as OHLC coverage.
const PriceBarSchema = new Schema<PriceBarDoc>({
    symbol: {type: String, required: true, uppercase: true, trim: true},
    date: {type: String, required: true},
    close: {type: Number, required: true},
    open: {type: Number},
    high: {type: Number},
    low: {type: Number},
    volume: {type: Number},
    adjClose: {type: Number},
    dividend: {type: Number},
    source: {type: String, enum: ['yahoo', 'stooq']},
});

// Idempotency key for daily appends and backfills (same trick as AccountSnapshot).
PriceBarSchema.index({symbol: 1, date: 1}, {unique: true});
// Only the few bars that paid a dividend (~4 a year per payer, against ~250 bars): the nightly
// income job and the Income panel's receipts read {symbol, date, dividend} for dividend > 0,
// which this index answers without touching a document. `dividend` is in the key (not only in
// the filter) so the read is covered, and so the key pattern differs from the unique index.
PriceBarSchema.index({symbol: 1, date: 1, dividend: 1}, {partialFilterExpression: {dividend: {$gt: 0}}, name: 'dividends_by_symbol_date'});

const PriceBar = models?.PriceBar || model<PriceBarDoc>('PriceBar', PriceBarSchema);

export default PriceBar;
