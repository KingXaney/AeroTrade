import {Document, model, models, Schema} from "mongoose";

export interface PriceBarDoc extends Document {
    symbol: string;
    date: string;                 // 'YYYY-MM-DD'
    close: number;
    volume?: number;
}

const PriceBarSchema = new Schema<PriceBarDoc>({
    symbol: {type: String, required: true, uppercase: true, trim: true},
    date: {type: String, required: true},
    close: {type: Number, required: true},
    volume: {type: Number},
});

// Idempotency key for daily appends and backfills (same trick as AccountSnapshot).
PriceBarSchema.index({symbol: 1, date: 1}, {unique: true});

const PriceBar = models?.PriceBar || model<PriceBarDoc>('PriceBar', PriceBarSchema);

export default PriceBar;
