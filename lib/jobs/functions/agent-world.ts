// The trading agent world's weekly session (lib/agent-world; docs/specs/2026-10-27-trading-agent-world.md):
// open the session, have the service run the desk over the week's symbols, wait for it (the
// service streams every step to /api/agent-world/events meanwhile), turn the ratings into orders
// by code, wait for the owner's decision (or approve automatically), then fill at the open.
//
// Every request to Vercel is capped at 60 s, so the run is never held inside a step: the service
// answers POST /runs at once and works in the background, and the function waits in rounds of
// step.waitForEvent with a Mongo read between them — a lost wake-up costs one round, never the
// session. Mongo is the truth throughout; Inngest events only wake the function. Paperclip is told
// everything best-effort (lib/agent-world/company.ts) and never stops a session.

import {inngest} from "@/lib/jobs/client";
import {recordJobRun} from "@/lib/jobs/job-runs";
import {JOBS, triggersOf} from "@/lib/jobs/registry";
import {stepId} from "@/lib/jobs/steps";
import {AGENT_WORLD_EVENTS, AGENT_WORLD_OWNER_ID, SESSION_WAIT_ROUND_MINUTES, SESSION_WAIT_ROUNDS, type Rating} from "@/lib/agent-world/config";
import {
    issueNoOrders,
    issueOnFailure,
    issueOnFills,
    issueOnLapse,
    openSessionIssue,
    paperclipAgentIds,
} from "@/lib/agent-world/company";
import {agentWorldCallbackUrl, agentWorldEnv, agentWorldOff, agentWorldService, agentWorldUniverse, approvalMode, paperclipSettings} from "@/lib/agent-world/env";
import {agentWorldDay, describeRun, lapseDeadline, runRequestBody, type RunStamp} from "@/lib/agent-world/job";
import {agentWorldOrders, orderRequest} from "@/lib/agent-world/orders";
import {signedHeaders} from "@/lib/agent-world/signing";
import {
    autoApprove,
    completeSession,
    ensureAgentWorldAccount,
    failSession,
    getSession,
    lapseSession,
    loadDeskBook,
    openSession,
    recordFills,
    saveOrders,
    setAwaitingApproval,
    setSessionNote,
} from "@/lib/agent-world/store";
import type {SessionFill} from "@/lib/agent-world/types";
import {reportLimit} from "@/lib/limits/report";
import {marketStatus} from "@/lib/prices/market-hours";
import {quoteMissed} from "@/lib/strategies/job";
import {executeOrder, FUNDING_SELL_FAILED} from "@/lib/trading/orders";

const SESSION_FINISHED_EVENT = AGENT_WORLD_EVENTS.finished;
const SESSION_DECIDED_EVENT = AGENT_WORLD_EVENTS.decided;

const QUOTE_RETRY_DELAY = '15s';
const START_TIMEOUT_MS = 10_000;
// A fill waits a minute past the bell, so the open's first quotes are there to fill at.
const AFTER_OPEN_MS = 60_000;

const JOB_ID = JOBS.agentWorldWeekly.id;

// The service's answer to POST /runs: 202 (queued) or 200 (already known: a replayed step).
type StartResult = {ok: true} | {ok: false; status: number; message: string};

const startRun = async (url: string, secret: string, body: string): Promise<StartResult> => {
    try {
        const response = await fetch(`${url}/runs`, {method: 'POST', headers: signedHeaders(secret, body, Date.now()), body, signal: AbortSignal.timeout(START_TIMEOUT_MS)});
        if (response.status === 202 || response.status === 200) return {ok: true};
        const message = (await response.text().catch(() => '')).slice(0, 200);
        await reportLimit('agent-world', {status: response.status, message: `runs: ${message}`}, JOB_ID);
        return {ok: false, status: response.status, message};
    } catch (error) {
        const message = `unreachable (${(error as Error).message ?? 'no answer'})`;
        await reportLimit('agent-world', {message: `runs: ${message}`}, JOB_ID);
        return {ok: false, status: 0, message};
    }
};

export const runAgentWorldWeekly = inngest.createFunction(
    {id: JOB_ID, triggers: triggersOf(JOBS.agentWorldWeekly), concurrency: [{limit: 1}]},
    async ({event, step}) => {
        const nowMs = typeof event.ts === 'number' ? event.ts : Date.now();
        const day = agentWorldDay(event.data, new Date(nowMs));
        const env = agentWorldEnv();
        const sid = day.sessionId;
        const stamp = async (id: string, value: RunStamp) => {
            const message = describeRun(value);
            await step.run(id, async () => recordJobRun(JOB_ID, message));
            return message;
        };

        const off = agentWorldOff();
        if (off) return {success: false, message: await stamp('record-job-run', {outcome: 'off', reason: off})};
        if (day.kind === 'weekly' && !day.tradingDay) {
            return {success: true, message: await stamp('record-job-run', {outcome: 'holiday', weekKey: day.weekKey, today: day.today})};
        }

        const mode = approvalMode();
        const symbols = agentWorldUniverse();
        const lapseAt = day.dryRun ? null : lapseDeadline(nowMs);
        const account = await step.run('ensure-account', async () => ensureAgentWorldAccount(env));
        const opened = await step.run('open-session', async () => openSession({
            env,
            sessionId: sid,
            kind: day.kind,
            weekKey: day.weekKey,
            tradeDate: day.today,
            approval: mode,
            source: day.source,
            requestedBy: day.by,
            accountId: account.accountId,
            symbols,
            lapseAt,
        }));
        if (!opened.ok) {
            // The Tuesday cron after a Monday that ran leaves Monday's stamp standing.
            if (opened.reason === 'already') return {success: true, message: `already ran: ${sid}`};
            return {success: false, message: await stamp('record-job-run', {outcome: 'live', sessionId: sid, liveSessionId: opened.sessionId})};
        }

        const book = await step.run('load-book', async () => loadDeskBook(account.accountId, symbols));
        if (!book) {
            await step.run('fail-account', async () => failSession(env, sid, 'error', 'the desk account could not be read'));
            return {success: false, message: await stamp('record-job-run', {outcome: 'service-failed', sessionId: sid, reason: 'error', message: 'the desk account could not be read'})};
        }

        // The company: the role agents' ids (each role reports its own cost) and the session's issue.
        const company = paperclipSettings() !== null;
        const agentIds = company ? await step.run('paperclip-agents', async () => paperclipAgentIds()) : {ids: {}, note: null};
        const issue = company && !day.dryRun
            ? await step.run('paperclip-open-issue', async () => openSessionIssue(env, {sessionId: sid, kind: day.kind, weekKey: day.weekKey, today: day.today, symbols, approval: mode, agentIds: agentIds.ids}))
            : {issueId: null};

        const service = agentWorldService();
        const started = await step.run('start-run', async () => {
            if (!service) return {ok: false, status: 0, message: 'no service configured'} satisfies StartResult;
            const body = runRequestBody({
                day,
                symbols,
                book,
                callbackUrl: agentWorldCallbackUrl(),
                approval: mode,
                paperclip: company ? {issueId: issue.issueId, runId: day.paperclip?.runId ?? null, agentIds: agentIds.ids} : null,
            });
            return startRun(service.url, service.secret, body);
        });
        if (!started.ok) {
            const message = `HTTP ${started.status} ${started.message}`.trim();
            await step.run('fail-refused', async () => failSession(env, sid, 'refused', message));
            if (issue.issueId) await step.run('paperclip-refused', async () => issueOnFailure(issue.issueId, message));
            return {success: false, message: await stamp('record-job-run', {outcome: 'refused', sessionId: sid, status: started.status, message: started.message})};
        }

        // The desk runs for a quarter of an hour or so; the events route wakes this with
        // SESSION_FINISHED_EVENT, and a read of the session between rounds catches a wake-up lost.
        let finished: 'completed' | 'failed' | null = null;
        for (let round = 0; round < SESSION_WAIT_ROUNDS && finished === null; round++) {
            const wake = await step.waitForEvent(`wait-session-${round}`, {
                event: SESSION_FINISHED_EVENT,
                if: `async.data.sessionId == "${sid}"`,
                timeout: `${SESSION_WAIT_ROUND_MINUTES}m`,
            });
            if (wake) {
                finished = (wake.data as {outcome?: unknown}).outcome === 'failed' ? 'failed' : 'completed';
                break;
            }
            finished = await step.run(`peek-session-${round}`, async () => {
                const session = await getSession(env, sid);
                if (!session || session.status === 'failed') return 'failed' as const;
                return session.serviceFinishedAt !== null ? 'completed' as const : null;
            });
        }
        if (finished === null) {
            await step.run('fail-no-answer', async () => failSession(env, sid, 'no-answer', `no answer from the service in ${SESSION_WAIT_ROUNDS * SESSION_WAIT_ROUND_MINUTES} minutes`));
            if (issue.issueId) await step.run('paperclip-no-answer', async () => issueOnFailure(issue.issueId, 'no answer from the service'));
            return {success: false, message: await stamp('record-job-run', {outcome: 'no-answer', sessionId: sid})};
        }
        if (finished === 'failed') {
            const failure = await step.run('read-failure', async () => (await getSession(env, sid))?.service ?? {outcome: 'error', message: 'the service reported a failure'});
            if (issue.issueId) await step.run('paperclip-failed', async () => issueOnFailure(issue.issueId, `${failure.outcome}: ${failure.message}`));
            return {success: false, message: await stamp('record-job-run', {outcome: 'service-failed', sessionId: sid, reason: failure.outcome, message: failure.message})};
        }

        // The ratings, and the orders code makes of them at the prices of now. A symbol whose run
        // never completed counts as REVIEW: nothing is traded on it.
        const ratings = await step.run('load-ratings', async () => {
            const session = await getSession(env, sid);
            const out: Record<string, Rating> = {};
            for (const symbol of symbols) {
                const run = session?.runs.find((r) => r.symbol === symbol);
                out[symbol] = run?.status === 'completed' && run.rating ? run.rating : 'REVIEW';
            }
            return out;
        });
        const plan = await step.run('plan-orders', async () => {
            const now = await loadDeskBook(account.accountId, symbols);
            const {orders} = agentWorldOrders({book: now ?? book, ratings});
            await saveOrders(env, sid, orders);
            return {orders, totalValue: (now ?? book).totalValue};
        });

        if (day.dryRun) {
            await step.run('complete-preview', async () => completeSession(env, sid));
            return {success: true, message: await stamp('record-job-run', {outcome: 'preview', sessionId: sid, ratings, orders: plan.orders.length})};
        }
        if (plan.orders.length === 0) {
            await step.run('complete-no-orders', async () => completeSession(env, sid));
            if (issue.issueId) await step.run('paperclip-no-orders', async () => issueNoOrders(issue.issueId, mode));
            return {success: true, message: await stamp('record-job-run', {outcome: 'no-orders', sessionId: sid, ratings})};
        }

        // The decision: the owner's, on the page, until the lapse; or automatic.
        const deadline = lapseAt ?? lapseDeadline(nowMs);
        if (mode === 'owner') {
            await step.run('await-approval', async () => setAwaitingApproval(env, sid, deadline));
            await stamp('record-job-run-awaiting', {outcome: 'awaiting', sessionId: sid, ratings, orders: plan.orders.length, lapseAt: deadline});
            await step.waitForEvent('wait-decision', {event: SESSION_DECIDED_EVENT, if: `async.data.sessionId == "${sid}"`, timeout: new Date(deadline)});
        } else {
            await step.run('auto-approve', async () => autoApprove(env, sid));
        }
        // Mongo is read whatever woke the function: a decision whose wake-up was lost still stands.
        const decided = await step.run('read-decision', async () => {
            const session = await getSession(env, sid);
            return {status: session?.status ?? null, by: session?.decision?.by ?? null, mirrored: session?.paperclip.mirrored ?? null};
        });
        if (decided.status === 'declined') {
            return {success: true, message: await stamp('record-job-run', {outcome: 'declined', sessionId: sid})};
        }
        if (decided.status !== 'approved') {
            await step.run('lapse', async () => lapseSession(env, sid));
            if (issue.issueId) await step.run('paperclip-lapsed', async () => issueOnLapse(issue.issueId));
            return {success: true, message: await stamp('record-job-run', {outcome: 'lapsed', sessionId: sid, at: deadline})};
        }

        // Fills only in the session (a manual run with `force` fills at once). An approval after the
        // last open before the deadline lapses instead: a week's orders never outlive the week.
        const market = await step.run('market-check', async () => {
            const status = marketStatus(new Date());
            return {open: status.state === 'open', nextOpen: status.nextOpen};
        });
        if (!market.open && !day.force) {
            if (market.nextOpen === null || market.nextOpen > deadline) {
                await step.run('lapse-closed', async () => lapseSession(env, sid));
                if (issue.issueId) await step.run('paperclip-lapsed-closed', async () => issueOnLapse(issue.issueId));
                return {success: true, message: await stamp('record-job-run', {outcome: 'lapsed', sessionId: sid, at: deadline})};
            }
            await step.run('note-waiting-open', async () => setSessionNote(env, sid, `approved; waiting for the open at ${new Date(market.nextOpen as number).toISOString()}`));
            await step.sleepUntil('sleep-until-open', new Date(market.nextOpen + AFTER_OPEN_MS));
        }

        const fills: SessionFill[] = [];
        let sellFailed = false;
        for (const order of plan.orders) {
            if (sellFailed && order.side === 'buy') {
                // The plan funded buys with sell proceeds; without them a buy could drain cash through the floor.
                fills.push({symbol: order.symbol, side: order.side, quantity: order.quantity, executed: false, price: null, message: FUNDING_SELL_FAILED, at: Date.now()});
                continue;
            }
            const request = orderRequest(sid, account.accountId, order, plan.totalValue);
            const execute = async () => ({...(await executeOrder(AGENT_WORLD_OWNER_ID, request)), at: Date.now()});
            let result = await step.run(stepId(`execute-${order.side}-${order.symbol}`), execute);
            if (quoteMissed(result)) {
                await step.sleep(stepId(`quote-retry-${order.symbol}`), QUOTE_RETRY_DELAY);
                result = await step.run(stepId(`execute-again-${order.side}-${order.symbol}`), execute);
            }
            if (order.side === 'sell' && !result.success) sellFailed = true;
            fills.push({
                symbol: order.symbol,
                side: order.side,
                quantity: order.quantity,
                executed: result.success,
                price: result.success && typeof result.price === 'number' ? result.price : null,
                message: result.success ? null : result.message ?? 'not filled',
                at: result.at,
            });
        }
        await step.run('record-fills', async () => recordFills(env, sid, fills));
        if (issue.issueId) await step.run('paperclip-fills', async () => issueOnFills(issue.issueId, fills));
        const filled = fills.filter((fill) => fill.executed).length;
        return {
            success: true,
            message: await stamp('record-job-run', {
                outcome: 'executed',
                sessionId: sid,
                auto: decided.by === 'auto',
                orders: fills.length,
                filled,
                firstFailure: fills.find((fill) => !fill.executed)?.message ?? null,
                mirrored: decided.mirrored,
            }),
        };
    },
);
