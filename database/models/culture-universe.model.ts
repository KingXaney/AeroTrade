import {Document, model, models, Schema} from "mongoose";

// A week's quote check, one row per symbol the catalog names: whether Finnhub priced it and at
// what. Read before any quote is asked for, so a replay, the holiday retry and a preview pay
// nothing, and the stored price is the week's planning price. Ninety days, then gone.
export interface CultureUniverseDoc extends Document {
    weekKey: string;              // the Monday of the week
    symbol: string;
    quoted: boolean;
    price: number | null;
    reason: 'ok' | 'no quote' | 'zero price' | 'error';
    checkedAt: Date;
}

const CULTURE_UNIVERSE_TTL_SECONDS = 60 * 60 * 24 * 90;

const CultureUniverseSchema = new Schema<CultureUniverseDoc>({
    weekKey: {type: String, required: true},
    symbol: {type: String, required: true},
    quoted: {type: Boolean, required: true},
    price: {type: Number, default: null},
    reason: {type: String, required: true, enum: ['ok', 'no quote', 'zero price', 'error']},
    checkedAt: {type: Date, default: Date.now},
});

CultureUniverseSchema.index({weekKey: 1, symbol: 1}, {unique: true});
CultureUniverseSchema.index({checkedAt: 1}, {expireAfterSeconds: CULTURE_UNIVERSE_TTL_SECONDS});

const CultureUniverse = models?.CultureUniverse || model<CultureUniverseDoc>('CultureUniverse', CultureUniverseSchema);

export default CultureUniverse;
