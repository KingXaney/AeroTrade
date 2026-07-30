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
import PaperTrade from "@/database/models/paper-trade.model";
import {getActiveTheses, getBrainDigestData, getTopEntities, getTopVerifiedTickers} from "@/lib/brain/queries";
import {foldExtractionsIntoBrain, type ArticleFold} from "@/lib/brain/update";
import {parseExtractionResponse, sanitizeExtraction} from "@/lib/brain/extraction";
import {EXTRACTION_PROMPT, RATIONALE_PROMPT} from "@/lib/brain/prompts";
import {
    EXTRACTION_BATCH_SIZE,
    EXTRACTION_MODEL,
    MAX_EXTRACTION_CALLS_PER_DAY,
    NEW_TICKER_VERIFY_BUDGET,
    THEME_REUSE_LIST_SIZE,
    UNEXTRACTED_PICKUP_LIMIT,
} from "@/lib/brain/config";
import {ensureBars, getBarsForSymbols} from "@/lib/prices/store";
import {computeSignals} from "@/lib/prices/signals";
import {scoreUniverse, type ScoringInput} from "@/lib/navigator/scoring";
import {buildTargets, diffToOrders, type HeldPosition} from "@/lib/navigator/allocator";
import {ALWAYS_ELIGIBLE_SYMBOLS, ELIGIBILITY_LOOKBACK_DAYS, MIN_CASH_WEIGHT} from "@/lib/navigator/config";
import {executeOrder} from "@/lib/trading/orders";
import BrainEntity from "@/database/models/brain-entity.model";
import {searchStocks} from "@/lib/actions/finnhub.actions";
import {getEasternDateString, getFormattedTodayDate} from "@/lib/utils";
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

        return {success: true, message: `Snapshotted ${written} account(s) + ${BENCHMARK_SYMBOL}`};
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

            const prompt = EXTRACTION_PROMPT
                .replace('{{articles}}', JSON.stringify(batch, null, 1))
                .replace('{{activeThemes}}', JSON.stringify(queue.activeThemes));
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

        return {
            success: true,
            message: `Brain updated: ${inserted} articles ingested, ${extractedIds.length} extracted, ${foldResult.entitiesTouched} entities touched, ${foldResult.deleted} pruned`,
        };
    },
)

// Weekly navigator: long-horizon scoring over the brain's SLOW layer + multi-month
// momentum, then per-enrolled-user allocation under strict holding rails. All
// decisions are deterministic; the single LLM call per user only writes rationale.
export const runWeeklyNavigator = inngest.createFunction(
    { id: 'ai-navigator-weekly', triggers: [{ event: 'app/run.ai.navigator' }, { cron: 'TZ=America/New_York 0 10 * * 1' }] },
    async ({ step }) => {
        const universe = await step.run('build-universe', async () => {
            await connectToDatabase();
            const navigators = (await AiNavigator.find({status: 'active'}).lean())
                .map((n) => ({userId: n.userId, accountId: n.accountId}));
            const held = new Set<string>();
            for (const nav of navigators) {
                for (const sym of await getHeldSymbolsByUserId(nav.userId)) held.add(sym);
            }
            const topTickers = await getTopVerifiedTickers(25);
            const symbols = Array.from(new Set([...ALWAYS_ELIGIBLE_SYMBOLS, ...topTickers, ...held]));
            return {symbols, navigators};
        });

        await step.run('ensure-price-bars', async () => ensureBars(universe.symbols));

        // Deterministic scoring inputs: brain slow layer + eligibility counts + signals.
        const scored = await step.run('compute-global-scores', async () => {
            await connectToDatabase();
            const entities = await BrainEntity.find({key: {$in: universe.symbols}}).lean();
            const entityByKey = new Map(entities.map((e) => [e.key, e]));
            const thesisKeys = new Set(
                (await BrainEntity.find({thesisSince: {$ne: null}}).lean()).map((e) => e.key),
            );

            const lookbackStart = getEasternDateString(new Date(Date.now() - ELIGIBILITY_LOOKBACK_DAYS * 24 * 60 * 60 * 1000));
            const counts = await NewsItem.aggregate([
                {$match: {publishedDate: {$gte: lookbackStart}, 'extraction.entities.key': {$in: universe.symbols}}},
                {$unwind: '$extraction.entities'},
                {$match: {'extraction.entities.key': {$in: universe.symbols}}},
                {$group: {_id: '$extraction.entities.key', articles: {$addToSet: '$contentHash'}, sources: {$addToSet: '$source'}}},
            ]);
            const countByKey = new Map<string, {articles: number; sources: number}>(
                counts.map((c: {_id: string; articles: unknown[]; sources: unknown[]}) => [c._id, {articles: c.articles.length, sources: c.sources.length}]),
            );

            const barsBySymbol = await getBarsForSymbols(universe.symbols);

            const inputs: ScoringInput[] = universe.symbols.map((symbol) => {
                const entity = entityByKey.get(symbol);
                const links: {key: string}[] = entity?.links ?? [];
                const hasActiveThesis = thesisKeys.has(symbol) || links.some((l) => thesisKeys.has(l.key));
                const thesisLink = thesisKeys.has(symbol) ? symbol : links.find((l) => thesisKeys.has(l.key))?.key;
                const bars = barsBySymbol.get(symbol) ?? [];
                const weight = entity?.weightSlow ?? 0;
                return {
                    symbol,
                    newsWeightSlow: weight,
                    sentimentSlow: weight > 1e-9 ? (entity?.sentimentSumSlow ?? 0) / weight : 0,
                    signals: computeSignals(bars),
                    sectorTilt: 0,
                    hasActiveThesis,
                    thesisLabel: thesisLink,
                    articleCount: countByKey.get(symbol)?.articles ?? 0,
                    sourceCount: countByKey.get(symbol)?.sources ?? 0,
                    barsCount: bars.length,
                    alwaysEligible: ALWAYS_ELIGIBLE_SYMBOLS.includes(symbol),
                };
            });
            return scoreUniverse(inputs);
        });

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
        const claimDate = new Date(today + 'T00:00:00Z');
        claimDate.setUTCDate(claimDate.getUTCDate() - ((claimDate.getUTCDay() + 6) % 7));
        const weekKey = claimDate.toISOString().slice(0, 10);

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
                    const account = await getOwnedAccount(nav.userId, nav.accountId);
                    if (!account) {
                        await AiNavigator.updateOne({userId: nav.userId}, {$set: {lastError: 'AI account missing'}});
                        return null;
                    }
                    const positionSymbols = account.positions.map((p) => p.symbol);
                    const priceMap = await buildPriceMap([...positionSymbols, ...targets.map((t) => t.symbol)]);
                    const portfolio = computePortfolio(
                        {cash: account.cash, startingBalance: account.startingBalance, positions: account.positions.map((p) => ({symbol: p.symbol, company: p.company, quantity: p.quantity, avgCost: p.avgCost}))},
                        priceMap,
                    );

                    // Last buy per held symbol → approximate trading days held (5/7 of calendar).
                    const lastBuys = await PaperTrade.aggregate([
                        {$match: {accountId: String(account._id), side: 'buy'}},
                        {$group: {_id: '$symbol', last: {$max: '$createdAt'}}},
                    ]);
                    const lastBuyBySymbol = new Map<string, number>(
                        lastBuys.map((r: {_id: string; last: Date}) => [r._id, new Date(r.last).getTime()]),
                    );

                    const positions: HeldPosition[] = portfolio.positions.map((p) => {
                        const lastBuy = lastBuyBySymbol.get(p.symbol);
                        const calendarDays = lastBuy ? (Date.now() - lastBuy) / (24 * 60 * 60 * 1000) : null;
                        return {
                            symbol: p.symbol,
                            quantity: p.quantity,
                            avgCost: p.avgCost,
                            price: typeof p.currentPrice === 'number' ? p.currentPrice : null,
                            heldTradingDays: calendarDays === null ? null : Math.floor(calendarDays * 5 / 7),
                            // v1: thesis health is already 20% of the score, so score-based exits
                            // cover a dying thesis; a dedicated thesis-history trigger is v2.
                            thesisBroken: false,
                            score: scoreBySymbol.get(p.symbol)?.score ?? null,
                        };
                    });
                    // diffToOrders resolves entry prices from position rows only — unheld
                    // targets need quantity-0 quote-carrier rows or they are silently skipped.
                    const heldSymbols = new Set(positions.map((p) => p.symbol));
                    for (const t of targets) {
                        if (heldSymbols.has(t.symbol)) continue;
                        positions.push({
                            symbol: t.symbol,
                            quantity: 0,
                            avgCost: 0,
                            price: priceMap.get(t.symbol.toUpperCase())?.price ?? null,
                            heldTradingDays: null,
                            thesisBroken: false,
                            score: scoreBySymbol.get(t.symbol)?.score ?? null,
                        });
                    }

                    const planned = diffToOrders({totalValue: portfolio.totalValue, cash: portfolio.cash, positions, targets});
                    return {planned, positions, totalValue: portfolio.totalValue};
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

                    const target = targets.find((t) => t.symbol === order.symbol);
                    const held = orders.positions.find((p) => p.symbol === order.symbol);
                    executed.push({
                        symbol: order.symbol,
                        action: order.side,
                        quantity: order.quantity,
                        targetWeight: target?.weight ?? 0,
                        currentWeight: held && held.price !== null && orders.totalValue > 0
                            ? (held.quantity * held.price) / orders.totalValue : 0,
                        score: scoreBySymbol.get(order.symbol)?.score ?? 0,
                        reasons: [order.reason, ...(scoreBySymbol.get(order.symbol)?.reasons ?? []).slice(0, 3)],
                        executed: result.success,
                        ...(result.success && typeof result.price === 'number' ? {executionPrice: result.price} : {}),
                        ...(!result.success ? {error: result.message} : {}),
                    });
                }
                // Holds: real positions kept this week (skip the quantity-0 quote carriers).
                const orderedSymbols = new Set(orders.planned.map((o) => o.symbol));
                for (const p of orders.positions) {
                    if (p.quantity === 0 || orderedSymbols.has(p.symbol)) continue;
                    const target = targets.find((t) => t.symbol === p.symbol);
                    executed.push({
                        symbol: p.symbol,
                        action: 'hold',
                        targetWeight: target?.weight ?? (p.price !== null && orders.totalValue > 0 ? (p.quantity * p.price) / orders.totalValue : 0),
                        currentWeight: p.price !== null && orders.totalValue > 0 ? (p.quantity * p.price) / orders.totalValue : 0,
                        score: p.score ?? 0,
                        reasons: (scoreBySymbol.get(p.symbol)?.reasons ?? ['holding — no exit trigger']).slice(0, 3),
                        executed: false,
                    });
                }
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

        return {
            success: true,
            message: `Navigator ran for ${usersProcessed}/${universe.navigators.length} user(s), ${ordersExecuted} order(s) executed`,
        };
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
                        const set = await SuggestionSet.findOne({userId: user.id}).sort({date: -1}).lean();
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
                const prompt = NEWS_SUMMARY_EMAIL_PROMPT
                    .replace('{{newsData}}', JSON.stringify(promptNews, null, 2))
                    .replace('{{navigatorData}}', JSON.stringify(navigatorData, null, 2));

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

        return {
            success: true,
            message: `Daily news summary sent to ${sentCount}/${users.length} users`,
        }
    }
)
