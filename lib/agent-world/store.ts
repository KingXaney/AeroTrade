// The trading agent world's reads and writes (Mongo). The decisions live in the pure modules beside
// it — events.ts folds what the service sends, orders.ts turns ratings into orders, job.ts dates a
// session — and this file only reads and writes them. Every query names the deployment (`env`): a
// preview or a local server sharing production's database keeps sessions and an account of its own.

import AgentWorldRun from "@/database/models/agent-world-run.model";
import AgentWorldSession from "@/database/models/agent-world-session.model";
import PaperAccount from "@/database/models/paper-account.model";
import {connectToDatabase} from "@/database/mongoose";
import {
    AGENT_WORLD_OWNER_ID,
    AGENT_WORLD_STARTING_BALANCE,
    LIVE_STATUSES,
    RUN_STATUSES,
    agentWorldAccountName,
    type ServiceOutcome,
    type SessionStatus,
} from "@/lib/agent-world/config";
import type {AgentWorldEnv} from "@/lib/agent-world/env";
import {TERMINAL_STATUSES, foldHead, runUpdateFor, symbolOf, type AgentWorldEvent} from "@/lib/agent-world/events";
import type {Book} from "@/lib/agent-world/orders";
import type {LiveAnswer, LiveView, RunView, SessionFill, SessionOrder, SessionRow, SessionView} from "@/lib/agent-world/types";
import {headFields, newSessionFields, toRunView, toSessionHead, toSessionRow, toSessionView} from "@/lib/agent-world/views";
import {getOwnedAccount} from "@/lib/trading/accounts";
import {seedDayZeroSnapshot} from "@/lib/trading/lifecycle";
import {buildHoldingsPriceMap, computePortfolio} from "@/lib/trading/valuation";

type Loose = Record<string, unknown>;

// ---- the desk's account ----

// The desk's paper account in this deployment, opened with the starting balance and its day-zero
// snapshot the first time (the culture pickers' recipe). The unique {userId, name} index stops a
// racing second open.
export const ensureAgentWorldAccount = async (env: AgentWorldEnv): Promise<{accountId: string}> => {
    await connectToDatabase();
    const name = agentWorldAccountName(env);
    const existing = await PaperAccount.findOne({userId: AGENT_WORLD_OWNER_ID, name}).select({_id: 1}).lean<{_id: unknown} | null>();
    if (existing) return {accountId: String(existing._id)};
    try {
        const created = await PaperAccount.create({
            userId: AGENT_WORLD_OWNER_ID,
            name,
            cash: AGENT_WORLD_STARTING_BALANCE,
            startingBalance: AGENT_WORLD_STARTING_BALANCE,
            inceptionAt: new Date(),
            positions: [],
        });
        await seedDayZeroSnapshot(created);
        return {accountId: String(created._id)};
    } catch (error) {
        const again = await PaperAccount.findOne({userId: AGENT_WORLD_OWNER_ID, name}).select({_id: 1}).lean<{_id: unknown} | null>();
        if (again) return {accountId: String(again._id)};
        throw error;
    }
};

export const findAgentWorldAccountId = async (env: AgentWorldEnv): Promise<string | null> => {
    await connectToDatabase();
    const existing = await PaperAccount.findOne({userId: AGENT_WORLD_OWNER_ID, name: agentWorldAccountName(env)}).select({_id: 1}).lean<{_id: unknown} | null>();
    return existing ? String(existing._id) : null;
};

// The account as the desk sees it: valued at live quotes, a stored close within a few days where a
// quote is missing (lib/trading/valuation's holdings map), with a price for every rated symbol.
export const loadDeskBook = async (accountId: string, symbols: readonly string[]): Promise<Book | null> => {
    const account = await getOwnedAccount(AGENT_WORLD_OWNER_ID, accountId);
    if (!account) return null;
    const held = account.positions.map((p) => p.symbol.toUpperCase());
    const prices = await buildHoldingsPriceMap([...new Set([...held, ...symbols.map((s) => s.toUpperCase())])]);
    const portfolio = computePortfolio(
        {cash: account.cash, startingBalance: account.startingBalance, positions: account.positions.map((p) => ({symbol: p.symbol, company: p.company, quantity: p.quantity, avgCost: p.avgCost}))},
        prices,
    );
    const priceBySymbol: Record<string, number> = {};
    for (const [symbol, info] of prices) if (typeof info.price === 'number' && info.price > 0) priceBySymbol[symbol] = info.price;
    return {
        totalValue: portfolio.totalValue,
        cash: portfolio.cash,
        positions: portfolio.positions.map((p) => ({
            symbol: p.symbol.toUpperCase(),
            quantity: p.quantity,
            avgCost: p.avgCost,
            price: typeof p.currentPrice === 'number' && p.currentPrice > 0 ? p.currentPrice : null,
        })),
        priceBySymbol,
    };
};

// ---- sessions ----

export type OpenSessionInput = Parameters<typeof newSessionFields>[0] & {env: AgentWorldEnv};
export type OpenResult = {ok: true} | {ok: false; reason: 'already' | 'live'; sessionId: string};

// A session's row, if this run may start one: refused while another session holds the desk
// (running, awaiting a decision, or approved and waiting for the open), and refused for a weekly
// session whose week already has one (its id is its week, so this is also the week's claim).
export const openSession = async (input: OpenSessionInput): Promise<OpenResult> => {
    await connectToDatabase();
    const live = await AgentWorldSession.findOne({env: input.env, status: {$in: LIVE_STATUSES}, sessionId: {$ne: input.sessionId}})
        .select({sessionId: 1}).lean<{sessionId: string} | null>();
    if (live) return {ok: false, reason: 'live', sessionId: live.sessionId};
    try {
        const result = await AgentWorldSession.updateOne(
            {env: input.env, sessionId: input.sessionId},
            {$setOnInsert: newSessionFields(input)},
            {upsert: true},
        );
        return result.upsertedCount === 1 ? {ok: true} : {ok: false, reason: 'already', sessionId: input.sessionId};
    } catch (error) {
        if ((error as {code?: number}).code === 11000) return {ok: false, reason: 'already', sessionId: input.sessionId};
        throw error;
    }
};

const sessionDoc = async (env: AgentWorldEnv, sessionId: string): Promise<Loose | null> => {
    await connectToDatabase();
    return AgentWorldSession.findOne({env, sessionId}).lean<Loose | null>();
};

export const getSession = async (env: AgentWorldEnv, sessionId: string): Promise<SessionView | null> => {
    const doc = await sessionDoc(env, sessionId);
    return doc ? toSessionView(doc) : null;
};

export const getRuns = async (env: AgentWorldEnv, sessionId: string, afterSeq = 0): Promise<RunView[]> => {
    await connectToDatabase();
    const docs = await AgentWorldRun.find({env, sessionId, ...(afterSeq > 0 ? {seq: {$gt: afterSeq}} : {})}).lean<Loose[]>();
    return docs.map(toRunView).sort((a, b) => a.index - b.index);
};

export const latestSession = async (env: AgentWorldEnv): Promise<SessionView | null> => {
    await connectToDatabase();
    const doc = await AgentWorldSession.findOne({env}).sort({createdAt: -1}).lean<Loose | null>();
    return doc ? toSessionView(doc) : null;
};

// A session opens with every symbol pending; only the service's run.started moves one on.
const STARTED_RUN_STATUSES = RUN_STATUSES.filter((status) => status !== 'pending');

// The newest session the desk ran a symbol in: one the service refused, or that failed before its
// first symbol, still has every run pending and nothing to show. The {env, createdAt} index walks
// newest first to the first match.
export const latestRunSessionId = async (env: AgentWorldEnv): Promise<string | null> => {
    await connectToDatabase();
    const doc = await AgentWorldSession.findOne({env, 'runs.status': {$in: STARTED_RUN_STATUSES}}).sort({createdAt: -1}).select({sessionId: 1}).lean<{sessionId?: unknown} | null>();
    return typeof doc?.sessionId === 'string' ? doc.sessionId : null;
};

export const listSessions = async (env: AgentWorldEnv, limit = 12): Promise<SessionRow[]> => {
    await connectToDatabase();
    const docs = await AgentWorldSession.find({env}).sort({createdAt: -1}).limit(limit).lean<Loose[]>();
    return docs.map((doc) => toSessionRow(toSessionView(doc)));
};

// Every session this deployment has run, counted, and their model cost added up.
export const sessionTotals = async (env: AgentWorldEnv): Promise<{sessions: number; spentCents: number}> => {
    await connectToDatabase();
    const [row] = await AgentWorldSession.aggregate<{n: number; cents: number}>([
        {$match: {env}},
        {$group: {_id: null, n: {$sum: 1}, cents: {$sum: {$ifNull: ['$cost.totalCents', 0]}}}},
    ]);
    return {sessions: row?.n ?? 0, spentCents: row?.cents ?? 0};
};

// A write to a session's head, guarded on the statuses it may move from, and bumping the version
// the live poll reads. True when it landed.
const updateSession = async (env: AgentWorldEnv, sessionId: string, from: readonly SessionStatus[] | null, set: Loose): Promise<boolean> => {
    await connectToDatabase();
    const result = await AgentWorldSession.updateOne(
        {env, sessionId, ...(from ? {status: {$in: from}} : {})},
        {$set: set, $inc: {version: 1}},
    );
    return result.modifiedCount === 1;
};

const OPEN_STATUSES: readonly SessionStatus[] = ['queued', 'running'];

export const failSession = (env: AgentWorldEnv, sessionId: string, outcome: ServiceOutcome, message: string): Promise<boolean> =>
    updateSession(env, sessionId, ['queued', 'running', 'approved'], {status: 'failed', service: {outcome, message: message.slice(0, 300)}, finishedAt: new Date()});

export const saveOrders = (env: AgentWorldEnv, sessionId: string, orders: readonly SessionOrder[]): Promise<boolean> =>
    updateSession(env, sessionId, null, {orders});

export const setAwaitingApproval = (env: AgentWorldEnv, sessionId: string, lapseAt: number): Promise<boolean> =>
    updateSession(env, sessionId, OPEN_STATUSES, {status: 'awaiting-approval', lapseAt: new Date(lapseAt)});

export const completeSession = (env: AgentWorldEnv, sessionId: string, note: string | null = null): Promise<boolean> =>
    updateSession(env, sessionId, [...OPEN_STATUSES, 'approved'], {status: 'completed', finishedAt: new Date(), ...(note ? {note} : {})});

// The owner's decision, or the job's automatic one, taken once: only a session awaiting one moves.
export const decideSession = (env: AgentWorldEnv, sessionId: string, decision: 'approved' | 'declined', by: string): Promise<boolean> =>
    updateSession(env, sessionId, ['awaiting-approval'], {
        status: decision,
        decision: {decision, by, at: new Date()},
        ...(decision === 'declined' ? {finishedAt: new Date()} : {}),
    });

// Approval set to auto: the decided session's orders go without a pause, recorded as such.
export const autoApprove = (env: AgentWorldEnv, sessionId: string): Promise<boolean> =>
    updateSession(env, sessionId, OPEN_STATUSES, {status: 'approved', decision: {decision: 'approved', by: 'auto', at: new Date()}});

// A session nobody decided in time, or one approved after the last open before its deadline.
export const lapseSession = (env: AgentWorldEnv, sessionId: string): Promise<boolean> =>
    updateSession(env, sessionId, ['awaiting-approval', 'approved'], {status: 'lapsed', decision: {decision: 'lapsed', by: null, at: new Date()}, finishedAt: new Date()});

export const recordFills = (env: AgentWorldEnv, sessionId: string, fills: readonly SessionFill[]): Promise<boolean> =>
    updateSession(env, sessionId, null, {
        status: 'completed',
        fills: fills.map((fill) => ({...fill, at: new Date(fill.at)})),
        finishedAt: new Date(),
    });

export const setPaperclip = (env: AgentWorldEnv, sessionId: string, patch: Partial<SessionView['paperclip']>): Promise<boolean> =>
    updateSession(env, sessionId, null, Object.fromEntries(Object.entries(patch).map(([key, value]) => [`paperclip.${key}`, value])));

export const setSessionNote = (env: AgentWorldEnv, sessionId: string, note: string): Promise<boolean> =>
    updateSession(env, sessionId, null, {note: note.slice(0, 500)});

// ---- the service's events ----

export type ApplyResult =
    | {status: 'applied'; applied: number; stale: number; seq: number; finished: 'completed' | 'failed' | null; limits: Extract<AgentWorldEvent, {type: 'limit'}>[]}
    | {status: 'unknown-session'}
    | {status: 'busy'};

const isDuplicateKey = (error: unknown): boolean => (error as {code?: number})?.code === 11000;

// One batch from the service: each run-level event as one update of its run's document, filtered
// on the run's seq being below the event's (so a retried batch, a duplicate or a stale event
// changes nothing), then the whole batch folded into the session's head and written once with a
// compare-and-set on the head's seq. A head that moved meanwhile is read again and the batch
// re-applied; the run updates are idempotent, so that costs nothing but a read.
export const applyEventBatch = async (env: AgentWorldEnv, sessionId: string, events: readonly AgentWorldEvent[]): Promise<ApplyResult> => {
    await connectToDatabase();
    for (let attempt = 0; attempt < 4; attempt++) {
        const doc = await AgentWorldSession.findOne({env, sessionId}).lean<Loose | null>();
        if (!doc) return {status: 'unknown-session'};
        const head = toSessionHead(doc);
        const fresh = events.filter((event) => event.seq > head.seq);
        if (fresh.length === 0) return {status: 'applied', applied: 0, stale: events.length, seq: head.seq, finished: null, limits: []};
        for (const event of fresh) {
            const update = runUpdateFor(event);
            const symbol = symbolOf(event);
            if (!update || !symbol) continue;
            try {
                await AgentWorldRun.updateOne({env, sessionId, symbol, seq: {$lt: event.seq}}, update, {upsert: true});
            } catch (error) {
                // The run's document exists with this event already applied: the upsert's insert
                // collides with the unique index, which is the guard working.
                if (!isDuplicateKey(error)) throw error;
            }
        }
        const next = foldHead(head, fresh);
        const written = await AgentWorldSession.updateOne({env, sessionId, seq: head.seq}, {$set: headFields(next), $inc: {version: 1}});
        if (written.modifiedCount === 0) continue;
        const types = new Set(fresh.map((event) => event.type));
        return {
            status: 'applied',
            applied: fresh.length,
            stale: events.length - fresh.length,
            seq: next.seq,
            finished: types.has('session.failed') ? 'failed' : types.has('session.completed') ? 'completed' : null,
            limits: fresh.filter((event): event is Extract<AgentWorldEvent, {type: 'limit'}> => event.type === 'limit'),
        };
    }
    return {status: 'busy'};
};

// ---- what the floor polls ----

// The newest session, as much of it as the poll does not already hold: nothing when its version
// matches; the session and only the runs past the poll's seq when it names this session; the
// whole session otherwise.
export const getLiveView = async (env: AgentWorldEnv, {sid, version, seq}: {sid: string | null; version: number | null; seq: number | null}): Promise<LiveAnswer> => {
    await connectToDatabase();
    const serverNow = Date.now();
    const doc = await AgentWorldSession.findOne({env}).sort({createdAt: -1}).lean<Loose | null>();
    if (!doc) {
        return sid === null && version === 0
            ? {unchanged: true, version: 0, seq: 0, serverNow, sessionId: null}
            : {version: 0, seq: 0, serverNow, session: null, runs: [], partial: false};
    }
    const session = toSessionView(doc);
    if (sid === session.sessionId && version === session.version) {
        return {unchanged: true, version: session.version, seq: session.seq, serverNow, sessionId: session.sessionId};
    }
    // A poll ahead of the session (one held from before a reset) is answered whole.
    const partial = sid === session.sessionId && seq !== null && seq >= 0 && seq <= session.seq;
    const runs = await getRuns(env, session.sessionId, partial ? seq ?? 0 : 0);
    return {version: session.version, seq: session.seq, serverNow, session, runs, partial};
};

// The whole floor as the page renders it first.
export const getFullLiveView = async (env: AgentWorldEnv): Promise<LiveView> => {
    const answer = await getLiveView(env, {sid: '', version: null, seq: null});
    return 'unchanged' in answer ? {version: 0, seq: 0, serverNow: answer.serverNow, session: null, runs: [], partial: false} : answer;
};

export const isTerminal = (status: SessionStatus): boolean => TERMINAL_STATUSES.includes(status);
