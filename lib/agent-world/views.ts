// Stored rows as the page and the live route hand them on: dates to epoch milliseconds, every
// optional field filled, roles in their order. Pure (it reads plain objects, a `.lean()` row or a
// test's own), so the shapes the client sees are unit-tested without a database.

import {
    AGENT_WORLD_ENGINE_VERSION,
    COST_EXTRA_ROLES,
    ROLE_IDS,
    SERVICE_OUTCOMES,
    isRating,
    isRoleId,
    type CostRole,
    type RoleId,
    type ServiceOutcome,
    type SessionStatus,
} from "@/lib/agent-world/config";
import type {SessionHead} from "@/lib/agent-world/events";
import {glossAgentWorldReasons} from "@/lib/learn/agent-world-reasons";
import type {
    DebateTurn,
    RiskTurn,
    RunView,
    SessionCost,
    SessionFill,
    SessionLimit,
    SessionOrder,
    SessionRow,
    SessionRunSummary,
    SessionView,
    StageRecord,
    ToolCall,
    ToolResult,
} from "@/lib/agent-world/types";

type Loose = Record<string, unknown>;

const ms = (value: unknown): number | null => {
    if (value instanceof Date) return value.getTime();
    if (typeof value === 'number' && Number.isFinite(value)) return value;
    if (typeof value === 'string') {
        const parsed = Date.parse(value);
        return Number.isFinite(parsed) ? parsed : null;
    }
    return null;
};
const num = (value: unknown): number => (typeof value === 'number' && Number.isFinite(value) ? value : 0);
const str = (value: unknown): string | null => (typeof value === 'string' ? value : null);
const arr = (value: unknown): Loose[] => (Array.isArray(value) ? value.filter((item): item is Loose => typeof item === 'object' && item !== null) : []);
const obj = (value: unknown): Loose => (typeof value === 'object' && value !== null && !Array.isArray(value) ? value as Loose : {});

export const emptyCost = (): SessionCost => ({totalCents: 0, tokensIn: 0, tokensOut: 0, llmCalls: 0, toolCalls: 0});

const serviceOutcome = (value: unknown): ServiceOutcome => SERVICE_OUTCOMES.find((outcome) => outcome === value) ?? 'error';

const costOf = (value: unknown): SessionCost => {
    const c = obj(value);
    return {totalCents: num(c.totalCents), tokensIn: num(c.tokensIn), tokensOut: num(c.tokensOut), llmCalls: num(c.llmCalls), toolCalls: num(c.toolCalls)};
};

const runSummaries = (value: unknown): SessionRunSummary[] => arr(value).map((r) => ({
    symbol: str(r.symbol) ?? '',
    status: (['pending', 'running', 'completed', 'failed'] as const).find((s) => s === r.status) ?? 'pending',
    rating: isRating(r.rating) ? r.rating : null,
    review: r.review === true,
    costCents: num(r.costCents),
})).filter((r) => r.symbol !== '');

export const toSessionHead = (doc: Loose): SessionHead => ({
    status: (str(doc.status) ?? 'queued') as SessionStatus,
    seq: num(doc.seq),
    startedAt: ms(doc.startedAt),
    finishedAt: ms(doc.finishedAt),
    serviceFinishedAt: ms(doc.serviceFinishedAt),
    current: doc.current && typeof obj(doc.current).symbol === 'string' ? {symbol: obj(doc.current).symbol as string, index: num(obj(doc.current).index)} : null,
    runs: runSummaries(doc.runs),
    cost: costOf(doc.cost),
    limits: arr(doc.limits).map((l) => ({provider: str(l.provider) ?? '', status: num(l.status), message: str(l.message) ?? '', fatal: l.fatal === true, at: ms(l.at) ?? 0, symbol: str(l.symbol)})),
    service: doc.service ? {outcome: serviceOutcome(obj(doc.service).outcome), message: str(obj(doc.service).message) ?? ''} : null,
    models: doc.models ? {provider: str(obj(doc.models).provider) ?? '', quick: str(obj(doc.models).quick) ?? '', deep: str(obj(doc.models).deep) ?? ''} : null,
    dropped: num(doc.dropped),
});

// The head as stored again: the fields a batch write sets.
export const headFields = (head: SessionHead): Record<string, unknown> => ({
    status: head.status,
    seq: head.seq,
    startedAt: head.startedAt === null ? null : new Date(head.startedAt),
    finishedAt: head.finishedAt === null ? null : new Date(head.finishedAt),
    serviceFinishedAt: head.serviceFinishedAt === null ? null : new Date(head.serviceFinishedAt),
    current: head.current,
    runs: head.runs,
    cost: head.cost,
    limits: head.limits.map((l) => ({...l, at: new Date(l.at)})),
    service: head.service,
    models: head.models,
    dropped: head.dropped,
});

const orders = (value: unknown): SessionOrder[] => arr(value).flatMap((o) => {
    const symbol = str(o.symbol);
    const side = o.side === 'buy' || o.side === 'sell' ? o.side : null;
    if (!symbol || !side || !isRating(o.rating)) return [];
    const reason = str(o.reason) ?? '';
    return [{symbol, side, quantity: num(o.quantity), reason, rating: o.rating, targetWeight: typeof o.targetWeight === 'number' ? o.targetWeight : null, currentWeight: num(o.currentWeight), gloss: glossAgentWorldReasons([reason])}];
});

const fills = (value: unknown): SessionFill[] => arr(value).flatMap((f) => {
    const symbol = str(f.symbol);
    const side = f.side === 'buy' || f.side === 'sell' ? f.side : null;
    if (!symbol || !side) return [];
    return [{symbol, side, quantity: num(f.quantity), executed: f.executed === true, price: typeof f.price === 'number' ? f.price : null, message: str(f.message), at: ms(f.at) ?? 0}];
});

export const toSessionView = (doc: Loose): SessionView => {
    const head = toSessionHead(doc);
    const decision = obj(doc.decision);
    const paperclip = obj(doc.paperclip);
    const limits: SessionLimit[] = head.limits;
    return {
        sessionId: str(doc.sessionId) ?? '',
        kind: (['weekly', 'manual', 'preview'] as const).find((k) => k === doc.kind) ?? 'weekly',
        weekKey: str(doc.weekKey) ?? '',
        tradeDate: str(doc.tradeDate) ?? '',
        status: head.status,
        approval: doc.approval === 'auto' ? 'auto' : 'owner',
        symbols: Array.isArray(doc.symbols) ? doc.symbols.filter((s): s is string => typeof s === 'string') : [],
        seq: head.seq,
        version: num(doc.version),
        current: head.current,
        runs: head.runs,
        orders: orders(doc.orders),
        fills: fills(doc.fills),
        decision: doc.decision && (decision.decision === 'approved' || decision.decision === 'declined' || decision.decision === 'lapsed')
            ? {decision: decision.decision, by: str(decision.by), at: ms(decision.at) ?? 0}
            : null,
        lapseAt: ms(doc.lapseAt),
        cost: head.cost,
        paperclip: {
            issueId: str(paperclip.issueId),
            identifier: str(paperclip.identifier),
            url: str(paperclip.url),
            mirrored: typeof paperclip.mirrored === 'boolean' ? paperclip.mirrored : null,
            note: str(paperclip.note),
        },
        limits,
        service: head.service,
        models: head.models,
        dropped: head.dropped,
        note: str(doc.note),
        createdAt: ms(doc.createdAt) ?? 0,
        startedAt: head.startedAt,
        finishedAt: head.finishedAt,
        serviceFinishedAt: head.serviceFinishedAt,
    };
};

export const toSessionRow = (view: SessionView): SessionRow => ({
    sessionId: view.sessionId,
    kind: view.kind,
    weekKey: view.weekKey,
    tradeDate: view.tradeDate,
    status: view.status,
    runs: view.runs,
    cost: view.cost,
    decision: view.decision,
    createdAt: view.createdAt,
    fills: view.fills,
});

const STAGE_STATUSES = ['waiting', 'working', 'done', 'failed'] as const;

const stagesOf = (value: unknown): Partial<Record<RoleId, StageRecord>> => {
    const raw = obj(value);
    const out: Partial<Record<RoleId, StageRecord>> = {};
    for (const role of ROLE_IDS) {
        const s = raw[role];
        if (typeof s !== 'object' || s === null) continue;
        const stage = s as Loose;
        out[role] = {
            status: STAGE_STATUSES.find((v) => v === stage.status) ?? 'waiting',
            startedAt: ms(stage.startedAt),
            finishedAt: ms(stage.finishedAt),
            reportAt: ms(stage.reportAt),
            llmCalls: num(stage.llmCalls),
            tokensIn: num(stage.tokensIn),
            tokensOut: num(stage.tokensOut),
            costCents: num(stage.costCents),
        };
    }
    return out;
};

const reportsOf = (value: unknown): Partial<Record<RoleId, string>> => {
    const raw = obj(value);
    const out: Partial<Record<RoleId, string>> = {};
    for (const role of ROLE_IDS) if (typeof raw[role] === 'string') out[role] = raw[role] as string;
    return out;
};

export const toRunView = (doc: Loose): RunView => {
    const stats = obj(doc.stats);
    const ticks = costOf(doc.cost);
    // At completion the service's own count stands for ticks that never arrived.
    const cost: SessionCost = doc.stats ? {
        totalCents: Math.max(ticks.totalCents, num(stats.costCents)),
        tokensIn: Math.max(ticks.tokensIn, num(stats.tokensIn)),
        tokensOut: Math.max(ticks.tokensOut, num(stats.tokensOut)),
        llmCalls: Math.max(ticks.llmCalls, num(stats.llmCalls)),
        toolCalls: Math.max(ticks.toolCalls, num(stats.toolCalls)),
    } : ticks;
    const extra = obj(doc.extraCost);
    const extraCost: Partial<Record<CostRole, number>> = {};
    for (const role of COST_EXTRA_ROLES) if (typeof extra[role] === 'number') extraCost[role] = extra[role] as number;
    const failure = obj(doc.failure);
    return {
        symbol: str(doc.symbol) ?? '',
        index: num(doc.index),
        status: (['pending', 'running', 'completed', 'failed'] as const).find((s) => s === doc.status) ?? 'pending',
        seq: num(doc.seq),
        rating: isRating(doc.rating) ? doc.rating : null,
        review: doc.review === true,
        decision: str(doc.decision),
        startedAt: ms(doc.startedAt),
        finishedAt: ms(doc.finishedAt),
        stages: stagesOf(doc.stages),
        reports: reportsOf(doc.reports),
        debate: arr(doc.debate).flatMap((t): DebateTurn[] => (t.side === 'bull' || t.side === 'bear')
            ? [{seq: num(t.seq), side: t.side, round: num(t.round), text: str(t.text) ?? '', at: ms(t.at) ?? 0}]
            : []),
        risk: arr(doc.risk).flatMap((t): RiskTurn[] => (t.role === 'risk-aggressive' || t.role === 'risk-conservative' || t.role === 'risk-neutral')
            ? [{seq: num(t.seq), role: t.role, round: num(t.round), text: str(t.text) ?? '', at: ms(t.at) ?? 0}]
            : []),
        tools: arr(doc.tools).flatMap((t): ToolCall[] => isRoleId(t.role)
            ? [{seq: num(t.seq), callId: str(t.callId) ?? '', role: t.role, name: str(t.name) ?? '', args: str(t.args) ?? '', at: ms(t.at) ?? 0}]
            : []),
        toolResults: arr(doc.toolResults).flatMap((t): ToolResult[] => isRoleId(t.role)
            ? [{
                seq: num(t.seq),
                callId: str(t.callId) ?? '',
                role: t.role,
                name: str(t.name) ?? '',
                status: t.status === 'unavailable' || t.status === 'no-data' ? t.status : 'ok',
                vendor: str(t.vendor),
                ms: typeof t.ms === 'number' ? t.ms : null,
                chars: num(t.chars),
                attempts: arr(t.attempts).map((a) => ({vendor: str(a.vendor) ?? '', ok: a.ok === true, error: str(a.error)})),
                at: ms(t.at) ?? 0,
            }]
            : []),
        cost,
        extraCost,
        memoryNote: str(doc.memoryNote),
        failure: doc.failure ? {reason: str(failure.reason) ?? 'error', message: str(failure.message) ?? ''} : null,
    };
};

// A session row as first written, before the service has said anything.
export const newSessionFields = ({env, sessionId, kind, weekKey, tradeDate, approval, source, requestedBy, accountId, symbols, lapseAt}: {
    env: string;
    sessionId: string;
    kind: string;
    weekKey: string;
    tradeDate: string;
    approval: string;
    source: string;
    requestedBy: string | null;
    accountId: string;
    symbols: readonly string[];
    lapseAt: number | null;
}) => ({
    env,
    sessionId,
    kind,
    weekKey,
    tradeDate,
    status: 'queued',
    approval,
    source,
    requestedBy,
    accountId,
    symbols: [...symbols],
    seq: 0,
    version: 1,
    current: null,
    runs: symbols.map((symbol) => ({symbol, status: 'pending', rating: null, review: false, costCents: 0})),
    orders: [],
    fills: [],
    decision: null,
    lapseAt: lapseAt === null ? null : new Date(lapseAt),
    cost: emptyCost(),
    paperclip: {issueId: null, identifier: null, url: null, mirrored: null, note: null},
    limits: [],
    service: null,
    models: null,
    dropped: 0,
    note: null,
    engineVersion: AGENT_WORLD_ENGINE_VERSION,
    startedAt: null,
    finishedAt: null,
    serviceFinishedAt: null,
});
