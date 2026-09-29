import {Document, model, models, Schema} from "mongoose";

// Which dates a symbol's stored dividends can be trusted for. Written only after a Yahoo
// payload parsed with dividend inference (lib/prices/yahoo.ts), and only as one unbroken
// range — a gap between two fetches is never claimed. Income is credited only inside this
// range, so a failed or partial fetch delays a dividend instead of paying zero for it.
export interface PriceSeriesMetaDoc extends Document {
    symbol: string;
    dividendsFrom?: string;       // 'YYYY-MM-DD'
    dividendsThrough?: string;    // 'YYYY-MM-DD'
    failingSince?: string;        // first ET date of an unbroken run of failed fetches
    updatedAt: Date;
}

const PriceSeriesMetaSchema = new Schema<PriceSeriesMetaDoc>({
    symbol: {type: String, required: true, uppercase: true, trim: true, unique: true},
    dividendsFrom: {type: String},
    dividendsThrough: {type: String},
    failingSince: {type: String},
    updatedAt: {type: Date, default: Date.now},
});

const PriceSeriesMeta = models?.PriceSeriesMeta || model<PriceSeriesMetaDoc>('PriceSeriesMeta', PriceSeriesMetaSchema);

export default PriceSeriesMeta;
