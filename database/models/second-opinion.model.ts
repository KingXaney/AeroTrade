import {Document, model, models, Schema} from "mongoose";

// Claude's critique of the brain + latest decisions, stored per user (scope =
// userId): the brain is shared, but an opinion is something a person requests,
// and a pasted one is user-authored — nobody should be able to write text onto
// someone else's page. "modelUsed" because mongoose Documents already have a
// model() method.
export type SecondOpinionSource = 'api' | 'cli' | 'manual';

export interface SecondOpinionDoc extends Document {
    scope: string;
    opinionMd: string;
    modelUsed: string;
    source: SecondOpinionSource;
    generatedAt: Date;
    requestedBy: string;
    // Stamped when a paid run is queued, before any answer exists — the row can
    // therefore hold a claim with no opinion yet, so readers must tolerate that.
    requestedAt?: Date;
}

const SecondOpinionSchema = new Schema<SecondOpinionDoc>({
    scope: {type: String, required: true, unique: true, index: true},
    opinionMd: {type: String},
    modelUsed: {type: String},
    source: {type: String, enum: ['api', 'cli', 'manual'], default: 'api'},
    generatedAt: {type: Date},
    requestedBy: {type: String, default: ''},
    requestedAt: {type: Date},
});

const SecondOpinion = models?.SecondOpinion || model<SecondOpinionDoc>('SecondOpinion', SecondOpinionSchema);

export default SecondOpinion;
