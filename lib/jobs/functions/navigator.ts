import {inngest} from "@/lib/jobs/client";
import {recordJobRun} from "@/lib/jobs/job-runs";
import {JOBS, triggersOf} from "@/lib/jobs/registry";
import {eventDay, stepId} from "@/lib/jobs/steps";
import {updateNewsBrain} from "@/lib/jobs/functions/brain";
import {getEasternWeekKey} from "@/lib/dates";
import {MAX_POSITIONS} from "@/lib/navigator/config";
import {buildNavigatorUniverse, computeNavigatorScores} from "@/lib/navigator/store";
import {describeWeeklyRun, isRetryRun, type HeldBack} from "@/lib/navigator/weekly";
import {marketStatus} from "@/lib/prices/market-hours";
import {
    accountIsEmpty,
    brainIsEmpty,
    claimNavigatorWeek,
    countWaitingNavigators,
    decisionInputs,
    ensureUniverseBars,
    executeNavigatorPlan,
    loadEnrollment,
    planNavigatorOrders,
    previewNavigatorPlan,
    refusedQuotes,
    releaseNavigatorWeek,
    saveDecisions,
    saveGlobalSuggestions,
    savePreviewDecisions,
    writeRationale,
} from "@/lib/navigator/run";

// Throttle for the free-tier LLM budget.
const RATIONALE_THROTTLE_DELAY = '5s';

// Weekly navigator: long-horizon scoring over the brain's SLOW layer + multi-month
// momentum, then per-enrolled-user allocation under strict holding rails. All
// decisions are deterministic; the single LLM call per user only writes rationale.
// The run itself is lib/navigator/run.ts, shared with the bootstrap below.
//
// It trades only while the market is open, as the strategies and the culture pickers do: on a
// Monday holiday the week is scored and nothing is claimed, and Tuesday's cron trades it. A
// claim taken on a morning when a quote the plan needed was refused is given back before any
// order is sent, for the same retry. `force: true` on the event trades whatever the hour (a
// run fired by hand, as the on-demand run below always may).
export const runWeeklyNavigator = inngest.createFunction(
    { id: JOBS.navigatorWeekly.id, triggers: triggersOf(JOBS.navigatorWeekly) },
    async ({ step, event }) => {
        const today = eventDay(event.ts);
        // Claims are per ET WEEK, not per day (claimNavigatorWeek).
        const weekKey = getEasternWeekKey(today);
        // The Tuesday retry has work only while an enrolment still waits for its week; with
        // none, Monday's scores and stamp stand.
        const retry = isRetryRun(event.name, event.ts);
        if (retry) {
            const waiting = await step.run('waiting-enrolments', async () => countWaitingNavigators(weekKey));
            if (waiting === 0) return {success: true, message: `Retry: no enrolment is waiting for week ${weekKey}`};
        }
        // Read off the event's own time, so every replay of this function decides the same way.
        const open = (event.data as {force?: unknown} | undefined)?.force === true
            || marketStatus(new Date(typeof event.ts === 'number' ? event.ts : Date.now())).state === 'open';
        const universe = await step.run('build-universe', async () => buildNavigatorUniverse());

        await ensureUniverseBars(step, universe.symbols, 'ensure-price-bars');

        // Deterministic scoring inputs: brain slow layer + eligibility counts + signals.
        const scored = await step.run('compute-global-scores', async () =>
            computeNavigatorScores(universe.symbols, {record: {weekKey: getEasternWeekKey(today), date: today}}));

        const inputs = decisionInputs(scored, universe);

        await step.run('save-global-suggestions', async () => saveGlobalSuggestions(inputs.targets, today));

        let usersProcessed = 0;
        let ordersExecuted = 0;
        const heldBack: HeldBack[] = [];
        const failed: string[] = [];

        if (!open) {
            const closed = describeWeeklyRun({enrolled: universe.navigators.length, traded: 0, orders: 0, heldBack, failed, open});
            await step.run('record-job-run', async () => recordJobRun(JOBS.navigatorWeekly.id, closed));
            return {success: true, message: closed};
        }

        for (const nav of universe.navigators) {
            const safeId = stepId(nav.userId);
            // What the catch needs to know: a claim this run took, and whether any order went.
            let claimedHere = false;
            let ordersStarted = false;
            try {
                const claimed = await step.run(`claim-run-${safeId}`, async () => claimNavigatorWeek(nav.userId, weekKey));
                if (!claimed) continue;
                claimedHere = true;

                const orders = await step.run(`plan-orders-${safeId}`, async () => planNavigatorOrders(nav.userId, nav.accountId, inputs));
                if (!orders) continue;

                // A quote the plan needed was refused: trading on the rest would leave a holding
                // or a target out for the whole week. Nothing has been sent yet, so the claim
                // goes back and the next run plans the week whole.
                const refused = await step.run(`refused-quotes-${safeId}`, async () => refusedQuotes(orders.unpriced, {retry}));
                if (refused.length > 0) {
                    await step.run(`release-run-${safeId}`, async () => releaseNavigatorWeek(nav.userId, weekKey));
                    claimedHere = false;
                    heldBack.push({userId: nav.userId, symbols: refused});
                    continue;
                }
                ordersStarted = true;

                const executed = await executeNavigatorPlan(step, {
                    userId: nav.userId,
                    accountId: nav.accountId,
                    plan: orders,
                    ...inputs,
                    orderStepPrefix: `execute-order-${safeId}`,
                    weekKey,
                });
                ordersExecuted += executed.filter((i) => i.executed).length;

                await step.run(`save-suggestions-${safeId}`, async () => saveDecisions(nav.userId, today, executed));

                await writeRationale(step, {
                    userId: nav.userId,
                    today,
                    items: executed,
                    stepIds: {narratives: `load-narratives-${safeId}`, infer: `rationale-${safeId}`, save: `save-rationale-${safeId}`},
                });

                usersProcessed++;
                await step.sleep(`rationale-throttle-${safeId}`, RATIONALE_THROTTLE_DELAY);
            } catch (error) {
                console.error('Navigator failed for user:', nav.userId, error);
                failed.push(nav.userId);
                // The run threw before any order was sent: the week is not spent. Its own step
                // and its own catch, since whatever failed the plan may fail this too.
                if (claimedHere && !ordersStarted) {
                    try {
                        await step.run(`release-failed-${safeId}`, async () => releaseNavigatorWeek(nav.userId, weekKey));
                    } catch (releaseError) {
                        console.error('The week\'s claim could not be given back for user:', nav.userId, releaseError);
                    }
                }
            }
        }

        const summary = describeWeeklyRun({enrolled: universe.navigators.length, traded: usersProcessed, orders: ordersExecuted, heldBack, failed, open});
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
        const today = eventDay(event.ts);
        const weekKey = getEasternWeekKey(today);

        const nav = await step.run('load-navigator', async () => loadEnrollment(userId));
        if (!nav) return {success: true, message: 'Skipped: not enrolled'};
        if (nav.status !== 'active') return {success: true, message: 'Skipped: navigator is paused'};

        // Atomic weekly-budget claim decides the mode: won → trade, lost → preview.
        const claimed = await step.run('claim-bootstrap', async () => claimNavigatorWeek(userId, weekKey));

        // Fresh deployment: an empty brain would degrade decisions to pure ETF
        // momentum. Run one brain update inline so there is news to read. Only
        // fires when the graph has NO entities (≈ once per deployment lifetime).
        const brainEmpty = await step.run('check-brain-empty', brainIsEmpty);
        if (brainEmpty) {
            await step.invoke('bootstrap-brain-update', {function: updateNewsBrain, data: {}});
        }

        const universe = await step.run('bootstrap-universe', async () => buildNavigatorUniverse());
        await ensureUniverseBars(step, universe.symbols, 'bootstrap-price-bars');
        const scored = await step.run('bootstrap-scores', async () => computeNavigatorScores(universe.symbols));

        const inputs = decisionInputs(scored, universe);

        // The lifted MAX_POSITIONS cap is only for an initial deployment of an
        // empty account; established accounts (and previews) use the weekly cap.
        const accountEmpty = await step.run('check-account-empty', async () => accountIsEmpty(userId, nav.accountId));

        const orders = await step.run('bootstrap-plan', async () => planNavigatorOrders(
            userId, nav.accountId, inputs,
            claimed && accountEmpty ? MAX_POSITIONS : undefined,
        ));
        if (!orders) return {success: false, message: 'AI account missing'};

        const executed = claimed
            ? await executeNavigatorPlan(step, {userId, accountId: nav.accountId, plan: orders, ...inputs, orderStepPrefix: `bootstrap-order-${safeId}`, weekKey})
            : previewNavigatorPlan({plan: orders, ...inputs});

        const saved = await step.run('bootstrap-save-suggestions', async () => {
            if (!claimed) return savePreviewDecisions(userId, today, executed);
            await saveDecisions(userId, today, executed, 'executed');
            return true;
        });
        if (!saved) {
            return {success: true, message: 'Preview skipped: today already has executed decisions'};
        }

        await writeRationale(step, {
            userId,
            today,
            items: executed,
            stepIds: {narratives: 'bootstrap-narratives', infer: 'bootstrap-rationale', save: 'bootstrap-save-rationale'},
        });

        const summary = claimed
            ? `Run traded ${executed.filter((i) => i.executed).length} order(s)`
            : 'Preview saved (nothing traded)';
        await step.run('record-job-run', async () => recordJobRun(JOBS.navigatorBootstrap.id, summary));
        return {success: true, message: `${summary} for ${userId}`};
    },
)
