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
}, {minimize: false});

const StrategyBacktest = models?.StrategyBacktest || model<StrategyBacktestDoc>('StrategyBacktest', StrategyBacktestSchema);

export default StrategyBacktest;
