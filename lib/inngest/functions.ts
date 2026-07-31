import {inngest} from "@/lib/inngest/client";
import {NEWS_SUMMARY_EMAIL_PROMPT, PERSONALIZED_WELCOME_EMAIL_PROMPT} from "@/lib/inngest/prompts"
import {sendNewsSummaryEmail, sendWelcomeEmail} from "@/lib/nodemailer";
import {getAllUsersForNewsEmail} from "@/lib/actions/user.actions";
import {getWatchlistSymbolsByEmail} from "@/lib/actions/watchlist.actions";
import {getQuote} from "@/lib/actions/finnhub.actions";
import {getAggregatedNews, normalizeUrl} from "@/lib/news/aggregate";
import {sanitizeDigestHtml} from "@/lib/news/sanitize";
import {BRAIN_SOURCE_CAPS, BRAIN_TOTAL_CAP, hashId} from "@/lib/news/config";
import SuggestionSet, {GLOBAL_SUGGESTIONS_USER} from "@/database/models/suggestion-set.model";
import NewsItem from "@/database/models/news-item.model";
import AiNavigator from "@/database/models/ai-navigator.model";
import {getActiveTheses, getBrainDigestData, getTopEntities, getTopVerifiedTickers} from "@/lib/brain/queries";
import {foldExtractionsIntoBrain, type ArticleFold} from "@/lib/brain/update";
import {parseExtractionResponse, sanitizeExtraction} from "@/lib/brain/extraction";
import {buildSecondOpinionPrompt, EXTRACTION_PROMPT, injectJson, RATIONALE_PROMPT, SECOND_OPINION_SYSTEM} from "@/lib/brain/prompts";
import {
    gatherOpinionContext,
    isSecondOpinionConfigured,
    saveSecondOpinion,
    SECOND_OPINION_MAX_TOKENS,
    SECOND_OPINION_MODEL,
} from "@/lib/brain/opinion";
import {
    EXTRACTION_BATCH_SIZE,
    EXTRACTION_MODEL,
    MAX_EXTRACTION_CALLS_PER_DAY,
    NEW_TICKER_VERIFY_BUDGET,
    THEME_REUSE_LIST_SIZE,
    UNEXTRACTED_PICKUP_LIMIT,
} from "@/lib/brain/config";
import {recordJobRun} from "@/lib/inngest/job-runs";
import {ensureBars} from "@/lib/prices/store";
import {buildTargets} from "@/lib/navigator/allocator";
import {ALWAYS_ELIGIBLE_SYMBOLS, MAX_POSITIONS, MIN_CASH_WEIGHT} from "@/lib/navigator/config";
import {
    buildHoldItems,
    buildNavigatorUniverse,
    buildOrderItem,
    computeNavigatorScores,
    planAccountOrders,
} from "@/lib/navigator/service";
import {executeOrder} from "@/lib/trading/orders";
import BrainEntity from "@/database/models/brain-entity.model";
import {searchStocks} from "@/lib/actions/finnhub.actions";
import {getEasternDateString, getEasternWeekKey, getFormattedTodayDate} from "@/lib/utils";
import {connectToDatabase} from "@/database/mongoose";
import PaperAccount from "@/database/models/paper-account.model";
import AccountSnapshot from "@/database/models/account-snapshot.model";
import BenchmarkSnapshot from "@/database/models/benchmark-snapshot.model";
import {BENCHMARK_SYMBOL} from "@/lib/constants";
import {buildPriceMap, computePortfolio, getHeldSymbolsByUserId, getOwnedAccount, type PriceInfo} from "@/lib/trading/account";

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

// Bound the personalized symbol universe so per-user news fan-out stays cheap.
const PERSONALIZED_SYMBOL_CAP = 10;

// Finnhub's free tier allows ~60 calls/min; quotes are fetched in chunks with a
// pause between them once the symbol universe is big enough to matter.
const QUOTE_CHUNK_SIZE = 25;
const QUOTE_THROTTLE_THRESHOLD = 50;
const QUOTE_THROTTLE_DELAY = '30s';

// Daily close snapshots: every strategy account's value + the SPY benchmark,
// keyed on the Eastern-time date. Runs after market close on weekdays; the
// {accountId, date} unique index makes re-runs (event replays, manual triggers)
// harmless upserts.
export const recordDailySnapshots = inngest.createFunction(
    { id: 'daily-account-snapshots', triggers: [{ event: 'app/record.daily.snapshots' }, { cron: 'TZ=America/New_York 10 16 * * 1-5' }] },
    async ({ step }) => {
        await step.run('snapshot-benchmark', async () => {
            const quote = await getQuote(BENCHMARK_SYMBOL);
            if (typeof quote.c !== 'number' || !(quote.c > 0)) {
                console.warn(`Benchmark snapshot skipped: no quote for ${BENCHMARK_SYMBOL}`);
                return {recorded: false};
            }
            await connectToDatabase();
            await BenchmarkSnapshot.updateOne(
                {symbol: BENCHMARK_SYMBOL, date: getEasternDateString()},
                {$set: {close: quote.c}},
                {upsert: true},
            );
            return {recorded: true};
        });

        const accounts = await step.run('load-accounts', async () => {
            await connectToDatabase();
            const docs = await PaperAccount.find({}).lean();
            return docs.map((a) => ({
                id: String(a._id),
                userId: a.userId,
                cash: a.cash,
                startingBalance: a.startingBalance,
                // Memoized so write-snapshots can detect a reset that landed mid-run
                // (reset always re-anchors inceptionAt).
                inceptionAt: new Date(a.inceptionAt || a.createdAt).getTime(),
                positions: (a.positions || []).map((p: PaperPosition) => ({
                    symbol: p.symbol,
                    company: p.company,
                    quantity: p.quantity,
                    avgCost: p.avgCost,
                })),
            }));
        });
        if (accounts.length === 0) {
            return {success: true, message: 'No accounts to snapshot'};
        }

        // One quote per unique symbol across ALL accounts, chunked to respect rate limits.
        const uniqueSymbols = Array.from(new Set(
            accounts.flatMap((a) => a.positions.map((p: PaperPosition) => p.symbol.toUpperCase())),
        )).filter(Boolean);
        const chunks: string[][] = [];
        for (let i = 0; i < uniqueSymbols.length; i += QUOTE_CHUNK_SIZE) {
            chunks.push(uniqueSymbols.slice(i, i + QUOTE_CHUNK_SIZE));
        }
        const throttle = uniqueSymbols.length > QUOTE_THROTTLE_THRESHOLD;

        const priceEntries: Array<[string, PriceInfo]> = [];
        for (let i = 0; i < chunks.length; i++) {
            if (throttle && i > 0) {
                await step.sleep(`quote-throttle-${i}`, QUOTE_THROTTLE_DELAY);
            }
            const entries = await step.run(`fetch-prices-${i}`, async () =>
                Array.from((await buildPriceMap(chunks[i])).entries()));
            priceEntries.push(...entries);
        }

        const written = await step.run('write-snapshots', async () => {
            await connectToDatabase();
            const priceMap = new Map(priceEntries);
            const date = getEasternDateString();

            // Re-read inception times: an account reset between load-accounts and here
            // re-anchors inceptionAt and seeds a fresh day-0 snapshot that the memoized
            // (pre-reset) state must not overwrite.
            const fresh = await PaperAccount.find(
                {_id: {$in: accounts.map((a) => a.id)}},
                {inceptionAt: 1, createdAt: 1},
            ).lean();
            const freshInception = new Map(fresh.map((f) => [
                String(f._id),
                new Date(f.inceptionAt || f.createdAt).getTime(),
            ]));

            let count = 0;
            for (const a of accounts) {
                const inception = freshInception.get(a.id);
                if (inception === undefined || inception > a.inceptionAt) {
                    console.warn(`Snapshot skipped for account ${a.id}: deleted or reset mid-run`);
                    continue;
                }
                // A snapshot is a permanent historical record — never persist a valuation
                // built on missing quotes (Finnhub outage / delisted symbol). A gap in the
                // series is harmless; a corrupt point fakes drawdowns forever.
                const pricesOk = a.positions.every((p: PaperPosition) => {
                    const info = priceMap.get(p.symbol.toUpperCase());
                    return typeof info?.price === 'number' && info.price > 0;
                });
                if (!pricesOk) {
                    console.warn(`Snapshot skipped for account ${a.id}: missing quotes`);
                    continue;
                }
                const summary = computePortfolio(
                    {cash: a.cash, startingBalance: a.startingBalance, positions: a.positions},
                    priceMap,
                );
                await AccountSnapshot.updateOne(
                    {accountId: a.id, date},
                    {
                        $set: {
                            userId: a.userId,
                            totalValue: summary.totalValue,
                            cash: summary.cash,
                            holdingsValue: summary.holdingsValue,
                            startingBalance: summary.startingBalance,
                        },
                    },
                    {upsert: true},
                );
                count++;
            }
            return count;
        });

        const summary = `Snapshotted ${written} account(s) + ${BENCHMARK_SYMBOL}`;
        await step.run('record-job-run', async () => recordJobRun('daily-account-snapshots', summary));
        return {success: true, message: summary};
    },
)

// Throttles for the free-tier LLM budget.
const EXTRACTION_THROTTLE_DELAY = '15s';
const RATIONALE_THROTTLE_DELAY = '5s';
const TARGETED_SYMBOL_LIMIT = 10;

// Daily brain update: ingest news with wide caps, persist articles, batch-extract
// entities/sentiment via Gemini (schema-validated; deterministic code decides
// everything downstream), then fold the dual-timescale entity graph.
export const updateNewsBrain = inngest.createFunction(
    { id: 'daily-brain-update', triggers: [{ event: 'app/update.news.brain' }, { cron: 'TZ=America/New_York 30 7 * * *' }] },
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
                await NewsItem.insertMany(docs, {ordered: false});
            } catch (error) {
                // Duplicate contentHash rows (already ingested) are expected — everything
                // else in a bulk-write error still inserted the non-duplicates.
                const bulkError = error as {code?: number; writeErrors?: unknown[]};
                if (bulkError.code !== 11000 && !bulkError.writeErrors) throw error;
            }
            return docs.length;
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
            const response = await step.ai.infer(`extract-batch-${b}`, {
                model: step.ai.models.gemini({ model: EXTRACTION_MODEL }),
                body: {
                    contents: [{ role: 'user', parts: [{ text: prompt }] }],
                    generationConfig: { responseMimeType: 'application/json' },
                },
            });

            // Fold data must flow through the step's RETURN value: on an Inngest replay,
            // memoized steps don't re-execute their callbacks, so anything pushed into
            // function-scope arrays inside the callback would be lost.
            const applied = await step.run(`apply-batch-${b}`, async () => {
                const part = response.candidates?.[0]?.content?.parts?.[0];
                const raw = (part && 'text' in part ? part.text : null);
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
                            model: EXTRACTION_MODEL,
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
        await step.run('record-job-run', async () => recordJobRun('daily-brain-update', summary));
        return {success: true, message: summary};
    },
)

// Weekly navigator: long-horizon scoring over the brain's SLOW layer + multi-month
// momentum, then per-enrolled-user allocation under strict holding rails. All
// decisions are deterministic; the single LLM call per user only writes rationale.
export const runWeeklyNavigator = inngest.createFunction(
    { id: 'ai-navigator-weekly', triggers: [{ event: 'app/run.ai.navigator' }, { cron: 'TZ=America/New_York 0 10 * * 1' }] },
    async ({ step }) => {
        const universe = await step.run('build-universe', async () => buildNavigatorUniverse());

        await step.run('ensure-price-bars', async () => ensureBars(universe.symbols));

        // Deterministic scoring inputs: brain slow layer + eligibility counts + signals.
        const scored = await step.run('compute-global-scores', async () => computeNavigatorScores(universe.symbols));

        const today = getEasternDateString();
        const targets = buildTargets(scored);
        const scoreBySymbol = new Map(scored.map((s) => [s.symbol, s]));

        await step.run('save-global-suggestions', async () => {
            await connectToDatabase();
            await SuggestionSet.updateOne(
                {userId: GLOBAL_SUGGESTIONS_USER, date: today},
                {$set: {items: targets.map((t) => ({
                    symbol: t.symbol,
                    action: 'buy' as const,
                    targetWeight: t.weight,
                    currentWeight: 0,
                    score: t.score,
                    reasons: t.reasons,
                    executed: false,
                }))}},
                {upsert: true},
            );
        });

        let usersProcessed = 0;
        let ordersExecuted = 0;
        // Claims are per ET WEEK, not per day: the trade budget (MAX_TRADES_PER_WEEK) is
        // weekly, so a manual re-fire later in the same week must skip users who already
        // ran rather than granting a fresh budget on a new calendar day.
        const weekKey = getEasternWeekKey(today);

        for (const nav of universe.navigators) {
            const safeId = nav.userId.replace(/[^a-zA-Z0-9_-]/g, '_');
            try {
                // Atomic run claim — replays and double-fires skip instead of double-trading.
                const claimed = await step.run(`claim-run-${safeId}`, async () => {
                    await connectToDatabase();
                    const doc = await AiNavigator.findOneAndUpdate(
                        {userId: nav.userId, status: 'active', lastRunDate: {$ne: weekKey}},
                        {$set: {lastRunDate: weekKey}},
                    );
                    return doc !== null;
                });
                if (!claimed) continue;

                const orders = await step.run(`plan-orders-${safeId}`, async () => {
                    const plan = await planAccountOrders(nav.userId, nav.accountId, targets, scoreBySymbol);
                    if (!plan) {
                        await AiNavigator.updateOne({userId: nav.userId}, {$set: {lastError: 'AI account missing'}});
                    }
                    return plan;
                });
                if (!orders) continue;

                // Each order is its own memoized step: a retry after partial execution
                // replays completed orders instead of re-trading them. diffToOrders emits
                // at most one order per symbol, so the step id is unique within the run.
                let sellFailed = false;
                const executed: SuggestionItem[] = [];
                for (const order of orders.planned) {
                    let result: OrderResult & {price?: number};
                    if (sellFailed && order.side === 'buy') {
                        // The plan funded buys with sell proceeds — without them, buying
                        // could drain cash through the floor.
                        result = {success: false, message: 'Skipped: a funding sell failed this run'};
                    } else {
                        const orderStepId = `execute-order-${safeId}-${order.side}-${order.symbol}`.replace(/[^a-zA-Z0-9_-]/g, '_');
                        result = await step.run(orderStepId, async () =>
                            executeOrder(nav.userId, {
                                accountId: nav.accountId,
                                symbol: order.symbol,
                                side: order.side,
                                quantity: order.quantity,
                                // Re-enforce the cash floor at execution time — live prices
                                // may have drifted since planning.
                                ...(order.side === 'buy' ? {minCashAfter: MIN_CASH_WEIGHT * orders.totalValue} : {}),
                            }));
                    }
                    if (order.side === 'sell' && !result.success) sellFailed = true;
                    executed.push(buildOrderItem(order, result, targets, orders, scoreBySymbol));
                }
                executed.push(...buildHoldItems(orders, targets, scoreBySymbol));
                ordersExecuted += executed.filter((i) => i.executed).length;

                await step.run(`save-suggestions-${safeId}`, async () => {
                    await connectToDatabase();
                    await SuggestionSet.updateOne(
                        {userId: nav.userId, date: today},
                        {$set: {items: executed}},
                        {upsert: true},
                    );
                    await AiNavigator.updateOne({userId: nav.userId}, {$unset: {lastError: ''}});
                });

                // The ONE per-user LLM call: paraphrase the deterministic reasons.
                const narratives = await step.run(`load-narratives-${safeId}`, async () => getBrainDigestData(5));
                const rationalePrompt = RATIONALE_PROMPT
                    .replace('{{items}}', JSON.stringify(executed.map((i) => ({action: i.action, symbol: i.symbol, targetWeightPct: Math.round(i.targetWeight * 100), reasons: i.reasons})), null, 1))
                    .replace('{{narratives}}', JSON.stringify(narratives, null, 1));
                const response = await step.ai.infer(`rationale-${safeId}`, {
                    model: step.ai.models.gemini({ model: EXTRACTION_MODEL }),
                    body: { contents: [{ role: 'user', parts: [{ text: rationalePrompt }] }] },
                });
                await step.run(`save-rationale-${safeId}`, async () => {
                    const part = response.candidates?.[0]?.content?.parts?.[0];
                    const rationale = (part && 'text' in part ? part.text : null);
                    if (!rationale) return;
                    await connectToDatabase();
                    await SuggestionSet.updateOne({userId: nav.userId, date: today}, {$set: {rationaleMd: rationale}});
                });

                usersProcessed++;
                await step.sleep(`rationale-throttle-${safeId}`, RATIONALE_THROTTLE_DELAY);
            } catch (error) {
                console.error('Navigator failed for user:', nav.userId, error);
            }
        }

        const summary = `Navigator ran for ${usersProcessed}/${universe.navigators.length} user(s), ${ordersExecuted} order(s) executed`;
        await step.run('record-job-run', async () => recordJobRun('ai-navigator-weekly', summary));
        return {success: true, message: summary};
    },
)

export const sendDailyNewsSummary = inngest.createFunction(
    { id: 'daily-news-summary', triggers: [{ event: 'app/send.daily.news' }, { cron: 'TZ=America/New_York 0 12 * * *' }] },
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
                    if (user.digestMode === 'general') {
                        return await getAggregatedNews({mode: 'general'});
                    }
                    // Holdings-aware: union of the watchlist and every symbol held
                    // across the user's strategy accounts.
                    const [watchlist, held] = await Promise.all([
                        getWatchlistSymbolsByEmail(user.email),
                        getHeldSymbolsByUserId(user.id),
                    ]);
                    const symbols = Array.from(new Set(
                        [...watchlist, ...held].map((s) => s.toUpperCase()),
                    )).slice(0, PERSONALIZED_SYMBOL_CAP);
                    if (symbols.length === 0) {
                        return await getAggregatedNews({mode: 'general'});
                    }
                    return await getAggregatedNews({symbols, mode: 'personalized'});
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

                // fullSummary is for the news brain — JSON.stringify drops undefined values,
                // keeping the email prompt lean.
                const promptNews = news.map((article) => ({...article, fullSummary: undefined}));
                const prompt = injectJson(
                    injectJson(NEWS_SUMMARY_EMAIL_PROMPT, '{{newsData}}', promptNews, 2),
                    '{{navigatorData}}', navigatorData, 2,
                );

                const response = await step.ai.infer(`summarize-news-${safeId}`, {
                    model: step.ai.models.gemini({ model: 'gemini-2.5-flash-lite' }),
                    body: {
                        contents: [{ role: 'user', parts: [{ text: prompt }] }]
                    }
                });

                const part = response.candidates?.[0]?.content?.parts?.[0];
                const newsContent = (part && 'text' in part ? part.text : null);
                if (!newsContent) {
                    console.warn(`Skipping ${user.email}: Gemini returned no summary text`);
                    continue;
                }

                await step.run(`send-news-email-${safeId}`, async () => {
                    await sendNewsSummaryEmail({
                        email: user.email,
                        date: getFormattedTodayDate(),
                        // LLM output built from untrusted news text — links are only allowed
                        // to point at URLs from the actual article set.
                        newsContent: sanitizeDigestHtml(newsContent, news.map((n) => n.url)),
                    });
                });

                sentCount++;
            } catch (e) {
                console.error('Failed to process news email for:', user.email, e);
            }
        }

        const summary = `Daily news summary sent to ${sentCount}/${users.length} users`;
        await step.run('record-job-run', async () => recordJobRun('daily-news-summary', summary));
        return {success: true, message: summary}
    }
)

// On-demand navigator run: fired on enrollment (to build the starting portfolio
// immediately) and by the "Run AI now" button. If this week's trade budget is
// still unclaimed it TRADES — it is simply the weekly run happening early, and
// the Monday cron then skips this user. If the AI already traded this week it
// produces a PREVIEW instead: full scoring, planned orders and rationale, badged
// and never executed — analysis without a churn loophole.
export const bootstrapAiNavigator = inngest.createFunction(
    { id: 'ai-navigator-bootstrap', triggers: [{ event: 'app/bootstrap.ai.navigator' }] },
    async ({ step, event }) => {
        const userId = typeof event.data?.userId === 'string' ? event.data.userId : null;
        if (!userId) return {success: false, message: 'Missing userId'};
        const safeId = userId.replace(/[^a-zA-Z0-9_-]/g, '_');
        const today = getEasternDateString();
        const weekKey = getEasternWeekKey(today);

        const nav = await step.run('load-navigator', async () => {
            await connectToDatabase();
            const doc = await AiNavigator.findOne({userId});
            return doc ? {accountId: doc.accountId, status: doc.status} : null;
        });
        if (!nav) return {success: true, message: 'Skipped: not enrolled'};
        if (nav.status !== 'active') return {success: true, message: 'Skipped: navigator is paused'};

        // Atomic weekly-budget claim decides the mode: won → trade, lost → preview.
        const claimed = await step.run('claim-bootstrap', async () => {
            await connectToDatabase();
            const doc = await AiNavigator.findOneAndUpdate(
                {userId, status: 'active', lastRunDate: {$ne: weekKey}},
                {$set: {lastRunDate: weekKey}},
            );
            return doc !== null;
        });

        // Fresh deployment: an empty brain would degrade decisions to pure ETF
        // momentum. Run one brain update inline so there is news to read. Only
        // fires when the graph has NO entities (≈ once per deployment lifetime).
        const brainEmpty = await step.run('check-brain-empty', async () => {
            await connectToDatabase();
            return (await BrainEntity.exists({})) === null;
        });
        if (brainEmpty) {
            await step.invoke('bootstrap-brain-update', {function: updateNewsBrain, data: {}});
        }

        const universe = await step.run('bootstrap-universe', async () => buildNavigatorUniverse());
        await step.run('bootstrap-price-bars', async () => ensureBars(universe.symbols));
        const scored = await step.run('bootstrap-scores', async () => computeNavigatorScores(universe.symbols));

        const targets = buildTargets(scored);
        const scoreBySymbol = new Map(scored.map((s) => [s.symbol, s]));

        // The lifted MAX_POSITIONS cap is only for an initial deployment of an
        // empty account; established accounts (and previews) use the weekly cap.
        const accountEmpty = await step.run('check-account-empty', async () => {
            const account = await getOwnedAccount(userId, nav.accountId);
            return account !== null && account.positions.length === 0;
        });

        const orders = await step.run('bootstrap-plan', async () => {
            const plan = await planAccountOrders(
                userId, nav.accountId, targets, scoreBySymbol,
                claimed && accountEmpty ? MAX_POSITIONS : undefined,
            );
            if (!plan) {
                await AiNavigator.updateOne({userId}, {$set: {lastError: 'AI account missing'}});
            }
            return plan;
        });
        if (!orders) return {success: false, message: 'AI account missing'};

        const executed: SuggestionItem[] = [];
        if (claimed) {
            let sellFailed = false;
            for (const order of orders.planned) {
                let result: OrderResult & {price?: number};
                if (sellFailed && order.side === 'buy') {
                    result = {success: false, message: 'Skipped: a funding sell failed this run'};
                } else {
                    const orderStepId = `bootstrap-order-${safeId}-${order.side}-${order.symbol}`.replace(/[^a-zA-Z0-9_-]/g, '_');
                    result = await step.run(orderStepId, async () =>
                        executeOrder(userId, {
                            accountId: nav.accountId,
                            symbol: order.symbol,
                            side: order.side,
                            quantity: order.quantity,
                            ...(order.side === 'buy' ? {minCashAfter: MIN_CASH_WEIGHT * orders.totalValue} : {}),
                        }));
                }
                if (order.side === 'sell' && !result.success) sellFailed = true;
                executed.push(buildOrderItem(order, result, targets, orders, scoreBySymbol));
            }
        } else {
            // Preview: same items, nothing sent to executeOrder ({success: false}
            // without a message leaves executed:false and no error text).
            for (const order of orders.planned) {
                executed.push(buildOrderItem(order, {success: false}, targets, orders, scoreBySymbol));
            }
        }
        executed.push(...buildHoldItems(orders, targets, scoreBySymbol));

        const saved = await step.run('bootstrap-save-suggestions', async () => {
            await connectToDatabase();
            if (!claimed) {
                // Never let a preview overwrite the record of trades actually
                // executed today (e.g. a Monday-afternoon button press).
                const existing = await SuggestionSet.findOne({userId, date: today}).lean();
                if (existing && existing.kind !== 'preview') return false;
            }
            await SuggestionSet.updateOne(
                {userId, date: today},
                {$set: {items: executed, kind: claimed ? 'executed' : 'preview'}},
                {upsert: true},
            );
            await AiNavigator.updateOne({userId}, {$unset: {lastError: ''}});
            return true;
        });
        if (!saved) {
            return {success: true, message: 'Preview skipped: today already has executed decisions'};
        }

        const narratives = await step.run('bootstrap-narratives', async () => getBrainDigestData(5));
        const rationalePrompt = RATIONALE_PROMPT
            .replace('{{items}}', JSON.stringify(executed.map((i) => ({action: i.action, symbol: i.symbol, targetWeightPct: Math.round(i.targetWeight * 100), reasons: i.reasons})), null, 1))
            .replace('{{narratives}}', JSON.stringify(narratives, null, 1));
        const response = await step.ai.infer('bootstrap-rationale', {
            model: step.ai.models.gemini({ model: EXTRACTION_MODEL }),
            body: { contents: [{ role: 'user', parts: [{ text: rationalePrompt }] }] },
        });
        await step.run('bootstrap-save-rationale', async () => {
            const part = response.candidates?.[0]?.content?.parts?.[0];
            const rationale = (part && 'text' in part ? part.text : null);
            if (!rationale) return;
            await connectToDatabase();
            await SuggestionSet.updateOne({userId, date: today}, {$set: {rationaleMd: rationale}});
        });

        const summary = claimed
            ? `Run traded ${executed.filter((i) => i.executed).length} order(s)`
            : 'Preview saved (nothing traded)';
        await step.run('record-job-run', async () => recordJobRun('ai-navigator-bootstrap', summary));
        return {success: true, message: `${summary} for ${userId}`};
    },
)

// On-demand "second opinion": Claude (a stronger model than the extraction
// pipeline's) reads the same brain digest, theses, decisions and headlines and
// argues with them. It never trades — the deterministic rails stay in charge;
// this is a critique layer for the human reading the /brain page.
export const generateSecondOpinion = inngest.createFunction(
    {
        id: 'claude-second-opinion',
        triggers: [{ event: 'app/generate.second.opinion' }],
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
            await step.run('record-job-run', async () => recordJobRun('claude-second-opinion', message));
            return {success: false, message};
        }
        if (!isSecondOpinionConfigured()) {
            const message = 'Skipped — ANTHROPIC_API_KEY is not set';
            await step.run('record-job-run', async () => recordJobRun('claude-second-opinion', message));
            return {success: false, message};
        }

        const context = await step.run('gather-context', gatherOpinionContext);

        if (!Array.isArray(context.narratives) || context.narratives.length === 0) {
            const message = 'Skipped — the brain is empty, run a brain update first';
            await step.run('record-job-run', async () => recordJobRun('claude-second-opinion', message));
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

        await step.run('record-job-run', async () => recordJobRun('claude-second-opinion', summary));
        return {success: true, message: summary};
    },
)
