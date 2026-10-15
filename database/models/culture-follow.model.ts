import {Document, model, models, Schema} from "mongoose";

// A user's enrolment with one culture picker (lib/culture/config.ts LIVE_PROFILES): the paper
// account of theirs the picker trades, whether it trades, and the week it last claimed — the
// atomic weekly budget, as AiNavigator keys the Navigator's runs. One row per user and profile,
// so a user may enrol an account with each picker. Unenrolling deletes the row and keeps the
// account; lib/trading/lifecycle.deleteOwnedAccount refuses the account while the row stands.
export interface CultureFollowDoc extends Document {
    userId: string;
    profile: string;              // 'spike' | 'quiet'
    accountId: string;            // String(_id) of the user's own PaperAccount
    status: 'active' | 'paused';
    enrolledAt: Date;
    lastRunWeek?: string;         // the Monday of the last claimed week
    lastError?: string;
}

const CultureFollowSchema = new Schema<CultureFollowDoc>({
    userId: {type: String, required: true},
    profile: {type: String, required: true},
    accountId: {type: String, required: true},
    status: {type: String, enum: ['active', 'paused'], default: 'active'},
    enrolledAt: {type: Date, required: true},
    lastRunWeek: {type: String},
    lastError: {type: String},
});

CultureFollowSchema.index({userId: 1, profile: 1}, {unique: true});
CultureFollowSchema.index({profile: 1, status: 1});
CultureFollowSchema.index({accountId: 1});

const CultureFollow = models?.CultureFollow || model<CultureFollowDoc>('CultureFollow', CultureFollowSchema);

export default CultureFollow;
