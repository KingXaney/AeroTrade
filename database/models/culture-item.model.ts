import {Document, model, models, Schema} from "mongoose";

// A post, a video or an article the culture brain read: the evidence behind a brand's
// attention, and what the model labelled about it. Its own collection, never NewsItem: the news
// brain's extraction queue reads every unextracted NewsItem, and these are not its articles.
export interface CultureItemMention {
    key: string;                  // the catalog id
    sentiment: number;            // -1..1, toward the brand
    relevance: number;            // 0..1
}

export interface CultureItemExtraction {
    model: string;                // the model that labelled it, or 'alias-match' for the fallback
    extractedAt: Date;
    importance: number;           // 0..1
    signal: string;               // adoption | hype | backlash | substitution | drop | price | fading | other
    entities: CultureItemMention[];
    newBrands: string[];          // brand names the model met that the catalog lacks
}

export interface CultureItemDoc extends Document {
    contentHash: number;          // hashId(normalizeUrl(url)) — dedupe key
    source: string;               // 'reddit' | 'news' | 'youtube' | 'social'
    sourceName: string;           // 'r/GenZ', an outlet, a channel
    title: string;
    body: string;                 // capped at CULTURE_ITEM_BODY_CHARS
    url: string;
    datetime: number;             // unix seconds as reported by the source
    publishedDate: string;        // 'YYYY-MM-DD' ET
    day: string;                  // the ET day it was ingested
    score?: number;               // Reddit score, YouTube views
    mentions: string[];           // deterministic alias matches, catalog ids
    extraction?: CultureItemExtraction;
    createdAt: Date;
}

const CultureItemMentionSchema = new Schema<CultureItemMention>(
    {
        key: {type: String, required: true},
        sentiment: {type: Number, required: true, min: -1, max: 1},
        relevance: {type: Number, required: true, min: 0, max: 1},
    },
    {_id: false},
);

const CultureItemExtractionSchema = new Schema<CultureItemExtraction>(
    {
        model: {type: String, required: true},
        extractedAt: {type: Date, required: true},
        importance: {type: Number, required: true, min: 0, max: 1},
        signal: {type: String, required: true},
        entities: {type: [CultureItemMentionSchema], default: []},
        newBrands: {type: [String], default: []},
    },
    {_id: false},
);

const CULTURE_ITEM_RETENTION_SECONDS = 60 * 60 * 24 * 90;

const CultureItemSchema = new Schema<CultureItemDoc>({
    contentHash: {type: Number, required: true},
    source: {type: String, required: true},
    sourceName: {type: String, default: ''},
    title: {type: String, required: true},
    body: {type: String, default: ''},
    url: {type: String, required: true},
    datetime: {type: Number, required: true},
    publishedDate: {type: String, required: true},
    day: {type: String, required: true},
    score: {type: Number},
    mentions: {type: [String], default: []},
    extraction: {type: CultureItemExtractionSchema},
    createdAt: {type: Date, default: Date.now},
});

CultureItemSchema.index({contentHash: 1}, {unique: true});
CultureItemSchema.index({day: 1});
CultureItemSchema.index({mentions: 1, publishedDate: -1});
CultureItemSchema.index({'extraction.entities.key': 1, publishedDate: -1});
// Unbounded ingest, bounded retention: ninety days, like the news brain's articles.
CultureItemSchema.index({createdAt: 1}, {expireAfterSeconds: CULTURE_ITEM_RETENTION_SECONDS});

const CultureItem = models?.CultureItem || model<CultureItemDoc>('CultureItem', CultureItemSchema);

export default CultureItem;
