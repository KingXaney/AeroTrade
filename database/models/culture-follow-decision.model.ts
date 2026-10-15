import {Document, model, models, Schema} from "mongoose";
import {CultureDecisionItemSchema, type CultureDecisionItemDoc} from "@/database/models/culture-decision.model";

// What a picker decided for one enrolled account on one day: the same items a picker's own
// decision carries (lib/culture/decisions.ts), sized to the account's book. Its own model, not a
// userId on CultureDecision, whose unique {date, profile} index is the pickers' own. The
// rationale is the picker's and is not copied here.
export interface CultureFollowDecisionDoc extends Document {
    userId: string;
    profile: string;              // 'spike' | 'quiet'
    accountId: string;
    date: string;                 // 'YYYY-MM-DD' ET
    weekKey: string;
    kind: 'executed' | 'preview';
    items: CultureDecisionItemDoc[];
    summary: string;
    createdAt: Date;
}

const CultureFollowDecisionSchema = new Schema<CultureFollowDecisionDoc>({
    userId: {type: String, required: true},
    profile: {type: String, required: true},
    accountId: {type: String, required: true},
    date: {type: String, required: true},
    weekKey: {type: String, required: true},
    kind: {type: String, required: true, enum: ['executed', 'preview']},
    items: {type: [CultureDecisionItemSchema], default: []},
    summary: {type: String, default: ''},
    createdAt: {type: Date, default: Date.now},
});

CultureFollowDecisionSchema.index({userId: 1, profile: 1, date: 1}, {unique: true});
CultureFollowDecisionSchema.index({userId: 1, profile: 1, date: -1});

const CultureFollowDecision = models?.CultureFollowDecision || model<CultureFollowDecisionDoc>('CultureFollowDecision', CultureFollowDecisionSchema);

export default CultureFollowDecision;
