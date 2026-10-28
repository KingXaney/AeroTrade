// The Paperclip company's REST API, as AeroTrade calls it with the Execution desk agent's key
// (PAPERCLIP_API_KEY). Server-only by use. Every call answers, never throws, within five seconds:
// a response that does not read as the shape Paperclip v2026.1023.0 sends is 'unexpected' (zod), a
// network failure, a timeout, a 429 or a 5xx is 'unreachable' and filed with the limits tracker, and
// any other refusal is 'refused' with Paperclip's own message — a 409 (someone else's checkout) or a
// 422 (not this agent's stage) is an answer, not a limit. Mongo stays the truth: callers mirror
// into Paperclip best-effort and note what did not land.
//
// What a local Paperclip v2026.1023.0 showed, and why the calls below take the shape they do:
// - An agent key's comments and issue updates are refused (403) unless X-Paperclip-Run-Id names one
//   of that agent's own heartbeat runs whose context names an issue; a run on the same issue is
//   uncounted, one on another issue counts toward a cap of 20 writes per run. runFor finds one.
// - An issue created in todo for the Head trader wakes it at once and checks the issue out to that
//   short http run, after which no update lands without a live run; created in backlog it waits.
// - The approval stage's participant (the Execution desk, an http agent) cannot answer inside its
//   wake, so Paperclip parks the issue in blocked while the stage stays pending; the desk's
//   decision still completes it from there: done approves, any other status requests changes.

import {z} from "zod";
import type {PaperclipSettings} from "@/lib/agent-world/env";
import {reportLimit} from "@/lib/limits/report";

export type PaperclipFailure = 'unconfigured' | 'unreachable' | 'refused' | 'unexpected';
export type PaperclipResult<T> = {ok: true; data: T} | {ok: false; reason: PaperclipFailure; status: number; message: string};

export type PaperclipAgent = {
    id: string;
    name: string;
    role: string;
    title: string | null;
    status: string;
    reportsTo: string | null;
    budgetMonthlyCents: number;
    spentMonthlyCents: number;
};
export type PaperclipExecutionState = {
    status: 'idle' | 'pending' | 'changes_requested' | 'completed';
    participantAgentId: string | null;
    lastDecisionOutcome: 'approved' | 'changes_requested' | null;
};
export type PaperclipIssue = {
    id: string;
    identifier: string | null;
    title: string;
    status: string;
    assigneeAgentId: string | null;
    executionState: PaperclipExecutionState | null;
};
export type PaperclipCostRow = {agentId: string; costCents: number; inputTokens: number; outputTokens: number};
export type PaperclipDashboard = {
    monthSpendCents: number;
    monthBudgetCents: number;
    monthUtilizationPercent: number;
    agents: Record<string, number>;
    tasks: Record<string, number>;
    pendingApprovals: number;
};
export type PaperclipActivity = {at: number; actor: string; action: string; entityType: string; entityId: string; details: string | null};
export type PaperclipCompany = {id: string; name: string; budgetMonthlyCents: number};
export type ExecutionPolicy = {
    mode: 'normal';
    commentRequired: true;
    stages: {type: 'approval'; approvalsNeeded: 1; participants: {type: 'agent'; agentId: string}[]}[];
};

export const PAPERCLIP_TIMEOUT_MS = 5_000;
// The reason a run this client asks Paperclip for carries (it reaches AeroTrade's own heartbeat
// route, which only logs it).
export const PAPERCLIP_RUN_REASON = 'agent-world';
// Paperclip refuses an unblock note longer than this.
const UNBLOCK_ACTION_CHARS = 2_000;
const MESSAGE_CHARS = 300;

// Paperclip sends money as a number, or a decimal string with seven places (costCentsExact).
const decimal = z.preprocess((value) => (typeof value === 'string' && value.trim() !== '' ? Number(value) : value), z.number().finite());
const decimalOrZero = decimal.nullish().transform((value) => value ?? 0);
const text = z.string().nullish().transform((value) => value ?? null);

const EXECUTION_STATUSES = ['idle', 'pending', 'changes_requested', 'completed'] as const;
const ExecutionStateSchema = z.object({
    status: z.string(),
    currentParticipant: z.object({type: z.string(), agentId: z.string().nullish()}).nullish(),
    lastDecisionOutcome: z.string().nullish(),
}).nullish().transform((state): PaperclipExecutionState | null => {
    if (!state) return null;
    const status = (EXECUTION_STATUSES as readonly string[]).includes(state.status) ? (state.status as PaperclipExecutionState['status']) : 'idle';
    const outcome = state.lastDecisionOutcome === 'approved' || state.lastDecisionOutcome === 'changes_requested' ? state.lastDecisionOutcome : null;
    const participant = state.currentParticipant?.type === 'agent' ? (state.currentParticipant.agentId ?? null) : null;
    return {status, participantAgentId: participant, lastDecisionOutcome: outcome};
});

const IssueSchema = z.object({
    id: z.string(),
    identifier: text,
    title: z.string(),
    status: z.string(),
    assigneeAgentId: text,
    executionState: ExecutionStateSchema,
}).transform((issue): PaperclipIssue => issue);

const AgentSchema = z.object({
    id: z.string(),
    name: z.string(),
    role: z.string().nullish(),
    title: text,
    status: z.string().nullish(),
    reportsTo: text,
    budgetMonthlyCents: decimalOrZero,
    spentMonthlyCents: decimalOrZero,
}).transform((agent): PaperclipAgent => ({...agent, role: agent.role ?? 'general', status: agent.status ?? 'idle'}));

const CompanySchema = z.object({id: z.string(), name: z.string(), budgetMonthlyCents: decimalOrZero})
    .transform((company): PaperclipCompany => company);

const CostRowSchema = z.object({
    agentId: z.string(),
    costCents: decimal.nullish(),
    costCentsExact: z.string().nullish(),
    inputTokens: decimalOrZero,
    outputTokens: decimalOrZero,
}).transform((row): PaperclipCostRow => {
    const exact = row.costCentsExact != null ? Number(row.costCentsExact) : Number.NaN;
    const costCents = row.costCents ?? (Number.isFinite(exact) ? exact : 0);
    return {agentId: row.agentId, costCents, inputTokens: row.inputTokens, outputTokens: row.outputTokens};
});

// The dashboard's counts by status, numbers only.
const counts = z.record(z.string(), z.unknown()).nullish().transform((value): Record<string, number> =>
    Object.fromEntries(Object.entries(value ?? {}).filter((entry): entry is [string, number] => typeof entry[1] === 'number' && Number.isFinite(entry[1]))));

const DashboardSchema = z.object({
    agents: counts,
    tasks: counts,
    costs: z.object({monthSpendCents: decimalOrZero, monthBudgetCents: decimalOrZero, monthUtilizationPercent: decimalOrZero}),
    pendingApprovals: decimalOrZero,
}).transform((dashboard): PaperclipDashboard => ({...dashboard.costs, agents: dashboard.agents, tasks: dashboard.tasks, pendingApprovals: dashboard.pendingApprovals}));

// An activity row's details, as one short line of the fields a reader can place.
const detailsLine = (details: unknown): string | null => {
    if (!details || typeof details !== 'object') return null;
    const d = details as Record<string, unknown>;
    const parts = [d.identifier, d.name, d.status, d.model, typeof d.costCents === 'number' ? `${d.costCents}¢` : null, d.bodySnippet]
        .filter((part): part is string => typeof part === 'string' && part.trim() !== '');
    const line = parts.join(' · ').replace(/\s+/g, ' ').trim();
    return line === '' ? null : line.slice(0, 200);
};

const ActivitySchema = z.object({
    actorType: z.string().nullish(),
    actorId: z.string().nullish(),
    action: z.string(),
    entityType: z.string().nullish(),
    entityId: z.string().nullish(),
    details: z.unknown().optional(),
    createdAt: z.string(),
}).transform((row): PaperclipActivity => ({
    at: Date.parse(row.createdAt),
    // An agent by its id (the page names it from the agents list); a person as the board.
    actor: row.actorType === 'agent' && row.actorId ? row.actorId : row.actorType === 'user' ? 'board' : (row.actorType ?? 'system'),
    action: row.action,
    entityType: row.entityType ?? '',
    entityId: row.entityId ?? '',
    details: detailsLine(row.details),
}));

const MeSchema = z.object({id: z.string()});
const IssueRunsSchema = z.array(z.object({runId: z.string(), agentId: z.string(), status: z.string(), createdAt: z.string().nullish()}));
const AgentRunsSchema = z.array(z.object({
    id: z.string(),
    agentId: z.string(),
    status: z.string(),
    createdAt: z.string().nullish(),
    contextSnapshot: z.object({issueId: z.string().nullish(), taskId: z.string().nullish()}).nullish(),
}));
// A run Paperclip queued for the invoking agent, or {status: 'skipped'} when the issue is not its own.
const InvokeSchema = z.object({id: z.string().nullish(), status: z.string()});
const CommentSchema = z.object({id: z.string()});

const messageOf = (body: unknown, fallback: string): string => {
    const value = (body as {error?: unknown; message?: unknown} | null)?.error ?? (body as {message?: unknown} | null)?.message;
    return typeof value === 'string' && value.trim() !== '' ? value.slice(0, MESSAGE_CHARS) : fallback;
};

const errorText = (error: unknown): string => (error instanceof Error ? error.message : String(error)).slice(0, MESSAGE_CHARS);

const newestFirst = <T extends {createdAt?: string | null}>(rows: readonly T[]): T[] =>
    [...rows].sort((a, b) => (b.createdAt ?? '').localeCompare(a.createdAt ?? ''));

const UNCONFIGURED = {ok: false, reason: 'unconfigured', status: 0, message: 'Paperclip is not configured'} as const;
const refused = (status: number, message: string): PaperclipResult<never> => ({ok: false, reason: 'refused', status, message});

export const createPaperclipClient = (settings: PaperclipSettings | null, fetchImpl: typeof fetch = fetch) => {
    type Init = {method?: 'GET' | 'POST' | 'PATCH'; body?: unknown; runId?: string};
    const call = async <T>(path: string, schema: z.ZodType<T>, init: Init = {}): Promise<PaperclipResult<T>> => {
        if (settings === null) return UNCONFIGURED;
        const method = init.method ?? 'GET';
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), PAPERCLIP_TIMEOUT_MS);
        try {
            const response = await fetchImpl(`${settings.url}${path}`, {
                method,
                headers: {
                    Authorization: `Bearer ${settings.apiKey}`,
                    Accept: 'application/json',
                    ...(init.body !== undefined ? {'Content-Type': 'application/json'} : {}),
                    ...(init.runId ? {'X-Paperclip-Run-Id': init.runId} : {}),
                },
                ...(init.body !== undefined ? {body: JSON.stringify(init.body)} : {}),
                cache: 'no-store',
                signal: controller.signal,
            });
            const body: unknown = await response.json().catch(() => null);
            if (!response.ok) {
                const message = messageOf(body, `HTTP ${response.status}`);
                const transient = response.status === 429 || response.status >= 500;
                if (transient) await reportLimit('paperclip', {status: response.status, message: `${method} ${path}: HTTP ${response.status} ${message}`});
                return {ok: false, reason: transient ? 'unreachable' : 'refused', status: response.status, message};
            }
            const parsed = schema.safeParse(body);
            return parsed.success
                ? {ok: true, data: parsed.data}
                : {ok: false, reason: 'unexpected', status: response.status, message: `unexpected response from ${method} ${path}`};
        } catch (error) {
            const message = controller.signal.aborted ? `timed out after ${PAPERCLIP_TIMEOUT_MS} ms` : `unreachable: ${errorText(error)}`;
            await reportLimit('paperclip', {message: `${method} ${path}: ${message}`});
            return {ok: false, reason: 'unreachable', status: 0, message};
        } finally {
            clearTimeout(timer);
        }
    };

    const company = encodeURIComponent(settings?.companyId ?? '');
    const issuePath = (id: string): string => `/api/issues/${encodeURIComponent(id)}`;

    let me: string | null = null;
    const whoAmI = async (): Promise<PaperclipResult<string>> => {
        if (me !== null) return {ok: true, data: me};
        const read = await call('/api/agents/me', MeSchema);
        if (!read.ok) return read;
        me = read.data.id;
        return {ok: true, data: me};
    };

    // A heartbeat run of this agent to attribute a write on the issue to: its newest run on the issue
    // (the approval wake, usually); else, on an open issue the desk holds, one it asks Paperclip for
    // with the issue as context (on an issue another agent holds Paperclip skips or cancels that run
    // at once, and a write under a cancelled run is refused); else its newest run on any issue, which
    // Paperclip counts toward that run's 20 writes outside its own issue.
    const runFor = async (target: PaperclipIssue): Promise<PaperclipResult<string>> => {
        const self = await whoAmI();
        if (!self.ok) return self;
        const onIssue = await call(`${issuePath(target.id)}/runs`, IssueRunsSchema);
        if (!onIssue.ok) return onIssue;
        const mine = newestFirst(onIssue.data).find((run) => run.agentId === self.data && run.status !== 'cancelled');
        if (mine) return {ok: true, data: mine.runId};
        if (target.assigneeAgentId === self.data && target.status !== 'done' && target.status !== 'cancelled') {
            const minted = await call(`/api/agents/${encodeURIComponent(self.data)}/heartbeat/invoke`, InvokeSchema, {method: 'POST', body: {reason: PAPERCLIP_RUN_REASON, payload: {issueId: target.id}}});
            if (minted.ok && minted.data.id) return {ok: true, data: minted.data.id};
            if (!minted.ok && minted.reason === 'unreachable') return minted;
        }
        const recent = await call(`/api/companies/${company}/heartbeat-runs?agentId=${encodeURIComponent(self.data)}&limit=20`, AgentRunsSchema);
        if (!recent.ok) return recent;
        const any = newestFirst(recent.data).find((run) => run.agentId === self.data && run.status !== 'cancelled' && (run.contextSnapshot?.issueId ?? run.contextSnapshot?.taskId));
        return any ? {ok: true, data: any.id} : refused(403, 'no heartbeat run of this agent to attribute the write to');
    };

    const patch = async (id: string, runId: string, body: Record<string, unknown>) =>
        call(issuePath(id), IssueSchema, {method: 'PATCH', body, runId});

    const issue = (id: string) => call(issuePath(id), IssueSchema);

    const commentOn = async (target: PaperclipIssue, body: string): Promise<PaperclipResult<{id: string}>> => {
        const run = await runFor(target);
        if (!run.ok) return run;
        return call(`${issuePath(target.id)}/comments`, CommentSchema, {method: 'POST', body: {body}, runId: run.data});
    };

    const comment = async (id: string, body: string): Promise<PaperclipResult<{id: string}>> => {
        const target = await issue(id);
        return target.ok ? commentOn(target.data, body) : target;
    };

    return {
        company: () => call(`/api/companies/${company}`, CompanySchema),

        agents: () => call(`/api/companies/${company}/agents`, z.array(AgentSchema)),

        // Opened in backlog: in todo, Paperclip would wake the Head trader at once and check the issue
        // out to that short run, leaving it where no update lands without a live run. Paperclip
        // answers a create whose title matches an open issue of the last 48 hours with that issue,
        // so two sessions titled alike would share one: allowDuplicate turns that off, and an
        // idempotency key (the session id) makes a retried create answer the issue it made.
        createIssue: (input: {title: string; description: string; assigneeAgentId: string; executionPolicy: ExecutionPolicy | null; idempotencyKey?: string}) =>
            call(`/api/companies/${company}/issues`, IssueSchema, {
                method: 'POST',
                body: {
                    title: input.title,
                    description: input.description,
                    status: 'backlog',
                    assigneeAgentId: input.assigneeAgentId,
                    allowDuplicate: true,
                    ...(input.idempotencyKey ? {idempotencyKey: input.idempotencyKey.slice(0, 255)} : {}),
                    ...(input.executionPolicy ? {executionPolicy: input.executionPolicy} : {}),
                },
            }),

        issue,

        comment,

        // The owner's decision on the session's approval stage, as the Execution desk. On a stage that
        // waits for the desk, done approves and in_progress sends the issue back to the Head trader.
        // An issue the Head trader never handed in (the service could not reach Paperclip) is handed
        // in by the desk's first done, which its second done then approves; a decline cancels it. A
        // decision already on the issue is answered as it stands.
        decide: async (id: string, decision: 'approved' | 'declined', note: string): Promise<PaperclipResult<PaperclipIssue>> => {
            const current = await issue(id);
            if (!current.ok) return current;
            const state = current.data.executionState;
            const settled = decision === 'approved'
                ? current.data.status === 'done' && state?.lastDecisionOutcome === 'approved'
                : current.data.status === 'cancelled' || state?.status === 'changes_requested';
            if (settled) return current;
            if (current.data.status === 'done' || current.data.status === 'cancelled') return refused(409, `the issue is already ${current.data.status}`);
            const self = await whoAmI();
            if (!self.ok) return self;
            const run = await runFor(current.data);
            if (!run.ok) return run;
            if (state?.status === 'pending') {
                if (state.participantAgentId !== self.data) return refused(422, 'the approval stage waits for another participant');
                return patch(id, run.data, {status: decision === 'approved' ? 'done' : 'in_progress', comment: note});
            }
            if (decision === 'declined') return patch(id, run.data, {status: 'cancelled', comment: note});
            const handedIn = await patch(id, run.data, {status: 'done', comment: note});
            if (!handedIn.ok) return handedIn;
            const after = handedIn.data.executionState;
            return after?.status === 'pending' && after.participantAgentId === self.data ? patch(id, run.data, {status: 'done', comment: note}) : handedIn;
        },

        // A status set by the desk with its reason. Blocked names the desk as the one to unblock it
        // (Paperclip lets an agent name only itself). On a stage that waits for the desk, any status
        // but done would be read as a decision, so there the reason is only commented.
        setStatus: async (id: string, status: 'blocked' | 'done' | 'cancelled', note: string): Promise<PaperclipResult<PaperclipIssue>> => {
            const current = await issue(id);
            if (!current.ok) return current;
            const self = await whoAmI();
            if (!self.ok) return self;
            const state = current.data.executionState;
            if (state?.status === 'pending' && state.participantAgentId === self.data && status !== 'done') {
                const said = await commentOn(current.data, note);
                return said.ok ? current : said;
            }
            const run = await runFor(current.data);
            if (!run.ok) return run;
            return patch(id, run.data, status === 'blocked'
                ? {status, comment: note, unblockDescriptor: {owner: {agentId: self.data}, action: note.slice(0, UNBLOCK_ACTION_CHARS)}}
                : {status, comment: note});
        },

        costsByAgent: () => call(`/api/companies/${company}/costs/by-agent`, z.array(CostRowSchema)),

        dashboard: () => call(`/api/companies/${company}/dashboard`, DashboardSchema),

        activity: (limit = 20) =>
            call(`/api/companies/${company}/activity?limit=${Math.min(100, Math.max(1, Math.floor(limit)))}`, z.array(ActivitySchema)),
    };
};

export type PaperclipClient = ReturnType<typeof createPaperclipClient>;
