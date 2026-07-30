import {Document, model, models, Schema} from "mongoose";

export interface BrainLink {
    key: string;
    weight: number;               // decayed co-mention mass
}

// Dual-timescale memory: the fast layer (half-life ~5d) answers "what's hot this
// week" for display; the slow layer (half-life ~60d) is persistent narrative mass
// and is what allocation decisions read. Sentiment is stored as a decayed SUM
// (sums compose under decay); the average is derived as sentimentSum / weight.
export interface BrainEntityDoc extends Document {
    key: string;                  // 'NVDA' | 'sector:energy' | 'theme:ai-capex'
    type: 'ticker' | 'sector' | 'theme';
    displayName: string;
    weightFast: number;
    sentimentSumFast: number;
    weightSlow: number;
    sentimentSumSlow: number;
    decayedTo: string;            // 'YYYY-MM-DD' ET both layers are decayed to (idempotency)
    lastSeenAt: Date;
    verified: boolean;            // tickers only: resolved via Finnhub search + live quote
    thesisSince?: Date | null;    // set when weightSlow sustains above threshold
    peakSlowWeight: number;       // high-water mark while a thesis is active
    lastFoldRunId?: string;       // Inngest run id of the last fold — retry idempotency
    links: BrainLink[];
}

const BrainLinkSchema = new Schema<BrainLink>(
    {
        key: {type: String, required: true},
        weight: {type: Number, required: true},
    },
    {_id: false},
);

const BrainEntitySchema = new Schema<BrainEntityDoc>({
    key: {type: String, required: true},
    type: {type: String, required: true, enum: ['ticker', 'sector', 'theme']},
    displayName: {type: String, required: true},
    weightFast: {type: Number, default: 0},
    sentimentSumFast: {type: Number, default: 0},
    weightSlow: {type: Number, default: 0},
    sentimentSumSlow: {type: Number, default: 0},
    decayedTo: {type: String, required: true},
    lastSeenAt: {type: Date, required: true},
    verified: {type: Boolean, default: false},
    thesisSince: {type: Date, default: null},
    peakSlowWeight: {type: Number, default: 0},
    lastFoldRunId: {type: String},
    links: {type: [BrainLinkSchema], default: []},
});

BrainEntitySchema.index({key: 1}, {unique: true});
BrainEntitySchema.index({type: 1, weightSlow: -1});

const BrainEntity = models?.BrainEntity || model<BrainEntityDoc>('BrainEntity', BrainEntitySchema);

export default BrainEntity;
