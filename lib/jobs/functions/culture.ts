import {inngest} from "@/lib/jobs/client";
import {recordJobRun} from "@/lib/jobs/job-runs";
import {JOBS, triggersOf} from "@/lib/jobs/registry";
import {chunk, eventDay} from "@/lib/jobs/steps";
import {inferText, isDailyQuotaExhausted} from "@/lib/ai/infer";
import {brandById, CULTURE_BRANDS} from "@/lib/culture/catalog";
import {
    BACKFILL_CHUNK,
    CULTURE_BACKFILL_YEARS,
    CULTURE_NEWS_QUERY_CHUNK,
    WIKI_DATA_START,
    WIKIPEDIA_CHUNK,
    WIKIPEDIA_DAILY_LOOKBACK_DAYS,
} from "@/lib/culture/config";
import {
    applyCultureBatch,
    buildCultureBatchPrompt,
    computeAttentionFolds,
    cultureBatches,
    describeCultureRun,
    foldUnextractedItems,
    ingestAppStore,
    ingestNews,
    ingestReddit,
    ingestSocial,
    ingestWikipedia,
    ingestYouTube,
    newsQueryChunks,
    recordNewBrands,
    socialAdapterId,
    countMentionsAndQueue,
} from "@/lib/culture/ingest";
import {foldCultureIntoBrain} from "@/lib/culture/update";
import {addCalendarDays, calendarDaysBetween} from "@/lib/dates";
import type {CultureFold} from "@/lib/culture/types";

// The culture brain's two jobs (lib/culture/ingest.ts, lib/culture/update.ts): the daily
// update, and the one-off Wikipedia backfill the backtest needs.

// The same pacing as the news brain's extraction on the free tier.
const EXTRACTION_THROTTLE_DELAY = '15s';
// One search a second, Google News etiquette (the topics' sweep does the same).
const NEWS_QUERY_GAP_MS = 1000;

// Daily: every source into the series and the items, the model over a bounded batch, the
// alias matcher over the rest, the day's attention surprises, one fold.
//
// `concurrency 1`: two overlapping runs would fold the same day's attention twice under
// different run ids. The day and the clock come from the event, never the wall (a replay may
// cross midnight ET).
export const updateCultureBrain = inngest.createFunction(
    { id: JOBS.cultureBrain.id, triggers: triggersOf(JOBS.cultureBrain), concurrency: [{ limit: 1 }] },
    async ({ event, step, runId }) => {
        const today = eventDay(event.ts);
        // The last day Wikipedia has complete views for.
        const asOf = addCalendarDays(today, -1);
        const nowMs = typeof event.ts === 'number' ? event.ts : Date.now();
        const dayIndex = calendarDaysBetween(WIKI_DATA_START, today);
        const brandIds = CULTURE_BRANDS.map((brand) => brand.id);

        const wikipedia = {written: 0, missing: 0, failed: 0};
        const wikiChunks = chunk(brandIds, WIKIPEDIA_CHUNK);
        for (let i = 0; i < wikiChunks.length; i++) {
            const ids = wikiChunks[i];
            const out = await step.run(`wikipedia-${i}`, async () =>
                ingestWikipedia(ids, {from: addCalendarDays(today, -WIKIPEDIA_DAILY_LOOKBACK_DAYS), to: asOf}));
            wikipedia.written += out.written;
            wikipedia.missing += out.missing.length;
            wikipedia.failed += out.failed.length;
        }

        const appstore = await step.run('appstore', async () => ingestAppStore(today));
        const youtube = await step.run('youtube', async () => ingestYouTube(today, dayIndex));
        const reddit = await step.run('reddit', async () => ingestReddit(today));

        const news = {inserted: 0, ok: true, skipped: false};
        const queryChunks = newsQueryChunks(CULTURE_NEWS_QUERY_CHUNK);
        for (let i = 0; i < queryChunks.length; i++) {
            const queries = queryChunks[i];
            const out = await step.run(`news-${i}`, async () => ingestNews(queries, today, NEWS_QUERY_GAP_MS));
            news.inserted += out.inserted;
            news.ok = news.ok && out.ok;
            news.skipped = out.skipped;
        }

        const social = socialAdapterId()
            ? await step.run('social', async () => ingestSocial(today))
            : {inserted: 0, rows: 0, adapter: null};

        const mentions = await step.run('count-mentions', async () => countMentionsAndQueue(today));

        // Fold data flows through each step's RETURN value: a replayed step does not run its
        // callback again, so anything pushed into these arrays inside one would be lost.
        const folds: CultureFold[] = [];
        const extractedIds: string[] = [];
        const newBrands: {name: string; itemHash: number}[] = [];
        let quotaHit = false;
        const batches = cultureBatches(mentions.queue);
        for (let b = 0; b < batches.length; b++) {
            if (b > 0) await step.sleep(`culture-extract-throttle-${b}`, EXTRACTION_THROTTLE_DELAY);
            const batch = batches[b];
            try {
                const {prompt} = buildCultureBatchPrompt(batch);
                const response = await inferText(step, {task: 'extraction', stepId: `culture-extract-${b}`, prompt});
                const applied = await step.run(`apply-culture-batch-${b}`, async () =>
                    applyCultureBatch({index: b, batch, text: response.text, model: response.model, now: new Date(nowMs)}));
                folds.push(...applied.folds);
                extractedIds.push(...applied.ids);
                newBrands.push(...applied.newBrands);
            } catch (error) {
                // One batch's failure never costs the run its other sources; the model's daily
                // quota is a wall, so the rest of the queue folds by alias instead.
                console.error(`Culture extraction batch ${b} failed:`, error);
                if (isDailyQuotaExhausted(error)) {
                    quotaHit = true;
                    break;
                }
            }
        }

        const fallback = await step.run('fallback-folds', async () => foldUnextractedItems(today, new Date(nowMs)));
        const attention = await step.run('attention-folds', async () => computeAttentionFolds(asOf));
        const folded = await step.run('fold-culture', async () =>
            foldCultureIntoBrain([...folds, ...fallback.folds, ...attention.folds], {today, nowMs, runId}));
        const suggestions = await step.run('record-suggestions', async () => recordNewBrands(newBrands, new Date(nowMs)));

        const summary = describeCultureRun({
            wikipedia,
            appstore,
            youtube: {inserted: youtube.inserted, skipped: youtube.skipped, ok: youtube.ok},
            reddit: {inserted: reddit.inserted, skipped: reddit.skipped},
            news,
            social: {inserted: social.inserted, adapter: social.adapter},
            items: mentions.counts.items,
            matched: mentions.counts.matched,
            extracted: extractedIds.length,
            aliasFolded: fallback.stamped,
            attentionFolded: folded.attentionFolded,
            entitiesTouched: folded.entitiesTouched,
            deleted: folded.deleted,
            suggestions,
            quotaHit,
        });
        await step.run('record-job-run', async () => recordJobRun(JOBS.cultureBrain.id, summary));
        return {success: true, message: summary};
    },
);

// On demand: every brand's Wikipedia views back to the backtest's horizon, one request per
// article title for the whole range, a few brands per step. `event.data.brands` narrows it to
// a list of catalog ids (a new entry, a corrected title); upserts, so a rerun is harmless.
export const backfillCultureWikipedia = inngest.createFunction(
    { id: JOBS.cultureBackfill.id, triggers: triggersOf(JOBS.cultureBackfill), concurrency: [{ limit: 1 }] },
    async ({ event, step }) => {
        const today = eventDay(event.ts);
        const requested: unknown = event.data?.brands;
        const ids = (Array.isArray(requested) && requested.length > 0 ? requested.map(String) : CULTURE_BRANDS.map((brand) => brand.id))
            .filter((id) => brandById(id) !== undefined);
        const horizon = addCalendarDays(today, -Math.round(CULTURE_BACKFILL_YEARS * 365));
        const window = {from: horizon < WIKI_DATA_START ? WIKI_DATA_START : horizon, to: addCalendarDays(today, -1)};

        let written = 0;
        let missing = 0;
        let failed = 0;
        const slices = chunk(ids, BACKFILL_CHUNK);
        for (let i = 0; i < slices.length; i++) {
            const slice = slices[i];
            const out = await step.run(`backfill-${i}`, async () => ingestWikipedia(slice, window));
            written += out.written;
            missing += out.missing.length;
            failed += out.failed.length;
        }

        const summary = `Culture backfill: ${ids.length} brands from ${window.from} to ${window.to}, ${written} monthly documents written`
            + (missing ? `, ${missing} titles missing` : '')
            + (failed ? `, ${failed} titles failed (rerun to heal)` : '');
        await step.run('record-job-run', async () => recordJobRun(JOBS.cultureBackfill.id, summary));
        return {success: failed === 0, message: summary};
    },
);
