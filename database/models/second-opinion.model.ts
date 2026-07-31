import {Document, model, models, Schema} from "mongoose";

// Claude's on-demand critique of the brain + latest decisions. One global
// document — the brain and the model portfolio are shared, so the critique is
// too; any signed-in user can refresh it. ("modelUsed" because mongoose
// Documents already have a model() method.)
export interface SecondOpinionDoc extends Document {
    scope: string;
    opinionMd: string;
    modelUsed: string;
    generatedAt: Date;
    requestedBy: string;
}

const SecondOpinionSchema = new Schema<SecondOpinionDoc>({
    scope: {type: String, required: true, unique: true, index: true},
    opinionMd: {type: String, required: true},
    modelUsed: {type: String, required: true},
    generatedAt: {type: Date, required: true},
    requestedBy: {type: String, default: ''},
});

const SecondOpinion = models?.SecondOpinion || model<SecondOpinionDoc>('SecondOpinion', SecondOpinionSchema);

export default SecondOpinion;
