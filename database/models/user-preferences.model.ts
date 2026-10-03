import {Document, model, models, Schema} from "mongoose";
import type {NewsFeedPrefs} from "@/lib/news/feed-prefs";

export interface AppearancePrefs {
    palette: string;
    style: string;
    reduceMotion: boolean;
}

export interface DashboardLayoutPrefs {
    version: number;
    widgets: {id: string; span: number}[];
}

// Learn-surface stamps: each is written once by the user's own click and read back as
// derived state. No defaults anywhere in the sub-schema.
export interface LearnPrefs {
    missionsDismissedAt?: Date;
    // Today's lesson "Got it" keys (lib/learn/moments.ts lessonKey), newest last, capped at
    // LESSONS_SEEN_CAP by the $push {$each, $slice} that writes them.
    lessonsSeen?: string[];
    // Beginner-course lessons marked done (lib/learn/course.ts ids), each once ($addToSet). A
    // field of its own: lessonsSeen is capped and churns with rebalance keys. (The retired Daily
    // quiz's quizDaysAnswered / quizLastAnsweredDate may still sit in old documents; nothing reads them.)
    courseDone?: string[];
}

export interface UserPreferencesDoc extends Document {
    userId: string;
    emailNotifications: boolean;
    digestMode: 'personalized' | 'general';
    topicsInDigest?: boolean;
    appearance?: AppearancePrefs;
    dashboardLayout?: DashboardLayoutPrefs;
    newsFeed?: NewsFeedPrefs;          // absent = the default feed (lib/news/feed-prefs.ts)
    followedStrategies?: string[];     // quant-strategy slugs pinned on the dashboard; absent = none
    topicsSeededAt?: Date;             // default topics installed once; absent = never seeded
    newsSeenAt?: Date;                 // the reader last opened News (/news or the /topics index); absent = never — the rail dot's and the News card's stamp
    learn?: LearnPrefs;                // learn-surface stamps (checklist hidden, lessons seen, course lessons done); absent = none
    updatedAt: Date;
}

// Single-nested sub-schemas without defaults: a plain nested path would default
// `widgets` to [] and persist an empty layout on every unrelated upsert. The same goes
// for every array inside a sub-schema (default: undefined), or a theme save would write
// an empty news feed.
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

const NewsFeedSchema = new Schema<NewsFeedPrefs>(
    {
        categories: {type: [String], default: undefined},
        regions: {type: [String], default: undefined},
        includeSources: {type: [String], default: undefined},
        excludeSources: {type: [String], default: undefined},
        keywords: {type: [String], default: undefined},
        includeWatchlist: {type: Boolean},
    },
    {_id: false},
);

const LearnSchema = new Schema<LearnPrefs>(
    {
        missionsDismissedAt: {type: Date, required: false},
        lessonsSeen: {type: [String], default: undefined},
        courseDone: {type: [String], default: undefined},
    },
    {_id: false},
);

const UserPreferencesSchema = new Schema<UserPreferencesDoc>({
    userId: {type: String, required: true, unique: true},
    emailNotifications: {type: Boolean, default: true},
    digestMode: {type: String, enum: ['personalized', 'general'], default: 'personalized'},
    topicsInDigest: {type: Boolean, default: true},
    appearance: {type: AppearanceSchema, required: false},
    dashboardLayout: {type: DashboardLayoutSchema, required: false},
    newsFeed: {type: NewsFeedSchema, required: false},
    // No default: an empty array would be persisted by every unrelated upsert.
    followedStrategies: {type: [String], default: undefined},
    // Set once, when the default topics are installed. This — not the topic count — is
    // what makes "I deleted them all on purpose" stick: without it, every page view would
    // resurrect the defaults the user just removed.
    topicsSeededAt: {type: Date, required: false},
    // Written on every visit to News by lib/actions/news-feed.actions.markNewsSeen; read with the
    // feed by lib/news/feed-store.getNewsReaderPrefs. No default: absent means never looked.
    newsSeenAt: {type: Date, required: false},
    learn: {type: LearnSchema, required: false},
    updatedAt: {type: Date, default: Date.now},
});

const UserPreferences = models?.UserPreferences || model<UserPreferencesDoc>('UserPreferences', UserPreferencesSchema);

export default UserPreferences;
