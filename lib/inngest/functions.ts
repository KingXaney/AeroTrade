import {inngest} from "@/lib/inngest/client";
import {NEWS_SUMMARY_EMAIL_PROMPT, PERSONALIZED_WELCOME_EMAIL_PROMPT} from "@/lib/inngest/prompts"
import {sendNewsSummaryEmail, sendWelcomeEmail} from "@/lib/nodemailer";
import {getAllUsersForNewsEmail} from "@/lib/actions/user.actions";
import {getWatchlistSymbolsByEmail} from "@/lib/actions/watchlist.actions";
import {getNews} from "@/lib/actions/finnhub.actions";
import {getFormattedTodayDate} from "@/lib/utils";

export const sendSignUpEmail = inngest.createFunction(
    { id: 'sign-up-email', triggers: [{ event: 'app/user.created' }] },
    async ({ event, step }) => {
        const userProfile = `
            - Country: ${event.data.country}
            - Investment goals: ${event.data.investmentGoals}
            - Risk tolerance: ${event.data.riskTolerance}
            - Preferred industry: ${event.data.preferredIndustry}
        `
        const prompt = PERSONALIZED_WELCOME_EMAIL_PROMPT.replace('{{userProfile}}', userProfile)

        const response = await step.ai.infer('generate-welcome-intro', {
            model: step.ai.models.gemini({model: 'gemini-2.5-flash-lite'}),
            body: {
                contents: [
                    {
                        role: 'user',
                        parts: [
                            {text: prompt}
                        ]
                    }]
            }
        })
        await step.run('send-welcome-email', async () => {
            const part = response.candidates?.[0]?.content?.parts?.[0];
            const introText = (part && 'text' in part ? part.text : null) ||'Thanks for joining AlgoTest. You now have the tools to track markets and make smarter moves.'

            const { data: { email, name } } = event;

            return await sendWelcomeEmail({ email, name, intro: introText });
        })

        return {
            success: true,
            message: 'Welcome email sent successfully'
        }

    }
)


// Sanitize a value for use as an Inngest step ID (only [a-zA-Z0-9_-] are safe).
const stepIdFor = (user: { id: string; email: string }) =>
    (user.id || user.email).replace(/[^a-zA-Z0-9_-]/g, '_');

export const sendDailyNewsSummary = inngest.createFunction(
    { id: 'daily-news-summary', triggers: [{ event: 'app/send.daily.news' }, { cron: '0 12 * * *' }] },
    async ({ step }) => {
        // Step #1: Get all users for news delivery
        const users = await step.run('get-all-users', getAllUsersForNewsEmail)

        if (!users || users.length === 0) return {success: false, message: 'No users found for news email'};

        // Step #2-#4: Per-user pipeline. Each user is its own set of steps so that one
        // failing user doesn't block the rest, and Inngest can retry just that user.
        let sentCount = 0;
        for (const user of users) {
            const safeId = stepIdFor(user);

            try {
                const news = await step.run(`fetch-news-${safeId}`, async () => {
                    const symbols = await getWatchlistSymbolsByEmail(user.email);
                    return await getNews(symbols.length > 0 ? symbols : undefined);
                });

                if (!news || news.length === 0) continue;

                const prompt = NEWS_SUMMARY_EMAIL_PROMPT.replace('{{newsData}}', JSON.stringify(news, null, 2));

                const response = await step.ai.infer(`summarize-news-${safeId}`, {
                    model: step.ai.models.gemini({ model: 'gemini-2.5-flash-lite' }),
                    body: {
                        contents: [{ role: 'user', parts: [{ text: prompt }] }]
                    }
                });

                const part = response.candidates?.[0]?.content?.parts?.[0];
                const newsContent = (part && 'text' in part ? part.text : null);
                if (!newsContent) continue;

                await step.run(`send-news-email-${safeId}`, async () => {
                    await sendNewsSummaryEmail({
                        email: user.email,
                        date: getFormattedTodayDate(),
                        newsContent,
                    });
                });

                sentCount++;
            } catch (e) {
                console.error('Failed to process news email for:', user.email, e);
            }
        }

        return {
            success: true,
            message: `Daily news summary sent to ${sentCount}/${users.length} users`,
        }
    }
)
