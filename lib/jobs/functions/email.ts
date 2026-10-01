import {inngest} from "@/lib/jobs/client";
import {buildWelcomePrompt, NEWS_SUMMARY_EMAIL_PROMPT} from "@/lib/email/prompts";
import {getFormattedTodayDate, mailerReady, sendNewsSummaryEmail, sendWelcomeEmail} from "@/lib/email/send";
import {getAllUsersForNewsEmail} from "@/lib/email/recipients";
import {getWatchlistSymbolsByEmail} from "@/lib/stocks/watchlist-store";
import {getAggregatedNews} from "@/lib/news/aggregate";
import {sanitizeDigestHtml, sanitizeWelcomeIntroHtml} from "@/lib/news/sanitize";
import {FEED_DIGEST_CAP} from "@/lib/news/config";
import {pickDigestArticles} from "@/lib/news/feed";
import {getNewsFeedForPrefs, getNewsFeedPrefs} from "@/lib/news/feed-store";
import SuggestionSet from "@/database/models/suggestion-set.model";
import {getActiveTheses} from "@/lib/brain/store";
import {injectJson} from "@/lib/ai/prompt-utils";
import {inferText} from "@/lib/ai/infer";
import {recordJobRun} from "@/lib/jobs/job-runs";
import {JOBS, triggersOf} from "@/lib/jobs/registry";
import {connectToDatabase} from "@/database/mongoose";
import {getHeldSymbolsByUserId} from "@/lib/trading/accounts";
import {getTopicsDigestData} from "@/lib/topics/store";
import {buildTopicsSectionHtml} from "@/lib/email/sections/topics";
import {lessonSectionFor} from "@/lib/email/sections/lesson";
import {readLearnFacts} from "@/lib/learn/facts-store";
import {readLessonForDigest} from "@/lib/learn/lesson-store";
import {stepId} from "@/lib/jobs/steps";

// Absolute links in email need the deployment's public URL (the same one better-auth uses).
const APP_URL = (process.env.BETTER_AUTH_URL ?? '').replace(/\/$/, '') || 'http://localhost:3000';

export const sendSignUpEmail = inngest.createFunction(
    { id: JOBS.signUpEmail.id, triggers: triggersOf(JOBS.signUpEmail) },
    async ({ event, step }) => {
        // No mailer, no email to write: skipped before the model call, with mailerReady's one line.
        if (!mailerReady('the welcome email')) return {success: false, message: 'Mailer not configured: welcome email skipped'};

        const {country, investmentGoals, riskTolerance, preferredIndustry} = event.data;
        const prompt = buildWelcomePrompt({country, investmentGoals, riskTolerance, preferredIndustry})

        const response = await inferText(step, {task: 'welcome', stepId: 'generate-welcome-intro', prompt})
        await step.run('send-welcome-email', async () => {
            const rawIntro = response.text;
            // The model wrote this from the user's own signup answers and it lands in
            // the template unescaped — sanitize before it becomes email.
            const introText = sanitizeWelcomeIntroHtml(rawIntro || '')
                || sanitizeWelcomeIntroHtml('Thanks for joining AeroTrade. You now have the tools to track markets and make smarter moves.');

            const { data: { email, name } } = event;

            return await sendWelcomeEmail({ email, name, intro: introText });
        })

        return {
            success: true,
            message: 'Welcome email sent successfully'
        }

    }
)


// Bound the personalized symbol universe so per-user news fan-out stays cheap.
const PERSONALIZED_SYMBOL_CAP = 10;

export const sendDailyNewsSummary = inngest.createFunction(
    { id: JOBS.newsDigest.id, triggers: triggersOf(JOBS.newsDigest) },
    async ({ step, runId }) => {
        // No mailer, no digest: skipped before any user's news is read or summarised by the model.
        if (!mailerReady('the daily news summary')) return {success: false, message: 'Mailer not configured: daily news summary skipped'};

        // Step #1: Get all users for news delivery
        const users = await step.run('get-all-users', getAllUsersForNewsEmail)

        if (!users || users.length === 0) return {success: false, message: 'No users found for news email'};

        // Step #2-#4: Per-user pipeline. Each user is its own set of steps so that one
        // failing user doesn't block the rest, and Inngest can retry just that user.
        let sentCount = 0;
        for (const user of users) {
            const safeId = stepId(user.id || user.email);

            try {
                const news = await step.run(`fetch-news-${safeId}`, async () => {
                    // Holdings-aware: union of the watchlist and every symbol held across the
                    // user's strategy accounts. Read in both digest modes now — the user's own
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
                });

                if (!news || news.length === 0) {
                    console.warn(`Skipping ${user.email}: no news returned (check Finnhub key / watchlist)`);
                    continue;
                }

                // Latest weekly AI Navigator decisions (if enrolled) + active theses for the
                // email's experiment section. Failure here must never block the digest.
                const navigatorData = await step.run(`fetch-navigator-${safeId}`, async () => {
                    try {
                        await connectToDatabase();
                        // Previews are analysis-only — the email reports actual AI activity.
                        const set = await SuggestionSet.findOne({userId: user.id, kind: {$ne: 'preview'}}).sort({date: -1}).lean();
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
                });

                // Two deterministic sections (no LLM), in one step: followed topics (off per user),
                // every string escaped and links allow-listed to the articles it lists; and Today's
                // lesson — a first from the learner's own account (or a followed strategy's
                // rebalance) dated exactly yesterday (this noon run would otherwise mail a morning
                // fill or a 09:35 rebalance twice), else the day's glossary concept, read once per
                // distinct keyword set in this run (lessonSectionFor, lib/email/sections/lesson.ts).
                // Both ride under the same emailNotifications opt-out as the rest, and a failure
                // in either only drops that section.
                const {topicsSection, lessonSection} = await step.run(`fetch-sections-${safeId}`, async () => {
                    const topics = async (): Promise<string> => {
                        if (!user.topicsInDigest) return '';
                        try {
                            const data = await getTopicsDigestData(user.id);
                            if (data.length === 0) return '';
                            const manageUrl = `${APP_URL}/topics`;
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
                            return await lessonSectionFor({facts: await readLearnFacts(user.id), loadTerm: () => readLessonForDigest(user.id, runId), appUrl: APP_URL});
                        } catch (error) {
                            console.error('Lesson email section failed:', error);
                            return '';
                        }
                    };
                    const [topicsHtml, lessonHtml] = await Promise.all([topics(), lesson()]);
                    return {topicsSection: topicsHtml, lessonSection: lessonHtml};
                });

                // fullSummary is for the news brain — JSON.stringify drops undefined values,
                // keeping the email prompt lean.
                const promptNews = news.map((article) => ({...article, fullSummary: undefined}));
                const prompt = injectJson(
                    injectJson(NEWS_SUMMARY_EMAIL_PROMPT, '{{newsData}}', promptNews, 2),
                    '{{navigatorData}}', navigatorData, 2,
                );

                const response = await inferText(step, {task: 'digest', stepId: `summarize-news-${safeId}`, prompt});

                const newsContent = response.text;
                if (!newsContent) {
                    console.warn(`Skipping ${user.email}: ${response.model} returned no summary text (${response.stopReason ?? 'no stop reason'})`);
                    continue;
                }

                await step.run(`send-news-email-${safeId}`, async () => {
                    await sendNewsSummaryEmail({
                        email: user.email,
                        date: getFormattedTodayDate(),
                        // LLM output built from untrusted news text — links are only allowed
                        // to point at URLs from the actual article set.
                        newsContent: sanitizeDigestHtml(newsContent, news.map((n) => n.url)),
                        topicsSection,
                        lessonSection,
                    });
                });

                sentCount++;
            } catch (e) {
                console.error('Failed to process news email for:', user.email, e);
            }
        }

        const summary = `Daily news summary sent to ${sentCount}/${users.length} users`;
        await step.run('record-job-run', async () => recordJobRun(JOBS.newsDigest.id, summary));
        return {success: true, message: summary}
    }
)
