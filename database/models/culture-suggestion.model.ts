import {Document, model, models, Schema} from "mongoose";

// A brand name the model met in an item that the catalog does not have. The queue the /culture
// system view shows a person, who adds a brand by editing lib/culture/catalog.ts; the brain
// never adds one itself, so a hallucinated name can never become a ticker.
export interface CultureSuggestionDoc extends Document {
    name: string;                 // as the model wrote it, cleaned
    nameKey: string;              // lower-cased, whitespace collapsed — the dedupe key
    count: number;                // how many items named it
    firstSeenAt: Date;
    lastSeenAt: Date;
    sampleItemHashes: number[];   // a few items it came from, for a person to look at
    status: 'new' | 'dismissed';
}

const CultureSuggestionSchema = new Schema<CultureSuggestionDoc>({
    name: {type: String, required: true},
    nameKey: {type: String, required: true},
    count: {type: Number, default: 1},
    firstSeenAt: {type: Date, required: true},
    lastSeenAt: {type: Date, required: true},
    sampleItemHashes: {type: [Number], default: []},
    status: {type: String, enum: ['new', 'dismissed'], default: 'new'},
});

CultureSuggestionSchema.index({nameKey: 1}, {unique: true});
CultureSuggestionSchema.index({status: 1, count: -1});

const CultureSuggestion = models?.CultureSuggestion || model<CultureSuggestionDoc>('CultureSuggestion', CultureSuggestionSchema);

export default CultureSuggestion;
