import {Document, model, models, Schema} from "mongoose";

// The morning's market briefing: one document per ET day, for every reader — it is written from
// the news brain's global articles, never from a user's topics or accounts. Each bullet and
// story carries a snapshot of the articles it cites (headline, outlet, link, time), so the page
// is one read, a link never depends on a NewsItem that has since expired, and nothing the
// model wrote is ever a link: it cites by index and the links are the app's own.
export interface BriefingSourceDoc {
    headline: string;
    source: string;
    url: string;
    datetime: number;        // unix seconds
}

export interface BriefingPointDoc {
    text: string;
    sources: BriefingSourceDoc[];
}

export interface BriefingStoryDoc {
    title: string;
    summary: string;
    eventType: string;       // the extractor's label of the first cited article; '' when none
    tickers: string[];       // tickers the cited articles name, for "touches your holdings"
    sources: BriefingSourceDoc[];
}

export interface MarketBriefingDoc extends Document {
    date: string;            // 'YYYY-MM-DD' in America/New_York
    headline: string;
    bullets: BriefingPointDoc[];
    stories: BriefingStoryDoc[];
    writtenBy: string;       // the model that wrote it
    generatedAt: Date;
    createdAt: Date;
}

const BRIEFING_TTL_SECONDS = 30 * 24 * 60 * 60;

const BriefingSourceSchema = new Schema<BriefingSourceDoc>(
    {
        headline: {type: String, required: true},
        source: {type: String, default: ''},
        url: {type: String, required: true},
        datetime: {type: Number, required: true},
    },
    {_id: false},
);

const BriefingPointSchema = new Schema<BriefingPointDoc>(
    {
        text: {type: String, required: true},
        sources: {type: [BriefingSourceSchema], default: []},
    },
    {_id: false},
);

const BriefingStorySchema = new Schema<BriefingStoryDoc>(
    {
        title: {type: String, required: true},
        summary: {type: String, required: true},
        eventType: {type: String, default: ''},
        tickers: {type: [String], default: []},
        sources: {type: [BriefingSourceSchema], default: []},
    },
    {_id: false},
);

const MarketBriefingSchema = new Schema<MarketBriefingDoc>({
    date: {type: String, required: true},
    headline: {type: String, default: ''},
    bullets: {type: [BriefingPointSchema], default: []},
    stories: {type: [BriefingStorySchema], default: []},
    writtenBy: {type: String, default: ''},
    generatedAt: {type: Date, required: true},
    createdAt: {type: Date, default: Date.now},
});

MarketBriefingSchema.index({date: 1}, {unique: true});
MarketBriefingSchema.index({createdAt: 1}, {expireAfterSeconds: BRIEFING_TTL_SECONDS});

const MarketBriefing = models?.MarketBriefing || model<MarketBriefingDoc>('MarketBriefing', MarketBriefingSchema);

export default MarketBriefing;
