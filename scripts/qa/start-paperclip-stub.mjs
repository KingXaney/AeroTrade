// A stand-in for the trading agent world's Paperclip company (paperclipai v2026.1023.0), for the
// harness only: run.sh starts it on :8790 and hands the app PAPERCLIP_URL pointing here with the
// Execution desk's key qa-paperclip-key. It is in memory, local_trusted (a request without a key
// acts as the board), seeded as scripts/agent-world-setup.mjs leaves a company, and answers with the
// shapes and rules a real local Paperclip answered with on 2026-10-27:
//
// - Keys: qa-paperclip-key is the Execution desk, qa-head-trader-key the Head trader, qa-role-<id>
//   each role agent. Agent ids are 22222222-2222-4222-8222-0000000000NN (01 Head trader, 02
//   Execution desk, 03-14 the twelve roles in lib/agent-world/config.ts ROLES order).
// - Every comment or issue update by an agent key needs X-Paperclip-Run-Id naming one of that
//   agent's own runs whose context names an issue (403 without; a cancelled run 403; a run on
//   another issue is counted, 429 past 20 writes). Checkout needs one too (401 without, 500 for an
//   id with no run behind it); an in_progress issue takes updates only under a live run (409).
//   Issue creation, cost events and reads need none.
// - An agent gets a run when Paperclip wakes it: an issue created in todo for it (which also checks
//   the issue out to that run), a stage handed to it, a routine run, or POST /api/agents/:id/
//   heartbeat/invoke on itself (payload.issueId sets the run's issue; an issue held by another
//   agent answers {status: 'skipped'}). A wake is POSTed to the agent's adapterConfig.url with its
//   headers; the run is live until that answers, then succeeded or failed, and leaves an unpriced
//   zero-cost event, which pauses the agent and the company under a budget policy that blocks
//   unpriced usage.
// - Creating an issue whose title an open issue of the last 48 hours already has answers that issue
//   (200, deduplicated) unless allowDuplicate is true; an idempotency key replays the issue it made.
// - The execution policy: the executor's done (or anyone's done on an issue nobody handed in) puts
//   the issue in_review for the stage's participant, pending; when the participant's wake ends
//   without a decision Paperclip retries once and parks the issue in blocked, still pending. The
//   participant decides with a comment in the same PATCH: done approves (done, completed), any other
//   status requests changes (in_progress, back to the executor). A blank comment is 422, anyone
//   else 422; the executor's done on a parked issue hands it in again.
// - Cost events: an agent reports only its own (403), occurredAt is required, costCents is a number
//   or a decimal string, an idempotency key replayed with the same receipt answers the same event
//   and with another 409. Spend past an agent's budget pauses it; it can still report and write.
//
// Not emulated: the slower disposition repair that parks a stranded in_progress issue in blocked
// after two more wakes (minutes on a real one), and the accounting gate that can drop a wake.
//
// Controls: GET /__state (everything, issues with their comments and decisions), GET|POST /__reset
// (reseed), GET /__mode?down=1|0 (down: every /api/* answers 503). POST /api/auth/sign-in/email with
// qa-board@example.com / qa-board-password sets a board session cookie, as an authenticated
// Paperclip does, for the setup script's sign-in path.
import http from 'node:http';
import {createHash, randomBytes, randomUUID} from 'node:crypto';

export const PAPERCLIP_STUB_PORT = Number(process.env.PAPERCLIP_STUB_PORT ?? 8790);
const SERVICE_URL = (process.env.PAPERCLIP_STUB_SERVICE_URL ?? 'http://localhost:8789').replace(/\/+$/, '');
const APP_URL = (process.env.PAPERCLIP_STUB_APP_URL ?? 'http://localhost:3000').replace(/\/+$/, '');
const HEARTBEAT_SECRET = process.env.PAPERCLIP_STUB_HEARTBEAT_SECRET ?? 'qa-agent-world-heartbeat';
// 0 keeps wakes in memory only (no POST); the runs still start and end.
const DELIVER_WAKES = process.env.PAPERCLIP_STUB_WAKES !== '0';

const COMPANY_ID = '11111111-1111-4111-8111-111111111111';
const BOARD_USER = 'local-board';
const BOARD_EMAIL = 'qa-board@example.com';
const BOARD_PASSWORD = 'qa-board-password';
const SESSION_COOKIE = 'paperclip-default.session_token';
const AGENT_ROLES = ['ceo', 'cto', 'cmo', 'cfo', 'security', 'engineer', 'designer', 'pm', 'qa', 'devops', 'researcher', 'general'];
const ISSUE_STATUSES = ['backlog', 'todo', 'in_progress', 'in_review', 'done', 'blocked', 'cancelled'];
const CROSS_ISSUE_CAP = 20;
const LIVE = new Set(['queued', 'running']);

// The company scripts/agent-world-setup.mjs builds: [NN, key, name, role, reports to, budget ¢, title].
// Names copied from lib/agent-world/config.ts (ROLES[].paperclip, PAPERCLIP_DESKS): a script cannot
// import TypeScript.
const SEED = [
    ['01', 'head-trader', 'Head trader', 'general', null, 500, 'Runs each weekly session of the desk'],
    ['02', 'execution-desk', 'Execution desk', 'general', 'head-trader', 100, "Records the owner's decision and the fills"],
    ['03', 'market', 'Market analyst', 'researcher', 'research-manager', 200, 'Files the market report'],
    ['04', 'sentiment', 'Sentiment analyst', 'researcher', 'research-manager', 200, 'Files the sentiment report'],
    ['05', 'news', 'News analyst', 'researcher', 'research-manager', 200, 'Files the news report'],
    ['06', 'fundamentals', 'Fundamentals analyst', 'researcher', 'research-manager', 200, 'Files the fundamentals report'],
    ['07', 'bull', 'Bull researcher', 'researcher', 'research-manager', 200, 'Argues the case for the symbol'],
    ['08', 'bear', 'Bear researcher', 'researcher', 'research-manager', 200, 'Argues the case against it'],
    ['09', 'research-manager', 'Research manager', 'researcher', 'head-trader', 300, 'Weighs the debate and writes the plan'],
    ['10', 'trader', 'Trader', 'general', 'head-trader', 200, 'Turns the plan into a proposal'],
    ['11', 'risk-aggressive', 'Aggressive risk analyst', 'qa', 'portfolio-manager', 150, 'Weighs the proposal for taking the risk'],
    ['12', 'risk-conservative', 'Conservative risk analyst', 'qa', 'portfolio-manager', 150, 'Weighs the proposal for keeping risk down'],
    ['13', 'risk-neutral', 'Neutral risk analyst', 'qa', 'portfolio-manager', 150, 'Weighs the proposal between the two'],
    ['14', 'portfolio-manager', 'Portfolio manager', 'pm', 'head-trader', 300, 'Names the rating the orders are built from'],
];
const idOf = (nn) => `22222222-2222-4222-8222-0000000000${nn}`;
const keyFor = (key) => (key === 'execution-desk' ? 'qa-paperclip-key' : key === 'head-trader' ? 'qa-head-trader-key' : `qa-role-${key}`);

const now = () => new Date().toISOString();
const cents7 = (value) => Number(value).toFixed(7);
const round2 = (value) => Math.round(value * 100) / 100;

let state;
const reset = () => {
    const at = now();
    state = {
        down: false,
        company: {id: COMPANY_ID, name: 'Trading agent world', description: 'The desk of twelve model roles, its head trader and its execution desk.', status: 'active', issuePrefix: 'TRA', issueCounter: 0, budgetMonthlyCents: 3000, spentMonthlyCents: 0, createdAt: at, updatedAt: at},
        companies: [],
        agents: new Map(),
        keys: [],
        issues: new Map(),
        comments: [],
        decisions: [],
        runs: new Map(),
        costEvents: [],
        activity: [],
        policies: new Map(),
        incidents: [],
        routines: new Map(),
        routineRuns: [],
        wakes: [],
        sessions: new Set(),
    };
    state.companies.push(state.company);
    for (const [nn, key, name, role, boss, budget, title] of SEED) {
        const url = key === 'execution-desk' ? `${APP_URL}/api/agent-world/paperclip/heartbeat` : `${SERVICE_URL}/paperclip/heartbeat`;
        const agent = newAgent(COMPANY_ID, {name, role, title, reportsTo: boss ? idOf(SEED.find((row) => row[1] === boss)[0]) : null, adapterType: 'http',
            adapterConfig: {url, headers: {'X-Agent-World-Heartbeat': HEARTBEAT_SECRET}, timeoutMs: 20_000}, budgetMonthlyCents: budget}, idOf(nn));
        state.keys.push({id: randomUUID(), agentId: agent.id, name: 'agent-world', token: keyFor(key), scope: {kind: 'standard'}, responsibleUserId: BOARD_USER, createdAt: at, revokedAt: null});
    }
    upsertPolicy({scopeType: 'company', scopeId: COMPANY_ID, amount: 3000, unpricedUsagePolicy: 'allow'});
    for (const agent of state.agents.values()) upsertPolicy({scopeType: 'agent', scopeId: agent.id, amount: agent.budgetMonthlyCents, unpricedUsagePolicy: 'allow'});
    const routine = {id: '33333333-3333-4333-8333-000000000001', companyId: COMPANY_ID, title: 'Weekly session', description: 'The desk rates the universe once a week.', assigneeAgentId: idOf('01'), projectId: null, priority: 'medium', status: 'active', concurrencyPolicy: 'skip_if_active', catchUpPolicy: 'skip_missed', variables: [], createdAt: at, updatedAt: at, triggers: []};
    routine.triggers.push({id: '33333333-3333-4333-8333-000000000002', companyId: COMPANY_ID, routineId: routine.id, kind: 'api', label: null, enabled: true, setupPending: false, archived: false, cronExpression: null, timezone: null, publicId: null, createdAt: at, updatedAt: at});
    state.routines.set(routine.id, routine);
};

function newAgent(companyId, input, id = randomUUID()) {
    const at = now();
    const agent = {
        id, companyId, name: input.name, role: input.role ?? 'general', title: input.title ?? null, icon: null, status: 'idle', lifecycleState: 'ready', lifecycleHolds: [],
        reportsTo: input.reportsTo ?? null, capabilities: input.capabilities ?? null, adapterType: input.adapterType, adapterConfig: input.adapterConfig ?? {},
        runtimeConfig: {heartbeat: {enabled: false, maxConcurrentRuns: 20}}, budgetMonthlyCents: input.budgetMonthlyCents ?? 0, spendMonthUtc: null, spentMonthlyCents: 0,
        pauseReason: null, pausedAt: null, errorReason: null, permissions: {canCreateAgents: true, canCreateSkills: true}, lastHeartbeatAt: null, metadata: null,
        createdAt: at, updatedAt: at, urlKey: input.name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, ''),
    };
    state.agents.set(agent.id, agent);
    return agent;
}

function upsertPolicy(input) {
    const key = `${input.scopeType}:${input.scopeId}`;
    const existing = state.policies.get(key);
    const policy = {
        policyId: existing?.policyId ?? randomUUID(), companyId: COMPANY_ID, scopeType: input.scopeType, scopeId: input.scopeId, metric: 'billed_cents', windowKind: 'calendar_month_utc',
        amount: input.amount ?? existing?.amount ?? 0, warnPercent: input.warnPercent ?? existing?.warnPercent ?? 80, hardStopEnabled: input.hardStopEnabled ?? existing?.hardStopEnabled ?? true,
        unpricedUsagePolicy: input.unpricedUsagePolicy ?? existing?.unpricedUsagePolicy ?? 'block', notifyEnabled: input.notifyEnabled ?? existing?.notifyEnabled ?? true,
        isActive: input.isActive ?? existing?.isActive ?? (input.amount ?? existing?.amount ?? 0) > 0,
    };
    state.policies.set(key, policy);
    if (input.scopeType === 'agent' && state.agents.has(input.scopeId) && input.amount !== undefined) state.agents.get(input.scopeId).budgetMonthlyCents = input.amount;
    if (input.scopeType === 'company' && input.amount !== undefined) state.company.budgetMonthlyCents = input.amount;
    return policy;
}

const log = (actor, action, entityType, entityId, details = null, extra = {}) => {
    state.activity.unshift({
        id: randomUUID(), companyId: COMPANY_ID, actorType: actor.type === 'agent' ? 'agent' : actor.type === 'system' ? 'system' : 'user',
        actorId: actor.type === 'agent' ? actor.agentId : actor.type === 'system' ? 'system' : BOARD_USER, action, entityType, entityId,
        agentId: actor.type === 'agent' ? actor.agentId : (extra.agentId ?? null), runId: actor.runId ?? extra.runId ?? null, responsibleUserId: BOARD_USER, details, createdAt: now(),
    });
};
const SYSTEM = {type: 'system'};

// ---- HTTP plumbing ----

const json = (res, status, body, headers = {}) => {
    res.writeHead(status, {'Content-Type': 'application/json', ...headers});
    res.end(JSON.stringify(body));
};
class Answer extends Error {
    constructor(status, body) {
        super(typeof body?.error === 'string' ? body.error : String(status));
        this.status = status;
        this.body = body;
    }
}
const fail = (status, error, extra = {}) => { throw new Answer(status, {error, ...extra}); };
const readBody = (req) => new Promise((resolve) => {
    let raw = '';
    req.on('data', (chunk) => { raw += chunk; });
    req.on('end', () => {
        if (raw === '') return resolve({});
        try { resolve(JSON.parse(raw)); } catch { resolve(Symbol.for('invalid')); }
    });
});
const validation = (path, message, code = 'invalid_type') => fail(400, 'Validation error', {details: [{code, path, message}]});

const cookieOf = (req, name) => (req.headers.cookie ?? '').split(';').map((part) => part.trim().split('=')).find(([k]) => k === name)?.[1] ?? null;
const trustedOrigin = (req) => {
    const allowed = new Set([`http://localhost:${PAPERCLIP_STUB_PORT}`, `http://127.0.0.1:${PAPERCLIP_STUB_PORT}`, `http://${req.headers.host}`, `https://${req.headers.host}`]);
    for (const header of [req.headers.origin, req.headers.referer]) {
        try { if (header && allowed.has(new URL(header).origin)) return true; } catch { /* not a URL */ }
    }
    return false;
};

const actorOf = (req) => {
    const auth = req.headers.authorization ?? '';
    const runId = (req.headers['x-paperclip-run-id'] ?? '').trim() || undefined;
    if (/^bearer\s+/i.test(auth)) {
        const token = auth.replace(/^bearer\s+/i, '').trim();
        const key = state.keys.find((row) => row.token === token && row.revokedAt === null);
        const agent = key ? state.agents.get(key.agentId) : null;
        if (!agent) fail(401, 'Agent token did not verify; obtain fresh credentials and retry');
        if (agent.status === 'terminated') fail(401, 'Agent is terminated and cannot authenticate');
        return {type: 'agent', agentId: agent.id, companyId: agent.companyId, keyId: key.id, runId};
    }
    const session = cookieOf(req, SESSION_COOKIE);
    if (session && state.sessions.has(session)) return {type: 'board', userId: BOARD_USER, source: 'session', runId};
    return {type: 'board', userId: BOARD_USER, source: 'local_implicit', runId};
};
const board = (actor) => { if (actor.type !== 'board') fail(403, 'Board access required'); };
const companyAccess = (actor, companyId) => {
    if (!state.companies.some((company) => company.id === companyId)) fail(404, 'Company not found');
    if (actor.type === 'agent' && actor.companyId !== companyId) fail(403, 'Agent key cannot access another company');
};
const agentOr404 = (id) => state.agents.get(id) ?? fail(404, 'Agent not found');
const issueOr404 = (id) => state.issues.get(id) ?? [...state.issues.values()].find((issue) => issue.identifier === id) ?? fail(404, 'Issue not found');

// ---- views ----

const agentView = (agent) => ({...agent});
const issueView = (issue) => ({...issue});
const runView = (run) => ({
    id: run.id, companyId: COMPANY_ID, agentId: run.agentId, status: run.status, invocationSource: run.invocationSource, triggerDetail: run.triggerDetail,
    contextSnapshot: run.contextSnapshot, error: run.error, errorCode: run.errorCode, createdAt: run.createdAt, startedAt: run.startedAt, finishedAt: run.finishedAt,
});
const companyView = (company) => ({...company});
const keyView = ({token, agentId, ...key}) => { void token; void agentId; return key; };

// ---- runs and wakes ----

const RUN_CONTEXT_ERROR = 'Cross-issue writes need a run to attribute them to (Heartbeat run context). Every agent comment and task update is attributed to a heartbeat run so the cross-issue cap can be counted and the audit trail can name who acted for whom. This request arrived without a valid run, so it could not be contained. Who can act: this agent, once the request carries its own run id. Try this: Send the `X-Paperclip-Run-Id` header with your current run (`$PAPERCLIP_RUN_ID`) and retry.';

const startRun = (agent, {reason, source, issueId = null, extraContext = {}}) => {
    const run = {
        id: randomUUID(), agentId: agent.id, status: 'queued', invocationSource: source, triggerDetail: source === 'on_demand' ? 'manual' : 'system',
        contextSnapshot: {...(issueId ? {issueId, taskId: issueId, taskKey: issueId} : {}), wakeReason: reason, wakeSource: source, ...extraContext},
        error: null, errorCode: null, crossIssueWrites: 0, createdAt: now(), startedAt: null, finishedAt: null,
    };
    state.runs.set(run.id, run);
    return run;
};

// Whether the issue would be checked out to a wake's run, as the harness does before it dispatches.
const autoCheckout = (issue, agent, reason) =>
    issue.assigneeAgentId === agent.id && issue.executionState?.status !== 'pending' && ['todo', 'backlog', 'blocked', 'in_progress'].includes(issue.status)
    && !reason.startsWith('execution_') && reason !== 'issue_comment_mentioned';

// Deliver a wake as the http adapter does: POST the agent's url with its headers; the run is live
// until the answer, then succeeded (2xx) or failed. Every run ends with an unpriced zero-cost event.
const wake = (agent, run, onEnd) => {
    const issue = run.contextSnapshot.issueId ? state.issues.get(run.contextSnapshot.issueId) : null;
    if (issue && autoCheckout(issue, agent, run.contextSnapshot.wakeReason)) {
        Object.assign(issue, {status: 'in_progress', checkoutRunId: run.id, executionRunId: run.id, startedAt: issue.startedAt ?? now(), updatedAt: now()});
        run.contextSnapshot.paperclipHarnessCheckedOut = true;
    }
    run.status = 'running';
    run.startedAt = now();
    const url = agent.adapterConfig?.url;
    const body = {
        agentId: agent.id, runId: run.id,
        context: {
            source: run.contextSnapshot.source ?? 'stub', ...run.contextSnapshot,
            ...(issue ? {paperclipIssue: {id: issue.id, identifier: issue.identifier, title: issue.title, description: issue.description, workMode: 'standard'}} : {}),
        },
        connectionInstructions: null,
    };
    const delivery = {at: now(), agentId: agent.id, agentName: agent.name, runId: run.id, url: url ?? null, wakeReason: run.contextSnapshot.wakeReason, wakeSource: run.contextSnapshot.wakeSource, issueId: issue?.id ?? null, status: null};
    state.wakes.push(delivery);
    const finish = (ok, status, error = null) => {
        delivery.status = status;
        if (run.status === 'running' || run.status === 'queued') {
            run.status = ok ? 'succeeded' : 'failed';
            run.error = error;
            run.errorCode = ok ? null : 'adapter_failed';
            run.finishedAt = now();
        }
        if (issue && issue.checkoutRunId === run.id) issue.checkoutRunId = null;
        if (issue && issue.executionRunId === run.id) issue.executionRunId = null;
        if (ok && issue && url) addComment(issue, {authorAgentId: agent.id, createdByRunId: run.id, body: `HTTP POST ${url}`, viaRun: true});
        recordCost({agentId: agent.id, provider: 'unknown', model: 'unknown', inputTokens: 0, outputTokens: 0, costCents: 0, occurredAt: now(), heartbeatRunId: run.id}, SYSTEM, 'unpriced');
        onEnd?.(run);
    };
    if (!DELIVER_WAKES || !url) {
        setImmediate(() => finish(true, 'kept'));
        return run;
    }
    const controller = new AbortController();
    const timeoutMs = Number(agent.adapterConfig?.timeoutMs) || 0;
    const timer = timeoutMs > 0 ? setTimeout(() => controller.abort(), timeoutMs) : null;
    fetch(url, {method: 'POST', headers: {'content-type': 'application/json', ...(agent.adapterConfig?.headers ?? {})}, body: JSON.stringify(body), signal: controller.signal})
        .then((response) => finish(response.ok, response.status, response.ok ? null : `HTTP invoke failed with status ${response.status}`))
        .catch((error) => finish(false, 0, error instanceof Error ? error.message : String(error)))
        .finally(() => timer && clearTimeout(timer));
    return run;
};

// The run an agent write is attributed to, as the cross-issue check reads it.
const attribute = (actor, issue) => {
    if (actor.type !== 'agent') return null;
    if (!actor.runId) fail(403, RUN_CONTEXT_ERROR, {details: {code: 'cross_issue_influence_run_context_required'}});
    const run = state.runs.get(actor.runId);
    if (!run || run.agentId !== actor.agentId) fail(403, RUN_CONTEXT_ERROR, {details: {code: 'cross_issue_influence_run_context_required'}});
    if (run.status === 'cancelled') throw new Answer(403, {error: 'This run was cancelled', code: 'agent_run_cancelled'});
    const source = run.contextSnapshot.issueId ?? run.contextSnapshot.taskId ?? null;
    if (!source) fail(403, RUN_CONTEXT_ERROR, {details: {code: 'cross_issue_influence_run_context_required'}});
    if (source !== issue.id) {
        run.crossIssueWrites += 1;
        if (run.crossIssueWrites > CROSS_ISSUE_CAP) {
            fail(429, `This run has spent its cross-issue write budget (Per-run cross-issue cap of ${CROSS_ISSUE_CAP} writes). A single heartbeat run may make at most ${CROSS_ISSUE_CAP} cross-issue comments or task updates combined; this was attempt ${run.crossIssueWrites}.`, {details: {code: 'cross_issue_influence_cap_exceeded', cap: CROSS_ISSUE_CAP, count: run.crossIssueWrites}});
        }
    }
    return run;
};

// An in_progress issue takes an agent's update only from its assignee under a live run.
const runLock = (actor, issue) => {
    if (actor.type !== 'agent' || issue.status !== 'in_progress') return;
    if (!actor.runId) fail(401, 'Agent run id required');
    if (issue.assigneeAgentId !== actor.agentId) {
        fail(409, 'Issue is checked out by another agent run', {details: {code: 'issue_write_assignee_run_lock', issueId: issue.id, assigneeAgentId: issue.assigneeAgentId, actorAgentId: actor.agentId}});
    }
    const run = state.runs.get(actor.runId);
    const holder = issue.checkoutRunId ? state.runs.get(issue.checkoutRunId) : null;
    const free = !holder || !LIVE.has(holder.status) || holder.id === actor.runId;
    if (run && run.agentId === actor.agentId && LIVE.has(run.status) && free) {
        issue.checkoutRunId = run.id;
        issue.executionRunId = run.id;
        return;
    }
    fail(409, 'Issue run ownership conflict', {details: {issueId: issue.id, status: issue.status, assigneeAgentId: issue.assigneeAgentId, checkoutRunId: issue.checkoutRunId, executionRunId: issue.executionRunId, actorAgentId: actor.agentId, actorRunId: actor.runId}});
};

// ---- costs and budgets ----

const evaluateBudgets = () => {
    const spent = (agentId) => state.costEvents.filter((event) => event.agentId === agentId).reduce((sum, event) => sum + event.costCents, 0);
    const unpriced = (agentId) => state.costEvents.filter((event) => event.costStatus === 'unpriced' && (agentId === null || event.agentId === agentId)).length;
    for (const agent of state.agents.values()) {
        agent.spentMonthlyCents = Number(spent(agent.id).toFixed(7));
        const policy = state.policies.get(`agent:${agent.id}`);
        const over = policy?.isActive && policy.hardStopEnabled && (agent.spentMonthlyCents >= policy.amount || (policy.unpricedUsagePolicy !== 'allow' && unpriced(agent.id) > 0));
        if (over && agent.status !== 'paused' && agent.status !== 'terminated') {
            Object.assign(agent, {status: 'paused', pauseReason: 'budget', pausedAt: now()});
            state.incidents.push({id: randomUUID(), companyId: COMPANY_ID, policyId: policy.policyId, scopeType: 'agent', scopeId: agent.id, scopeName: agent.name, thresholdType: 'hard', amountLimit: policy.amount, amountObserved: agent.spentMonthlyCents, status: 'open', createdAt: now()});
            log(SYSTEM, 'budget.hard_threshold_crossed', 'budget_incident', agent.id, {scopeType: 'agent', scopeId: agent.id, amountLimit: policy.amount, amountObserved: agent.spentMonthlyCents});
        }
    }
    state.company.spentMonthlyCents = Number(state.costEvents.reduce((sum, event) => sum + event.costCents, 0).toFixed(7));
    const policy = state.policies.get(`company:${COMPANY_ID}`);
    const over = policy?.isActive && policy.hardStopEnabled && (state.company.spentMonthlyCents >= policy.amount || (policy.unpricedUsagePolicy !== 'allow' && unpriced(null) > 0));
    if (over && state.company.status === 'active') {
        state.company.status = 'paused';
        state.incidents.push({id: randomUUID(), companyId: COMPANY_ID, policyId: policy.policyId, scopeType: 'company', scopeId: COMPANY_ID, scopeName: state.company.name, thresholdType: 'hard', amountLimit: policy.amount, amountObserved: state.company.spentMonthlyCents, status: 'open', createdAt: now()});
        log(SYSTEM, 'budget.hard_threshold_crossed', 'budget_incident', COMPANY_ID, {scopeType: 'company', amountLimit: policy.amount, amountObserved: state.company.spentMonthlyCents});
    }
};

const parseCents = (value) => {
    if (typeof value === 'number' && Number.isFinite(value)) return value;
    if (typeof value === 'string' && /^[+-]?\d+(\.\d+)?$/.test(value.trim())) return Number(value);
    return null;
};

function recordCost(input, actor, costStatus = 'reported') {
    const event = {
        id: randomUUID(), companyId: COMPANY_ID, agentId: input.agentId, usageKind: 'agent', responsibleUserId: null, issueId: input.issueId ?? null, projectId: null, goalId: null,
        heartbeatRunId: input.heartbeatRunId ?? null, billingCode: input.billingCode ?? null, idempotencyKey: input.idempotencyKey ?? null, receiptHash: input.receiptHash ?? null,
        reportedCostCents: cents7(input.costCents), pricingProvenance: input.pricingProvenance ?? null, provider: input.provider, biller: input.biller ?? input.provider,
        billingType: input.billingType ?? 'unknown', costStatus, model: input.model, inputTokens: input.inputTokens ?? 0, cachedInputTokens: input.cachedInputTokens ?? 0,
        outputTokens: input.outputTokens ?? 0, costCents: input.costCents, occurredAt: input.occurredAt, createdAt: now(), costCentsExact: cents7(input.costCents),
    };
    state.costEvents.push(event);
    log(actor, 'cost.reported', 'cost_event', event.id, {model: event.model, costCents: event.costCents, costStatus, costCentsExact: event.costCentsExact}, {agentId: input.agentId});
    evaluateBudgets();
    return event;
}

// ---- issues ----

function addComment(issue, {authorAgentId = null, createdByRunId = null, body, system = null, viaRun = false}) {
    const comment = {
        id: randomUUID(), companyId: COMPANY_ID, issueId: issue.id, authorAgentId, authorUserId: authorAgentId || system ? null : BOARD_USER,
        authorType: system ? 'system' : authorAgentId ? 'agent' : 'user', createdByRunId, body, origin: 'comment', presentation: system, createdAt: now(), updatedAt: now(),
    };
    state.comments.push(comment);
    log(authorAgentId ? {type: 'agent', agentId: authorAgentId, runId: createdByRunId} : system ? SYSTEM : {type: 'board'}, 'issue.comment_added', 'issue', issue.id,
        {identifier: issue.identifier, issueTitle: issue.title, bodySnippet: body.slice(0, 120), ...(viaRun ? {source: 'run_presentation_resolver'} : {})});
    return comment;
}

const policyStages = (issue) => issue.executionPolicy?.stages ?? [];

// The stage is handed to its participant: in_review and pending, the executor's live run ended,
// the participant woken; a wake that ends without a decision is retried once, then the issue parks
// in blocked, still pending.
const handIn = (issue, actor) => {
    const stage = policyStages(issue)[0];
    const participant = stage.participants.find((p) => p.type === 'agent' && p.agentId) ?? null;
    const returnAssignee = issue.assigneeAgentId ?? (actor.type === 'agent' ? actor.agentId : null);
    const holder = issue.checkoutRunId ? state.runs.get(issue.checkoutRunId) : null;
    if (holder && LIVE.has(holder.status)) Object.assign(holder, {status: 'cancelled', errorCode: 'issue_reassigned', finishedAt: now()});
    const previous = issue.executionState;
    Object.assign(issue, {
        status: 'in_review', assigneeAgentId: participant?.agentId ?? issue.assigneeAgentId, checkoutRunId: null, executionRunId: null, updatedAt: now(),
        executionState: {
            status: 'pending', monitor: null, reviewRequest: null, currentStageId: stage.id, currentStageIndex: 0, currentStageType: stage.type,
            currentParticipant: participant ? {type: 'agent', userId: null, agentId: participant.agentId} : null,
            returnAssignee: returnAssignee ? {type: 'agent', userId: null, agentId: returnAssignee} : null,
            completedStageIds: previous?.completedStageIds ?? [], lastDecisionId: previous?.lastDecisionId ?? null, lastDecisionOutcome: previous?.lastDecisionOutcome ?? null,
            changesRequestedCount: previous?.changesRequestedCount ?? 0,
        },
    });
    const approver = participant ? state.agents.get(participant.agentId) : null;
    const park = (title, text) => {
        if (issue.status !== 'in_review' || issue.executionState?.status !== 'pending') return;
        Object.assign(issue, {status: 'blocked', blockedTransitionAt: now(), updatedAt: now()});
        addComment(issue, {body: text, system: {kind: 'system_notice', tone: 'danger', title, detailsDefaultOpen: false}});
        log(SYSTEM, 'issue.updated', 'issue', issue.id, {source: 'recovery.reconcile_execution_review_participant', status: 'blocked', identifier: issue.identifier, previousStatus: 'in_review'});
    };
    if (!approver || approver.status === 'paused' || approver.status === 'terminated') {
        setImmediate(() => park('Review participant unavailable', 'Paperclip cannot continue the pending execution-review participant because the participant is not invokable and the review stage has no completed decision or live reviewer run. Moving it to `blocked` so the board can inspect the evidence, repair the reviewer runtime, restore the review stage, or record an intentional manual resolution.'));
        return;
    }
    const stageContext = {executionStage: {stageId: stage.id, wakeRole: 'approver', stageType: stage.type, reviewRequest: null, allowedActions: ['approve', 'request_changes'], returnAssignee: issue.executionState.returnAssignee, currentParticipant: issue.executionState.currentParticipant, lastDecisionOutcome: issue.executionState.lastDecisionOutcome}};
    const first = startRun(approver, {reason: 'execution_approval_requested', source: 'assignment', issueId: issue.id, extraContext: {source: 'issue.execution_stage', ...stageContext}});
    wake(approver, first, () => {
        if (issue.status !== 'in_review' || issue.executionState?.status !== 'pending') return;
        const retry = startRun(approver, {reason: 'execution_review_participant_recovery', source: 'automation', issueId: issue.id});
        wake(approver, retry, () => park('Review recovery stalled', 'Paperclip retried the pending execution-review participant once, but the review stage still has no completed decision or live reviewer run. Moving it to `blocked` so the board can inspect the evidence, repair the reviewer runtime, restore the review stage, or record an intentional manual resolution.'));
    });
};

const decide = (issue, actor, status, comment, runId) => {
    const state0 = issue.executionState;
    const decision = {
        id: randomUUID(), companyId: COMPANY_ID, issueId: issue.id, stageId: state0.currentStageId, stageType: state0.currentStageType,
        actorAgentId: actor.type === 'agent' ? actor.agentId : null, actorUserId: actor.type === 'agent' ? null : BOARD_USER,
        outcome: status === 'done' ? 'approved' : 'changes_requested', body: comment, createdByRunId: runId ?? null, createdAt: now(),
    };
    state.decisions.push(decision);
    if (decision.outcome === 'approved') {
        Object.assign(issue, {
            status: 'done', completedAt: now(), blockedTransitionAt: null, updatedAt: now(),
            executionState: {...state0, status: 'completed', currentStageId: null, currentStageIndex: null, currentStageType: null, currentParticipant: null,
                completedStageIds: [...state0.completedStageIds, state0.currentStageId], lastDecisionId: decision.id, lastDecisionOutcome: 'approved'},
        });
        return;
    }
    const back = state0.returnAssignee?.agentId ?? issue.assigneeAgentId;
    Object.assign(issue, {
        status: 'in_progress', assigneeAgentId: back, startedAt: now(), blockedTransitionAt: null, updatedAt: now(),
        executionState: {...state0, status: 'changes_requested', lastDecisionId: decision.id, lastDecisionOutcome: 'changes_requested', changesRequestedCount: (state0.changesRequestedCount ?? 0) + 1},
    });
    const executor = state.agents.get(back);
    if (executor && executor.status !== 'paused') {
        wake(executor, startRun(executor, {reason: 'execution_changes_requested', source: 'assignment', issueId: issue.id, extraContext: {source: 'issue.execution_stage'}}));
    }
};

const blank = (text) => typeof text !== 'string' || text.trim() === '';

const normalTitle = (title) => title.trim().replace(/\s+/g, ' ').toLowerCase();

// A create Paperclip answers with an issue it already has: the one an idempotency key made, or
// (unless allowDuplicate) an open issue of the last 48 hours with the same title.
const duplicateOf = (body) => {
    if (typeof body.idempotencyKey === 'string' && body.idempotencyKey.trim() !== '') {
        const made = [...state.issues.values()].find((issue) => issue.idempotencyKey === body.idempotencyKey.trim());
        if (made) return {issue: made, reason: 'idempotency_key'};
    }
    if (body.allowDuplicate === true || blank(body.title)) return null;
    const since = Date.now() - 48 * 60 * 60 * 1000;
    const open = [...state.issues.values()].find((issue) => !['done', 'cancelled'].includes(issue.status) && Date.parse(issue.createdAt) >= since && normalTitle(issue.title) === normalTitle(body.title));
    return open ? {issue: open, reason: 'recent_open_title'} : null;
};

const createIssue = (actor, body) => {
    if (blank(body.title)) validation(['title'], 'Invalid input: expected string, received undefined');
    if (body.status !== undefined && !ISSUE_STATUSES.includes(body.status)) validation(['status'], 'Invalid option', 'invalid_value');
    const assignee = body.assigneeAgentId ? state.agents.get(body.assigneeAgentId) : null;
    if (body.assigneeAgentId && !assignee) fail(404, 'Agent not found');
    if (assignee && assignee.status === 'paused') fail(409, 'Cannot assign work to a paused agent. Assign an invokable agent, leave the issue unassigned, or escalate to a board operator instead.');
    let policy = null;
    if (body.executionPolicy) {
        const stages = [];
        for (const [i, stage] of (body.executionPolicy.stages ?? []).entries()) {
            if (!['review', 'approval'].includes(stage.type)) validation(['executionPolicy', 'stages', i, 'type'], 'Invalid option', 'invalid_value');
            const participants = [];
            for (const p of stage.participants ?? []) {
                if (p.type === 'agent' && !p.agentId) validation(['executionPolicy', 'stages', i, 'participants'], 'Agent participants require agentId', 'custom');
                if (p.type === 'agent' && state.agents.has(p.agentId) && !participants.some((q) => q.agentId === p.agentId)) participants.push({id: randomUUID(), type: 'agent', userId: null, agentId: p.agentId});
            }
            if (participants.length > 0) stages.push({id: randomUUID(), type: stage.type, participants, approvalsNeeded: 1});
        }
        policy = stages.length > 0 ? {mode: body.executionPolicy.mode ?? 'normal', stages, commentRequired: body.executionPolicy.commentRequired ?? true} : null;
    }
    state.company.issueCounter += 1;
    const n = state.company.issueCounter;
    const status = body.status ?? (assignee ? 'todo' : 'backlog');
    const at = now();
    const issue = {
        id: randomUUID(), companyId: COMPANY_ID, projectId: null, goalId: null, parentId: null, title: body.title, description: body.description ?? null, status, priority: body.priority ?? 'medium',
        assigneeAgentId: assignee?.id ?? null, assigneeUserId: null, checkoutRunId: null, executionRunId: null, createdByAgentId: actor.type === 'agent' ? actor.agentId : null,
        createdByUserId: actor.type === 'agent' ? null : BOARD_USER, responsibleUserId: BOARD_USER, issueNumber: n, identifier: `${state.company.issuePrefix}-${n}`,
        originKind: body.originKind ?? 'manual', originId: body.originId ?? null, billingCode: body.billingCode ?? null, executionPolicy: policy, executionState: null,
        idempotencyKey: typeof body.idempotencyKey === 'string' && body.idempotencyKey.trim() !== '' ? body.idempotencyKey.trim() : null,
        unblockDescriptor: null, blockedTransitionAt: null, startedAt: null, completedAt: null, cancelledAt: null, createdAt: at, updatedAt: at, labels: [], labelIds: [], blockedBy: [], blocks: [],
    };
    state.issues.set(issue.id, issue);
    const wakeSkipped = !assignee || status !== 'todo';
    log(actor, 'issue.created', 'issue', issue.id, {title: issue.title, status, identifier: issue.identifier, assignmentWakeSkipped: wakeSkipped, assignmentWakeSkipReason: !assignee ? null : status === 'backlog' ? 'assigned_backlog' : wakeSkipped ? `assigned_${status}` : null});
    if (!wakeSkipped) wake(assignee, startRun(assignee, {reason: 'issue_assigned', source: 'assignment', issueId: issue.id, extraContext: {source: body.originKind === 'routine_execution' ? 'routine.dispatch' : 'issue.create'}}));
    return issue;
};

const patchIssue = (issue, actor, body) => {
    runLock(actor, issue);
    const fields = ['title', 'description', 'priority', 'status', 'assigneeAgentId', 'unblockDescriptor', 'billingCode'].filter((field) => body[field] !== undefined);
    const comment = typeof body.comment === 'string' && body.comment.trim() !== '' ? body.comment : null;
    if (fields.length > 0 || comment) attribute(actor, issue);
    const before = JSON.parse(JSON.stringify(issueView(issue)));
    const runId = actor.runId ?? null;
    const actorAgent = actor.type === 'agent' ? actor.agentId : null;
    let decisionComment = false;
    if (body.status !== undefined) {
        if (!ISSUE_STATUSES.includes(body.status)) validation(['status'], 'Invalid option', 'invalid_value');
        const pending = issue.executionState?.status === 'pending';
        if (pending) {
            const participant = issue.executionState.currentParticipant?.agentId ?? null;
            if (actor.type === 'board' || actorAgent === participant) {
                if (blank(body.comment)) {
                    fail(422, body.status === 'done'
                        ? 'Approving a review or approval stage requires a comment. Include the decision comment in the same PATCH request; prior comments are not considered.'
                        : 'Requesting changes requires a comment. Include the decision comment in the same PATCH request; prior comments are not considered.');
                }
                decide(issue, actor, body.status, body.comment, runId);
                decisionComment = true;
            } else if (body.status === 'done' && issue.status === 'blocked' && actorAgent === issue.executionState.returnAssignee?.agentId) {
                Object.assign(issue, {status: 'in_review', blockedTransitionAt: null, updatedAt: now()});
            } else {
                fail(422, 'Only the active reviewer or approver can advance the current execution stage');
            }
        } else if (body.status === 'done' && policyStages(issue).length > 0 && issue.executionState?.status !== 'completed') {
            handIn(issue, actor);
        } else {
            if (body.status === 'blocked') {
                const descriptor = body.unblockDescriptor;
                if (!descriptor) fail(422, 'Entering blocked requires unresolved blockers, a pending interaction/approval, or unblockDescriptor');
                if (actor.type === 'agent' && !(descriptor.owner && typeof descriptor.owner === 'object' && descriptor.owner.agentId === actorAgent)) fail(403, 'Agents may only name themselves as an unblock owner');
                if (blank(descriptor.action)) validation(['unblockDescriptor', 'action'], 'Too small: expected string to have >=1 characters', 'too_small');
                issue.unblockDescriptor = {owner: descriptor.owner, action: String(descriptor.action).slice(0, 2000)};
                issue.blockedTransitionAt = now();
            }
            if (body.status === 'done') issue.completedAt = now();
            if (body.status === 'cancelled') issue.cancelledAt = now();
            if (body.status === 'in_progress' && issue.status !== 'in_progress') issue.startedAt = now();
            issue.status = body.status;
        }
    }
    for (const field of ['title', 'description', 'priority', 'billingCode']) if (body[field] !== undefined) issue[field] = body[field];
    if (body.assigneeAgentId !== undefined && body.status === undefined) {
        const agent = body.assigneeAgentId === null ? null : state.agents.get(body.assigneeAgentId) ?? [...state.agents.values()].find((a) => a.urlKey === body.assigneeAgentId);
        if (body.assigneeAgentId !== null && !agent) fail(404, 'Agent not found');
        issue.assigneeAgentId = agent?.id ?? null;
    }
    issue.updatedAt = now();
    const created = comment ? addComment(issue, {authorAgentId: actorAgent, createdByRunId: runId, body: comment}) : null;
    const after = issueView(issue);
    const changes = {};
    for (const key of ['title', 'description', 'priority', 'status', 'assigneeAgentId', 'executionState', 'unblockDescriptor', 'completedAt', 'cancelledAt']) {
        if (JSON.stringify(before[key]) !== JSON.stringify(after[key])) changes[key] = {from: before[key], to: after[key]};
    }
    log(actor, 'issue.updated', 'issue', issue.id, {source: comment ? 'comment' : 'update', identifier: issue.identifier, status: issue.status, changes, decision: decisionComment});
    return {...after, changes, comment: created};
};

const checkout = (issue, actor, body) => {
    if (actor.type === 'agent' && actor.agentId !== body.agentId) fail(403, 'Agent can only checkout as itself');
    if (!body.agentId || !Array.isArray(body.expectedStatuses) || body.expectedStatuses.length === 0) validation(['expectedStatuses'], 'Invalid input: expected array, received undefined');
    const agent = agentOr404(body.agentId);
    if (agent.status === 'paused') fail(409, 'Cannot assign work to a paused agent. Assign an invokable agent, leave the issue unassigned, or escalate to a board operator instead.');
    if (actor.type === 'agent' && !actor.runId) fail(401, 'Agent run id required');
    // The issue's checkout column references a heartbeat run: an id with no run behind it fails the
    // write itself, which Paperclip answers as a 500.
    if (actor.runId && !state.runs.has(actor.runId)) fail(500, 'Internal server error');
    const holder = issue.checkoutRunId ? state.runs.get(issue.checkoutRunId) : null;
    const assignedElsewhere = Boolean(issue.assigneeAgentId) && issue.assigneeAgentId !== agent.id;
    const lockedElsewhere = Boolean(holder) && LIVE.has(holder.status) && holder.id !== actor.runId;
    const resumable = issue.status === 'in_progress' && issue.assigneeAgentId === agent.id;
    if (assignedElsewhere || lockedElsewhere || !(body.expectedStatuses.includes(issue.status) || resumable)) {
        fail(409, 'Issue checkout conflict', {details: {issueId: issue.id, status: issue.status, assigneeAgentId: issue.assigneeAgentId, checkoutRunId: issue.checkoutRunId, executionRunId: issue.executionRunId}});
    }
    Object.assign(issue, {assigneeAgentId: agent.id, assigneeUserId: null, checkoutRunId: actor.runId ?? null, executionRunId: actor.runId ?? null, status: 'in_progress', startedAt: issue.startedAt ?? now(), updatedAt: now()});
    log(actor, 'issue.checked_out', 'issue', issue.id, {agentId: agent.id, status: 'in_progress'});
    return issueView(issue);
};

// ---- read models ----

const byAgentRows = () => {
    const rows = new Map();
    for (const event of state.costEvents) {
        const agent = state.agents.get(event.agentId);
        if (!agent) continue;
        const row = rows.get(agent.id) ?? {agentId: agent.id, agentName: agent.name, agentStatus: agent.status, eventCount: 0, estimatedEventCount: 0, costCents: 0, inputTokens: 0, cachedInputTokens: 0, outputTokens: 0, apiRunCount: 0, subscriptionRunCount: 0};
        row.eventCount += 1;
        row.costCents += event.costCents;
        row.inputTokens += event.inputTokens;
        row.outputTokens += event.outputTokens;
        rows.set(agent.id, row);
    }
    return [...rows.values()].map((row) => ({...row, costCents: Number(row.costCents.toFixed(7)), costCentsExact: cents7(row.costCents)})).sort((a, b) => b.costCents - a.costCents || a.agentName.localeCompare(b.agentName));
};

const dashboard = () => {
    const agents = [...state.agents.values()];
    const issues = [...state.issues.values()];
    const spend = state.company.spentMonthlyCents;
    const budget = state.company.budgetMonthlyCents;
    const openIncidents = state.incidents.filter((incident) => incident.status === 'open').length;
    return {
        companyId: COMPANY_ID,
        agents: {active: agents.filter((a) => ['active', 'idle', 'running'].includes(a.status)).length, running: agents.filter((a) => a.status === 'running').length, paused: agents.filter((a) => a.status === 'paused').length, error: agents.filter((a) => a.status === 'error').length},
        tasks: {open: issues.filter((i) => !['done', 'cancelled'].includes(i.status)).length, inProgress: issues.filter((i) => i.status === 'in_progress').length, blocked: issues.filter((i) => i.status === 'blocked').length, done: issues.filter((i) => i.status === 'done').length},
        costs: {monthSpendCents: spend, monthBudgetCents: budget, monthUtilizationPercent: budget > 0 ? round2((spend / budget) * 100) : 0},
        pendingApprovals: openIncidents,
        budgets: {activeIncidents: openIncidents, pendingApprovals: openIncidents, pausedAgents: agents.filter((a) => a.status === 'paused').length, pausedProjects: 0},
        runActivity: [],
    };
};

const overview = () => ({
    companyId: COMPANY_ID,
    policies: [...state.policies.values()].map((policy) => {
        const agent = policy.scopeType === 'agent' ? state.agents.get(policy.scopeId) : null;
        const observed = agent ? agent.spentMonthlyCents : state.company.spentMonthlyCents;
        const unpricedEventCount = state.costEvents.filter((event) => event.costStatus === 'unpriced' && (!agent || event.agentId === agent.id)).length;
        return {
            ...policy, scopeName: agent ? agent.name : state.company.name, observedAmount: observed, observedAmountExact: cents7(observed), reservationCents: cents7(0), unpricedEventCount, pendingRunCount: 0,
            remainingAmount: Math.max(0, policy.amount - observed), utilizationPercent: policy.amount > 0 ? round2((observed / policy.amount) * 100) : 0,
            status: observed >= policy.amount && policy.amount > 0 ? 'hard_stop' : 'ok', paused: agent ? agent.status === 'paused' : state.company.status === 'paused',
            pauseReason: agent ? agent.pauseReason : null, windowStart: '2026-10-01T00:00:00.000Z', windowEnd: '2026-11-01T00:00:00.000Z',
        };
    }),
    activeIncidents: state.incidents.filter((incident) => incident.status === 'open'),
    pausedAgentCount: [...state.agents.values()].filter((agent) => agent.status === 'paused').length,
    pausedProjectCount: 0,
    pendingApprovalCount: state.incidents.filter((incident) => incident.status === 'open').length,
});

const routineView = (routine) => ({...routine, triggers: routine.triggers.map((trigger) => ({...trigger}))});

const runRoutine = (routine, actor, body) => {
    if (actor.type === 'agent' && routine.assigneeAgentId !== actor.agentId) fail(403, 'Agents can only manage routines assigned to themselves');
    if (body.source !== undefined && !['manual', 'api'].includes(body.source)) validation(['source'], 'Invalid option', 'invalid_value');
    if (body.triggerId) {
        const trigger = routine.triggers.find((t) => t.id === body.triggerId);
        if (!trigger) fail(403, 'Trigger does not belong to this routine');
        if (!trigger.enabled) fail(409, 'Trigger is disabled');
    }
    const replay = body.idempotencyKey ? state.routineRuns.find((run) => run.routineId === routine.id && run.idempotencyKey === body.idempotencyKey) : null;
    if (replay) return replay;
    const active = state.routineRuns.find((run) => run.routineId === routine.id && run.linkedIssueId && !['done', 'cancelled'].includes(state.issues.get(run.linkedIssueId)?.status));
    const at = now();
    const run = {id: randomUUID(), companyId: COMPANY_ID, routineId: routine.id, triggerId: body.triggerId ?? null, source: body.source ?? 'manual', status: 'issue_created', triggeredAt: at, idempotencyKey: body.idempotencyKey ?? null, triggerPayload: body.payload ?? null, linkedIssueId: null, coalescedIntoRunId: null, failureReason: null, completedAt: null, createdAt: at, updatedAt: at};
    if (active && routine.concurrencyPolicy !== 'always_enqueue') {
        Object.assign(run, {status: routine.concurrencyPolicy === 'skip_if_active' ? 'skipped' : 'coalesced', linkedIssueId: active.linkedIssueId, coalescedIntoRunId: active.id, completedAt: at});
    } else {
        const issue = createIssue({type: 'system'}, {title: routine.title, description: routine.description, assigneeAgentId: routine.assigneeAgentId, status: 'todo', originKind: 'routine_execution', originId: routine.id, allowDuplicate: true});
        run.linkedIssueId = issue.id;
    }
    state.routineRuns.push(run);
    routine.lastTriggeredAt = at;
    log(actor, 'routine.run_triggered', 'routine', routine.id, {runId: run.id, status: run.status, source: run.source});
    return run;
};

// ---- the router ----

const route = async (req, url) => {
    const method = req.method ?? 'GET';
    const path = url.pathname;
    const parts = path.split('/').filter(Boolean).slice(1); // without "api"
    const at = (i) => decodeURIComponent(parts[i] ?? '');
    const match = (pattern) => {
        const p = pattern.split('/').filter(Boolean);
        if (p.length !== parts.length) return false;
        return p.every((segment, i) => segment.startsWith(':') || segment === parts[i]);
    };
    if (method === 'GET' && match('health')) return [200, {status: 'ok', version: '2026.1023.0', serverVersion: '2026.1023.0 (stub)', deploymentMode: 'local_trusted', deploymentExposure: 'private'}];

    if (method === 'POST' && match('auth/sign-in/email')) {
        const body = await readBody(req);
        if (body?.email !== BOARD_EMAIL || body?.password !== BOARD_PASSWORD) return [401, {code: 'INVALID_EMAIL_OR_PASSWORD', message: 'Invalid email or password'}];
        const token = randomBytes(24).toString('hex');
        state.sessions.add(token);
        return [200, {redirect: false, token, user: {id: BOARD_USER, email: BOARD_EMAIL, name: 'QA board'}}, {'Set-Cookie': `${SESSION_COOKIE}=${token}; Path=/; HttpOnly; SameSite=Lax`}];
    }

    const actor = actorOf(req);
    if (actor.type === 'board' && actor.source === 'session' && !['GET', 'HEAD', 'OPTIONS'].includes(method) && !trustedOrigin(req)) {
        return [403, {error: 'Board mutation requires trusted browser origin'}];
    }
    const body = ['POST', 'PATCH', 'PUT'].includes(method) ? await readBody(req) : {};
    if (body === Symbol.for('invalid')) return [400, {error: 'Invalid JSON body'}];

    // companies
    if (method === 'GET' && match('companies')) { board(actor); return [200, state.companies.map(companyView)]; }
    if (method === 'POST' && match('companies')) {
        board(actor);
        if (blank(body.name)) validation(['name'], 'Invalid input: expected string, received undefined');
        const company = {id: randomUUID(), name: body.name, description: body.description ?? null, status: 'active', issuePrefix: body.name.replace(/[^A-Za-z]/g, '').slice(0, 3).toUpperCase() || 'CO', issueCounter: 0, budgetMonthlyCents: body.budgetMonthlyCents ?? 0, spentMonthlyCents: 0, createdAt: now(), updatedAt: now()};
        state.companies.push(company);
        return [201, companyView(company)];
    }
    if (method === 'GET' && match('companies/:id')) { companyAccess(actor, at(1)); return [200, companyView(state.companies.find((c) => c.id === at(1)))]; }
    if (match('companies/:id/:what') || match('companies/:id/:what/:more') || match('companies/:id/:what/:more/:tail')) companyAccess(actor, at(1));
    const inCompany = parts[1] === COMPANY_ID;

    // agents
    if (method === 'GET' && match('companies/:id/agents')) return [200, inCompany ? [...state.agents.values()].map(agentView) : []];
    if (method === 'POST' && match('companies/:id/agents')) {
        board(actor);
        if (blank(body.name)) validation(['name'], 'Invalid input: expected string, received undefined');
        if (body.role !== undefined && !AGENT_ROLES.includes(body.role)) {
            return [400, {error: 'Validation error', details: [{code: 'invalid_value', values: AGENT_ROLES, path: ['role'], message: `Invalid option: expected one of ${AGENT_ROLES.map((r) => `"${r}"`).join('|')}`}]}];
        }
        if (!body.adapterType) validation(['adapterType'], 'Invalid input');
        if (body.reportsTo && !state.agents.has(body.reportsTo)) fail(422, 'Manager agent not found in this company');
        const agent = newAgent(COMPANY_ID, body);
        upsertPolicy({scopeType: 'agent', scopeId: agent.id, amount: agent.budgetMonthlyCents, isActive: agent.budgetMonthlyCents > 0});
        log(actor, 'agent.created', 'agent', agent.id, {name: agent.name, role: agent.role});
        return [201, agentView(agent)];
    }
    if (method === 'GET' && match('agents/me')) {
        if (actor.type !== 'agent') fail(401, 'Agent authentication required');
        const agent = agentOr404(actor.agentId);
        const chain = [];
        for (let boss = agent.reportsTo; boss && state.agents.has(boss) && chain.length < 20; boss = state.agents.get(boss).reportsTo) {
            const b = state.agents.get(boss);
            chain.push({id: b.id, name: b.name, role: b.role, title: b.title});
        }
        return [200, {...agentView(agent), chainOfCommand: chain}];
    }
    if (method === 'GET' && match('agents/:id')) return [200, agentView(agentOr404(at(1)))];
    if (method === 'PATCH' && match('agents/:id')) {
        board(actor);
        const agent = agentOr404(at(1));
        if (body.role !== undefined && !AGENT_ROLES.includes(body.role)) validation(['role'], 'Invalid option', 'invalid_value');
        for (const field of ['name', 'role', 'title', 'reportsTo', 'capabilities', 'adapterType']) if (body[field] !== undefined) agent[field] = body[field];
        if (body.adapterConfig !== undefined) agent.adapterConfig = body.adapterConfig;
        if (body.status === 'paused') Object.assign(agent, {status: 'paused', pauseReason: 'manual', pausedAt: now()});
        if (body.status === 'idle') Object.assign(agent, {status: 'idle', pauseReason: null, pausedAt: null});
        if (body.status === 'terminated') agent.status = 'terminated';
        if (body.budgetMonthlyCents !== undefined) upsertPolicy({scopeType: 'agent', scopeId: agent.id, amount: body.budgetMonthlyCents, isActive: body.budgetMonthlyCents > 0});
        agent.updatedAt = now();
        log(actor, 'agent.updated', 'agent', agent.id, {name: agent.name});
        evaluateBudgets();
        return [200, agentView(agent)];
    }
    if (method === 'GET' && match('agents/:id/keys')) {
        board(actor);
        agentOr404(at(1));
        return [200, state.keys.filter((key) => key.agentId === at(1)).map(keyView)];
    }
    if (method === 'POST' && match('agents/:id/keys')) {
        board(actor);
        const agent = agentOr404(at(1));
        const key = {id: randomUUID(), agentId: agent.id, name: blank(body.name) ? 'default' : body.name, token: `pcp_stub_${randomBytes(24).toString('hex')}`, scope: {kind: 'standard'}, responsibleUserId: BOARD_USER, createdAt: now(), revokedAt: null};
        state.keys.push(key);
        log(actor, 'agent.key_created', 'agent', agent.id, {name: key.name, keyId: key.id});
        const {agentId, revokedAt, ...shown} = key;
        void agentId; void revokedAt;
        return [201, shown];
    }
    if (method === 'DELETE' && match('agents/:id/keys/:keyId')) {
        board(actor);
        const key = state.keys.find((row) => row.id === at(3) && row.agentId === at(1));
        if (!key || key.revokedAt) fail(404, 'Key not found');
        key.revokedAt = now();
        log(actor, 'agent.key_revoked', 'agent', key.agentId, {keyId: key.id});
        return [200, {ok: true}];
    }
    if (method === 'POST' && match('agents/:id/heartbeat/invoke')) {
        const agent = agentOr404(at(1));
        if (actor.type === 'agent' && actor.agentId !== agent.id) fail(403, 'Agent can only invoke itself');
        if (agent.status === 'paused') fail(409, agent.pauseReason === 'budget' ? 'Agent is paused because its budget hard-stop was reached.' : 'Agent is paused');
        const issueId = typeof body.payload?.issueId === 'string' ? body.payload.issueId : null;
        const issue = issueId ? state.issues.get(issueId) : null;
        if (issueId && (!issue || (issue.assigneeAgentId && issue.assigneeAgentId !== agent.id))) return [202, {status: 'skipped'}];
        const run = startRun(agent, {reason: typeof body.reason === 'string' && body.reason ? body.reason : 'on_demand', source: 'on_demand', issueId, extraContext: {triggeredBy: actor.type, actorId: actor.type === 'agent' ? actor.agentId : BOARD_USER}});
        log(actor, 'heartbeat.invoked', 'heartbeat_run', run.id, {agentId: agent.id});
        const view = runView(run);
        wake(agent, run);
        return [202, view];
    }

    // issues
    if (method === 'GET' && match('companies/:id/issues')) {
        const statuses = url.searchParams.get('status')?.split(',') ?? null;
        const assignee = url.searchParams.get('assigneeAgentId');
        return [200, [...state.issues.values()].filter((i) => (!statuses || statuses.includes(i.status)) && (!assignee || i.assigneeAgentId === assignee)).map(issueView)];
    }
    if (method === 'POST' && match('companies/:id/issues')) {
        const duplicate = duplicateOf(body);
        if (duplicate) return [200, {...issueView(duplicate.issue), deduplicated: true, deduplicationReason: duplicate.reason}];
        return [201, issueView(createIssue(actor, body))];
    }
    if (method === 'GET' && match('issues/:id')) return [200, issueView(issueOr404(at(1)))];
    if (method === 'PATCH' && match('issues/:id')) return [200, patchIssue(issueOr404(at(1)), actor, body)];
    if (method === 'POST' && match('issues/:id/checkout')) return [200, checkout(issueOr404(at(1)), actor, body)];
    if (method === 'GET' && match('issues/:id/comments')) {
        const issue = issueOr404(at(1));
        return [200, state.comments.filter((c) => c.issueId === issue.id).reverse()];
    }
    if (method === 'POST' && match('issues/:id/comments')) {
        const issue = issueOr404(at(1));
        if (blank(body.body)) validation(['body'], 'Too small: expected string to have >=1 characters', 'too_small');
        const run = attribute(actor, issue);
        return [201, addComment(issue, {authorAgentId: actor.type === 'agent' ? actor.agentId : null, createdByRunId: run?.id ?? actor.runId ?? null, body: body.body})];
    }
    if (method === 'GET' && match('issues/:id/runs')) {
        const issue = issueOr404(at(1));
        return [200, [...state.runs.values()].filter((run) => run.contextSnapshot.issueId === issue.id).reverse().map((run) => ({
            runId: run.id, runtimeMode: 'legacy', status: run.status, agentId: run.agentId, adapterType: state.agents.get(run.agentId)?.adapterType ?? 'http',
            startedAt: run.startedAt, finishedAt: run.finishedAt, createdAt: run.createdAt, invocationSource: run.invocationSource, errorCode: run.errorCode, error: run.error, contextIssueId: issue.id,
        }))];
    }
    if (method === 'GET' && match('heartbeat-runs/:id')) {
        const run = state.runs.get(at(1)) ?? fail(400, 'Invalid heartbeat run ID');
        return [200, runView(run)];
    }
    if (method === 'GET' && match('companies/:id/heartbeat-runs')) {
        const agentId = url.searchParams.get('agentId');
        const limit = Math.max(1, Math.min(1000, Number(url.searchParams.get('limit')) || 200));
        return [200, [...state.runs.values()].filter((run) => !agentId || run.agentId === agentId).reverse().slice(0, limit).map(runView)];
    }

    // costs, budgets, dashboard, activity
    if (method === 'POST' && match('companies/:id/cost-events')) {
        const missing = ['agentId', 'provider', 'model', 'occurredAt'].find((field) => blank(body[field]));
        if (missing) validation([missing], 'Invalid input: expected string, received undefined');
        if (Number.isNaN(Date.parse(body.occurredAt))) validation(['occurredAt'], 'Invalid ISO datetime', 'invalid_format');
        const costCents = parseCents(body.costCents);
        if (costCents === null) validation(['costCents'], 'Invalid decimal money amount', 'custom');
        if (costCents < 0) validation(['costCents'], 'Money cannot be negative', 'custom');
        if (actor.type === 'agent' && actor.agentId !== body.agentId) return [403, {error: 'Agent can only report its own costs'}];
        agentOr404(body.agentId);
        if (body.issueId && !state.issues.has(body.issueId)) return [404, {error: 'Issue not found'}];
        const receipt = createHash('sha256').update(JSON.stringify([body.agentId, body.provider, body.model, body.inputTokens ?? 0, body.outputTokens ?? 0, cents7(costCents), body.occurredAt, body.issueId ?? null, body.billingCode ?? null])).digest('hex');
        if (body.idempotencyKey) {
            const prior = state.costEvents.find((event) => event.idempotencyKey === body.idempotencyKey);
            if (prior) return prior.receiptHash === receipt ? [201, prior] : [409, {error: 'Idempotency key already used for a different cost receipt'}];
        }
        return [201, recordCost({...body, costCents, receiptHash: receipt}, actor)];
    }
    if (method === 'GET' && match('companies/:id/costs/by-agent')) return [200, byAgentRows()];
    if (method === 'GET' && match('companies/:id/costs/summary')) {
        const unpriced = state.costEvents.filter((event) => event.costStatus === 'unpriced').length;
        const spend = state.company.spentMonthlyCents;
        return [200, {companyId: COMPANY_ID, eventCount: state.costEvents.length, unpricedEventCount: unpriced, unknownBillingEventCount: state.costEvents.length, estimatedEventCount: 0, pendingRunCount: 0, pricingComplete: unpriced === 0, spendCents: spend, spendCentsExact: cents7(spend), budgetCents: state.company.budgetMonthlyCents, utilizationPercent: state.company.budgetMonthlyCents > 0 ? round2((spend / state.company.budgetMonthlyCents) * 100) : 0}];
    }
    if (method === 'GET' && match('companies/:id/dashboard')) return [200, dashboard()];
    if (method === 'GET' && match('companies/:id/activity')) {
        const limit = Math.max(1, Math.min(500, Number(url.searchParams.get('limit')) || 100));
        const filters = ['agentId', 'entityType', 'entityId'].map((key) => [key, url.searchParams.get(key)]).filter(([, value]) => value);
        return [200, state.activity.filter((row) => filters.every(([key, value]) => row[key] === value)).slice(0, limit)];
    }
    if (method === 'GET' && match('companies/:id/budgets/overview')) return [200, overview()];
    if (method === 'POST' && match('companies/:id/budgets/policies')) {
        board(actor);
        if (!['company', 'agent', 'project'].includes(body.scopeType)) validation(['scopeType'], 'Invalid option', 'invalid_value');
        if (body.unpricedUsagePolicy !== undefined && !['block', 'allow'].includes(body.unpricedUsagePolicy)) validation(['unpricedUsagePolicy'], 'Invalid option', 'invalid_value');
        const policy = upsertPolicy(body);
        // A policy that now allows the unpriced usage behind an open incident lifts that pause.
        if (body.unpricedUsagePolicy === 'allow' && body.scopeType === 'company' && state.company.status === 'paused' && state.company.spentMonthlyCents < policy.amount) state.company.status = 'active';
        log(actor, 'budget.policy_upserted', 'budget_policy', policy.policyId, {scopeType: policy.scopeType, scopeId: policy.scopeId, amount: policy.amount});
        return [200, overview().policies.find((p) => p.policyId === policy.policyId)];
    }
    if (method === 'POST' && match('companies/:id/budget-incidents/:incidentId/resolve')) {
        board(actor);
        const incident = state.incidents.find((row) => row.id === at(3)) ?? fail(404, 'Budget incident not found');
        if (body.action === 'raise_budget_and_resume') {
            upsertPolicy({scopeType: incident.scopeType, scopeId: incident.scopeId, amount: body.amount});
            if (incident.scopeType === 'agent') Object.assign(state.agents.get(incident.scopeId), {status: 'idle', pauseReason: null, pausedAt: null});
            else state.company.status = 'active';
        }
        Object.assign(incident, {status: 'resolved', resolvedAt: now()});
        return [200, incident];
    }

    // routines
    if (method === 'GET' && match('companies/:id/routines')) return [200, [...state.routines.values()].map(routineView)];
    if (method === 'POST' && match('companies/:id/routines')) {
        if (actor.type === 'agent' && body.assigneeAgentId !== actor.agentId) fail(403, 'Agents can only manage routines assigned to themselves');
        if (blank(body.title)) validation(['title'], 'Invalid input: expected string, received undefined');
        if (body.assigneeAgentId) agentOr404(body.assigneeAgentId);
        const routine = {id: randomUUID(), companyId: COMPANY_ID, title: body.title, description: body.description ?? null, assigneeAgentId: body.assigneeAgentId ?? null, projectId: body.projectId ?? null, priority: body.priority ?? 'medium', status: body.status ?? 'active', concurrencyPolicy: body.concurrencyPolicy ?? 'coalesce_if_active', catchUpPolicy: body.catchUpPolicy ?? 'skip_missed', variables: [], createdAt: now(), updatedAt: now(), triggers: []};
        state.routines.set(routine.id, routine);
        log(actor, 'routine.created', 'routine', routine.id, {title: routine.title});
        return [201, routineView(routine)];
    }
    if (method === 'GET' && match('routines/:id')) return [200, routineView(state.routines.get(at(1)) ?? fail(404, 'Routine not found'))];
    if (method === 'POST' && match('routines/:id/triggers')) {
        const routine = state.routines.get(at(1)) ?? fail(404, 'Routine not found');
        if (actor.type === 'agent' && routine.assigneeAgentId !== actor.agentId) fail(403, 'Agents can only manage routines assigned to themselves');
        if (!['schedule', 'webhook', 'api'].includes(body.kind)) validation(['kind'], 'Invalid discriminator value', 'invalid_union');
        const trigger = {id: randomUUID(), companyId: COMPANY_ID, routineId: routine.id, kind: body.kind, label: body.label ?? null, enabled: body.enabled ?? true, setupPending: false, archived: false, cronExpression: body.cronExpression ?? null, timezone: body.kind === 'schedule' ? (body.timezone ?? 'UTC') : null, publicId: body.kind === 'webhook' ? randomBytes(8).toString('hex') : null, createdAt: now(), updatedAt: now()};
        routine.triggers.push(trigger);
        log(actor, 'routine.trigger_created', 'routine', routine.id, {kind: trigger.kind});
        return [201, {trigger}];
    }
    if (method === 'POST' && match('routines/:id/run')) return [202, runRoutine(state.routines.get(at(1)) ?? fail(404, 'Routine not found'), actor, body)];
    if (method === 'GET' && match('routines/:id/runs')) return [200, state.routineRuns.filter((run) => run.routineId === at(1)).reverse()];

    return [404, {error: 'Not found'}];
};

const exportState = () => ({
    down: state.down,
    company: state.company,
    agents: [...state.agents.values()],
    keys: state.keys,
    issues: [...state.issues.values()].map((issue) => ({
        ...issue,
        comments: state.comments.filter((c) => c.issueId === issue.id),
        decisions: state.decisions.filter((d) => d.issueId === issue.id),
    })),
    runs: [...state.runs.values()],
    costEvents: state.costEvents,
    activity: state.activity,
    policies: [...state.policies.values()],
    incidents: state.incidents,
    routines: [...state.routines.values()],
    routineRuns: state.routineRuns,
    wakes: state.wakes,
});

reset();

const server = http.createServer(async (req, res) => {
    const url = new URL(req.url ?? '/', `http://localhost:${PAPERCLIP_STUB_PORT}`);
    if (url.pathname === '/__state') return json(res, 200, exportState());
    if (url.pathname === '/__reset') {
        reset();
        return json(res, 200, {ok: true});
    }
    if (url.pathname === '/__mode') {
        const down = url.searchParams.get('down');
        if (down === '1' || down === '0') state.down = down === '1';
        return json(res, 200, {down: state.down});
    }
    if (!url.pathname.startsWith('/api/')) return json(res, 404, {error: 'Not found'});
    if (state.down) return json(res, 503, {error: 'Service unavailable'});
    try {
        const [status, body, headers] = await route(req, url);
        return json(res, status, body, headers);
    } catch (error) {
        if (error instanceof Answer) return json(res, error.status, error.body);
        console.error(error);
        return json(res, 500, {error: 'Internal server error'});
    }
});

server.listen(PAPERCLIP_STUB_PORT, () => console.log(`READY http://localhost:${PAPERCLIP_STUB_PORT}`));
server.on('error', (error) => {
    console.error('FAILED', error);
    process.exit(1);
});
