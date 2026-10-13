import {Document, model, models, Schema} from "mongoose";
import {LAB_DAY_TTL_DAYS} from "@/lib/lab/papers/config";

// One day of the lab's papers feed, global (the lab has one reader, but the day is the feed's,
// not the owner's): the papers kept for each track, their counts, and the one digest the model
// wrote over them — citing by index, never carrying a link. A paper is its arXiv id; the links
// are built from it at render time (lib/lab/papers/links.ts). Written by the weekday job
// (lib/lab/papers/store.ts), read by the lab page; expires after LAB_DAY_TTL_DAYS.
export interface LabPaperDoc {
    id: string;
    title: string;
    abstract: string;
    authors: string[];
    categories: string[];
    primary: string;
    track: 'cv' | 'ml' | 'quant';
    published: string;
    source: 'arxiv' | 'hf' | 'both';
    upvotes: number | null;
}

export interface LabDigestBulletDoc {
    text: string;
    papers: number[];
}

export interface LabDigestDoc {
    headline: string;
    bullets: LabDigestBulletDoc[];
    model: string;
    writtenAt: Date;
}

export interface LabDayDoc extends Document {
    day: string;                 // 'YYYY-MM-DD' in America/New_York
    papers: LabPaperDoc[];
    counts: {listed: number; hf: number; novel: number; kept: number};
    digest: LabDigestDoc | null;
    fetchedAt: Date;
    createdAt: Date;
}

const LabPaperSchema = new Schema<LabPaperDoc>(
    {
        id: {type: String, required: true},
        title: {type: String, required: true},
        abstract: {type: String, default: ''},
        authors: {type: [String], default: []},
        categories: {type: [String], default: []},
        primary: {type: String, default: ''},
        track: {type: String, enum: ['cv', 'ml', 'quant'], required: true},
        published: {type: String, default: ''},
        source: {type: String, enum: ['arxiv', 'hf', 'both'], required: true},
        upvotes: {type: Number, default: null},
    },
    {_id: false},
);

const LabDigestBulletSchema = new Schema<LabDigestBulletDoc>(
    {text: {type: String, required: true}, papers: {type: [Number], default: []}},
    {_id: false},
);

const LabDigestSchema = new Schema<LabDigestDoc>(
    {
        headline: {type: String, default: ''},
        bullets: {type: [LabDigestBulletSchema], default: []},
        model: {type: String, default: ''},
        writtenAt: {type: Date, required: true},
    },
    {_id: false},
);

const LabDaySchema = new Schema<LabDayDoc>({
    day: {type: String, required: true, unique: true},
    papers: {type: [LabPaperSchema], default: []},
    counts: {
        listed: {type: Number, default: 0},
        hf: {type: Number, default: 0},
        novel: {type: Number, default: 0},
        kept: {type: Number, default: 0},
    },
    digest: {type: LabDigestSchema, default: null},
    fetchedAt: {type: Date, required: true},
    createdAt: {type: Date, default: Date.now, expires: LAB_DAY_TTL_DAYS * 24 * 60 * 60},
});

const LabDay = models.LabDay || model<LabDayDoc>('LabDay', LabDaySchema);

export default LabDay;
