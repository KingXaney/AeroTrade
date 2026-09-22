import {Document, model, models, Schema} from "mongoose";

// One row per quant strategy in the catalog: which system-owned PaperAccount it
// trades, the daily run claim and the last time its rule evaluated a rebalance.
// lastRunDate is the atomic claim — the daily job proceeds for a strategy only after
// winning findOneAndUpdate({strategyId, status: 'active', lastRunDate: {$ne: today}}).
// lastRebalanceDate drives cadence (state-based, see lib/strategies/calendar.ts).
export interface StrategyStateDoc extends Document {
    strategyId: string;
    accountId: string;
    status: 'active' | 'paused';
    version: string;              // effectiveVersion(def) at the last run
    launchDate: string;           // 'YYYY-MM-DD' ET — the simulated record ends before this
    lastRunDate?: string;         // 'YYYY-MM-DD' ET claim
    lastTradeDate?: string;
    lastRebalanceDate?: string;
    lastError?: string;
    createdAt: Date;
    updatedAt: Date;
}

const StrategyStateSchema = new Schema<StrategyStateDoc>(
    {
        strategyId: {type: String, required: true, unique: true, index: true},
        accountId: {type: String, required: true},
        status: {type: String, required: true, enum: ['active', 'paused'], default: 'active'},
        version: {type: String, required: true},
        launchDate: {type: String, required: true},
        lastRunDate: {type: String},
        lastTradeDate: {type: String},
        lastRebalanceDate: {type: String},
        lastError: {type: String},
    },
    {timestamps: true},
);

const StrategyState = models?.StrategyState || model<StrategyStateDoc>('StrategyState', StrategyStateSchema);

export default StrategyState;
