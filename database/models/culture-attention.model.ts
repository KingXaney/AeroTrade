import {Document, model, models, Schema} from "mongoose";

// A brand's daily attention from one source, one document per month: `days` maps a day of the
// month ('07') to that day's value — pageviews, an App Store chart score (101 − rank), or how
// many items named the brand. Monthly maps, never a row per day: ten years of Wikipedia history
// for two hundred brands is a few tens of thousands of documents, not millions, and the backtest
// reads a brand's whole history in one query. A day is written with `$set: {'days.07': v}`, so a
// late or corrected day heals in place. No TTL: the backtest needs the history.
export interface CultureAttentionDoc extends Document {
    brand: string;                // the catalog id
    source: string;               // 'wikipedia' | 'appstore' | 'youtube' | 'reddit' | 'news' | 'social'
    month: string;                // 'YYYY-MM'
    days: Map<string, number>;    // 'DD' → value; absent = no data (a chart the brand was not on)
    updatedAt: Date;
}

const CultureAttentionSchema = new Schema<CultureAttentionDoc>({
    brand: {type: String, required: true},
    source: {type: String, required: true},
    month: {type: String, required: true},
    days: {type: Map, of: Number, default: {}},
    updatedAt: {type: Date, default: Date.now},
});

CultureAttentionSchema.index({brand: 1, source: 1, month: 1}, {unique: true});
CultureAttentionSchema.index({source: 1, month: 1});

const CultureAttention = models?.CultureAttention || model<CultureAttentionDoc>('CultureAttention', CultureAttentionSchema);

export default CultureAttention;
