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
    source: {type: String, enum: ['yahoo', 'stooq']},
});

// Idempotency key for daily appends and backfills (same trick as AccountSnapshot).
PriceBarSchema.index({symbol: 1, date: 1}, {unique: true});

const PriceBar = models?.PriceBar || model<PriceBarDoc>('PriceBar', PriceBarSchema);

export default PriceBar;
