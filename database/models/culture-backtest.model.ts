import {Document, model, models, Schema} from "mongoose";
import type {SeriesStats} from "@/lib/strategies/types";

// The culture pickers' simulated record: one document (key 'culture') holding three variants —
// the price-only control, Spike and Quiet — run by lib/culture/simulator.ts over the same stored
// pageviews and bars, ending before the accounts' launch. Replaced whole when the engine version
// or the catalog's owners change, or on a resimulate; never blended with the live accounts.
export interface CultureBacktestPointDoc {
    date: string;
    value: number;
}

export interface CultureBacktestTradeDoc {
    date: string;
    symbol: string;
    side: 'buy' | 'sell';
    quantity: number;
    price: number;
    total: number;
    realizedPnl?: number;
    reason: string;
    fill: 'open' | 'close';
}

export interface CultureBacktestVariantDoc {
    profile: string;              // 'price' | 'spike' | 'quiet'
    weeks: number;
    turnoverPct: number;
    closeFills: number;
    points: CultureBacktestPointDoc[];
    trades: CultureBacktestTradeDoc[];
    stats: SeriesStats;
}

export interface CultureBacktestDoc extends Document {
    key: string;                  // CULTURE_BACKTEST_KEY
    version: string;              // CULTURE_ENGINE_VERSION at the build
    catalogHash: string;          // catalogHash() at the build
    feeds: string[];
    from: string;
    to: string;
    fillRule: 'next-open';
    benchmark: CultureBacktestPointDoc[];
    variants: CultureBacktestVariantDoc[];
    computedAt: Date;
}

const PointSchema = new Schema<CultureBacktestPointDoc>(
    {date: {type: String, required: true}, value: {type: Number, required: true}},
    {_id: false},
);

const TradeSchema = new Schema<CultureBacktestTradeDoc>(
    {
        date: {type: String, required: true},
        symbol: {type: String, required: true, uppercase: true, trim: true},
        side: {type: String, required: true, enum: ['buy', 'sell']},
        quantity: {type: Number, required: true},
        price: {type: Number, required: true},
        total: {type: Number, required: true},
        realizedPnl: {type: Number},
        reason: {type: String, required: true},
        fill: {type: String, required: true, enum: ['open', 'close']},
    },
    {_id: false},
);

// Stats are nullable numbers; Mixed keeps null distinct from absent.
const VariantSchema = new Schema<CultureBacktestVariantDoc>(
    {
        profile: {type: String, required: true},
        weeks: {type: Number, required: true},
        turnoverPct: {type: Number, required: true},
        closeFills: {type: Number, required: true, default: 0},
        points: {type: [PointSchema], default: []},
        trades: {type: [TradeSchema], default: []},
        stats: {type: Schema.Types.Mixed, required: true},
    },
    {_id: false, minimize: false},
);

const CultureBacktestSchema = new Schema<CultureBacktestDoc>({
    key: {type: String, required: true},
    version: {type: String, required: true},
    catalogHash: {type: String, required: true},
    feeds: {type: [String], default: []},
    from: {type: String, required: true},
    to: {type: String, required: true},
    fillRule: {type: String, required: true, enum: ['next-open'], default: 'next-open'},
    benchmark: {type: [PointSchema], default: []},
    variants: {type: [VariantSchema], default: []},
    computedAt: {type: Date, required: true},
}, {minimize: false});

CultureBacktestSchema.index({key: 1}, {unique: true});

const CultureBacktest = models?.CultureBacktest || model<CultureBacktestDoc>('CultureBacktest', CultureBacktestSchema);

export default CultureBacktest;
