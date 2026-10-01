import {inngest} from "@/lib/jobs/client";
import {getQuote, searchStocks} from "@/lib/prices/finnhub";
import {getAggregatedNews} from "@/lib/news/aggregate";
import {BRAIN_SOURCE_CAPS, BRAIN_TOTAL_CAP} from "@/lib/news/config";
import {hashId, normalizeUrl} from "@/lib/text";
import NewsItem from "@/database/models/news-item.model";
import {getTopEntities, getTopVerifiedTickers} from "@/lib/brain/store";
import {foldExtractionsIntoBrain, type ArticleFold} from "@/lib/brain/update";
import {parseExtractionResponse, sanitizeExtraction} from "@/lib/brain/extraction";
import {buildSecondOpinionPrompt, EXTRACTION_PROMPT, SECOND_OPINION_SYSTEM} from "@/lib/brain/prompts";
import {injectJson} from "@/lib/ai/prompt-utils";
import {inferText} from "@/lib/ai/infer";
import {gatherOpinionContext, isSecondOpinionConfigured, saveSecondOpinion, SECOND_OPINION_MAX_TOKENS, SECOND_OPINION_MODEL} from "@/lib/brain/opinion";
import {EXTRACTION_BATCH_SIZE, MAX_EXTRACTION_CALLS_PER_DAY, NEW_TICKER_VERIFY_BUDGET, THEME_REUSE_LIST_SIZE, UNEXTRACTED_PICKUP_LIMIT} from "@/lib/brain/config";
import {recordJobRun} from "@/lib/jobs/job-runs";
import {JOBS, triggersOf} from "@/lib/jobs/registry";
import {getEasternDateString} from "@/lib/dates";
import {ALWAYS_ELIGIBLE_SYMBOLS} from "@/lib/navigator/config";
import BrainEntity from "@/database/models/brain-entity.model";
import {connectToDatabase} from "@/database/mongoose";

// Throttles for the free-tier LLM budget.
const EXTRACTION_THROTTLE_DELAY = '15s';
const TARGETED_SYMBOL_LIMIT = 10;

// Daily brain update: ingest news with wide caps, persist articles, batch-extract
// entities/sentiment via Gemini (schema-validated; deterministic code decides
// everything downstream), then fold the dual-timescale entity graph.
export const updateNewsBrain = inngest.createFunction(
    { id: JOBS.newsBrain.id, triggers: triggersOf(JOBS.newsBrain) },
    async ({ step, runId }) => {
        // Ingest: one general sweep + one targeted at what the brain already tracks.
        const inserted = await step.run('fetch-and-persist', async () => {
            await connectToDatabase();
            const topTickers = await getTopVerifiedTickers(TARGETED_SYMBOL_LIMIT);
            const [general, targeted] = await Promise.all([
                getAggregatedNews({mode: 'general', caps: BRAIN_SOURCE_CAPS, totalCap: BRAIN_TOTAL_CAP}),
                topTickers.length > 0
                    ? getAggregatedNews({symbols: topTickers, mode: 'personalized', caps: BRAIN_SOURCE_CAPS, totalCap: BRAIN_TOTAL_CAP})
                    : Promise.resolve([]),
            ]);

            const seen = new Set<number>();
            const docs = [];
            for (const article of [...general, ...targeted]) {
                const contentHash = hashId(normalizeUrl(article.url));
                if (seen.has(contentHash)) continue;
                seen.add(contentHash);
                docs.push({
                    contentHash,
                    headline: article.headline,
                    summary: article.fullSummary || article.summary,
                    source: article.source,
                    sourceType: article.sourceType ?? 'finance',
                    url: article.url,
                    datetime: article.datetime,
                    publishedDate: getEasternDateString(new Date(article.datetime * 1000)),
                    category: article.category,
                    related: article.related,
                });
            }
            try {
                const inserted = await NewsItem.insertMany(docs, {ordered: false});
                return inserted.length;
            } catch (error) {
                // Duplicate contentHash rows (already ingested) are expected — everything
                // else in a bulk-write error still inserted the non-duplicates.
                const bulkError = error as {code?: number; writeErrors?: unknown[]; insertedDocs?: unknown[]};
                if (bulkError.code !== 11000 && !bulkError.writeErrors) throw error;
                // Report what was actually new, not how many were offered: most of a
                // sweep is already-seen articles, so docs.length overstates ingest badly.
                return bulkError.insertedDocs?.length ?? 0;
            }
        });

        // Extraction queue: newest unextracted articles first, hard daily budget.
        const queue = await step.run('load-extraction-queue', async () => {
            await connectToDatabase();
            const limit = EXTRACTION_BATCH_SIZE * MAX_EXTRACTION_CALLS_PER_DAY + UNEXTRACTED_PICKUP_LIMIT;
            const items = await NewsItem.find({extraction: {$exists: false}})
                .sort({createdAt: -1})
                .limit(limit)
                .lean();
            // Bare names, not stored 'theme:'-prefixed keys — the extractor's sanitizer
            // prefixes them itself; passing prefixed keys would fork 'theme:theme-*' entities.
            const activeThemes = (await getTopEntities(THEME_REUSE_LIST_SIZE)).theme.map((t) => t.key.replace(/^theme:/, ''));
            return {
                articles: items.map((i) => ({
                    id: String(i._id),
                    headline: i.headline,
                    summary: i.summary,
                    related: i.related,
                    source: i.source,
                    sourceType: i.sourceType,
                })),
                activeThemes,
            };
        });

        const folds: ArticleFold[] = [];
        const extractedIds: string[] = [];
        const batchCount = Math.min(
            Math.ceil(queue.articles.length / EXTRACTION_BATCH_SIZE),
            MAX_EXTRACTION_CALLS_PER_DAY,
        );

        for (let b = 0; b < batchCount; b++) {
            if (b > 0) await step.sleep(`extract-throttle-${b}`, EXTRACTION_THROTTLE_DELAY);
            const batch = queue.articles.slice(b * EXTRACTION_BATCH_SIZE, (b + 1) * EXTRACTION_BATCH_SIZE);

            const prompt = injectJson(
                injectJson(EXTRACTION_PROMPT, '{{articles}}', batch),
                '{{activeThemes}}', queue.activeThemes,
            );
            const response = await inferText(step, {task: 'extraction', stepId: `extract-batch-${b}`, prompt});

            // Fold data must flow through the step's RETURN value: on an Inngest replay,
            // memoized steps don't re-execute their callbacks, so anything pushed into
            // function-scope arrays inside the callback would be lost.
            const applied = await step.run(`apply-batch-${b}`, async () => {
                const raw = response.text;
                if (!raw) return {folds: [] as ArticleFold[], ids: [] as string[]};

                const parsed = parseExtractionResponse(raw);
                if (!parsed) {
                    console.warn(`Extraction batch ${b} returned invalid JSON — skipped`);
                    return {folds: [] as ArticleFold[], ids: [] as string[]};
                }

                await connectToDatabase();
                const sourceTypeById = new Map(batch.map((a) => [a.id, a.sourceType]));
                const batchFolds: ArticleFold[] = [];
                const batchIds: string[] = [];
                for (const article of parsed.articles) {
                    // Consume-once: hallucinated ids AND duplicate ids in one response are skipped.
                    const sourceType = sourceTypeById.get(article.id);
                    if (sourceType === undefined) continue;
                    sourceTypeById.delete(article.id);
                    const clean = sanitizeExtraction(article, sourceType, queue.activeThemes);
                    if (clean.entities.length === 0) continue;
                    await NewsItem.updateOne(
                        {_id: clean.id},
                        {$set: {extraction: {
                            eventType: clean.eventType,
                            importance: clean.importance,
                            entities: clean.entities,
                            // The model that actually tagged this article, not a
                            // constant — otherwise the record lies after any tier
                            // change and there is no way to tell afterwards whether
                            // a better model produced a better brain.
                            model: response.model,
                            extractedAt: new Date(),
                        }}},
                    );
                    batchFolds.push({importance: clean.importance, entities: clean.entities});
                    batchIds.push(clean.id);
                }
                return {folds: batchFolds, ids: batchIds};
            });
            folds.push(...applied.folds);
            extractedIds.push(...applied.ids);
        }

        // Ticker hallucination guard: unknown tickers must resolve via Finnhub before
        // they can ever become tradable. 'related' symbols came from Finnhub already.
        const verifiedTickers = await step.run('verify-new-tickers', async () => {
            await connectToDatabase();
            const mentioned = new Set<string>();
            for (const fold of folds) {
                for (const e of fold.entities) {
                    if (e.type === 'ticker') mentioned.add(e.key);
                }
            }
            const relatedSet = new Set(
                queue.articles.flatMap((a) => a.related.split(',').map((s: string) => s.trim().toUpperCase()).filter(Boolean)),
            );
            const known = new Set(
                (await BrainEntity.find({type: 'ticker', verified: true}).lean()).map((d) => d.key),
            );

            const verified: string[] = [];
            let budget = NEW_TICKER_VERIFY_BUDGET;
            for (const ticker of mentioned) {
                if (known.has(ticker) || ALWAYS_ELIGIBLE_SYMBOLS.includes(ticker) || relatedSet.has(ticker)) {
                    verified.push(ticker);
                    continue;
                }
                if (budget <= 0) continue;   // stays unverified — never tradable, harmless
                budget--;
                try {
                    const [hits, quote] = await Promise.all([searchStocks(ticker), getQuote(ticker)]);
                    const exact = hits.some((h) => h.symbol.toUpperCase() === ticker);
                    if (exact && typeof quote.c === 'number' && quote.c > 0) verified.push(ticker);
                } catch (error) {
                    console.warn(`Ticker verification failed for ${ticker}:`, error);
                }
            }
            return verified;
        });

        const foldResult = await step.run('fold-brain', async () =>
            foldExtractionsIntoBrain(folds, new Set(verifiedTickers), runId));

        const summary = `Brain updated: ${inserted} articles ingested, ${extractedIds.length} extracted, ${foldResult.entitiesTouched} entities touched, ${foldResult.deleted} pruned`;
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

        const summary = await step.run('save-opinion', async () => {
            // Claude Opus 5 can decline via its safety classifiers ('refusal' —
            // newer than this adapter's stop_reason union, hence the widening).
            const stopReason: string | null = response.stop_reason;
            if (stopReason === 'refusal') return 'Claude declined the request';
            const text = response.content
                .map((block) => (block.type === 'text' && 'text' in block ? block.text : ''))
                .filter(Boolean)
                .join('\n')
                .trim();
            if (!text) return 'Claude returned no text';

            await saveSecondOpinion({userId, opinionMd: text, modelUsed: SECOND_OPINION_MODEL, source: 'api'});
            return `Second opinion written (${text.length} chars)`;
        });

        await step.run('record-job-run', async () => recordJobRun(JOBS.secondOpinion.id, summary));
        return {success: true, message: summary};
    },
)
