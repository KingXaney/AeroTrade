import {Document, model, models, Schema} from "mongoose";

export interface AppearancePrefs {
    palette: string;
    style: string;
    reduceMotion: boolean;
}

export interface DashboardLayoutPrefs {
    version: number;
    widgets: {id: string; span: number}[];
}

export interface UserPreferences extends Document {
    userId: string;
    emailNotifications: boolean;
    digestMode: 'personalized' | 'general';
    topicsInDigest?: boolean;
    appearance?: AppearancePrefs;
    dashboardLayout?: DashboardLayoutPrefs;
    updatedAt: Date;
}

// Single-nested sub-schemas without defaults: a plain nested path would default
// `widgets` to [] and persist an empty layout on every unrelated upsert.
const AppearanceSchema = new Schema<AppearancePrefs>(
    {
        palette: {type: String, required: true},
        style: {type: String, required: true},
        reduceMotion: {type: Boolean, default: false},
    },
    {_id: false},
);

const DashboardLayoutSchema = new Schema<DashboardLayoutPrefs>(
    {
        version: {type: Number, required: true},
        widgets: {
            type: [new Schema({id: {type: String, required: true}, span: {type: Number, required: true}}, {_id: false})],
            default: undefined,
        },
    },
    {_id: false},
);

const UserPreferencesSchema = new Schema<UserPreferences>({
    userId: {type: String, required: true, unique: true, index: true},
    emailNotifications: {type: Boolean, default: true},
    digestMode: {type: String, enum: ['personalized', 'general'], default: 'personalized'},
    topicsInDigest: {type: Boolean, default: true},
    appearance: {type: AppearanceSchema, required: false},
    dashboardLayout: {type: DashboardLayoutSchema, required: false},
    updatedAt: {type: Date, default: Date.now},
});

const UserPreferencesModel = models?.UserPreferences || model<UserPreferences>('UserPreferences', UserPreferencesSchema);

export default UserPreferencesModel;
