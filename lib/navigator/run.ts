// The AI Navigator's run (NOT a 'use server' module), shared by the weekly job and the
// on-demand bootstrap (lib/jobs/functions/navigator.ts), which must make identical decisions:
// the same price passes, the same weekly claim, the same plan, the same order loop and the
// same rationale call. Each caller passes its own step ids, so neither job's ids change.
// Scoring and planning are lib/navigator/store.ts; the rationale prompt is ./prompts.ts.

import {connectToDatabase} from "@/database/mongoose";
import SuggestionSet, {GLOBAL_SUGGESTIONS_USER} from "@/database/models/suggestion-set.model";
import AiNavigator from "@/database/models/ai-navigator.model";
import BrainEntity from "@/database/models/brain-entity.model";
import type {JobStep} from "@/lib/jobs/client";
import {chunk, stepId} from "@/lib/jobs/steps";
import {inferText} from "@/lib/ai/infer";
import {getBrainDigestData} from "@/lib/brain/store";
import {ensureBars} from "@/lib/prices/store";
import {PRICE_CHUNK_SIZE} from "@/lib/prices/config";
import {executeOrder, FUNDING_SELL_FAILED} from "@/lib/trading/orders";
import {getOwnedAccount} from "@/lib/trading/accounts";
import {MIN_CASH_WEIGHT} from "@/lib/navigator/config";
import {buildRationalePrompt} from "@/lib/navigator/prompts";
import {navigatorTargets, type NavigatorUniverse} from "@/lib/navigator/universe";
import {buildHoldItems, buildOrderItem, planAccountOrders, type AccountPlan} from "@/lib/navigator/store";
import type {TargetWeight} from "@/lib/navigator/allocator";
import type {ScoredSymbol} from "@/lib/navigator/scoring";

// One step per chunk of the universe: a single 40-symbol step with Yahoo's spacing would
// exceed the route's 60 s budget and be retried from scratch. Steps are `${stepPrefix}-${i}`.
export const ensureUniverseBars = async (step: JobStep, symbols: readonly string[], stepPrefix: string): Promise<void> => {
    const chunks = chunk(symbols, PRICE_CHUNK_SIZE);
    for (let i = 0; i < chunks.length; i += 1) {
        const batch = chunks[i];
        await step.run(`${stepPrefix}-${i}`, async () => ensureBars(batch, {limit: batch.length}));
    }
};

type NavigatorDecisionInputs = {targets: TargetWeight[]; scoreBySymbol: Map<string, ScoredSymbol>};

// The week's targets, picked from the targetable part of the scored universe.
export const decisionInputs = (scored: ScoredSymbol[], universe: NavigatorUniverse): NavigatorDecisionInputs => ({
    targets: navigatorTargets(scored, universe),
    scoreBySymbol: new Map(scored.map((s) => [s.symbol, s])),
});

// The global model portfolio for the day (every enrolled user's targets).
export const saveGlobalSuggestions = async (targets: TargetWeight[], today: string): Promise<void> => {
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
};

// Atomic run claim, per ET WEEK (the trade budget, MAX_TRADES_PER_WEEK, is weekly): replays and
// double-fires lose it and skip instead of double-trading, and a manual re-fire later in the
// same week cannot grant a fresh budget on a new calendar day.
export const claimNavigatorWeek = async (userId: string, weekKey: string): Promise<boolean> => {
    await connectToDatabase();
    const doc = await AiNavigator.findOneAndUpdate(
        {userId, status: 'active', lastRunDate: {$ne: weekKey}},
        {$set: {lastRunDate: weekKey}},
    );
    return doc !== null;
};

// One account's orders under the holding rails; null (and the error recorded on the enrollment)
// when the account is gone.
export const planNavigatorOrders = async (
    userId: string,
    accountId: string,
    {targets, scoreBySymbol}: NavigatorDecisionInputs,
    maxTrades?: number,
): Promise<AccountPlan | null> => {
    const plan = await planAccountOrders(userId, accountId, targets, scoreBySymbol, maxTrades);
    if (!plan) {
        await AiNavigator.updateOne({userId}, {$set: {lastError: 'AI account missing'}});
    }
    return plan;
};

type PlanContext = NavigatorDecisionInputs & {plan: AccountPlan};

// Every planned order, each its own memoized step (`${orderStepPrefix}-${side}-${symbol}`,
// sanitised): a retry after partial execution replays completed orders instead of re-trading
// them, and diffToOrders emits at most one order per symbol, so the ids are unique within the
// run. Returns the decisions — the orders, then the kept positions.
export const executeNavigatorPlan = async (
    step: JobStep,
    {userId, accountId, plan, targets, scoreBySymbol, orderStepPrefix}: PlanContext & {userId: string; accountId: string; orderStepPrefix: string},
): Promise<SuggestionItem[]> => {
    const items: SuggestionItem[] = [];
    let sellFailed = false;
    for (const order of plan.planned) {
        let result: OrderResult & {price?: number};
        if (sellFailed && order.side === 'buy') {
            // The plan funded buys with sell proceeds — without them, buying could drain
            // cash through the floor.
            result = {success: false, message: FUNDING_SELL_FAILED};
        } else {
            result = await step.run(stepId(`${orderStepPrefix}-${order.side}-${order.symbol}`), async () =>
                executeOrder(userId, {
                    accountId,
                    symbol: order.symbol,
                    side: order.side,
                    quantity: order.quantity,
                    source: 'ai-navigator',
                    // Re-enforce the cash floor at execution time — live prices
                    // may have drifted since planning.
                    ...(order.side === 'buy' ? {minCashAfter: MIN_CASH_WEIGHT * plan.totalValue} : {}),
                }));
        }
        if (order.side === 'sell' && !result.success) sellFailed = true;
        items.push(buildOrderItem(order, result, targets, plan, scoreBySymbol));
    }
    items.push(...buildHoldItems(plan, targets, scoreBySymbol));
    return items;
};

// A preview: the same items, nothing sent to executeOrder ({success: false} without a message
// leaves executed:false and no error text).
export const previewNavigatorPlan = ({plan, targets, scoreBySymbol}: PlanContext): SuggestionItem[] => [
    ...plan.planned.map((order) => buildOrderItem(order, {success: false}, targets, plan, scoreBySymbol)),
    ...buildHoldItems(plan, targets, scoreBySymbol),
];

// The day's decisions for one user, and the enrollment's last error cleared. The weekly run
// leaves `kind` as stored; the bootstrap stamps 'executed' or 'preview'.
export const saveDecisions = async (userId: string, today: string, items: SuggestionItem[], kind?: 'executed' | 'preview'): Promise<void> => {
    await connectToDatabase();
    await SuggestionSet.updateOne(
        {userId, date: today},
        {$set: {items, ...(kind ? {kind} : {})}},
        {upsert: true},
    );
    await AiNavigator.updateOne({userId}, {$unset: {lastError: ''}});
};

// A preview never overwrites the record of trades actually executed today (e.g. a
// Monday-afternoon button press): false when today already has executed decisions.
export const savePreviewDecisions = async (userId: string, today: string, items: SuggestionItem[]): Promise<boolean> => {
    await connectToDatabase();
    const existing = await SuggestionSet.findOne({userId, date: today}).lean();
    if (existing && existing.kind !== 'preview') return false;
    await saveDecisions(userId, today, items, 'preview');
    return true;
};

// The ONE per-user LLM call: paraphrase the deterministic reasons (lib/navigator/prompts.ts)
// beside the brain's top narratives, saved on the user's decisions for the day.
export const writeRationale = async (
    step: JobStep,
    {userId, today, items, stepIds}: {userId: string; today: string; items: SuggestionItem[]; stepIds: {narratives: string; infer: string; save: string}},
): Promise<void> => {
    const narratives = await step.run(stepIds.narratives, async () => getBrainDigestData(5));
    const rationalePrompt = buildRationalePrompt(items, narratives);
    const response = await inferText(step, {task: 'rationale', stepId: stepIds.infer, prompt: rationalePrompt});
    await step.run(stepIds.save, async () => {
        const rationale = response.text;
        if (!rationale) return;
        await connectToDatabase();
        await SuggestionSet.updateOne({userId, date: today}, {$set: {rationaleMd: rationale}});
    });
};

// The bootstrap's reads: the enrollment, whether the brain has anything yet, whether the
// account is untouched (the lifted MAX_POSITIONS cap is only for an initial deployment).
export const loadEnrollment = async (userId: string): Promise<{accountId: string; status: string} | null> => {
    await connectToDatabase();
    const doc = await AiNavigator.findOne({userId});
    return doc ? {accountId: doc.accountId, status: doc.status} : null;
};

export const brainIsEmpty = async (): Promise<boolean> => {
    await connectToDatabase();
    return (await BrainEntity.exists({})) === null;
};

export const accountIsEmpty = async (userId: string, accountId: string): Promise<boolean> => {
    const account = await getOwnedAccount(userId, accountId);
    return account !== null && account.positions.length === 0;
};
