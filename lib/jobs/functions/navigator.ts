import {inngest} from "@/lib/jobs/client";
import SuggestionSet, {GLOBAL_SUGGESTIONS_USER} from "@/database/models/suggestion-set.model";
import AiNavigator from "@/database/models/ai-navigator.model";
import {getBrainDigestData} from "@/lib/brain/store";
import {buildRationalePrompt} from "@/lib/navigator/prompts";
import {inferText} from "@/lib/ai/infer";
import {recordJobRun} from "@/lib/jobs/job-runs";
import {JOBS, triggersOf} from "@/lib/jobs/registry";
import {getEasternDateString, getEasternWeekKey} from "@/lib/dates";
import {ensureBars} from "@/lib/prices/store";
import {navigatorTargets} from "@/lib/navigator/universe";
import {MAX_POSITIONS, MIN_CASH_WEIGHT} from "@/lib/navigator/config";
import {buildHoldItems, buildNavigatorUniverse, buildOrderItem, computeNavigatorScores, planAccountOrders} from "@/lib/navigator/store";
import {executeOrder} from "@/lib/trading/orders";
import BrainEntity from "@/database/models/brain-entity.model";
import {connectToDatabase} from "@/database/mongoose";
import {getOwnedAccount} from "@/lib/trading/accounts";
import {chunk, stepId} from "@/lib/jobs/steps";
import {PRICE_CHUNK_SIZE} from "@/lib/prices/config";
import {updateNewsBrain} from "@/lib/jobs/functions/brain";

// Throttle for the free-tier LLM budget.
const RATIONALE_THROTTLE_DELAY = '5s';

// Weekly navigator: long-horizon scoring over the brain's SLOW layer + multi-month
// momentum, then per-enrolled-user allocation under strict holding rails. All
// decisions are deterministic; the single LLM call per user only writes rationale.
export const runWeeklyNavigator = inngest.createFunction(
    { id: JOBS.navigatorWeekly.id, triggers: triggersOf(JOBS.navigatorWeekly) },
    async ({ step }) => {
        const universe = await step.run('build-universe', async () => buildNavigatorUniverse());

        // One step per chunk: a single 40-symbol step with Yahoo's spacing would exceed the
        // route's 60 s budget and be retried from scratch.
        const navigatorChunks = chunk(universe.symbols, PRICE_CHUNK_SIZE);
        for (let i = 0; i < navigatorChunks.length; i += 1) {
            const symbols = navigatorChunks[i];
            await step.run(`ensure-price-bars-${i}`, async () => ensureBars(symbols, {limit: symbols.length}));
        }

        // Deterministic scoring inputs: brain slow layer + eligibility counts + signals.
        const scored = await step.run('compute-global-scores', async () => computeNavigatorScores(universe.symbols));

        const today = getEasternDateString();
        const targets = navigatorTargets(scored, universe);
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
            const safeId = stepId(nav.userId);
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
                        const orderStepId = stepId(`execute-order-${safeId}-${order.side}-${order.symbol}`);
                        result = await step.run(orderStepId, async () =>
                            executeOrder(nav.userId, {
                                accountId: nav.accountId,
                                symbol: order.symbol,
                                side: order.side,
                                quantity: order.quantity,
                                source: 'ai-navigator',
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
                const rationalePrompt = buildRationalePrompt(executed, narratives);
                const response = await inferText(step, {task: 'rationale', stepId: `rationale-${safeId}`, prompt: rationalePrompt});
                await step.run(`save-rationale-${safeId}`, async () => {
                    const rationale = response.text;
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
        await step.run('record-job-run', async () => recordJobRun(JOBS.navigatorWeekly.id, summary));
        return {success: true, message: summary};
    },
)

// On-demand navigator run: fired on enrollment (to build the starting portfolio
// immediately) and by the "Run AI now" button. If this week's trade budget is
// still unclaimed it TRADES — it is simply the weekly run happening early, and
// the Monday cron then skips this user. If the AI already traded this week it
// produces a PREVIEW instead: full scoring, planned orders and rationale, badged
// and never executed — analysis without a churn loophole.
export const bootstrapAiNavigator = inngest.createFunction(
    { id: JOBS.navigatorBootstrap.id, triggers: triggersOf(JOBS.navigatorBootstrap) },
    async ({ step, event }) => {
        const userId = typeof event.data?.userId === 'string' ? event.data.userId : null;
        if (!userId) return {success: false, message: 'Missing userId'};
        const safeId = stepId(userId);
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
        const bootstrapChunks = chunk(universe.symbols, PRICE_CHUNK_SIZE);
        for (let i = 0; i < bootstrapChunks.length; i += 1) {
            const symbols = bootstrapChunks[i];
            await step.run(`bootstrap-price-bars-${i}`, async () => ensureBars(symbols, {limit: symbols.length}));
        }
        const scored = await step.run('bootstrap-scores', async () => computeNavigatorScores(universe.symbols));

        const targets = navigatorTargets(scored, universe);
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
                    const orderStepId = stepId(`bootstrap-order-${safeId}-${order.side}-${order.symbol}`);
                    result = await step.run(orderStepId, async () =>
                        executeOrder(userId, {
                            accountId: nav.accountId,
                            symbol: order.symbol,
                            side: order.side,
                            quantity: order.quantity,
                            source: 'ai-navigator',
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
        const rationalePrompt = buildRationalePrompt(executed, narratives);
        const response = await inferText(step, {task: 'rationale', stepId: 'bootstrap-rationale', prompt: rationalePrompt});
        await step.run('bootstrap-save-rationale', async () => {
            const rationale = response.text;
            if (!rationale) return;
            await connectToDatabase();
            await SuggestionSet.updateOne({userId, date: today}, {$set: {rationaleMd: rationale}});
        });

        const summary = claimed
            ? `Run traded ${executed.filter((i) => i.executed).length} order(s)`
            : 'Preview saved (nothing traded)';
        await step.run('record-job-run', async () => recordJobRun(JOBS.navigatorBootstrap.id, summary));
        return {success: true, message: `${summary} for ${userId}`};
    },
)
