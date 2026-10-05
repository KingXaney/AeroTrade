import {inngest} from "@/lib/jobs/client";
import {recordJobRun} from "@/lib/jobs/job-runs";
import {JOBS, triggersOf} from "@/lib/jobs/registry";
import {eventDay, stepId} from "@/lib/jobs/steps";
import {inferText} from "@/lib/ai/infer";
import {buildDigestPrompt, buildWelcomePrompt} from "@/lib/email/prompts";
import {mailerReady} from "@/lib/email/send";
import {getAllUsersForNewsEmail} from "@/lib/email/recipients";
import {sendWelcome} from "@/lib/email/welcome";
import {fetchDigestNews, fetchDigestSections, fetchNavigatorDigest, sendUserDigest} from "@/lib/email/digest";

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

// A test send names one reader: `npm run trigger -- news <email>`, or the Inngest dashboard's
// Invoke with {"email": "..."}. Only an opted-in reader on the list can be named, and a test send
// takes no daily claim, so it neither blocks nor repeats the day's real brief.
const testRecipient = (data: unknown): string | null => {
    const email = (data as {email?: unknown} | null)?.email;
    return typeof email === 'string' && email.trim() ? email.trim().toLowerCase() : null;
};

// The daily digest, one user at a time (lib/email/digest.ts).
export const sendDailyNewsSummary = inngest.createFunction(
    { id: JOBS.newsDigest.id, triggers: triggersOf(JOBS.newsDigest) },
    async ({ event, step, runId }) => {
        // No mailer, no digest: skipped before any user's news is read or summarised by the model.
        if (!mailerReady('the daily news summary')) return {success: false, message: 'Mailer not configured: daily news summary skipped'};

        const only = testRecipient(event?.data);
        const everyone = await step.run('get-all-users', getAllUsersForNewsEmail);
        const users = only ? (everyone ?? []).filter((user) => user.email.toLowerCase() === only) : everyone;
        if (!users || users.length === 0) return {success: false, message: only ? `No opted-in reader ${only}` : 'No users found for news email'};

        // The ET day the briefs are claimed under: the event's, so a replay after midnight keeps it.
        const day = eventDay(event?.ts);

        // Per-user pipeline. Each user is its own set of steps so that one failing user doesn't
        // block the rest, and Inngest can retry just that user.
        const counts = {sent: 0, fallback: 0, already: 0};
        for (const user of users) {
            const safeId = stepId(user.id || user.email);

            try {
                const news = await step.run(`fetch-news-${safeId}`, async () => fetchDigestNews(user));

                if (!news || news.articles.length === 0) {
                    console.warn(`Skipping ${user.email}: no news returned (check Finnhub key / watchlist)`);
                    continue;
                }

                const navigator = await step.run(`fetch-navigator-${safeId}`, async () => fetchNavigatorDigest(user.id));

                // Both deterministic sections (topics, Today's lesson) in one step.
                const sections = await step.run(`fetch-sections-${safeId}`, async () => fetchDigestSections(user, runId));

                // A model that fails for good (after Inngest's retries) still leaves a brief to
                // send: the send step falls back to the articles in their outlets' own words.
                let modelText = '';
                try {
                    const response = await inferText(step, {task: 'digest', stepId: `summarize-news-${safeId}`, prompt: buildDigestPrompt(news.articles, news.symbols)});
                    modelText = response.text;
                    if (!modelText) console.warn(`Digest for ${user.email}: ${response.model} returned no text (${response.stopReason ?? 'no stop reason'}); sending the fallback`);
                } catch (error) {
                    console.error(`Digest for ${user.email}: the summary failed; sending the fallback`, error);
                }

                const result = await step.run(`send-news-email-${safeId}`, async () =>
                    sendUserDigest({user, day, test: only !== null, news, navigator, sections, modelText}));

                if (result === 'already-sent') counts.already++;
                else if (result === 'sent-fallback') counts.fallback++;
                else counts.sent++;
            } catch (e) {
                console.error('Failed to process news email for:', user.email, e);
            }
        }

        const delivered = counts.sent + counts.fallback;
        const summary = `Daily news summary sent to ${delivered}/${users.length} users`
            + (counts.fallback ? ` (${counts.fallback} without the written summary)` : '')
            + (counts.already ? `; ${counts.already} already had today's` : '')
            + (only ? ' — test send' : '');
        if (!only) await step.run('record-job-run', async () => recordJobRun(JOBS.newsDigest.id, summary));
        return {success: true, message: summary};
    }
)
