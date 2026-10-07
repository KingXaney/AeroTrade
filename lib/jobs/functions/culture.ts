import {inngest} from "@/lib/jobs/client";
import {recordJobRun} from "@/lib/jobs/job-runs";
import {JOBS, triggersOf} from "@/lib/jobs/registry";
import {chunk, eventDay, stepId} from "@/lib/jobs/steps";
import {inferText, isDailyQuotaExhausted} from "@/lib/ai/infer";
import {modelConfigured} from "@/lib/ai/models";
import {brandById, CULTURE_BRANDS} from "@/lib/culture/catalog";
import {
    BACKFILL_CHUNK,
    CULTURE_BACKFILL_YEARS,
    CULTURE_NEWS_QUERY_CHUNK,
    CULTURE_OWNER_ID,
    CULTURE_PROFILES,
    CULTURE_QUOTE_CHUNK,
    LIVE_PROFILES,
    RATIONALE_NARRATIVES,
    WIKI_DATA_START,
    WIKIPEDIA_CHUNK,
    WIKIPEDIA_DAILY_LOOKBACK_DAYS,
} from "@/lib/culture/config";
import {buildCultureItems, type OrderOutcome} from "@/lib/culture/decisions";
import {decideWeek, firstWeekTrades} from "@/lib/culture/engine";
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
import {cultureDay, cultureOrderRequest, describeWeeklyRun, type CultureEventData, type ProfileRunSummary} from "@/lib/culture/job";
import {
    claimCultureWeek,
    completeCultureRun,
    cultureWeekClaimed,
    ensureCultureAccount,
    ensureCultureBars,
    getHeldCultureSymbols,
    loadBook,
    loadScoringInputs,
    refreshReportDates,
    saveCultureDecision,
    saveCultureRationale,
    verifyUniverseChunk,
} from "@/lib/culture/picker-store";
import {buildCultureRationalePrompt} from "@/lib/culture/prompts";
import {getTickerRollup, getTopCultureEntities} from "@/lib/culture/store";
import {foldCultureIntoBrain} from "@/lib/culture/update";
import {brandsByTicker} from "@/lib/culture/catalog";
import {cultureTickers, orderUniverse, selectCultureUniverse, type CultureTicker, type VerifiedSymbol} from "@/lib/culture/universe";
import {addCalendarDays, calendarDaysBetween} from "@/lib/dates";
import {PRICE_CHUNK_SIZE} from "@/lib/prices/config";
import {ensureRateBars, quoteMissed} from "@/lib/strategies/job";
import {executeOrder, FUNDING_SELL_FAILED} from "@/lib/trading/orders";
import type {CultureFold} from "@/lib/culture/types";

// The culture brain's three jobs (lib/culture/ingest.ts, lib/culture/update.ts, lib/culture/job.ts,
// lib/culture/picker-store.ts): the daily update, the weekly pickers, and the one-off Wikipedia
// backfill the backtest needs.

// The same pacing as the news brain's extraction on the free tier.
const EXTRACTION_THROTTLE_DELAY = '15s';
// One search a second, Google News etiquette (the topics' sweep does the same).
const NEWS_QUERY_GAP_MS = 1000;
// Finnhub's free tier allows about sixty calls a minute: a pause between quote bursts past
// two chunks, the snapshots job's own pacing.
const QUOTE_THROTTLE_DELAY = '30s';
const QUOTE_RETRY_DELAY = '15s';

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
        // Without a model key every item folds by alias (the next step); a call with no key is
        // a 403 the Inngest server would retry for minutes.
        const modelOff = !modelConfigured();
        const batches = modelOff ? [] : cultureBatches(mentions.queue);
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
            modelOff,
        });
        await step.run('record-job-run', async () => recordJobRun(JOBS.cultureBrain.id, summary));
        return {success: true, message: summary};
    },
);

// Weekly: the two pickers, Spike and Quiet, over one scored universe. The accounts are
// ensured, the week's quotes checked once (and kept), the earnings dates refreshed, the bars
// topped up, the inputs loaded once; then each picker plans, claims its week, fills through
// the path users trade on, saves its decisions and writes its one rationale. Outside the
// session (and on `dryRun`) a run previews and claims nothing; a week already claimed is
// skipped — the Tuesday cron exists for holiday Mondays and finds every claim taken otherwise.
export const runCultureWeekly = inngest.createFunction(
    { id: JOBS.cultureWeekly.id, triggers: triggersOf(JOBS.cultureWeekly), concurrency: [{ limit: 1 }] },
    async ({ event, step }) => {
        const nowMs = typeof event.ts === 'number' ? event.ts : Date.now();
        const day = cultureDay((event.data ?? {}) as CultureEventData, new Date(nowMs));

        const states = [];
        for (const profile of LIVE_PROFILES) {
            states.push(await step.run(`ensure-account-${profile}`, async () => ensureCultureAccount(profile, day.today)));
        }
        const claimed = await step.run('peek-week', async () => {
            const out: Record<string, boolean> = {};
            for (const profile of LIVE_PROFILES) out[profile] = await cultureWeekClaimed(profile, day.weekKey);
            return out;
        });
        if (!day.dryRun && LIVE_PROFILES.every((profile) => claimed[profile])) {
            const message = `Culture pickers: every picker already ran in the week of ${day.weekKey}`;
            await step.run('record-job-run', async () => recordJobRun(JOBS.cultureWeekly.id, message));
            return {success: true, message};
        }

        // The universe: the catalog's listed owners, bounded, quoted once this week.
        const held = await step.run('held-symbols', getHeldCultureSymbols);
        const attention = await step.run('order-universe', async () => {
            const rollup = await getTickerRollup();
            return Object.fromEntries(rollup.map((row) => [row.ticker, row.weightSlowSum]));
        });
        const allTickers = cultureTickers();
        const ordered = orderUniverse(allTickers, new Map(Object.entries(attention)));
        const verified: VerifiedSymbol[] = [];
        const quoteChunks = chunk(ordered.map((t) => t.symbol), CULTURE_QUOTE_CHUNK);
        let fetchedLast = 0;
        for (let i = 0; i < quoteChunks.length; i++) {
            const symbols = quoteChunks[i];
            // A pause only after a chunk that asked Finnhub: a replay, the holiday retry and a
            // preview find every row stored and run straight through.
            if (fetchedLast > 0) await step.sleep(`quote-throttle-${i}`, QUOTE_THROTTLE_DELAY);
            const out = await step.run(`verify-universe-${i}`, async () => verifyUniverseChunk(symbols, day.weekKey));
            verified.push(...out.rows);
            fetchedLast = out.fetched;
        }
        const universe = selectCultureUniverse(verified, held);
        const tickerBySymbol = new Map(allTickers.map((t) => [t.symbol, t]));
        // A held name the catalog no longer lists is scored on price alone, for its exit.
        const tickers: CultureTicker[] = universe.symbols.map((symbol) =>
            tickerBySymbol.get(symbol) ?? {symbol, listing: 'us', company: symbol, brands: []});

        const earnings = await step.run('earnings-calendar', async () => refreshReportDates(universe.symbols, day.today));

        const barChunks = chunk(universe.symbols, PRICE_CHUNK_SIZE);
        for (let i = 0; i < barChunks.length; i++) {
            const symbols = barChunks[i];
            await step.run(`ensure-bars-${i}`, async () => ensureCultureBars(symbols));
        }
        await step.run('ensure-rate', ensureRateBars);

        const scoring = await step.run('load-inputs', async () => loadScoringInputs(tickers, universe.targetable, day.asOf));
        const narratives = await step.run('load-narratives', async () =>
            (await getTopCultureEntities(RATIONALE_NARRATIVES)).map((e) => ({brand: e.displayName, owner: e.ticker, attention: Number(e.weightSlow.toFixed(1)), sentiment: Number(e.sentimentSlow.toFixed(2)), thesis: e.thesisSince !== null})));
        const brandsBySymbol = new Map([...brandsByTicker()].map(([ticker, brands]) => [ticker, brands.map((b) => ({id: b.id, name: b.name}))]));
        const targetable = new Set(universe.targetable);

        const summaries: ProfileRunSummary[] = [];
        // Each picker's items, for the rationales written once every decision is saved.
        const decided: {profile: (typeof LIVE_PROFILES)[number]; items: ReturnType<typeof buildCultureItems>}[] = [];
        for (const profile of LIVE_PROFILES) {
            const state = states.find((s) => s.profile === profile);
            if (!state) continue;
            if (!day.dryRun && claimed[profile]) {
                summaries.push({profile, kind: 'skipped', orders: 0, filled: 0});
                continue;
            }

            const plan = await step.run(`plan-${profile}`, async () => {
                const loaded = await loadBook(state.accountId, universe.priceBySymbol, universe.targetable, nowMs);
                if (!loaded) return null;
                const decision = decideWeek({inputs: scoring.inputs, feeds: scoring.feeds, profile, book: loaded.book, targetable, maxTrades: firstWeekTrades(loaded.book.positions)});
                return {book: loaded.book, decision};
            });
            if (!plan) {
                summaries.push({profile, kind: 'skipped', orders: 0, filled: 0, note: 'account missing'});
                continue;
            }

            const live = day.dryRun ? false : await step.run(`claim-${profile}`, async () => claimCultureWeek(profile, day.weekKey));
            const outcomes: OrderOutcome[] = [];
            let sellFailed = false;
            for (const order of plan.decision.orders) {
                if (!live) {
                    outcomes.push({success: false});
                    continue;
                }
                if (sellFailed && order.side === 'buy') {
                    // The plan funded buys with sell proceeds; without them a buy could drain cash through the floor.
                    outcomes.push({success: false, message: FUNDING_SELL_FAILED});
                    continue;
                }
                const request = cultureOrderRequest(profile, state.accountId, order, day.weekKey, plan.book.totalValue);
                let result = await step.run(stepId(`execute-${profile}-${order.side}-${order.symbol}`), async () => executeOrder(CULTURE_OWNER_ID, request));
                if (quoteMissed(result)) {
                    await step.sleep(stepId(`quote-retry-${profile}-${order.symbol}`), QUOTE_RETRY_DELAY);
                    result = await step.run(stepId(`execute-again-${profile}-${order.side}-${order.symbol}`), async () => executeOrder(CULTURE_OWNER_ID, request));
                }
                if (order.side === 'sell' && !result.success) sellFailed = true;
                outcomes.push(result);
            }

            const items = buildCultureItems({
                orders: plan.decision.orders,
                outcomes,
                positions: plan.book.positions,
                totalValue: plan.book.totalValue,
                targets: plan.decision.targets,
                scored: plan.decision.scored,
                brandsBySymbol,
            });
            const filled = outcomes.filter((o) => o.success).length;
            const kind = live ? 'executed' as const : 'preview' as const;
            const summary = live ? `${filled}/${plan.decision.orders.length} order(s) filled` : `${plan.decision.orders.length} order(s) planned (preview)`;
            await step.run(`save-decision-${profile}`, async () => saveCultureDecision({
                date: day.today,
                profile,
                weekKey: day.weekKey,
                kind,
                items,
                universe: {tickers: ordered.length, quoted: universe.targetable.length, unquoted: universe.unquoted.map((u) => ({symbol: u.symbol, reason: u.reason}))},
                feeds: scoring.feeds,
                summary,
            }));
            if (live) {
                await step.run(`complete-run-${profile}`, async () => completeCultureRun({
                    profile,
                    date: day.today,
                    outcomes: plan.decision.orders.map((order, i) => ({symbol: order.symbol, side: order.side, executed: outcomes[i]?.success ?? false, message: outcomes[i]?.message})),
                }));
            }

            summaries.push({profile, kind, orders: plan.decision.orders.length, filled});
            decided.push({profile, items});
        }

        // Each picker's one model call, after every decision is on record: a note restating the
        // reasons above, never a decision. Skipped without a model key; a failure costs nothing.
        if (modelConfigured()) {
            for (const {profile, items} of decided) {
                try {
                    const prompt = buildCultureRationalePrompt(CULTURE_PROFILES[profile].label, items, narratives);
                    const response = await inferText(step, {task: 'rationale', stepId: `rationale-${profile}`, prompt});
                    await step.run(`save-rationale-${profile}`, async () => saveCultureRationale(profile, day.today, response.text));
                } catch (error) {
                    console.error(`Culture rationale for ${profile} failed:`, error);
                }
            }
        }

        const message = describeWeeklyRun({
            mode: day.mode,
            universe: {tickers: ordered.length, quoted: universe.targetable.length},
            feeds: scoring.feeds,
            earnings,
            profiles: summaries,
        });
        await step.run('record-job-run', async () => recordJobRun(JOBS.cultureWeekly.id, message));
        return {success: true, message};
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
