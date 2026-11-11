import {Document, model, models, Schema} from "mongoose";
import {QUOTE_ROW_TTL_DAYS} from "@/lib/prices/config";

// The quote sheet: one row per symbol holding the newest quote the app has received from
// Finnhub. Every page values holdings from these rows (lib/prices/quote-store.ts), so a price
// is the same on every page, account and server instance until its row is refreshed; a fill,
// the snapshot job and a plan ask Finnhub themselves and write what they got here.
//
// Market data has no environment: a preview and production share the rows, as they share the
// daily bars. A daily close is never stored here — that is price-bar — and a row is never
// compared with one except by which is later in time (lib/trading/analytics.withStoredCloses).
export interface PriceQuoteDoc extends Document {
    symbol: string;
    price?: number;            // the newest positive price Finnhub gave; absent until it gives one
    changePercent?: number;    // the day's change from the same answer
    fetchedAt?: Date;          // when Finnhub was asked for that price
    refusedAt?: Date;          // the last attempt that got no price (a refusal, an empty answer, a timeout)
    claimedUntil?: Date;       // a refresh in flight holds the row until then
    claimedBy?: string;        // that refresh's token, so it knows which rows it won
    updatedAt: Date;           // the last write of any kind; the TTL below collects a symbol nobody asks about
}

const PriceQuoteSchema = new Schema<PriceQuoteDoc>({
    symbol: {type: String, required: true, uppercase: true, trim: true, unique: true},
    price: {type: Number},
    changePercent: {type: Number},
    fetchedAt: {type: Date},
    refusedAt: {type: Date},
    claimedUntil: {type: Date},
    claimedBy: {type: String},
    updatedAt: {type: Date, default: Date.now},
});

// Garbage collection only: whether a row is fresh is decided from fetchedAt (lib/prices/quotes.ts).
PriceQuoteSchema.index({updatedAt: 1}, {expireAfterSeconds: QUOTE_ROW_TTL_DAYS * 24 * 60 * 60});

const PriceQuote = models?.PriceQuote || model<PriceQuoteDoc>('PriceQuote', PriceQuoteSchema);

export default PriceQuote;
