// The Paperclip client: Paperclip's own response shapes (as a local v2026.1023.0 answered them)
// read into the app's types, the run every agent write must name, the approval stage's decisions,
// and every failure an answer — a 409 or a 422 is Paperclip's answer, a 429, a 5xx, a network
// failure or a timeout is filed with the limits tracker.

import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest';

vi.mock('@/lib/limits/report', () => ({reportLimit: vi.fn(async () => null)}));

import {reportLimit} from '@/lib/limits/report';
import {createPaperclipClient, PAPERCLIP_TIMEOUT_MS, type ExecutionPolicy} from '@/lib/agent-world/paperclip';
import type {PaperclipSettings} from '@/lib/agent-world/env';

const SETTINGS: PaperclipSettings = {url: 'https://paperclip.test', apiKey: 'pcp_desk', companyId: 'co-1', boardUrl: 'https://paperclip.test'};
const DESK = 'desk-1';
const HEAD = 'head-1';

type Call = {method: string; path: string; headers: Record<string, string>; body: Record<string, unknown> | null};
type Reply = {status: number; body: unknown};

const json = (status: number, body: unknown): Reply => ({status, body});

// A fake Paperclip: each handler answers one "METHOD /path" (query included); anything else is 404.
const fake = (routes: Record<string, Reply | ((call: Call) => Reply)>) => {
    const calls: Call[] = [];
    const fetchImpl = (async (url: string | URL | Request, init?: RequestInit) => {
        const parsed = new URL(String(url));
        const call: Call = {
            method: init?.method ?? 'GET',
            path: `${parsed.pathname}${parsed.search}`,
            headers: (init?.headers ?? {}) as Record<string, string>,
            body: init?.body ? JSON.parse(String(init.body)) : null,
        };
        calls.push(call);
        const route = routes[`${call.method} ${call.path}`];
        const reply = typeof route === 'function' ? route(call) : route ?? json(404, {error: 'Not found'});
        return new Response(JSON.stringify(reply.body), {status: reply.status, headers: {'Content-Type': 'application/json'}});
    }) as unknown as typeof fetch;
    return {calls, client: createPaperclipClient(SETTINGS, fetchImpl)};
};

// Shapes as Paperclip sends them, extra fields and all.
const issueRow = (extra: Record<string, unknown> = {}) => ({
    id: 'issue-1', companyId: 'co-1', identifier: 'TRA-7', title: 'Week of 2026-10-26: 3 symbols', status: 'backlog', priority: 'medium',
    assigneeAgentId: HEAD, executionPolicy: null, executionState: null, labels: [], blockedBy: [], ...extra,
});
const pending = (participant = DESK) => ({
    status: 'pending', monitor: null, currentStageId: 'stage-1', currentStageIndex: 0, currentStageType: 'approval',
    currentParticipant: {type: 'agent', userId: null, agentId: participant},
    returnAssignee: {type: 'agent', userId: null, agentId: HEAD}, completedStageIds: [], lastDecisionId: null, lastDecisionOutcome: null, changesRequestedCount: 0,
});
const completed = () => ({...pending(), status: 'completed', currentStageId: null, currentParticipant: null, lastDecisionId: 'd-1', lastDecisionOutcome: 'approved', completedStageIds: ['stage-1']});
const ME = {'GET /api/agents/me': json(200, {id: DESK, name: 'Execution desk', role: 'general', status: 'idle', budgetMonthlyCents: 100, spentMonthlyCents: 0})};
const ISSUE_RUNS = (rows: unknown[]) => ({'GET /api/issues/issue-1/runs': json(200, rows)});

beforeEach(() => vi.mocked(reportLimit).mockClear());
afterEach(() => vi.useRealTimers());

describe('createPaperclipClient: reads', () => {
    it('answers every call unconfigured without a request when settings are missing', async () => {
        let requests = 0;
        const client = createPaperclipClient(null, (async () => { requests += 1; return new Response('{}'); }) as unknown as typeof fetch);
        const answers = await Promise.all([
            client.company(), client.agents(), client.issue('x'), client.comment('x', 'y'), client.decide('x', 'approved', 'y'),
            client.setStatus('x', 'blocked', 'y'), client.costsByAgent(), client.dashboard(), client.activity(),
            client.createIssue({title: 't', description: 'd', assigneeAgentId: HEAD, executionPolicy: null}),
        ]);
        for (const answer of answers) expect(answer).toEqual({ok: false, reason: 'unconfigured', status: 0, message: 'Paperclip is not configured'});
        expect(requests).toBe(0);
    });

    it('reads the company and its agents with the bearer key, keeping only what the page needs', async () => {
        const {calls, client} = fake({
            'GET /api/companies/co-1': json(200, {id: 'co-1', name: 'Trading agent world', issuePrefix: 'TRA', status: 'active', budgetMonthlyCents: 3000, spentMonthlyCents: 10.67}),
            'GET /api/companies/co-1/agents': json(200, [
                {id: 'a1', name: 'Market analyst', role: 'researcher', title: 'Market analyst', status: 'idle', reportsTo: 'rm', budgetMonthlyCents: 200, spentMonthlyCents: 3.5,
                    adapterType: 'http', adapterConfig: {url: 'https://svc/paperclip/heartbeat', headers: {'X-Agent-World-Heartbeat': 'secret'}}},
                {id: 'h', name: 'Head trader', role: 'general', status: 'paused', pauseReason: 'budget', budgetMonthlyCents: 500, spentMonthlyCents: '501.5000000'},
            ]),
        });
        expect(await client.company()).toEqual({ok: true, data: {id: 'co-1', name: 'Trading agent world', budgetMonthlyCents: 3000}});
        const agents = await client.agents();
        expect(agents).toEqual({ok: true, data: [
            {id: 'a1', name: 'Market analyst', role: 'researcher', title: 'Market analyst', status: 'idle', reportsTo: 'rm', budgetMonthlyCents: 200, spentMonthlyCents: 3.5},
            {id: 'h', name: 'Head trader', role: 'general', title: null, status: 'paused', reportsTo: null, budgetMonthlyCents: 500, spentMonthlyCents: 501.5},
        ]});
        expect(JSON.stringify(agents)).not.toContain('secret');
        expect(calls[0]).toMatchObject({method: 'GET', path: '/api/companies/co-1'});
        expect(calls[0].headers).toMatchObject({Authorization: 'Bearer pcp_desk'});
        expect(calls[0].headers['X-Paperclip-Run-Id']).toBeUndefined();
    });

    it('reads costs by agent, the dashboard and the activity log', async () => {
        const {calls, client} = fake({
            'GET /api/companies/co-1/costs/by-agent': json(200, [
                {agentId: 'a1', agentName: 'Market analyst', eventCount: 2, costCents: 3.5, costCentsExact: '3.5000000', inputTokens: 24000, cachedInputTokens: 0, outputTokens: 1600},
                {agentId: 'a2', costCentsExact: '0.3700000', inputTokens: 12000, outputTokens: 800},
            ]),
            'GET /api/companies/co-1/dashboard': json(200, {
                companyId: 'co-1', agents: {active: 14, running: 0, paused: 0, error: 0}, tasks: {open: 3, inProgress: 0, blocked: 3, done: 1},
                costs: {monthSpendCents: 4.07, monthBudgetCents: 3000, monthUtilizationPercent: 0.14}, pendingApprovals: 0,
                budgets: {activeIncidents: 0}, runActivity: [{date: '2026-10-27', total: 18}],
            }),
            'GET /api/companies/co-1/activity?limit=5': json(200, [
                {id: 'e1', actorType: 'agent', actorId: 'a1', action: 'cost.reported', entityType: 'cost_event', entityId: 'c1', details: {model: 'gemini-2.5-flash-lite', costCents: 1.5}, createdAt: '2026-10-27T15:43:42.900Z'},
                {id: 'e2', actorType: 'user', actorId: 'local-board', action: 'issue.updated', entityType: 'issue', entityId: 'issue-1', details: {identifier: 'TRA-7', status: 'in_review'}, createdAt: '2026-10-27T15:36:10.825Z'},
                {id: 'e3', actorType: 'system', actorId: 'system', action: 'budget.hard_threshold_crossed', entityType: 'budget_incident', entityId: 'b1', details: null, createdAt: '2026-10-27T15:29:31.089Z'},
            ]),
        });
        expect(await client.costsByAgent()).toEqual({ok: true, data: [
            {agentId: 'a1', costCents: 3.5, inputTokens: 24000, outputTokens: 1600},
            {agentId: 'a2', costCents: 0.37, inputTokens: 12000, outputTokens: 800},
        ]});
        expect(await client.dashboard()).toEqual({ok: true, data: {
            monthSpendCents: 4.07, monthBudgetCents: 3000, monthUtilizationPercent: 0.14,
            agents: {active: 14, running: 0, paused: 0, error: 0}, tasks: {open: 3, inProgress: 0, blocked: 3, done: 1}, pendingApprovals: 0,
        }});
        expect(await client.activity(5)).toEqual({ok: true, data: [
            {at: Date.parse('2026-10-27T15:43:42.900Z'), actor: 'a1', action: 'cost.reported', entityType: 'cost_event', entityId: 'c1', details: 'gemini-2.5-flash-lite · 1.5¢'},
            {at: Date.parse('2026-10-27T15:36:10.825Z'), actor: 'board', action: 'issue.updated', entityType: 'issue', entityId: 'issue-1', details: 'TRA-7 · in_review'},
            {at: Date.parse('2026-10-27T15:29:31.089Z'), actor: 'system', action: 'budget.hard_threshold_crossed', entityType: 'budget_incident', entityId: 'b1', details: null},
        ]});
        await client.activity(500);
        expect(calls.at(-1)?.path).toBe('/api/companies/co-1/activity?limit=100');
    });
});

describe('createPaperclipClient: the session issue', () => {
    const policy: ExecutionPolicy = {mode: 'normal', commentRequired: true, stages: [{type: 'approval', approvalsNeeded: 1, participants: [{type: 'agent', agentId: DESK}]}]};

    it('opens the issue in backlog for the Head trader, with the approval stage when there is one', async () => {
        const {calls, client} = fake({
            'POST /api/companies/co-1/issues': (call) => json(201, issueRow({title: call.body?.title, executionPolicy: call.body?.executionPolicy ?? null})),
        });
        const opened = await client.createIssue({title: 'Week of 2026-10-26: 3 symbols', description: 'd', assigneeAgentId: HEAD, executionPolicy: policy, idempotencyKey: 'aw-2026-10-26'});
        expect(opened).toEqual({ok: true, data: {id: 'issue-1', identifier: 'TRA-7', title: 'Week of 2026-10-26: 3 symbols', status: 'backlog', assigneeAgentId: HEAD, executionState: null}});
        expect(calls[0].body).toEqual({title: 'Week of 2026-10-26: 3 symbols', description: 'd', status: 'backlog', assigneeAgentId: HEAD, allowDuplicate: true, idempotencyKey: 'aw-2026-10-26', executionPolicy: policy});
        await client.createIssue({title: 't', description: 'd', assigneeAgentId: HEAD, executionPolicy: null});
        expect(calls[1].body).toEqual({title: 't', description: 'd', status: 'backlog', assigneeAgentId: HEAD, allowDuplicate: true});
    });

    it('takes the issue Paperclip answers a replayed create with', async () => {
        const {client} = fake({'POST /api/companies/co-1/issues': json(200, issueRow({deduplicated: true, deduplicationReason: 'idempotency_key'}))});
        expect(await client.createIssue({title: 't', description: 'd', assigneeAgentId: HEAD, executionPolicy: null, idempotencyKey: 'aw-2026-10-26'}))
            .toMatchObject({ok: true, data: {id: 'issue-1', identifier: 'TRA-7'}});
    });

    it('reads a pending stage and who it waits for', async () => {
        const {client} = fake({'GET /api/issues/issue-1': json(200, issueRow({status: 'blocked', assigneeAgentId: DESK, executionState: pending()}))});
        expect(await client.issue('issue-1')).toEqual({ok: true, data: {
            id: 'issue-1', identifier: 'TRA-7', title: 'Week of 2026-10-26: 3 symbols', status: 'blocked', assigneeAgentId: DESK,
            executionState: {status: 'pending', participantAgentId: DESK, lastDecisionOutcome: null},
        }});
    });

    it('comments with the run the desk already has on the issue', async () => {
        const {calls, client} = fake({
            ...ME,
            'GET /api/issues/issue-1': json(200, issueRow({status: 'done', assigneeAgentId: DESK, executionState: completed()})),
            ...ISSUE_RUNS([
                {runId: 'run-old', agentId: DESK, status: 'succeeded', createdAt: '2026-10-27T15:36:11.000Z'},
                {runId: 'run-cancelled', agentId: DESK, status: 'cancelled', createdAt: '2026-10-27T15:50:00.000Z'},
                {runId: 'run-new', agentId: DESK, status: 'succeeded', createdAt: '2026-10-27T15:40:00.000Z'},
                {runId: 'run-head', agentId: HEAD, status: 'running', createdAt: '2026-10-27T15:59:00.000Z'},
            ]),
            'POST /api/issues/issue-1/comments': json(201, {id: 'comment-1', body: 'x', authorAgentId: DESK}),
        });
        expect(await client.comment('issue-1', 'The paper account bought 10 AAPL at $150.00.')).toEqual({ok: true, data: {id: 'comment-1'}});
        const posted = calls.find((call) => call.method === 'POST')!;
        expect(posted.body).toEqual({body: 'The paper account bought 10 AAPL at $150.00.'});
        expect(posted.headers['X-Paperclip-Run-Id']).toBe('run-new');
    });

    it('asks Paperclip for a run on an open issue the desk holds when it has none there', async () => {
        const {calls, client} = fake({
            ...ME,
            'GET /api/issues/issue-1': json(200, issueRow({status: 'blocked', assigneeAgentId: DESK, executionState: pending()})),
            ...ISSUE_RUNS([]),
            'POST /api/agents/desk-1/heartbeat/invoke': json(202, {id: 'run-minted', status: 'queued', agentId: DESK, contextSnapshot: {issueId: 'issue-1'}}),
            'POST /api/issues/issue-1/comments': json(201, {id: 'comment-2'}),
        });
        expect((await client.comment('issue-1', 'note')).ok).toBe(true);
        expect(calls.find((call) => call.path.endsWith('/heartbeat/invoke'))?.body).toEqual({reason: 'agent-world', payload: {issueId: 'issue-1'}});
        expect(calls.at(-1)?.headers['X-Paperclip-Run-Id']).toBe('run-minted');
    });

    it('uses its newest run on another issue for an issue the Head trader holds, asking for none', async () => {
        const {calls, client} = fake({
            ...ME,
            ...ISSUE_RUNS([]),
            'GET /api/issues/issue-1': json(200, issueRow({status: 'backlog', assigneeAgentId: HEAD})),
            'GET /api/companies/co-1/heartbeat-runs?agentId=desk-1&limit=20': json(200, [
                {id: 'run-no-issue', agentId: DESK, status: 'succeeded', createdAt: '2026-10-27T16:00:00.000Z', contextSnapshot: {wakeReason: 'probe'}},
                {id: 'run-other', agentId: DESK, status: 'succeeded', createdAt: '2026-10-27T15:00:00.000Z', contextSnapshot: {issueId: 'issue-0', taskId: 'issue-0'}},
            ]),
            'POST /api/issues/issue-1/comments': json(201, {id: 'comment-3'}),
        });
        expect((await client.comment('issue-1', 'note')).ok).toBe(true);
        expect(calls.at(-1)?.headers['X-Paperclip-Run-Id']).toBe('run-other');
        expect(calls.some((call) => call.path.endsWith('/heartbeat/invoke'))).toBe(false);
    });

    it('falls back the same way when Paperclip will not start a run on the desk\'s own issue', async () => {
        const {calls, client} = fake({
            ...ME,
            ...ISSUE_RUNS([]),
            'GET /api/issues/issue-1': json(200, issueRow({status: 'blocked', assigneeAgentId: DESK, executionState: pending()})),
            'POST /api/agents/desk-1/heartbeat/invoke': json(202, {status: 'skipped'}),
            'GET /api/companies/co-1/heartbeat-runs?agentId=desk-1&limit=20': json(200, [{id: 'run-other', agentId: DESK, status: 'succeeded', createdAt: '2026-10-27T15:00:00.000Z', contextSnapshot: {issueId: 'issue-0'}}]),
            'POST /api/issues/issue-1/comments': json(201, {id: 'comment-4'}),
        });
        expect((await client.comment('issue-1', 'note')).ok).toBe(true);
        expect(calls.at(-1)?.headers['X-Paperclip-Run-Id']).toBe('run-other');
    });

    it('refuses a write it has no run to attribute to, without sending it', async () => {
        const {calls, client} = fake({
            ...ME,
            ...ISSUE_RUNS([]),
            'GET /api/issues/issue-1': json(200, issueRow({status: 'blocked', assigneeAgentId: DESK, executionState: pending()})),
            'POST /api/agents/desk-1/heartbeat/invoke': json(409, {error: 'Company cannot start work while completed runs await accounting.'}),
            'GET /api/companies/co-1/heartbeat-runs?agentId=desk-1&limit=20': json(200, []),
        });
        expect(await client.comment('issue-1', 'note')).toEqual({ok: false, reason: 'refused', status: 403, message: 'no heartbeat run of this agent to attribute the write to'});
        expect(calls.some((call) => call.path.endsWith('/comments'))).toBe(false);
        expect(reportLimit).not.toHaveBeenCalled();
    });
});

describe('createPaperclipClient: decisions', () => {
    const decisionRoutes = (issue: Record<string, unknown>, onPatch: (call: Call) => Reply) => ({
        ...ME,
        ...ISSUE_RUNS(issue.assigneeAgentId === DESK ? [{runId: 'run-wake', agentId: DESK, status: 'succeeded', createdAt: '2026-10-27T15:36:11.000Z'}] : []),
        'GET /api/companies/co-1/heartbeat-runs?agentId=desk-1&limit=20': json(200, [{id: 'run-elsewhere', agentId: DESK, status: 'succeeded', createdAt: '2026-10-27T15:00:00.000Z', contextSnapshot: {issueId: 'issue-0'}}]),
        'GET /api/issues/issue-1': json(200, issueRow(issue)),
        'PATCH /api/issues/issue-1': onPatch,
    });

    it('approves a stage that waits for the desk: done with the comment, under its run', async () => {
        const {calls, client} = fake(decisionRoutes({status: 'blocked', assigneeAgentId: DESK, executionState: pending()}, () =>
            json(200, issueRow({status: 'done', assigneeAgentId: DESK, executionState: completed(), changes: {status: {from: 'blocked', to: 'done'}}, comment: {id: 'c'}}))));
        const decided = await client.decide('issue-1', 'approved', 'Approved by owner@example.com on AeroTrade.');
        expect(decided).toEqual({ok: true, data: expect.objectContaining({status: 'done', executionState: {status: 'completed', participantAgentId: null, lastDecisionOutcome: 'approved'}})});
        const patches = calls.filter((call) => call.method === 'PATCH');
        expect(patches).toHaveLength(1);
        expect(patches[0].body).toEqual({status: 'done', comment: 'Approved by owner@example.com on AeroTrade.'});
        expect(patches[0].headers['X-Paperclip-Run-Id']).toBe('run-wake');
    });

    it('declines a stage by sending the issue back: in_progress with the comment', async () => {
        const {calls, client} = fake(decisionRoutes({status: 'in_review', assigneeAgentId: DESK, executionState: pending()}, () =>
            json(200, issueRow({status: 'in_progress', assigneeAgentId: HEAD, executionState: {...pending(), status: 'changes_requested', lastDecisionOutcome: 'changes_requested'}}))));
        const decided = await client.decide('issue-1', 'declined', 'Declined by owner@example.com on AeroTrade, so nothing was traded.');
        expect(decided.ok && decided.data.executionState).toEqual({status: 'changes_requested', participantAgentId: DESK, lastDecisionOutcome: 'changes_requested'});
        expect(calls.find((call) => call.method === 'PATCH')?.body).toEqual({status: 'in_progress', comment: 'Declined by owner@example.com on AeroTrade, so nothing was traded.'});
    });

    it('hands in an issue the Head trader never handed in, then approves it', async () => {
        let handedIn = false;
        const {calls, client} = fake(decisionRoutes({status: 'backlog', assigneeAgentId: HEAD, executionState: null}, () => {
            const reply = handedIn
                ? json(200, issueRow({status: 'done', assigneeAgentId: DESK, executionState: completed()}))
                : json(200, issueRow({status: 'in_review', assigneeAgentId: DESK, executionState: pending()}));
            handedIn = true;
            return reply;
        }));
        const decided = await client.decide('issue-1', 'approved', 'Approved by owner@example.com on AeroTrade.');
        expect(decided.ok && decided.data.status).toBe('done');
        const patches = calls.filter((call) => call.method === 'PATCH');
        expect(patches.map((call) => call.body?.status)).toEqual(['done', 'done']);
        expect(patches.map((call) => call.headers['X-Paperclip-Run-Id'])).toEqual(['run-elsewhere', 'run-elsewhere']);
        expect(calls.some((call) => call.path.endsWith('/heartbeat/invoke'))).toBe(false);
    });

    it('cancels an issue the Head trader never handed in when the owner declines', async () => {
        const {calls, client} = fake(decisionRoutes({status: 'backlog', assigneeAgentId: HEAD, executionState: null}, () =>
            json(200, issueRow({status: 'cancelled'}))));
        expect((await client.decide('issue-1', 'declined', 'Declined.')).ok).toBe(true);
        expect(calls.find((call) => call.method === 'PATCH')?.body).toEqual({status: 'cancelled', comment: 'Declined.'});
    });

    it('answers a decision already on the issue as it stands, and refuses one it cannot make', async () => {
        const done = fake(decisionRoutes({status: 'done', assigneeAgentId: DESK, executionState: completed()}, () => json(500, {})));
        expect((await done.client.decide('issue-1', 'approved', 'again')).ok).toBe(true);
        expect(done.calls.some((call) => call.method === 'PATCH')).toBe(false);
        expect(await done.client.decide('issue-1', 'declined', 'too late')).toEqual({ok: false, reason: 'refused', status: 409, message: 'the issue is already done'});
        const elsewhere = fake(decisionRoutes({status: 'in_review', assigneeAgentId: 'someone', executionState: pending('someone')}, () => json(500, {})));
        expect(await elsewhere.client.decide('issue-1', 'approved', 'mine?')).toEqual({ok: false, reason: 'refused', status: 422, message: 'the approval stage waits for another participant'});
    });

    it('takes a 409 or a 422 as an answer, never a limit', async () => {
        const conflict = fake(decisionRoutes({status: 'in_review', assigneeAgentId: DESK, executionState: pending()}, () =>
            json(422, {error: 'Only the active reviewer or approver can advance the current execution stage'})));
        expect(await conflict.client.decide('issue-1', 'approved', 'x')).toEqual({ok: false, reason: 'refused', status: 422, message: 'Only the active reviewer or approver can advance the current execution stage'});
        const checkout = fake({'POST /api/companies/co-1/issues': json(409, {error: 'Cannot assign work to a paused agent. Assign an invokable agent, leave the issue unassigned, or escalate to a board operator instead.'})});
        const refused = await checkout.client.createIssue({title: 't', description: 'd', assigneeAgentId: HEAD, executionPolicy: null});
        expect(refused).toMatchObject({ok: false, reason: 'refused', status: 409});
        expect(reportLimit).not.toHaveBeenCalled();
    });

    it('blocks an issue naming the desk as the one to unblock it, and only comments on a stage that waits for it', async () => {
        const open = fake(decisionRoutes({status: 'backlog', assigneeAgentId: HEAD, executionState: null}, (call) => json(200, issueRow({status: call.body?.status}))));
        expect((await open.client.setStatus('issue-1', 'blocked', 'The session stopped.')).ok).toBe(true);
        expect(open.calls.find((call) => call.method === 'PATCH')?.body).toEqual({
            status: 'blocked', comment: 'The session stopped.', unblockDescriptor: {owner: {agentId: DESK}, action: 'The session stopped.'},
        });
        const waiting = fake({
            ...decisionRoutes({status: 'blocked', assigneeAgentId: DESK, executionState: pending()}, () => json(500, {})),
            'POST /api/issues/issue-1/comments': json(201, {id: 'c-9'}),
        });
        const result = await waiting.client.setStatus('issue-1', 'blocked', 'The session lapsed.');
        expect(result.ok && result.data.status).toBe('blocked');
        expect(waiting.calls.some((call) => call.method === 'PATCH')).toBe(false);
        expect(waiting.calls.find((call) => call.path.endsWith('/comments'))?.body).toEqual({body: 'The session lapsed.'});
    });
});

describe('createPaperclipClient: failures', () => {
    it('files a 429 and a 5xx as unreachable', async () => {
        const busy = fake({'GET /api/companies/co-1': json(429, {error: 'Too many requests'})});
        expect(await busy.client.company()).toEqual({ok: false, reason: 'unreachable', status: 429, message: 'Too many requests'});
        const down = fake({'GET /api/companies/co-1/agents': json(503, {error: 'Service unavailable'})});
        expect(await down.client.agents()).toEqual({ok: false, reason: 'unreachable', status: 503, message: 'Service unavailable'});
        expect(vi.mocked(reportLimit).mock.calls.map(([provider, signal]) => [provider, (signal as {status?: number}).status])).toEqual([['paperclip', 429], ['paperclip', 503]]);
    });

    it('answers a network failure with status 0 and files it', async () => {
        const client = createPaperclipClient(SETTINGS, (async () => { throw new TypeError('fetch failed'); }) as unknown as typeof fetch);
        expect(await client.dashboard()).toEqual({ok: false, reason: 'unreachable', status: 0, message: 'unreachable: fetch failed'});
        expect(reportLimit).toHaveBeenCalledWith('paperclip', {message: 'GET /api/companies/co-1/dashboard: unreachable: fetch failed'});
    });

    it('gives up after five seconds', async () => {
        vi.useFakeTimers();
        const hanging = (async (_url: string | URL | Request, init?: RequestInit) => new Promise<Response>((_resolve, reject) => {
            init?.signal?.addEventListener('abort', () => reject(new DOMException('The operation was aborted.', 'AbortError')));
        })) as unknown as typeof fetch;
        const pendingAnswer = createPaperclipClient(SETTINGS, hanging).company();
        await vi.advanceTimersByTimeAsync(PAPERCLIP_TIMEOUT_MS);
        expect(await pendingAnswer).toEqual({ok: false, reason: 'unreachable', status: 0, message: `timed out after ${PAPERCLIP_TIMEOUT_MS} ms`});
        expect(reportLimit).toHaveBeenCalledTimes(1);
    });

    it('calls a response that does not read as Paperclip\'s unexpected, and a 401 refused', async () => {
        const garbled = fake({'GET /api/companies/co-1': json(200, {nothing: true})});
        expect(await garbled.client.company()).toEqual({ok: false, reason: 'unexpected', status: 200, message: 'unexpected response from GET /api/companies/co-1'});
        const badKey = fake({'GET /api/companies/co-1': json(401, {error: 'Invalid agent token'})});
        expect(await badKey.client.company()).toEqual({ok: false, reason: 'refused', status: 401, message: 'Invalid agent token'});
        expect(reportLimit).not.toHaveBeenCalled();
    });
});
