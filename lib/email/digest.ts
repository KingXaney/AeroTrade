// The daily news digest, one user at a time (NOT a 'use server' module). The daily-news-summary
// job (lib/jobs/functions/email.ts) runs these as each user's steps: their news, their
// Navigator decisions, the two deterministic sections, the model's summary, the send.

import {connectToDatabase} from "@/database/mongoose";
import SuggestionSet from "@/database/models/suggestion-set.model";
import {appUrl, getFormattedTodayDate, sendNewsSummaryEmail} from "@/lib/email/send";
import {NEWS_SUMMARY_EMAIL_PROMPT} from "@/lib/email/prompts";
import {buildTopicsSectionHtml} from "@/lib/email/sections/topics";
import {lessonSectionFor} from "@/lib/email/sections/lesson";
import {injectJson} from "@/lib/ai/prompt-utils";
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

export const fetchDigestNews = async (user: DigestUser): Promise<MarketNewsArticle[]> => {
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
    return pickDigestArticles(aggregated, feedArticles);
};

type NavigatorDigest = {
    date: string;
    items: {action: string; symbol: string; targetWeightPct: number; executed: boolean; reasons: string[]}[];
    rationale: string | null;
    activeTheses: string[];
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
                reasons: i.reasons,
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
            const section = buildTopicsSectionHtml(data, manageUrl);
            const allowed = [manageUrl, ...data.flatMap((t) => t.articles.map((a) => a.url))];
            return sanitizeDigestHtml(section, allowed);
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

export const buildDigestPrompt = (news: readonly MarketNewsArticle[], navigatorData: NavigatorDigest | null): string => {
    // fullSummary is for the news brain — JSON.stringify drops undefined values,
    // keeping the email prompt lean.
    const promptNews = news.map((article) => ({...article, fullSummary: undefined}));
    return injectJson(
        injectJson(NEWS_SUMMARY_EMAIL_PROMPT, '{{newsData}}', promptNews, 2),
        '{{navigatorData}}', navigatorData, 2,
    );
};

export const sendDigest = async (
    email: string,
    news: readonly MarketNewsArticle[],
    newsContent: string,
    {topicsSection, lessonSection}: DigestSections,
): Promise<void> => {
    await sendNewsSummaryEmail({
        email,
        date: getFormattedTodayDate(),
        // LLM output built from untrusted news text — links are only allowed
        // to point at URLs from the actual article set.
        newsContent: sanitizeDigestHtml(newsContent, news.map((n) => n.url)),
        topicsSection,
        lessonSection,
    });
};
