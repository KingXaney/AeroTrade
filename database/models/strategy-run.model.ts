import {Document, model, models, Schema} from "mongoose";
import {STRATEGY_RUN_TTL_DAYS} from "@/lib/strategies/config";

// One row per strategy per trade date: the signal board it looked at, what it planned
// and what actually filled. This is the educational record; PaperTrade stays the
// permanent fill log, so these rows expire.
export interface StrategyRunOrderDoc {
    symbol: string;
    side: 'buy' | 'sell';
    quantity: number;
    kind: 'enter' | 'add' | 'trim' | 'exit';
    reason: string;
    executed: boolean;
    price?: number;
    message?: string;
}

export interface StrategyRunSignalDoc {
    symbol: string;
    state: 'held' | 'enter' | 'exit' | 'watch' | 'excluded';
    // Primitives keyed by the catalog's signal columns; Mixed so every rule can carry
    // its own columns without a schema change.
    values: Record<string, number | string | boolean | null>;
    note?: string;
}

export interface StrategyRunDoc extends Document {
    strategyId: string;
    date: string;                 // trade date, 'YYYY-MM-DD' ET
    asOf: string;                 // last bar the decision saw
    mode: 'live' | 'preview' | 'skipped';
    status: 'planned' | 'done' | 'skipped';
    staleCount: number;
    universeSize: number;
    rebalanceTriggered: boolean;
    board: StrategyRunSignalDoc[];
    orders: StrategyRunOrderDoc[];
    skippedOrders: {symbol: string; reason: string}[];
    dataIssues: string[];
    equity: number;
    summary: string;
    createdAt: Date;
}

const OrderSchema = new Schema<StrategyRunOrderDoc>(
    {
        symbol: {type: String, required: true, uppercase: true, trim: true},
        side: {type: String, required: true, enum: ['buy', 'sell']},
        quantity: {type: Number, required: true},
        kind: {type: String, required: true, enum: ['enter', 'add', 'trim', 'exit']},
        reason: {type: String, required: true},
        executed: {type: Boolean, required: true, default: false},
        price: {type: Number},
        message: {type: String},
    },
    {_id: false},
);

const SignalSchema = new Schema<StrategyRunSignalDoc>(
    {
        symbol: {type: String, required: true, uppercase: true, trim: true},
        state: {type: String, required: true, enum: ['held', 'enter', 'exit', 'watch', 'excluded']},
        values: {type: Schema.Types.Mixed, required: true},
        note: {type: String},
    },
    {_id: false, minimize: false},
);

const StrategyRunSchema = new Schema<StrategyRunDoc>({
    strategyId: {type: String, required: true},
    date: {type: String, required: true},
    asOf: {type: String, required: true},
    mode: {type: String, required: true, enum: ['live', 'preview', 'skipped']},
    status: {type: String, required: true, enum: ['planned', 'done', 'skipped']},
    staleCount: {type: Number, required: true, default: 0},
    universeSize: {type: Number, required: true},
    rebalanceTriggered: {type: Boolean, required: true, default: false},
    board: {type: [SignalSchema], default: []},
    orders: {type: [OrderSchema], default: []},
    skippedOrders: {type: [new Schema({symbol: {type: String, required: true}, reason: {type: String, required: true}}, {_id: false})], default: []},
    dataIssues: {type: [String], default: []},
    equity: {type: Number, required: true, default: 0},
    summary: {type: String, required: true, default: ''},
    createdAt: {type: Date, default: Date.now},
});

StrategyRunSchema.index({strategyId: 1, date: 1}, {unique: true});
StrategyRunSchema.index({createdAt: 1}, {expireAfterSeconds: STRATEGY_RUN_TTL_DAYS * 24 * 60 * 60});

const StrategyRun = models?.StrategyRun || model<StrategyRunDoc>('StrategyRun', StrategyRunSchema);

export default StrategyRun;
