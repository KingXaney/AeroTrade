// The daily news digest, one user at a time (NOT a 'use server' module). The daily-news-summary
// job (lib/jobs/functions/email.ts) runs these as each user's steps: their news, their
// Navigator decisions, the two deterministic sections, the model's summary, the send.

import {connectToDatabase} from "@/database/mongoose";
import SuggestionSet from "@/database/models/suggestion-set.model";
import {appUrl, sendNewsSummaryEmail} from "@/lib/email/send";
import {buildTopicsSectionHtml, topicsSectionLinks} from "@/lib/email/sections/topics";
import {lessonSectionFor} from "@/lib/email/sections/lesson";
import {claimDigestDay, releaseDigestDay} from "@/lib/email/digest-store";
import {fallbackDigestSummary, parseDigestSummary} from "@/lib/email/digest-summary";
import {buildDigestView, type NavigatorDigest} from "@/lib/email/digest-view";
import {renderDigestHtml, renderDigestText} from "@/lib/email/digest-render";
import {getWatchlistSymbolsByEmail} from "@/lib/stocks/watchlist-store";
import {getHeldSymbolsByUserId} from "@/lib/trading/accounts";
import {getAggregatedNews} from "@/lib/news/aggregate";
import {sanitizeDigestHtml} from "@/lib/news/sanitize";
import {FEED_DIGEST_CAP} from "@/lib/news/config";
import {pickDigestArticles} from "@/lib/news/feed";
import {getNewsFeedForPrefs, getNewsFeedPrefs} from "@/lib/news/feed-store";
import {getActiveTheses} from "@/lib/brain/store";
import {getTopicsDigestData} from "@/lib/topics/store";
import {readLearnFacts} from "@/lib/learn/facts-store";
import {readLessonForDigest} from "@/lib/learn/lesson-store";
import type {SuggestionItem} from '@/lib/navigator/types';
import type {MarketNewsArticle} from '@/lib/news/types';

// Bound the personalized symbol universe so per-user news fan-out stays cheap.
const PERSONALIZED_SYMBOL_CAP = 10;

// One recipient as lib/email/recipients.ts lists them.
type DigestUser = {
    id: string;
    email: string;
    name: string;
    digestMode: 'personalized' | 'general';
    topicsInDigest: boolean;
};

// The reader's articles, and the symbols they hold or watch (the brief's "Your stocks").
export type DigestNews = {articles: MarketNewsArticle[]; symbols: string[]};

export const fetchDigestNews = async (user: DigestUser): Promise<DigestNews> => {
    // Holdings-aware: union of the watchlist and every symbol held across the
    // user's paper accounts. Read in both digest modes now — the user's own
    // feed may ask for watchlist company news whatever the mode.
    const [watchlist, held] = await Promise.all([
        getWatchlistSymbolsByEmail(user.email),
        getHeldSymbolsByUserId(user.id),
    ]);
    const symbols = Array.from(new Set(
        [...watchlist, ...held].map((s) => s.toUpperCase()),
    )).slice(0, PERSONALIZED_SYMBOL_CAP);
    const marketPool = user.digestMode === 'general' || symbols.length === 0
        ? getAggregatedNews({mode: 'general'})
        : getAggregatedNews({symbols, mode: 'personalized'});
    // The user's news feed (Google News top stories unless they changed it) joins
    // the market pool as a bounded tail; the prompt gives it its own section. A
    // feed failure must never block the digest.
    const feed = getNewsFeedPrefs(user.id)
        .then((prefs) => getNewsFeedForPrefs(prefs, {limit: FEED_DIGEST_CAP, watchlistSymbols: symbols}))
        .then((result) => result.articles)
        .catch((error: unknown) => {
            console.error(`News feed unavailable for ${user.email}:`, error);
            return [] as MarketNewsArticle[];
        });
    const [aggregated, feedArticles] = await Promise.all([marketPool, feed]);
    return {articles: pickDigestArticles(aggregated, feedArticles), symbols};
};

// Latest weekly AI Navigator decisions (if enrolled) + active theses for the
// email's experiment section. Failure here must never block the digest.
export const fetchNavigatorDigest = async (userId: string): Promise<NavigatorDigest | null> => {
    try {
        await connectToDatabase();
        // Previews are analysis-only — the email reports actual AI activity.
        const set = await SuggestionSet.findOne({userId, kind: {$ne: 'preview'}}).sort({date: -1}).lean();
        if (!set) return null;
        const theses = await getActiveTheses();
        return {
            date: set.date,
            items: set.items.map((i: SuggestionItem) => ({
                action: i.action,
                symbol: i.symbol,
                targetWeightPct: Math.round(i.targetWeight * 100),
                executed: i.executed,
            })),
            rationale: set.rationaleMd ?? null,
            activeTheses: theses.slice(0, 5).map((t) => t.displayName),
        };
    } catch (error) {
        console.error('Navigator email data failed:', error);
        return null;
    }
};

type DigestSections = {topicsSection: string; lessonSection: string};

// Two deterministic sections (no LLM), read together: followed topics (off per user), every
// string escaped and links allow-listed to the articles it lists; and Today's lesson — a first
// from the learner's own account (or a followed strategy's rebalance) dated exactly yesterday
// (this noon run would otherwise mail a morning fill or a 09:35 rebalance twice), else the
// day's glossary concept, read once per distinct keyword set in this run (lessonSectionFor,
// lib/email/sections/lesson.ts). Both ride under the same emailNotifications opt-out as the
// rest, and a failure in either only drops that section.
export const fetchDigestSections = async (user: DigestUser, runId: string): Promise<DigestSections> => {
    const topics = async (): Promise<string> => {
        if (!user.topicsInDigest) return '';
        try {
            const data = await getTopicsDigestData(user.id);
            if (data.length === 0) return '';
            const manageUrl = `${appUrl()}/topics`;
            return sanitizeDigestHtml(buildTopicsSectionHtml(data, manageUrl), topicsSectionLinks(data, manageUrl));
        } catch (error) {
            console.error('Topics email section failed:', error);
            return '';
        }
    };
    const lesson = async (): Promise<string> => {
        try {
            return await lessonSectionFor({facts: await readLearnFacts(user.id), loadTerm: () => readLessonForDigest(user.id, runId), appUrl: appUrl()});
        } catch (error) {
            console.error('Lesson email section failed:', error);
            return '';
        }
    };
    const [topicsHtml, lessonHtml] = await Promise.all([topics(), lesson()]);
    return {topicsSection: topicsHtml, lessonSection: lessonHtml};
};

export type DigestSendInput = {
    user: Pick<DigestUser, 'id' | 'email'>;
    day: string;                         // the ET day, 'YYYY-MM-DD'
    test: boolean;                       // a test send to one reader takes no claim
    news: DigestNews;
    navigator: NavigatorDigest | null;
    sections: DigestSections;
    modelText: string;                   // '' when the model call failed
};

export type DigestSendResult = 'sent' | 'sent-fallback' | 'already-sent';

// The brief as mailed: what the model wrote, or the articles in their outlets' own words.
export const composeDigest = ({day, news, navigator, sections, modelText}: Omit<DigestSendInput, 'user' | 'test'>) => {
    const summary = parseDigestSummary(modelText, news.articles, news.symbols) ?? fallbackDigestSummary(news.articles, news.symbols);
    const view = buildDigestView({
        day, appUrl: appUrl(), summary, readerSymbols: news.symbols, navigator,
        topicsHtml: sections.topicsSection, lessonHtml: sections.lessonSection,
    });
    return {subject: view.subject, html: renderDigestHtml(view), text: renderDigestText(view), fallback: summary.fallback};
};

// One reader's send step: claim the day (a second run that day finds it taken), compose, send;
// a send that throws gives the day back so the step's retry can mail it.
export const sendUserDigest = async (input: DigestSendInput): Promise<DigestSendResult> => {
    const {user, day, test} = input;
    if (!test && !(await claimDigestDay(user.id, day))) return 'already-sent';
    try {
        const composed = composeDigest(input);
        await sendNewsSummaryEmail({email: user.email, subject: composed.subject, html: composed.html, text: composed.text});
        return composed.fallback ? 'sent-fallback' : 'sent';
    } catch (error) {
        if (!test) await releaseDigestDay(user.id, day);
        throw error;
    }
};
