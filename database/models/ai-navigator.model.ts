import {Document, model, models, Schema} from "mongoose";

// Per-user opt-in to the AI-managed strategy account. lastRunDate doubles as the
// atomic run claim: the weekly job only proceeds for a user after winning
// findOneAndUpdate({userId, lastRunDate: {$ne: today}}) — the double-trade guard.
export interface AiNavigatorDoc extends Document {
    userId: string;
    accountId: string;
    status: 'active' | 'paused';
    enrolledAt: Date;
    lastRunDate?: string;         // 'YYYY-MM-DD' ET
    lastError?: string;
}

const AiNavigatorSchema = new Schema<AiNavigatorDoc>({
    userId: {type: String, required: true, unique: true, index: true},
    accountId: {type: String, required: true},
    status: {type: String, required: true, enum: ['active', 'paused'], default: 'active'},
    enrolledAt: {type: Date, required: true},
    lastRunDate: {type: String},
    lastError: {type: String},
});

const AiNavigator = models?.AiNavigator || model<AiNavigatorDoc>('AiNavigator', AiNavigatorSchema);

export default AiNavigator;
