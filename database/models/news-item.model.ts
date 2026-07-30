import {Document, model, models, Schema} from "mongoose";

export interface NewsEntityMention {
    key: string;                  // 'NVDA' | 'sector:energy' | 'theme:ai-capex'
    type: 'ticker' | 'sector' | 'theme';
    sentiment: number;            // -1..1, toward the entity
    relevance: number;            // 0..1
}

export interface NewsExtraction {
    eventType: 'earnings' | 'guidance' | 'mna' | 'product' | 'macro' | 'regulatory' | 'analyst' | 'legal' | 'other';
    importance: number;           // 0..1
    entities: NewsEntityMention[];
    model: string;
    extractedAt: Date;
}

export interface NewsItemDoc extends Document {
    contentHash: number;          // hashId(normalizeUrl(url)) — dedupe key
    headline: string;
    summary: string;              // full pre-truncation text (capped at FULL_SUMMARY_MAX_CHARS)
    source: string;
    sourceType: string;
    url: string;
    datetime: number;             // unix seconds as reported by the source
    publishedDate: string;        // 'YYYY-MM-DD' ET
    category: string;
    related: string;
    extraction?: NewsExtraction;
    createdAt: Date;
}

const NewsEntityMentionSchema = new Schema<NewsEntityMention>(
    {
        key: {type: String, required: true},
        type: {type: String, required: true, enum: ['ticker', 'sector', 'theme']},
        sentiment: {type: Number, required: true, min: -1, max: 1},
        relevance: {type: Number, required: true, min: 0, max: 1},
    },
    {_id: false},
);

const NewsExtractionSchema = new Schema<NewsExtraction>(
    {
        eventType: {type: String, required: true, enum: ['earnings', 'guidance', 'mna', 'product', 'macro', 'regulatory', 'analyst', 'legal', 'other']},
        importance: {type: Number, required: true, min: 0, max: 1},
        entities: {type: [NewsEntityMentionSchema], default: []},
        model: {type: String, required: true},
        extractedAt: {type: Date, required: true},
    },
    {_id: false},
);

const NEWS_RETENTION_SECONDS = 60 * 60 * 24 * 90;

const NewsItemSchema = new Schema<NewsItemDoc>({
    contentHash: {type: Number, required: true},
    headline: {type: String, required: true},
    summary: {type: String, required: true},
    source: {type: String, default: ''},
    sourceType: {type: String, default: 'finance'},
    url: {type: String, required: true},
    datetime: {type: Number, required: true},
    publishedDate: {type: String, required: true},
    category: {type: String, default: ''},
    related: {type: String, default: ''},
    extraction: {type: NewsExtractionSchema},
    createdAt: {type: Date, default: Date.now},
});

NewsItemSchema.index({contentHash: 1}, {unique: true});
NewsItemSchema.index({publishedDate: -1});
NewsItemSchema.index({'extraction.entities.key': 1, publishedDate: -1});
// The only unbounded-ingest collection — TTL keeps it to ~90 days of articles.
NewsItemSchema.index({createdAt: 1}, {expireAfterSeconds: NEWS_RETENTION_SECONDS});

const NewsItem = models?.NewsItem || model<NewsItemDoc>('NewsItem', NewsItemSchema);

export default NewsItem;
