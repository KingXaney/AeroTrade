// What the service may send (services/agent-world, the event table in its README), read the way
// every model output is read here: zod over unknown, texts cut to their clamps, numbers bounded,
// unknown keys dropped, nothing trusted. Pure, so the folds below are unit-tested on the service's
// own exported fixture (scripts/qa/fixtures/agent-world-events.json).
//
// A batch lands in two places (lib/agent-world/store.ts applyEventBatch): each run-level event as
// one guarded update of its run's document (runUpdateFor), and the whole batch folded into the
// session's small head (foldHead), written once with a compare-and-set on the head's seq. Both are
// keyed on `seq`, so a retried batch, a duplicate or a stale event changes nothing.

import {z} from 'zod';
import {
    APPROVAL_MODES,
    CLAMPS,
    COST_EXTRA_ROLES,
    DEBATE_SIDES,
    EVENTS_PER_BATCH,
    LIMITS_KEPT,
    MAX_UNIVERSE,
    RATINGS,
    RISK_ROLES,
    SYMBOL_PATTERN,
    TOOLS_KEPT,
    TURNS_KEPT,
    isRoleId,
    type CostRole,
    type RoleId,
    type ServiceOutcome,
    type SessionStatus,
} from "@/lib/agent-world/config";
import type {SessionCost, SessionLimit, SessionModels, SessionRunSummary} from "@/lib/agent-world/types";

const cut = (max: number) => z.string().transform((value) => value.slice(0, max));
export const SESSION_ID = z.string().regex(/^[A-Za-z0-9-]{1,80}$/);
const SYMBOL = z.string().regex(SYMBOL_PATTERN);
const AT = z.string().max(40).refine((value) => Number.isFinite(Date.parse(value))).transform((value) => Date.parse(value));
const COUNT = z.number().int().min(0).max(1_000_000_000);
const CENTS = z.number().finite().min(0).max(10_000_000);
const ROLE = z.custom<RoleId>((value) => isRoleId(value));
const COST_ROLE = z.custom<CostRole>((value) => isRoleId(value) || (COST_EXTRA_ROLES as readonly unknown[]).includes(value));
const SHORT = cut(80);

const base = {seq: z.number().int().positive().max(10_000_000), at: AT, sessionId: SESSION_ID};

const sessionStarted = z.object({
    ...base,
    type: z.literal('session.started'),
    symbols: z.array(SYMBOL).min(1).max(MAX_UNIVERSE),
    tradeDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    approval: z.enum(APPROVAL_MODES),
    dryRun: z.boolean(),
    models: z.object({provider: SHORT, quick: SHORT, deep: SHORT}).nullish(),
});
const runStarted = z.object({...base, type: z.literal('run.started'), symbol: SYMBOL, index: z.number().int().min(0).max(MAX_UNIVERSE), total: z.number().int().min(1).max(MAX_UNIVERSE)});
const roleStarted = z.object({...base, type: z.literal('role.started'), symbol: SYMBOL, role: ROLE});
const roleDone = z.object({...base, type: z.literal('role.done'), symbol: SYMBOL, role: ROLE});
const roleReport = z.object({...base, type: z.literal('role.report'), symbol: SYMBOL, role: ROLE, text: cut(CLAMPS.report), forced: z.boolean().optional()});
const debateTurn = z.object({...base, type: z.literal('debate.turn'), symbol: SYMBOL, side: z.enum(DEBATE_SIDES), round: z.number().int().min(1).max(20), text: cut(CLAMPS.turn)});
const riskTurn = z.object({...base, type: z.literal('risk.turn'), symbol: SYMBOL, role: z.enum(RISK_ROLES), round: z.number().int().min(1).max(20), text: cut(CLAMPS.turn)});
const toolCalled = z.object({...base, type: z.literal('tool.called'), symbol: SYMBOL, role: ROLE, name: SHORT, args: cut(CLAMPS.toolArgs), callId: SHORT});
const toolResult = z.object({
    ...base,
    type: z.literal('tool.result'),
    symbol: SYMBOL,
    role: ROLE,
    callId: SHORT,
    name: SHORT,
    status: z.enum(['ok', 'unavailable', 'no-data']),
    chars: COUNT,
    vendor: SHORT.nullish(),
    ms: z.number().int().min(0).max(3_600_000).nullish(),
    attempts: z.array(z.object({vendor: SHORT, ok: z.boolean(), error: cut(200).nullish()})).max(6).nullish(),
});
const costTick = z.object({
    ...base,
    type: z.literal('cost.tick'),
    symbol: SYMBOL,
    role: COST_ROLE,
    model: SHORT,
    inputTokens: COUNT,
    outputTokens: COUNT,
    costCents: CENTS,
    llmCalls: z.number().int().min(1).max(100_000),
    pricing: z.enum(['known', 'unknown']).optional(),
});
const memoryNote = z.object({...base, type: z.literal('memory.note'), symbol: SYMBOL, text: cut(CLAMPS.note)});
const limit = z.object({
    ...base,
    type: z.literal('limit'),
    symbol: SYMBOL.nullish(),
    provider: SHORT,
    status: z.number().int().min(0).max(999),
    message: cut(CLAMPS.message),
    fatal: z.boolean(),
});
const RUN_STATS = z.object({llmCalls: COUNT, toolCalls: COUNT, tokensIn: COUNT, tokensOut: COUNT, costCents: CENTS});
const runCompleted = z.object({
    ...base,
    type: z.literal('run.completed'),
    symbol: SYMBOL,
    rating: z.enum(RATINGS),
    review: z.boolean(),
    decision: cut(CLAMPS.decision),
    stats: RUN_STATS,
});
const runFailed = z.object({...base, type: z.literal('run.failed'), symbol: SYMBOL, reason: z.enum(['timeout', 'error', 'limit']), message: cut(CLAMPS.message)});
const sessionCompleted = z.object({
    ...base,
    type: z.literal('session.completed'),
    runs: z.array(z.object({symbol: SYMBOL, rating: z.enum(RATINGS), review: z.boolean()})).max(MAX_UNIVERSE),
    tokensIn: COUNT,
    tokensOut: COUNT,
    costCents: CENTS,
    llmCalls: COUNT,
    toolCalls: COUNT,
    dropped: COUNT,
});
const sessionFailed = z.object({...base, type: z.literal('session.failed'), outcome: z.enum(['error', 'limit', 'budget', 'timeout']), message: cut(CLAMPS.message)});

export const eventSchema = z.discriminatedUnion('type', [
    sessionStarted, runStarted, roleStarted, roleDone, roleReport, debateTurn, riskTurn, toolCalled, toolResult,
    costTick, memoryNote, limit, runCompleted, runFailed, sessionCompleted, sessionFailed,
]);
export type AgentWorldEvent = z.output<typeof eventSchema>;
export type AgentWorldEventType = AgentWorldEvent['type'];

const batchSchema = z.object({sessionId: SESSION_ID, events: z.array(z.unknown()).min(1).max(EVENTS_PER_BATCH)});

export type ParsedBatch = {ok: true; sessionId: string; events: AgentWorldEvent[]; invalid: number} | {ok: false};

// A batch's events in seq order, each read on its own: one malformed event is counted and left
// out (its seq becomes a gap, as a dropped one does) rather than refusing its neighbours. An event
// naming another session than its batch is malformed.
export const parseBatch = (raw: unknown): ParsedBatch => {
    const batch = batchSchema.safeParse(raw);
    if (!batch.success) return {ok: false};
    const seen = new Set<number>();
    const events: AgentWorldEvent[] = [];
    let invalid = 0;
    for (const item of batch.data.events) {
        const parsed = eventSchema.safeParse(item);
        if (!parsed.success || parsed.data.sessionId !== batch.data.sessionId || seen.has(parsed.data.seq)) {
            invalid += 1;
            continue;
        }
        seen.add(parsed.data.seq);
        events.push(parsed.data);
    }
    events.sort((a, b) => a.seq - b.seq);
    return {ok: true, sessionId: batch.data.sessionId, events, invalid};
};

// ---- the session's head ----

export type SessionHead = {
    status: SessionStatus;
    seq: number;
    startedAt: number | null;
    finishedAt: number | null;
    serviceFinishedAt: number | null;
    current: {symbol: string; index: number} | null;
    runs: SessionRunSummary[];
    cost: SessionCost;
    limits: SessionLimit[];
    service: {outcome: ServiceOutcome; message: string} | null;
    models: SessionModels | null;
    dropped: number;
};

// A status the service's events never move a session out of: what the job or the owner decided
// stands, even when a late batch arrives after the job stopped waiting.
export const TERMINAL_STATUSES: readonly SessionStatus[] = ['declined', 'lapsed', 'completed', 'failed'];

const emptyRun = (symbol: string): SessionRunSummary => ({symbol, status: 'pending', rating: null, review: false, costCents: 0});

// The head after `events`, those past its seq only, in order. Returns the same object when no
// event is newer.
export const foldHead = (head: SessionHead, events: readonly AgentWorldEvent[]): SessionHead => {
    const fresh = events.filter((event) => event.seq > head.seq).sort((a, b) => a.seq - b.seq);
    if (fresh.length === 0) return head;
    const next: SessionHead = {...head, runs: head.runs.map((run) => ({...run})), cost: {...head.cost}, limits: [...head.limits]};
    const run = (symbol: string): SessionRunSummary => {
        let found = next.runs.find((r) => r.symbol === symbol);
        if (!found) {
            found = emptyRun(symbol);
            next.runs.push(found);
        }
        return found;
    };
    const terminal = () => TERMINAL_STATUSES.includes(next.status);
    for (const event of fresh) {
        next.seq = event.seq;
        switch (event.type) {
            case 'session.started':
                if (next.status === 'queued') next.status = 'running';
                next.startedAt ??= event.at;
                next.models = event.models ?? next.models;
                break;
            case 'run.started':
                if (next.status === 'queued') next.status = 'running';
                next.current = {symbol: event.symbol, index: event.index};
                run(event.symbol).status = 'running';
                break;
            case 'run.completed': {
                const r = run(event.symbol);
                r.status = 'completed';
                r.rating = event.rating;
                r.review = event.review;
                // The run's own total stands for ticks that never arrived (dropped under load).
                const missing = event.stats.costCents - r.costCents;
                if (missing > 0) {
                    next.cost.totalCents += missing;
                    r.costCents = event.stats.costCents;
                }
                break;
            }
            case 'run.failed':
                run(event.symbol).status = 'failed';
                break;
            case 'cost.tick':
                next.cost.totalCents += event.costCents;
                next.cost.tokensIn += event.inputTokens;
                next.cost.tokensOut += event.outputTokens;
                next.cost.llmCalls += event.llmCalls;
                run(event.symbol).costCents += event.costCents;
                break;
            case 'tool.called':
                next.cost.toolCalls += 1;
                break;
            case 'limit':
                next.limits = [...next.limits, {provider: event.provider, status: event.status, message: event.message, fatal: event.fatal, at: event.at, symbol: event.symbol ?? null}].slice(-LIMITS_KEPT);
                break;
            case 'session.completed':
                next.serviceFinishedAt = event.at;
                next.dropped = event.dropped;
                next.current = null;
                break;
            case 'session.failed':
                next.serviceFinishedAt = event.at;
                next.current = null;
                if (!terminal()) {
                    next.status = 'failed';
                    next.service = {outcome: event.outcome, message: event.message};
                    next.finishedAt = event.at;
                }
                break;
            default:
                break;
        }
    }
    return next;
};

// ---- a run's document ----

export type RunUpdate = {$set: Record<string, unknown>; $inc?: Record<string, number>; $push?: Record<string, unknown>};

// The one guarded update a run-level event makes to its run's document (the caller adds the
// `seq < event.seq` filter), or null for an event that only moves the head.
export const runUpdateFor = (event: AgentWorldEvent): RunUpdate | null => {
    const at = new Date(event.at);
    const $set: Record<string, unknown> = {seq: event.seq};
    switch (event.type) {
        case 'run.started':
            return {$set: {...$set, index: event.index, status: 'running', startedAt: at}};
        case 'role.started':
            return {$set: {...$set, [`stages.${event.role}.status`]: 'working', [`stages.${event.role}.startedAt`]: at}};
        case 'role.done':
            return {$set: {...$set, [`stages.${event.role}.status`]: 'done', [`stages.${event.role}.finishedAt`]: at}};
        case 'role.report':
            return {$set: {...$set, [`reports.${event.role}`]: event.text, [`stages.${event.role}.reportAt`]: at}};
        case 'debate.turn':
            return {$set, $push: {debate: {$each: [{seq: event.seq, side: event.side, round: event.round, text: event.text, at}], $slice: -TURNS_KEPT}}};
        case 'risk.turn':
            return {$set, $push: {risk: {$each: [{seq: event.seq, role: event.role, round: event.round, text: event.text, at}], $slice: -TURNS_KEPT}}};
        case 'tool.called':
            return {
                $set,
                $inc: {'cost.toolCalls': 1},
                $push: {tools: {$each: [{seq: event.seq, callId: event.callId, role: event.role, name: event.name, args: event.args, at}], $slice: -TOOLS_KEPT}},
            };
        case 'tool.result':
            return {
                $set,
                $push: {
                    toolResults: {
                        $each: [{
                            seq: event.seq,
                            callId: event.callId,
                            role: event.role,
                            name: event.name,
                            status: event.status,
                            vendor: event.vendor ?? null,
                            ms: event.ms ?? null,
                            chars: event.chars,
                            attempts: (event.attempts ?? []).map((a) => ({vendor: a.vendor, ok: a.ok, error: a.error ?? null})),
                            at,
                        }],
                        $slice: -TOOLS_KEPT,
                    },
                },
            };
        case 'cost.tick': {
            const $inc: Record<string, number> = {
                'cost.totalCents': event.costCents,
                'cost.tokensIn': event.inputTokens,
                'cost.tokensOut': event.outputTokens,
                'cost.llmCalls': event.llmCalls,
            };
            if (isRoleId(event.role)) {
                $inc[`stages.${event.role}.costCents`] = event.costCents;
                $inc[`stages.${event.role}.tokensIn`] = event.inputTokens;
                $inc[`stages.${event.role}.tokensOut`] = event.outputTokens;
                $inc[`stages.${event.role}.llmCalls`] = event.llmCalls;
            } else {
                $inc[`extraCost.${event.role}`] = event.costCents;
            }
            return {$set, $inc};
        }
        case 'memory.note':
            return {$set: {...$set, memoryNote: event.text}};
        case 'run.completed':
            return {$set: {...$set, status: 'completed', rating: event.rating, review: event.review, decision: event.decision, stats: event.stats, finishedAt: at}};
        case 'run.failed':
            return {$set: {...$set, status: 'failed', failure: {reason: event.reason, message: event.message}, finishedAt: at}};
        default:
            return null;
    }
};

// The symbol a run-level event belongs to, or null for a session-level one.
export const symbolOf = (event: AgentWorldEvent): string | null =>
    'symbol' in event && typeof event.symbol === 'string' && event.type !== 'limit' ? event.symbol : null;
