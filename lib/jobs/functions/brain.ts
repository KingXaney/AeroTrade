import {inngest} from "@/lib/jobs/client";
import {recordJobRun} from "@/lib/jobs/job-runs";
import {JOBS, triggersOf} from "@/lib/jobs/registry";
import {inferText, isDailyQuotaExhausted} from "@/lib/ai/infer";
import {
    applyExtractionBatch,
    buildExtractionPrompt,
    extractionBatches,
    fetchAndPersistNews,
    loadExtractionQueue,
    verifyNewTickers,
} from "@/lib/brain/ingest";
import {foldExtractionsIntoBrain, type ArticleFold} from "@/lib/brain/update";
import {buildSecondOpinionPrompt, SECOND_OPINION_SYSTEM} from "@/lib/brain/prompts";
import {
    gatherOpinionContext,
    isSecondOpinionConfigured,
    saveOpinionResponse,
    SECOND_OPINION_MAX_TOKENS,
    SECOND_OPINION_MODEL,
} from "@/lib/brain/opinion";

// Throttle for the free-tier LLM budget.
const EXTRACTION_THROTTLE_DELAY = '15s';

// Daily brain update: ingest, extract, verify, fold the dual-timescale entity graph
// (lib/brain/ingest.ts, lib/brain/update.ts).
export const updateNewsBrain = inngest.createFunction(
    { id: JOBS.newsBrain.id, triggers: triggersOf(JOBS.newsBrain) },
    async ({ step, runId }) => {
        const inserted = await step.run('fetch-and-persist', fetchAndPersistNews);

        const queue = await step.run('load-extraction-queue', loadExtractionQueue);

        const folds: ArticleFold[] = [];
        const extractedIds: string[] = [];
        let readEmpty = 0;
        const batches = extractionBatches(queue.articles);

        // A batch that fails (the model's daily quota, an outage that outlasts the retries) must
        // not cost the run the batches already applied: `apply-batch` has stamped their articles
        // as read, so the next run never queues them again, and their folds exist only here until
        // `fold-brain`. So a failed batch ends the loop, never the function, and what was
        // applied is folded. A batch that was never applied carries no stamp and is queued again
        // tomorrow. The stamp says where the run stopped.
        let stoppedAt: number | null = null;
        for (let b = 0; b < batches.length; b++) {
            if (b > 0) await step.sleep(`extract-throttle-${b}`, EXTRACTION_THROTTLE_DELAY);
            const batch = batches[b];

            try {
                const prompt = buildExtractionPrompt(batch, queue.activeThemes);
                const response = await inferText(step, {task: 'extraction', stepId: `extract-batch-${b}`, prompt});

                // Fold data must flow through the step's RETURN value: on an Inngest replay,
                // memoized steps don't re-execute their callbacks, so anything pushed into
                // function-scope arrays inside the callback would be lost.
                const applied = await step.run(`apply-batch-${b}`, async () => applyExtractionBatch({
                    index: b,
                    batch,
                    text: response.text,
                    model: response.model,
                    activeThemes: queue.activeThemes,
                }));
                folds.push(...applied.folds);
                extractedIds.push(...applied.ids);
                readEmpty += applied.read;
            } catch (error) {
                console.error(`Brain extraction batch ${b} of ${batches.length} failed${isDailyQuotaExhausted(error) ? ' (the model\'s daily quota)' : ''}:`, error);
                stoppedAt = b;
                break;
            }
        }

        const verifiedTickers = await step.run('verify-new-tickers', async () => verifyNewTickers(folds, queue.articles));

        const foldResult = await step.run('fold-brain', async () =>
            foldExtractionsIntoBrain(folds, new Set(verifiedTickers), runId));

        // A replayed fold step from before the repeat check has no count: say nothing then.
        const repeats = foldResult.repeats ?? 0;
        const summary = `Brain updated: ${inserted} articles ingested, ${extractedIds.length} extracted${readEmpty > 0 ? `, ${readEmpty} read with nothing to tag` : ''}${repeats > 0 ? `, ${repeats} repeated ${repeats === 1 ? 'mention' : 'mentions'} counted as attention only` : ''}, ${foldResult.entitiesTouched} entities touched, ${foldResult.deleted} pruned${stoppedAt !== null ? `; stopped at batch ${stoppedAt + 1} of ${batches.length}, the rest are read tomorrow` : ''}`;
        await step.run('record-job-run', async () => recordJobRun(JOBS.newsBrain.id, summary));
        return {success: true, message: summary};
    },
)

// On-demand "second opinion": Claude (a stronger model than the extraction
// pipeline's) reads the same brain digest, theses, decisions and headlines and
// argues with them. It never trades — the deterministic rails stay in charge;
// this is a critique layer for the human reading the /brain page.
export const generateSecondOpinion = inngest.createFunction(
    {
        id: JOBS.secondOpinion.id,
        triggers: triggersOf(JOBS.secondOpinion),
        // The action already claims a slot before enqueueing, but that guard lives
        // outside the queue: a replayed or hand-crafted event would never touch it.
        // These bound the spend at the only place every run must pass through —
        // one at a time per user, and a hard ceiling per hour for everyone.
        concurrency: [{ limit: 1, key: 'event.data.userId' }],
        rateLimit: { limit: 12, period: '1h' },
    },
    async ({ event, step }) => {
        // Opinions are stored per requester, so a run without one has nowhere to land.
        const userId = String(event.data?.userId ?? '');
        if (!userId) {
            const message = 'Skipped — no requesting user on the event';
            await step.run('record-job-run', async () => recordJobRun(JOBS.secondOpinion.id, message));
            return {success: false, message};
        }
        if (!isSecondOpinionConfigured()) {
            const message = 'Skipped — ANTHROPIC_API_KEY is not set';
            await step.run('record-job-run', async () => recordJobRun(JOBS.secondOpinion.id, message));
            return {success: false, message};
        }

        const context = await step.run('gather-context', gatherOpinionContext);

        if (!Array.isArray(context.narratives) || context.narratives.length === 0) {
            const message = 'Skipped — the brain is empty, run a brain update first';
            await step.run('record-job-run', async () => recordJobRun(JOBS.secondOpinion.id, message));
            return {success: false, message};
        }

        const prompt = buildSecondOpinionPrompt(context);

        const response = await step.ai.infer('claude-opinion', {
            model: step.ai.models.anthropic({
                model: SECOND_OPINION_MODEL,
                defaultParameters: {max_tokens: SECOND_OPINION_MAX_TOKENS},
            }),
            body: {
                system: SECOND_OPINION_SYSTEM,
                messages: [{role: 'user', content: prompt}],
            },
        });

        const summary = await step.run('save-opinion', async () => saveOpinionResponse(userId, response));

        await step.run('record-job-run', async () => recordJobRun(JOBS.secondOpinion.id, summary));
        return {success: true, message: summary};
    },
)
