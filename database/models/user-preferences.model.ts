import {Document, model, models, Schema} from "mongoose";

export interface UserPreferences extends Document {
    userId: string;
    emailNotifications: boolean;
    digestMode: 'personalized' | 'general';
    updatedAt: Date;
}

const UserPreferencesSchema = new Schema<UserPreferences>({
    userId: {type: String, required: true, unique: true, index: true},
    emailNotifications: {type: Boolean, default: true},
    digestMode: {type: String, enum: ['personalized', 'general'], default: 'personalized'},
    updatedAt: {type: Date, default: Date.now},
});

const UserPreferencesModel = models?.UserPreferences || model<UserPreferences>('UserPreferences', UserPreferencesSchema);

export default UserPreferencesModel;
