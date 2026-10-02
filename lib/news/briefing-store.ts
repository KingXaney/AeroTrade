// Server-only: the market briefing's write (the morning job) and its one read (the news page and
// Home). The parsing and its limits are the pure lib/news/briefing.ts.

import {cache} from "react";
import {connectToDatabase} from "@/database/mongoose";
import MarketBriefing, {type MarketBriefingDoc} from "@/database/models/market-briefing.model";
import {addCalendarDays, getEasternDateString} from "@/lib/dates";
import {parseBriefingText, type BriefingArticle, type MarketBriefingView} from "@/lib/news/briefing";

// The job's save step: the model's text parsed against the articles it was shown, and upserted
// under the run's day — a re-run replaces the day's briefing, never adds a second. False when
// the text did not parse into a briefing, in which case yesterday's stays the latest.
export const saveBriefingFromText = async (date: string, text: string, articles: readonly BriefingArticle[], model: string): Promise<boolean> => {
    const content = parseBriefingText(text, articles);
    if (!content) return false;
    await connectToDatabase();
    await MarketBriefing.updateOne(
        {date},
        {$set: {...content, writtenBy: model, generatedAt: new Date()}, $setOnInsert: {createdAt: new Date()}},
        {upsert: true},
    );
    return true;
};

type LeanBriefing = Pick<MarketBriefingDoc, 'date' | 'headline' | 'bullets' | 'stories' | 'generatedAt'>;

// Today's briefing, or yesterday's before this morning's job has run; null when neither exists
// (no key, a new deployment). Older than that is not news. A failed read reads as none: a page
// never breaks on the briefing.
export const getLatestMarketBriefing = cache(async (): Promise<MarketBriefingView | null> => {
    try {
        await connectToDatabase();
        const today = getEasternDateString();
        const doc = await MarketBriefing.findOne({date: {$gte: addCalendarDays(today, -1), $lte: today}})
            .sort({date: -1})
            .select('date headline bullets stories generatedAt')
            .lean<LeanBriefing>();
        if (!doc || doc.bullets.length === 0) return null;
        return {
            date: doc.date,
            headline: doc.headline,
            bullets: doc.bullets.map((b) => ({text: b.text, sources: b.sources.map((s) => ({headline: s.headline, source: s.source, url: s.url, datetime: s.datetime}))})),
            stories: doc.stories.map((s) => ({
                title: s.title,
                summary: s.summary,
                eventType: s.eventType,
                tickers: [...s.tickers],
                sources: s.sources.map((x) => ({headline: x.headline, source: x.source, url: x.url, datetime: x.datetime})),
            })),
            generatedAt: new Date(doc.generatedAt).getTime(),
        };
    } catch (error) {
        console.error('Market briefing unavailable:', error);
        return null;
    }
});
