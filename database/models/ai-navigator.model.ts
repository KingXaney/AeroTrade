import {Document, model, models, Schema} from "mongoose";

// Per-user opt-in to the AI-managed strategy account. lastRunDate doubles as the
// atomic run claim: the weekly job (or an early "Run AI now") only trades for a user after
// winning findOneAndUpdate({userId, lastRunDate: {$ne: weekKey}}) — the double-trade guard.
// Despite its name the field holds the ET week key; the stored name stays.
export interface AiNavigatorDoc extends Document {
    userId: string;
    accountId: string;
    status: 'active' | 'paused';
    enrolledAt: Date;
    lastRunDate?: string;         // the ET week key: 'YYYY-MM-DD' of that week's Monday (getEasternWeekKey)
    lastError?: string;
}

const AiNavigatorSchema = new Schema<AiNavigatorDoc>({
    userId: {type: String, required: true, unique: true},
    accountId: {type: String, required: true},
    status: {type: String, required: true, enum: ['active', 'paused'], default: 'active'},
    enrolledAt: {type: Date, required: true},
    lastRunDate: {type: String},
    lastError: {type: String},
});

const AiNavigator = models?.AiNavigator || model<AiNavigatorDoc>('AiNavigator', AiNavigatorSchema);

export default AiNavigator;
