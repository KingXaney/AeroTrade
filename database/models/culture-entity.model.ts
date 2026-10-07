import {Document, model, models, Schema} from "mongoose";

// A brand of the culture brain's catalog, as the daily fold keeps it: the news brain's
// dual-timescale memory (lib/brain/decay.ts) keyed by catalog id, with the brand's category and
// listed owner copied from the catalog on every write so a page never joins. Its own collection
// — never BrainEntity (invariant 3): user topics, the navigator and the news brain stay untouched.
export interface CultureLink {
    key: string;
    weight: number;               // decayed co-mention mass
}

export interface CultureEntityDoc extends Document {
    key: string;                  // the catalog id: 'celsius', 'on-running'
    displayName: string;
    category: string;
    ticker: string | null;        // the listed owner's ticker, null for a private brand
    listing: string | null;       // 'us' | 'adr' | 'otc' | null
    weightFast: number;
    sentimentSumFast: number;
    weightSlow: number;
    sentimentSumSlow: number;
    decayedTo: string;            // 'YYYY-MM-DD' ET both layers are decayed to (idempotency)
    lastSeenAt: Date;
    thesisSince?: Date | null;    // set when weightSlow sustains above the threshold
    peakSlowWeight: number;
    lastFoldRunId?: string;       // Inngest run id of the last fold — retry idempotency
    attentionDay?: string | null; // the last ET day an attention surprise folded — once a day
    links: CultureLink[];
}

const CultureLinkSchema = new Schema<CultureLink>(
    {
        key: {type: String, required: true},
        weight: {type: Number, required: true},
    },
    {_id: false},
);

const CultureEntitySchema = new Schema<CultureEntityDoc>({
    key: {type: String, required: true},
    displayName: {type: String, required: true},
    category: {type: String, required: true},
    ticker: {type: String, default: null},
    listing: {type: String, default: null},
    weightFast: {type: Number, default: 0},
    sentimentSumFast: {type: Number, default: 0},
    weightSlow: {type: Number, default: 0},
    sentimentSumSlow: {type: Number, default: 0},
    decayedTo: {type: String, required: true},
    lastSeenAt: {type: Date, required: true},
    thesisSince: {type: Date, default: null},
    peakSlowWeight: {type: Number, default: 0},
    lastFoldRunId: {type: String},
    attentionDay: {type: String, default: null},
    links: {type: [CultureLinkSchema], default: []},
});

CultureEntitySchema.index({key: 1}, {unique: true});
CultureEntitySchema.index({ticker: 1, weightSlow: -1});
CultureEntitySchema.index({category: 1, weightSlow: -1});

const CultureEntity = models?.CultureEntity || model<CultureEntityDoc>('CultureEntity', CultureEntitySchema);

export default CultureEntity;
