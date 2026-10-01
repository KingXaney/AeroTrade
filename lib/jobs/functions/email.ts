import {inngest} from "@/lib/jobs/client";
import {recordJobRun} from "@/lib/jobs/job-runs";
import {JOBS, triggersOf} from "@/lib/jobs/registry";
import {stepId} from "@/lib/jobs/steps";
import {inferText} from "@/lib/ai/infer";
import {buildWelcomePrompt} from "@/lib/email/prompts";
import {mailerReady} from "@/lib/email/send";
import {getAllUsersForNewsEmail} from "@/lib/email/recipients";
import {sendWelcome} from "@/lib/email/welcome";
import {buildDigestPrompt, fetchDigestNews, fetchDigestSections, fetchNavigatorDigest, sendDigest} from "@/lib/email/digest";

// The welcome email: the model writes a short intro from the user's sign-up answers
// (lib/email/prompts.ts), lib/email/welcome.ts sanitizes and sends it.
export const sendSignUpEmail = inngest.createFunction(
    { id: JOBS.signUpEmail.id, triggers: triggersOf(JOBS.signUpEmail) },
    async ({ event, step }) => {
        // No mailer, no email to write: skipped before the model call, with mailerReady's one line.
        if (!mailerReady('the welcome email')) return {success: false, message: 'Mailer not configured: welcome email skipped'};

        const {country, investmentGoals, riskTolerance, preferredIndustry} = event.data;
        const prompt = buildWelcomePrompt({country, investmentGoals, riskTolerance, preferredIndustry})

        const response = await inferText(step, {task: 'welcome', stepId: 'generate-welcome-intro', prompt})
        const { data: { email, name } } = event;
        await step.run('send-welcome-email', async () => sendWelcome({email, name}, response.text))

        return {
            success: true,
            message: 'Welcome email sent successfully'
        }

    }
)

// The daily digest, one user at a time (lib/email/digest.ts).
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
                const news = await step.run(`fetch-news-${safeId}`, async () => fetchDigestNews(user));

                if (!news || news.length === 0) {
                    console.warn(`Skipping ${user.email}: no news returned (check Finnhub key / watchlist)`);
                    continue;
                }

                const navigatorData = await step.run(`fetch-navigator-${safeId}`, async () => fetchNavigatorDigest(user.id));

                // Both deterministic sections (topics, Today's lesson) in one step.
                const sections = await step.run(`fetch-sections-${safeId}`, async () => fetchDigestSections(user, runId));

                const prompt = buildDigestPrompt(news, navigatorData);

                const response = await inferText(step, {task: 'digest', stepId: `summarize-news-${safeId}`, prompt});

                const newsContent = response.text;
                if (!newsContent) {
                    console.warn(`Skipping ${user.email}: ${response.model} returned no summary text (${response.stopReason ?? 'no stop reason'})`);
                    continue;
                }

                await step.run(`send-news-email-${safeId}`, async () => sendDigest(user.email, news, newsContent, sections));

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
