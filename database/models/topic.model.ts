import {Document, model, models, Schema} from "mongoose";

export interface TopicBriefDoc {
    summary: string;
    bullets: string[];
    date: string;            // 'YYYY-MM-DD' in America/New_York
    generatedAt: Date;
    articleHashes: number[];
    model: string;
}

export interface TopicDoc extends Document {
    userId: string;
    name: string;
    slug: string;
    keywords: string[];      // normalised, deduped, sorted (lib/topics/normalize.ts)
    exclude: string[];
    color?: string;
    keywordSetHash: number;  // shared across users with an identical keyword set
    createdAt: Date;
    updatedAt: Date;
    lastFetchedAt?: Date;    // last successful fetch for this keyword set
    lastSeenAt?: Date;       // the user opened the topic; unseen = articles newer than this
    refreshRequestedAt?: Date;
    brief?: TopicBriefDoc;
}

// Single-nested and optional so unrelated $set updates never persist an empty brief.
const TopicBriefSchema = new Schema<TopicBriefDoc>(
    {
        summary: {type: String, required: true},
        bullets: {type: [String], default: []},
        date: {type: String, required: true},
        generatedAt: {type: Date, required: true},
        articleHashes: {type: [Number], default: []},
        model: {type: String, default: ''},
    },
    {_id: false},
);

const TopicSchema = new Schema<TopicDoc>(
    {
        userId: {type: String, required: true, index: true},
        name: {type: String, required: true, trim: true, maxlength: 60},
        slug: {type: String, required: true, lowercase: true, trim: true, maxlength: 64},
        keywords: {type: [String], default: []},
        exclude: {type: [String], default: []},
        color: {type: String},
        keywordSetHash: {type: Number, required: true, index: true},
        lastFetchedAt: {type: Date},
        lastSeenAt: {type: Date},
        refreshRequestedAt: {type: Date},
        brief: {type: TopicBriefSchema, required: false},
    },
    {timestamps: true},
);

TopicSchema.index({userId: 1, slug: 1}, {unique: true});
TopicSchema.index({userId: 1, createdAt: 1});

const Topic = models?.Topic || model<TopicDoc>('Topic', TopicSchema);

export default Topic;
