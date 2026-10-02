import {inngest} from "@/lib/jobs/client";
import {inferText} from "@/lib/ai/infer";
import {recordJobRun} from "@/lib/jobs/job-runs";
import {JOBS, triggersOf} from "@/lib/jobs/registry";
import {eventDay} from "@/lib/jobs/steps";
import {getBriefingCandidates} from "@/lib/brain/store";
import {saveBriefingFromText} from "@/lib/news/briefing-store";
import {buildMarketBriefingPrompt} from "@/lib/news/prompts";

// The news page's one job (lib/news/briefing.ts, lib/news/briefing-store.ts).

// Below this many tagged articles there is no day to brief: the brain has not run, or no model
// key is set (then nothing was extracted, and this job has no model to call either).
const MIN_BRIEFING_ARTICLES = 3;
const BRIEFING_ARTICLES = 30;

// Every morning after the brain update: one model call over the day's most important tagged
// articles, written as one global briefing for every reader. It reads the brain's articles and
// never a user's topics or accounts (invariant 3 holds in both directions).
export const generateMarketBriefing = inngest.createFunction(
    { id: JOBS.marketBriefing.id, triggers: triggersOf(JOBS.marketBriefing) },
    async ({ event, step }) => {
        const today = eventDay(event.ts);
        const articles = await step.run('load-candidates', async () => getBriefingCandidates(today, BRIEFING_ARTICLES));

        if (articles.length < MIN_BRIEFING_ARTICLES) {
            const message = `Skipped — ${articles.length} tagged articles for ${today}`;
            await step.run('record-job-run', async () => recordJobRun(JOBS.marketBriefing.id, message));
            return {success: false, message};
        }

        const response = await inferText(step, {task: 'marketBriefing', stepId: `briefing-${today}`, prompt: buildMarketBriefingPrompt(articles)});
        const saved = await step.run('save-briefing', async () => saveBriefingFromText(today, response.text, articles, response.model));

        const summary = saved
            ? `Wrote the ${today} briefing from ${articles.length} articles`
            : `The ${today} briefing did not parse — yesterday's stays`;
        await step.run('record-job-run', async () => recordJobRun(JOBS.marketBriefing.id, summary));
        return {success: saved, message: summary};
    },
);
