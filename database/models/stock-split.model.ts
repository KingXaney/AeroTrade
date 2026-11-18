import {Document, model, models, Schema} from "mongoose";

// One stock split, as Yahoo's chart states it (lib/prices/yahoo.fetchYahooSplits): `numerator`
// new shares for every `denominator` old ones, in effect from `at` (the ex-date's 09:30 ET open).
// `prevClose` is the close of the session before it in the NEW basis, from the same payload — what
// tells an old-basis fill from a new-basis one in the hours around the open (lib/trading/splits.ts).
// Detected once per symbol; each account then applies it to itself (lib/trading/splits-store.ts).
export interface StockSplitDoc extends Document {
    symbol: string;
    exDate: string;
    numerator: number;
    denominator: number;
    at: Date;
    prevClose?: number;
    source: string;
    detectedAt: Date;
}

const StockSplitSchema = new Schema<StockSplitDoc>({
    symbol: {type: String, required: true, uppercase: true, trim: true},
    exDate: {type: String, required: true},
    numerator: {type: Number, required: true, min: 0},
    denominator: {type: Number, required: true, min: 0},
    at: {type: Date, required: true},
    prevClose: {type: Number},
    source: {type: String, required: true},
    detectedAt: {type: Date, required: true},
});

StockSplitSchema.index({symbol: 1, exDate: 1}, {unique: true});

const StockSplit = models?.StockSplit || model<StockSplitDoc>('StockSplit', StockSplitSchema);

export default StockSplit;
