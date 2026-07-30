import {Document, model, models, Schema} from "mongoose";

export const GLOBAL_SUGGESTIONS_USER = 'global';

// One set per decision date: the 'global' sentinel row is the model portfolio shown
// to everyone on /brain; per-user rows hold the concrete orders + execution results.
// rationaleMd is markdown (rendered with react-markdown — never raw HTML injection).
export interface SuggestionItemDoc {
    symbol: string;
    action: 'buy' | 'sell' | 'hold';
    quantity?: number;
    targetWeight: number;
    currentWeight: number;
    score: number;
    reasons: string[];            // deterministic scoring output — never LLM text
    executed: boolean;
    executionPrice?: number;
    error?: string;
}

export interface SuggestionSetDoc extends Document {
    userId: string;               // 'global' or a user id
    date: string;                 // 'YYYY-MM-DD' ET decision date
    kind: 'executed' | 'preview'; // preview = manual analysis run, nothing traded
    items: SuggestionItemDoc[];
    rationaleMd?: string;
    createdAt: Date;
}

const SuggestionItemSchema = new Schema<SuggestionItemDoc>(
    {
        symbol: {type: String, required: true, uppercase: true, trim: true},
        action: {type: String, required: true, enum: ['buy', 'sell', 'hold']},
        quantity: {type: Number},
        targetWeight: {type: Number, required: true},
        currentWeight: {type: Number, required: true},
        score: {type: Number, required: true},
        reasons: {type: [String], default: []},
        executed: {type: Boolean, default: false},
        executionPrice: {type: Number},
        error: {type: String},
    },
    {_id: false},
);

const SuggestionSetSchema = new Schema<SuggestionSetDoc>({
    userId: {type: String, required: true, default: GLOBAL_SUGGESTIONS_USER},
    date: {type: String, required: true},
    kind: {type: String, required: true, enum: ['executed', 'preview'], default: 'executed'},
    items: {type: [SuggestionItemSchema], default: []},
    rationaleMd: {type: String},
    createdAt: {type: Date, default: Date.now},
});

SuggestionSetSchema.index({userId: 1, date: 1}, {unique: true});

const SuggestionSet = models?.SuggestionSet || model<SuggestionSetDoc>('SuggestionSet', SuggestionSetSchema);

export default SuggestionSet;
