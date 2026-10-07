import {Document, model, models, Schema} from "mongoose";

// A picker's decisions for one day: every order it planned with what happened to it, every
// position it kept, the brands behind each symbol, and the universe it was given. Its own
// model, not SuggestionSet: the brands and the universe audit are what the picks view shows,
// and the Navigator's model carries neither.
export interface CultureDecisionItemDoc {
    symbol: string;
    action: 'buy' | 'sell' | 'hold';
    quantity?: number;
    targetWeight: number;
    currentWeight: number;
    score: number;
    reasons: string[];            // deterministic strings from the scorer and the allocator — never model output
    brands: {id: string; name: string}[];
    executed: boolean;
    executionPrice?: number;
    error?: string;
}

export interface CultureDecisionDoc extends Document {
    date: string;                 // 'YYYY-MM-DD' ET
    profile: string;              // 'spike' | 'quiet'
    weekKey: string;
    kind: 'executed' | 'preview' | 'skipped';
    items: CultureDecisionItemDoc[];
    universe: {tickers: number; quoted: number; unquoted: {symbol: string; reason: string}[]};
    feeds: string[];
    rationaleMd?: string;
    summary: string;
    createdAt: Date;
}

const CultureDecisionItemSchema = new Schema<CultureDecisionItemDoc>(
    {
        symbol: {type: String, required: true},
        action: {type: String, required: true, enum: ['buy', 'sell', 'hold']},
        quantity: {type: Number},
        targetWeight: {type: Number, required: true},
        currentWeight: {type: Number, required: true},
        score: {type: Number, required: true},
        reasons: {type: [String], default: []},
        brands: {type: [new Schema({id: {type: String, required: true}, name: {type: String, required: true}}, {_id: false})], default: []},
        executed: {type: Boolean, default: false},
        executionPrice: {type: Number},
        error: {type: String},
    },
    {_id: false},
);

const CultureDecisionSchema = new Schema<CultureDecisionDoc>({
    date: {type: String, required: true},
    profile: {type: String, required: true},
    weekKey: {type: String, required: true},
    kind: {type: String, required: true, enum: ['executed', 'preview', 'skipped']},
    items: {type: [CultureDecisionItemSchema], default: []},
    universe: {
        tickers: {type: Number, default: 0},
        quoted: {type: Number, default: 0},
        unquoted: {type: [new Schema({symbol: {type: String, required: true}, reason: {type: String, default: ''}}, {_id: false})], default: []},
    },
    feeds: {type: [String], default: []},
    rationaleMd: {type: String},
    summary: {type: String, default: ''},
    createdAt: {type: Date, default: Date.now},
});

CultureDecisionSchema.index({date: 1, profile: 1}, {unique: true});
CultureDecisionSchema.index({profile: 1, date: -1});

const CultureDecision = models?.CultureDecision || model<CultureDecisionDoc>('CultureDecision', CultureDecisionSchema);

export default CultureDecision;
