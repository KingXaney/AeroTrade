import {Document, model, models, Schema} from "mongoose";
import type {SeriesStats} from "@/lib/strategies/types";

// The simulated track record of one strategy: the same rule run over stored daily bars
// with next-open fills, ending before the strategy's launch date. Replaced whole when
// the rule version changes; never blended with the live account's snapshots.
export interface BacktestPointDoc {
    date: string;
    value: number;
}

export interface BacktestTradeDoc {
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

// One precomputed what-if setting (lib/strategies/whatif.ts): the same rule over the same bars
// and window with ONE knob moved, as the compact view the detail page draws. Stored as an
// array, never keyed by id: an id such as "spyWeight=0.4" holds a dot.
export interface BacktestVariantDoc {
    id: string;
    knob: string;
    value: number;
    from: string;
    to: string;
    stats: SeriesStats;
    closeFills: number;
    skippedDays: number;
    points: BacktestPointDoc[];
}

export interface StrategyBacktestDoc extends Document {
    strategyId: string;
    version: string;
    from: string;
    to: string;
    fillRule: 'next-open';
    closeFills: number;
    skippedDays: number;
    points: BacktestPointDoc[];
    benchmark: BacktestPointDoc[];
    trades: BacktestTradeDoc[];
    stats: SeriesStats;
    computedAt: Date;
    // Absent until the nightly job computes them; variantsVersion and variantsFor are the
    // backtest version and build (computedAt) they were computed beside, so a rebuilt backtest —
    // a new version or a resimulate on the same one — shows none until its own grid is computed.
    variants?: BacktestVariantDoc[];
    variantsVersion?: string;
    variantsFor?: Date;
}

const PointSchema = new Schema<BacktestPointDoc>(
    {date: {type: String, required: true}, value: {type: Number, required: true}},
    {_id: false},
);

const TradeSchema = new Schema<BacktestTradeDoc>(
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

// A path named id, so no id virtual (and no _id): the stored field is the id.
const VariantSchema = new Schema<BacktestVariantDoc>(
    {
        id: {type: String, required: true},
        knob: {type: String, required: true},
        value: {type: Number, required: true},
        from: {type: String, required: true},
        to: {type: String, required: true},
        stats: {type: Schema.Types.Mixed, required: true},
        closeFills: {type: Number, required: true},
        skippedDays: {type: Number, required: true},
        points: {type: [PointSchema], default: []},
    },
    {_id: false, id: false, minimize: false},
);

// Stats are nullable numbers; Mixed keeps null distinct from absent.
const StrategyBacktestSchema = new Schema<StrategyBacktestDoc>({
    strategyId: {type: String, required: true, unique: true, index: true},
    version: {type: String, required: true},
    from: {type: String, required: true},
    to: {type: String, required: true},
    fillRule: {type: String, required: true, enum: ['next-open'], default: 'next-open'},
    closeFills: {type: Number, required: true, default: 0},
    skippedDays: {type: Number, required: true, default: 0},
    points: {type: [PointSchema], default: []},
    benchmark: {type: [PointSchema], default: []},
    trades: {type: [TradeSchema], default: []},
    stats: {type: Schema.Types.Mixed, required: true},
    computedAt: {type: Date, required: true},
    // No default: an empty array would read as "computed, and nothing to show".
    variants: {type: [VariantSchema], default: undefined},
    variantsVersion: {type: String},
    variantsFor: {type: Date},
}, {minimize: false});

const StrategyBacktest = models?.StrategyBacktest || model<StrategyBacktestDoc>('StrategyBacktest', StrategyBacktestSchema);

export default StrategyBacktest;
