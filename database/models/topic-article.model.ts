import {Document, model, models, Schema} from "mongoose";

// Matched articles are stored per keyword set, not per user: everyone following
// the same set shares one fetch and one row, and the data expires on its own TTL
// independently of the brain's NewsItem retention.
export interface TopicArticleDoc extends Document {
    keywordSetHash: number;
    contentHash: number;     // hashId(normalizeUrl(url)) — same convention as NewsItem
    headline: string;
    summary: string;
    url: string;
    source: string;
    sourceType: NewsSourceType;
    datetime: number;        // unix seconds
    publishedDate: string;   // 'YYYY-MM-DD' in America/New_York
    score: number;
    matchedTerms: string[];
    createdAt: Date;
}

const TOPIC_ARTICLE_TTL_SECONDS = 30 * 24 * 60 * 60;

const TopicArticleSchema = new Schema<TopicArticleDoc>({
    keywordSetHash: {type: Number, required: true},
    contentHash: {type: Number, required: true},
    headline: {type: String, required: true},
    summary: {type: String, default: ''},
    url: {type: String, required: true},
    source: {type: String, default: ''},
    sourceType: {type: String, required: true},
    datetime: {type: Number, required: true},
    publishedDate: {type: String, required: true},
    score: {type: Number, default: 0},
    matchedTerms: {type: [String], default: []},
    createdAt: {type: Date, default: Date.now},
});

TopicArticleSchema.index({keywordSetHash: 1, contentHash: 1}, {unique: true});
TopicArticleSchema.index({keywordSetHash: 1, datetime: -1});
TopicArticleSchema.index({keywordSetHash: 1, publishedDate: 1});
TopicArticleSchema.index({createdAt: 1}, {expireAfterSeconds: TOPIC_ARTICLE_TTL_SECONDS});

const TopicArticle = models?.TopicArticle || model<TopicArticleDoc>('TopicArticle', TopicArticleSchema);

export default TopicArticle;
