// The office (/agent-world/office), pure and client-safe: what each of the fourteen seats is doing
// at one moment of the newest session — its status, the line on its nameplate, its bubble — what
// moves on the floor (planes to the data shelves, papers between seats, rating cards, tickets), the
// wall's totals and the ticker. Everything is read from the stored session; nothing is invented.
// The page calls it every tick with the view as it stands (live) or as it stood (a replay frame and
// its cut), so the same input is always the same office.
//
// Windows: a bubble, a check mark or a plane lasts OFFICE_WINDOWS after its event. Live, events
// reach the browser in batches up to a poll late, so a window is anchored on when the browser first
// saw the event (`seen`, kept by the page through seenAfter); in a replay it is anchored on the
// stored stamp and stretched by the replay's pace (`windowScale`), so it lasts as long on screen.

import {
    DATA_TOOLS,
    OFFICE_REPLAY_MS,
    RATING_LABELS,
    RISK_ROLES,
    ROLES,
    ROLE_IDS,
    WORKER_IDS,
    type PaperclipDesk,
    type Rating,
    type RiskRole,
    type RoleId,
    type RunStatus,
    type SessionKind,
    type SessionStatus,
    type TeamId,
    type WorkerId,
    type WorkerStatus,
} from "@/lib/agent-world/config";
import {activeRun, type LiveMode} from "@/lib/agent-world/live";
import {OFFICE_SHELF_VENDORS} from "@/lib/agent-world/office-layout";
import {approvalState, comparisonRows, elapsedText, vendorBadges, type ComparisonRow, type DeskRecord} from "@/lib/agent-world/page-view";
import {sessionSpan} from "@/lib/agent-world/replay";
import type {LiveView, OrderSide, RunView, SessionFill, SessionLimit, SessionRow, SessionView, ToolResult} from "@/lib/agent-world/types";
import {ROLE_COPY, vendorLabel} from "@/lib/learn/copy/agent-world";
import {DESK_TASK_COPY, providerLabel, ROLE_OUTPUT_COPY, ROLE_TASK_COPY, TASK_COPY, TICKER_COPY, toolWhat} from "@/lib/learn/copy/agent-world-office";

export {WORKER_IDS};

// How long, in ms of the screen, each thing stays after its event.
export const OFFICE_WINDOWS = {talk: 6000, filed: 6000, land: 2500, handoff: 6000, card: 8000, ticket: 8000, shelfHot: 4000, tag: 30_000} as const;
export const OFFICE_TICKER_LINES = 12;
const BUBBLE_CHARS = 120;

// ---- types ---------------------------------------------------------------------------------------

export type WorkerStats = {calls: number; tokensIn: number; tokensOut: number; costCents: number; fetches: number; texts: number; atWorkMs: number; vendors: {vendor: string; count: number}[]};
export type OfficeWorker = {
    id: WorkerId;
    team: TeamId | 'company';
    status: WorkerStatus;
    task: string;
    // The first line of the text just spoken or filed (model text), and the event it came from.
    bubble: string | null;
    bubbleKey: string | null;
    since: number | null;
    symbol: string | null;
    stats: WorkerStats;
};
export type FetchHop = {vendor: string; ok: boolean; note: string | null};
export type OfficeFlow =
    | {kind: 'fetch'; id: string; seq: number; role: RoleId; tool: string; what: string; hops: FetchHop[]; open: boolean; at: number; landedAt: number | null; until: number | null}
    | {kind: 'handoff'; id: string; from: WorkerId; to: WorkerId[]; at: number; until: number}
    | {kind: 'card'; id: string; symbol: string; rating: Rating | null; at: number; until: number}
    | {kind: 'ticket'; id: string; symbol: string; side: OrderSide; executed: boolean; at: number; until: number};
export type OfficeShelf = {vendor: string; label: string; hot: boolean; refused: boolean; fetches: number; failures: number; lastAt: number | null; tag: {note: string | null; at: number} | null};
export type OfficeLamp = 'off' | 'awaiting' | 'approved' | 'declined' | 'lapsed' | 'preview';
export type OfficeIssueState = 'none' | 'open' | 'handed-in' | 'approved' | 'declined' | 'lapsed' | 'blocked';
export type OfficeIssue = {identifier: string | null; url: string | null; state: OfficeIssueState; mirrored: boolean | null};
export type OfficeTicket = {symbol: string; side: OrderSide; quantity: number; executed: boolean; price: number | null; message: string | null; at: number};
export type OfficeRating = {symbol: string; status: RunStatus; rating: Rating | null; review: boolean};
export type OfficeScoreboard = {
    status: SessionStatus | null;
    kind: SessionKind | null;
    elapsed: string;
    symbols: string[];
    current: string | null;
    ratings: OfficeRating[];
    calls: number;
    fetches: number;
    tokensIn: number;
    tokensOut: number;
    costCents: number;
    refusals: number;
    sessionsToDate: number;
    costToDateCents: number;
    record: ComparisonRow[];
    nextSessionAt: number | null;
};
export type TickerLine = {id: string; at: number; clock: string; text: string};
export type OfficeExtras = {sessionsToDate: number; costToDateCents: number; record: DeskRecord | null; nextSessionAt: number | null};
export type OfficeInput = {
    view: LiveView;
    now: number;
    mode: LiveMode;
    // The run whose seats are drawn (the reader's pick, else the run in progress).
    symbol: string | null;
    seen?: ReadonlyMap<string, number>;
    windowScale?: number;
    extras?: OfficeExtras;
};
export type OfficeState = {
    mode: LiveMode;
    now: number;
    sessionId: string | null;
    symbol: string | null;
    preview: boolean;
    workers: OfficeWorker[];
    flows: OfficeFlow[];
    shelves: OfficeShelf[];
    ratings: OfficeRating[];
    tickets: OfficeTicket[];
    issue: OfficeIssue;
    lamp: OfficeLamp;
    focus: WorkerId | null;
    scoreboard: OfficeScoreboard;
    ticker: TickerLine[];
};

// ---- small readers -------------------------------------------------------------------------------

const RISK: readonly string[] = RISK_ROLES;
const isRiskRole = (role: RoleId): role is RiskRole => RISK.includes(role);
const isTurnRole = (role: RoleId): boolean => role === 'bull' || role === 'bear' || isRiskRole(role);
const TEAM_OF = new Map<RoleId, TeamId>(ROLES.map((role) => [role.id, role.team]));

// Who reads a role's filing next (the papers the robot carries).
export const HANDOFF_TO: Readonly<Record<RoleId, readonly WorkerId[]>> = {
    'market': ['bull', 'bear'],
    'sentiment': ['bull', 'bear'],
    'news': ['bull', 'bear'],
    'fundamentals': ['bull', 'bear'],
    'bull': [],
    'bear': [],
    'research-manager': ['trader'],
    'trader': ['risk-aggressive', 'risk-conservative', 'risk-neutral'],
    'risk-aggressive': [],
    'risk-conservative': [],
    'risk-neutral': [],
    'portfolio-manager': [],
};
const ANALYSTS: readonly WorkerId[] = ['market', 'sentiment', 'news', 'fundamentals'];

const chainOf = (tool: string): readonly string[] => DATA_TOOLS.find((entry) => entry.tool === tool)?.chain ?? [];

// The HTTP status a failed attempt's error names ("rate limited (429)" reads "429"), else null.
export const attemptNote = (error: string | null): string | null => /\b[45]\d\d\b/.exec(error ?? '')?.[0] ?? null;

// The first sentence of a model text, its markdown marks dropped, cut to a bubble's length.
export const excerpt = (text: string): string | null => {
    const flat = text
        .replace(/```[\s\S]*?```/g, ' ')
        .replace(/!?\[([^\]]*)\]\([^)]*\)/g, '$1')
        .replace(/^\s{0,3}#{1,6}\s+/gm, '')
        .replace(/^\s*[-*+]\s+/gm, '')
        .replace(/[*_`>|]+/g, '')
        .replace(/\s+/g, ' ')
        .trim();
    if (flat === '') return null;
    const sentence = /^(.+?[.!?])(\s|$)/.exec(flat)?.[1] ?? flat;
    return sentence.length > BUBBLE_CHARS ? `${sentence.slice(0, BUBBLE_CHARS - 1).trimEnd()}…` : sentence;
};

// "8:31:07 AM", New York time.
export const officeClock = (at: number): string =>
    new Date(at).toLocaleTimeString('en-US', {timeZone: 'America/New_York', hour: 'numeric', minute: '2-digit', second: '2-digit'}).replace(/\s+/g, ' ');

// How long the office plays a finished session back: OFFICE_REPLAY_MS, none with motion reduced.
export const officeReplayDuration = (motionMs: number): number => (motionMs > 0 ? OFFICE_REPLAY_MS : 0);

// The replay's cut at `progress`, the same formula lib/agent-world/replay.ts replayFrame cuts with.
export const replayCut = (view: LiveView, progress: number): number | null => {
    const span = sessionSpan(view);
    if (span === null || view.session === null) return null;
    return span.from + (span.to - span.from) * Math.min(1, Math.max(0, progress));
};

// How much session time one screen ms is during a replay of `durationMs` (at least 1).
export const replayWindowScale = (view: LiveView, durationMs: number): number => {
    const span = sessionSpan(view);
    if (span === null || durationMs <= 0) return 1;
    return Math.max(1, (span.to - span.from) / durationMs);
};

// ---- the session's moments ---------------------------------------------------------------------

export type OfficeEventKind =
    | 'session-started' | 'run-started' | 'stage-started' | 'tool' | 'result' | 'report' | 'turn' | 'stage-done'
    | 'run-completed' | 'run-failed' | 'limit' | 'desk-done' | 'decision' | 'fill' | 'service-stopped';
export type OfficeEvent = {
    key: string;
    at: number;
    seq: number;
    kind: OfficeEventKind;
    role: RoleId | null;
    symbol: string | null;
    run?: RunView;
    result?: ToolResult;
    turn?: {round: number; side: 'bull' | 'bear' | null; text: string};
    limit?: SessionLimit;
    fill?: SessionFill;
};

// Every stored moment of the session, oldest first, each with a key stable across polls.
export const officeEvents = (view: LiveView): OfficeEvent[] => {
    const events: OfficeEvent[] = [];
    const s = view.session;
    if (s?.startedAt != null) events.push({key: 'session-started', at: s.startedAt, seq: 0, kind: 'session-started', role: null, symbol: null});
    for (const run of view.runs) {
        const S = run.symbol;
        if (run.startedAt !== null) events.push({key: `run-started:${S}`, at: run.startedAt, seq: 0, kind: 'run-started', role: null, symbol: S, run});
        for (const role of ROLE_IDS) {
            const stage = run.stages[role];
            if (!stage) continue;
            if (stage.startedAt !== null) events.push({key: `started:${S}:${role}`, at: stage.startedAt, seq: 0, kind: 'stage-started', role, symbol: S});
            if (stage.reportAt !== null && run.reports[role] !== undefined) events.push({key: `report:${S}:${role}`, at: stage.reportAt, seq: 0, kind: 'report', role, symbol: S});
            if (stage.finishedAt !== null) events.push({key: `done:${S}:${role}`, at: stage.finishedAt, seq: 0, kind: 'stage-done', role, symbol: S});
        }
        for (const tool of run.tools) events.push({key: `tool:${tool.seq}`, at: tool.at, seq: tool.seq, kind: 'tool', role: tool.role, symbol: S});
        for (const result of run.toolResults) events.push({key: `result:${result.seq}`, at: result.at, seq: result.seq, kind: 'result', role: result.role, symbol: S, result});
        for (const turn of run.debate) events.push({key: `turn:${turn.seq}`, at: turn.at, seq: turn.seq, kind: 'turn', role: turn.side, symbol: S, turn: {round: turn.round, side: turn.side, text: turn.text}});
        for (const turn of run.risk) events.push({key: `turn:${turn.seq}`, at: turn.at, seq: turn.seq, kind: 'turn', role: turn.role, symbol: S, turn: {round: turn.round, side: null, text: turn.text}});
        if (run.finishedAt !== null && (run.status === 'completed' || run.status === 'failed')) {
            events.push({key: `run-${run.status}:${S}`, at: run.finishedAt, seq: 0, kind: run.status === 'completed' ? 'run-completed' : 'run-failed', role: null, symbol: S, run});
        }
    }
    if (s) {
        for (const limit of s.limits) events.push({key: `limit:${limit.at}:${limit.provider}`, at: limit.at, seq: 0, kind: 'limit', role: null, symbol: limit.symbol, limit});
        if (s.serviceFinishedAt !== null && s.status !== 'failed') events.push({key: 'desk-done', at: s.serviceFinishedAt, seq: 0, kind: 'desk-done', role: null, symbol: null});
        if (s.decision) events.push({key: 'decision', at: s.decision.at, seq: 0, kind: 'decision', role: null, symbol: null});
        for (const fill of s.fills) events.push({key: `fill:${fill.symbol}:${fill.side}`, at: fill.at, seq: 0, kind: 'fill', role: null, symbol: fill.symbol, fill});
        if (s.status === 'failed' && s.service) events.push({key: 'service-stopped', at: s.finishedAt ?? s.serviceFinishedAt ?? s.startedAt ?? s.createdAt, seq: 0, kind: 'service-stopped', role: null, symbol: null});
    }
    return events.sort((a, b) => a.at - b.at || a.seq - b.seq || a.key.localeCompare(b.key));
};

// The `seen` map after a view arrives: every key not held yet is stamped with the event's own time
// on the first view (nothing old animates) and with `at` (the server's time now) afterwards. The
// same map comes back when nothing is new, so a render that changed nothing changes nothing.
export const seenAfter = (seen: ReadonlyMap<string, number>, view: LiveView, at: number, first: boolean): ReadonlyMap<string, number> => {
    let next: Map<string, number> | null = null;
    for (const event of officeEvents(view)) {
        if (seen.has(event.key) || next?.has(event.key)) continue;
        next ??= new Map(seen);
        next.set(event.key, first ? event.at : Math.max(event.at, at));
    }
    return next ?? seen;
};

// ---- fetch lines ---------------------------------------------------------------------------------

const hopsOf = (result: ToolResult): FetchHop[] => {
    if (result.attempts.length > 0) return result.attempts.map((attempt) => ({vendor: attempt.vendor, ok: attempt.ok, note: attempt.ok ? null : attemptNote(attempt.error)}));
    if (result.vendor !== null) return [{vendor: result.vendor, ok: true, note: null}];
    const first = chainOf(result.name)[0];
    return first ? [{vendor: first, ok: false, note: null}] : [];
};

const lastFailedOf = (result: ToolResult) => [...result.attempts].reverse().find((attempt) => !attempt.ok && attempt.vendor !== result.vendor) ?? null;

const nextInChain = (tool: string, vendor: string): string | null => {
    const chain = chainOf(tool);
    const at = chain.indexOf(vendor);
    return at >= 0 && at + 1 < chain.length ? chain[at + 1] : null;
};

// What a fetch that has just landed is doing: the hop when a provider refused, else the read.
const landingLine = (result: ToolResult, symbol: string): string => {
    const what = toolWhat(result.name, symbol);
    const failed = lastFailedOf(result);
    if (failed) {
        const to = result.vendor ?? nextInChain(result.name, failed.vendor);
        if (to === null) return TASK_COPY.unanswered(what);
        const note = attemptNote(failed.error);
        return note ? TASK_COPY.fellBack(vendorLabel(failed.vendor), note, vendorLabel(to)) : TASK_COPY.fellBackSilent(vendorLabel(failed.vendor), vendorLabel(to));
    }
    return result.vendor !== null ? TASK_COPY.fetching(what, vendorLabel(result.vendor)) : TASK_COPY.unanswered(what);
};

// What a seat last read, once the plane is back.
const readLine = (result: ToolResult, symbol: string): string => {
    const what = toolWhat(result.name, symbol);
    if (result.status === 'unavailable' || result.vendor === null) return TASK_COPY.unanswered(what);
    const vendor = vendorLabel(result.vendor);
    if (result.status === 'no-data') return TASK_COPY.noData(what, vendor);
    const failed = lastFailedOf(result);
    if (failed) {
        const note = attemptNote(failed.error);
        return note ? TASK_COPY.readAfter(what, vendor, vendorLabel(failed.vendor), note) : TASK_COPY.readAfterSilent(what, vendor, vendorLabel(failed.vendor));
    }
    return TASK_COPY.read(what, vendor);
};

const tickerFetch = (result: ToolResult, symbol: string): string => {
    const name = ROLE_COPY[result.role].name;
    const what = toolWhat(result.name, symbol);
    if (result.status === 'unavailable' || result.vendor === null) return TICKER_COPY.unanswered(name, what);
    const vendor = vendorLabel(result.vendor);
    if (result.status === 'no-data') return TICKER_COPY.noData(name, what, vendor);
    const failed = lastFailedOf(result);
    if (failed) {
        const note = attemptNote(failed.error);
        return note ? TICKER_COPY.fetchedAfter(name, what, vendor, vendorLabel(failed.vendor), note) : TICKER_COPY.fetchedAfterSilent(name, what, vendor, vendorLabel(failed.vendor));
    }
    return TICKER_COPY.fetched(name, what, vendor);
};

// ---- the twelve roles ---------------------------------------------------------------------------

type Anchor = (key: string, at: number) => number;
type Windows = {[K in keyof typeof OFFICE_WINDOWS]: number};

const EMPTY_STATS = (): WorkerStats => ({calls: 0, tokensIn: 0, tokensOut: 0, costCents: 0, fetches: 0, texts: 0, atWorkMs: 0, vendors: []});

// A role's figures over every run of the session, as they stand at `now`.
const roleStats = (role: RoleId, runs: readonly RunView[], now: number): WorkerStats => {
    const stats = EMPTY_STATS();
    const vendors = new Map<string, number>();
    for (const run of runs) {
        const stage = run.stages[role];
        if (stage && stage.startedAt !== null && stage.startedAt <= now) {
            stats.calls += stage.llmCalls;
            stats.tokensIn += stage.tokensIn;
            stats.tokensOut += stage.tokensOut;
            stats.costCents += stage.costCents;
            stats.atWorkMs += Math.max(0, Math.min(stage.finishedAt ?? now, now) - stage.startedAt);
            if (stage.reportAt !== null && stage.reportAt <= now && run.reports[role] !== undefined) stats.texts += 1;
        }
        stats.fetches += run.tools.filter((tool) => tool.role === role && tool.at <= now).length;
        stats.texts += run.debate.filter((turn) => turn.side === role && turn.at <= now).length;
        stats.texts += run.risk.filter((turn) => turn.role === role && turn.at <= now).length;
        for (const badge of vendorBadges(run.toolResults.filter((result) => result.at <= now), role)) vendors.set(badge.vendor, (vendors.get(badge.vendor) ?? 0) + badge.count);
    }
    stats.vendors = [...vendors].map(([vendor, count]) => ({vendor, count}));
    return stats;
};

type Text = {key: string; at: number; text: string; round: number | null};

// The newest text a role filed or spoke in a run, at or before `now`.
const textOf = (run: RunView, role: RoleId, now: number): Text | null => {
    if (role === 'bull' || role === 'bear') {
        const turn = run.debate.filter((t) => t.side === role && t.at <= now).at(-1);
        return turn ? {key: `turn:${turn.seq}`, at: turn.at, text: turn.text, round: turn.round} : null;
    }
    if (isRiskRole(role)) {
        const turn = run.risk.filter((t) => t.role === role && t.at <= now).at(-1);
        return turn ? {key: `turn:${turn.seq}`, at: turn.at, text: turn.text, round: turn.round} : null;
    }
    const stage = run.stages[role];
    const report = run.reports[role];
    return stage?.reportAt != null && stage.reportAt <= now && report !== undefined ? {key: `report:${run.symbol}:${role}`, at: stage.reportAt, text: report, round: null} : null;
};

const turnLine = (role: RoleId, round: number): string => {
    if (role === 'bull') return TASK_COPY.bullTurn(round);
    if (role === 'bear') return TASK_COPY.bearTurn(round);
    if (role === 'risk-aggressive') return TASK_COPY.riskAggressiveTurn(round);
    if (role === 'risk-conservative') return TASK_COPY.riskConservativeTurn(round);
    return TASK_COPY.riskNeutralTurn(round);
};

const roleWorker = (role: RoleId, view: LiveView, run: RunView | null, now: number, anchor: Anchor, W: Windows): OfficeWorker => {
    const base = {id: role, team: TEAM_OF.get(role) ?? 'analysts', symbol: run?.symbol ?? null, stats: roleStats(role, view.runs, now), bubble: null, bubbleKey: null} as const;
    const worker = (status: WorkerStatus, task: string, since: number | null, bubble: {text: string; key: string} | null = null): OfficeWorker =>
        ({...base, status, task, since, bubble: bubble ? excerpt(bubble.text) : null, bubbleKey: bubble ? bubble.key : null});
    if (!run || run.status === 'pending' || run.startedAt === null || run.startedAt > now) return worker('idle', TASK_COPY.idle, null);
    const stage = run.stages[role];
    if (!stage || stage.startedAt === null || stage.startedAt > now) {
        return run.status === 'running' ? worker('waiting', ROLE_TASK_COPY.waiting[role], run.startedAt) : worker('idle', TASK_COPY.idle, null);
    }
    const finished = stage.finishedAt !== null && stage.finishedAt <= now;
    if (run.status === 'failed' && !finished) return worker('stopped', TASK_COPY.stopped(run.symbol), run.finishedAt);
    const text = textOf(run, role, now);
    if (text !== null && now - anchor(text.key, text.at) < (isTurnRole(role) ? W.talk : W.filed)) {
        return isTurnRole(role)
            ? worker('talking', turnLine(role, text.round ?? 1), text.at, text)
            : worker('filed', ROLE_TASK_COPY.filed[role], text.at, text);
    }
    if (finished) {
        if (role === 'portfolio-manager' && run.status === 'completed' && run.rating !== null) {
            return worker('done', run.rating === 'REVIEW' ? TASK_COPY.review(run.symbol) : TASK_COPY.rated(run.symbol, RATING_LABELS[run.rating]), stage.finishedAt);
        }
        return worker('done', ROLE_TASK_COPY.done[role], stage.finishedAt);
    }
    // A turn role that has spoken waits while the others have the floor.
    if (isTurnRole(role) && text !== null) return worker('waiting', TASK_COPY.spoke(text.round ?? 1), text.at);
    const results = new Map(run.toolResults.filter((result) => result.at <= now).map((result) => [result.callId, result]));
    const open = run.tools.filter((tool) => tool.role === role && tool.at <= now && !results.has(tool.callId)).at(-1);
    if (open) return worker('fetching', TASK_COPY.fetching(toolWhat(open.name, run.symbol), vendorLabel(chainOf(open.name)[0] ?? 'openbb')), open.at);
    const newest = [...results.values()].filter((result) => result.role === role).sort((a, b) => a.at - b.at || a.seq - b.seq).at(-1);
    if (newest && now - anchor(`result:${newest.seq}`, newest.at) < W.land) return worker('fetching', landingLine(newest, run.symbol), newest.at);
    return worker('working', newest ? readLine(newest, run.symbol) : ROLE_TASK_COPY.started[role](run.symbol), stage.startedAt);
};

// ---- the two desks -------------------------------------------------------------------------------

const deskWorker = (id: PaperclipDesk, status: WorkerStatus, task: string, since: number | null, symbol: string | null): OfficeWorker =>
    ({id, team: 'company', status, task, since, symbol, bubble: null, bubbleKey: null, stats: EMPTY_STATS()});

const trimStop = (message: string): string => message.trim().replace(/[.\s]+$/, '');

const headTrader = (s: SessionView | null, now: number): OfficeWorker => {
    const symbol = s?.current?.symbol ?? null;
    if (!s) return deskWorker('head-trader', 'idle', DESK_TASK_COPY.headIdle, null, null);
    if (s.status === 'failed') {
        const message = s.service?.message ? trimStop(s.service.message) : '';
        return deskWorker('head-trader', 'stopped', message ? DESK_TASK_COPY.blocked(message) : DESK_TASK_COPY.blockedUnexplained, s.finishedAt, symbol);
    }
    if (s.serviceFinishedAt !== null && s.serviceFinishedAt <= now) {
        const task = s.kind === 'preview' ? DESK_TASK_COPY.handedInPreview : s.paperclip.identifier ? DESK_TASK_COPY.handedInIssue(s.paperclip.identifier) : DESK_TASK_COPY.handedIn;
        return deskWorker('head-trader', 'done', task, s.serviceFinishedAt, symbol);
    }
    if (s.status === 'queued' || s.startedAt === null || s.startedAt > now) return deskWorker('head-trader', 'working', DESK_TASK_COPY.opening, s.createdAt, symbol);
    return deskWorker('head-trader', 'working', s.paperclip.identifier ? DESK_TASK_COPY.watchingIssue(s.paperclip.identifier) : DESK_TASK_COPY.watching, s.startedAt, symbol);
};

const executionDesk = (s: SessionView | null, now: number): OfficeWorker => {
    if (!s) return deskWorker('execution-desk', 'idle', DESK_TASK_COPY.execIdle, null, null);
    const symbol = s.current?.symbol ?? null;
    const deskDone = s.serviceFinishedAt !== null && s.serviceFinishedAt <= now;
    if (s.status === 'failed') return deskWorker('execution-desk', 'stopped', DESK_TASK_COPY.stoppedBefore, s.finishedAt, symbol);
    if (s.status === 'queued' || (s.status === 'running' && !deskDone)) return deskWorker('execution-desk', 'waiting', DESK_TASK_COPY.execWaiting, s.startedAt, symbol);
    if (s.status === 'running') return deskWorker('execution-desk', 'working', DESK_TASK_COPY.planning, s.serviceFinishedAt, symbol);
    if (s.status === 'awaiting-approval') return deskWorker('execution-desk', 'waiting', DESK_TASK_COPY.awaitingOwner, s.serviceFinishedAt, symbol);
    if (s.status === 'approved') return deskWorker('execution-desk', 'working', s.decision?.by === 'auto' ? DESK_TASK_COPY.stampedAuto : DESK_TASK_COPY.stampedOwner, s.decision?.at ?? null, symbol);
    if (s.status === 'declined') return deskWorker('execution-desk', 'done', DESK_TASK_COPY.declined, s.decision?.at ?? null, symbol);
    if (s.status === 'lapsed') return deskWorker('execution-desk', 'done', DESK_TASK_COPY.lapsed, s.decision?.at ?? null, symbol);
    // completed
    if (s.kind === 'preview') return deskWorker('execution-desk', 'done', s.orders.length > 0 ? DESK_TASK_COPY.previewPlanned(s.orders.length) : DESK_TASK_COPY.previewNone, s.finishedAt, symbol);
    if (s.fills.length > 0) return deskWorker('execution-desk', 'done', DESK_TASK_COPY.filled(s.fills.filter((fill) => fill.executed).length, s.fills.length), s.finishedAt, symbol);
    return deskWorker('execution-desk', 'done', s.orders.length === 0 ? DESK_TASK_COPY.noOrders : DESK_TASK_COPY.nothingSent, s.finishedAt, symbol);
};

const lampOf = (s: SessionView | null): OfficeLamp => {
    if (!s) return 'off';
    switch (approvalState(s)) {
        case 'pending': return 'awaiting';
        case 'approved':
        case 'approved-auto': return 'approved';
        case 'declined': return 'declined';
        case 'lapsed': return 'lapsed';
        case 'preview': return 'preview';
        default: return 'off';
    }
};

const issueOf = (s: SessionView | null, now: number): OfficeIssue => {
    if (!s || s.paperclip.issueId === null) return {identifier: null, url: null, state: 'none', mirrored: s?.paperclip.mirrored ?? null};
    const state: OfficeIssueState = s.status === 'failed' ? 'blocked'
        : s.decision?.decision === 'approved' ? 'approved'
        : s.decision?.decision === 'declined' ? 'declined'
        : s.decision?.decision === 'lapsed' ? 'lapsed'
        : s.serviceFinishedAt !== null && s.serviceFinishedAt <= now ? 'handed-in'
        : 'open';
    return {identifier: s.paperclip.identifier, url: s.paperclip.url, state, mirrored: s.paperclip.mirrored};
};

// ---- the floor -----------------------------------------------------------------------------------

const shelvesOf = (view: LiveView, now: number, anchor: Anchor, W: Windows): OfficeShelf[] => OFFICE_SHELF_VENDORS.map((vendor) => {
    let fetches = 0;
    let failures = 0;
    let lastAt: number | null = null;
    let touched: number | null = null;
    let failed: {at: number; note: string | null} | null = null;
    for (const run of view.runs) {
        for (const result of run.toolResults) {
            if (result.at > now) continue;
            const at = anchor(`result:${result.seq}`, result.at);
            const answered = result.vendor === vendor;
            const tried = result.attempts.some((attempt) => attempt.vendor === vendor);
            if (answered) {
                fetches += 1;
                lastAt = Math.max(lastAt ?? 0, result.at);
            }
            if (answered || tried) touched = Math.max(touched ?? 0, at);
            for (const attempt of result.attempts) {
                if (attempt.vendor !== vendor || attempt.ok) continue;
                failures += 1;
                if (failed === null || at >= failed.at) failed = {at, note: attemptNote(attempt.error)};
            }
        }
    }
    return {
        vendor,
        label: vendorLabel(vendor),
        hot: touched !== null && now - touched < W.shelfHot,
        refused: failed !== null && now - failed.at < W.shelfHot,
        fetches,
        failures,
        lastAt,
        tag: failed !== null && now - failed.at < W.tag ? failed : null,
    };
});

const flowsOf = (view: LiveView, run: RunView | null, now: number, anchor: Anchor, W: Windows): OfficeFlow[] => {
    const flows: OfficeFlow[] = [];
    const s = view.session;
    const live = (at: number, until: number | null) => at <= now && (until === null || now < until);
    if (run && run.startedAt !== null && run.startedAt <= now) {
        const at = anchor(`run-started:${run.symbol}`, run.startedAt);
        if (live(at, at + W.handoff)) flows.push({kind: 'handoff', id: `brief:${run.symbol}`, from: 'head-trader', to: [...ANALYSTS], at, until: at + W.handoff});
        const results = new Map(run.toolResults.filter((result) => result.at <= now).map((result) => [result.callId, result]));
        for (const tool of run.tools) {
            if (tool.at > now) continue;
            const result = results.get(tool.callId) ?? null;
            const at = anchor(`tool:${tool.seq}`, tool.at);
            const landedAt = result ? anchor(`result:${result.seq}`, result.at) : null;
            const until = landedAt === null ? null : landedAt + W.land;
            if (!live(at, until)) continue;
            const first = chainOf(tool.name)[0];
            flows.push({
                kind: 'fetch',
                id: `fetch:${tool.seq}`,
                seq: tool.seq,
                role: tool.role,
                tool: tool.name,
                what: toolWhat(tool.name, run.symbol),
                hops: result ? hopsOf(result) : first ? [{vendor: first, ok: true, note: null}] : [],
                open: result === null,
                at,
                landedAt,
                until,
            });
        }
        for (const role of ROLE_IDS) {
            const to = HANDOFF_TO[role];
            const stage = run.stages[role];
            if (to.length === 0 || stage?.reportAt == null || stage.reportAt > now || run.reports[role] === undefined) continue;
            const at = anchor(`report:${run.symbol}:${role}`, stage.reportAt);
            if (live(at, at + W.handoff)) flows.push({kind: 'handoff', id: `report:${run.symbol}:${role}`, from: role, to: [...to], at, until: at + W.handoff});
        }
    }
    for (const done of view.runs) {
        if (done.finishedAt === null || done.finishedAt > now || (done.status !== 'completed' && done.status !== 'failed')) continue;
        const at = anchor(`run-${done.status}:${done.symbol}`, done.finishedAt);
        if (live(at, at + W.card)) flows.push({kind: 'card', id: `card:${done.symbol}`, symbol: done.symbol, rating: done.status === 'completed' ? done.rating : null, at, until: at + W.card});
    }
    if (s && s.serviceFinishedAt !== null && s.serviceFinishedAt <= now && s.status !== 'failed') {
        const at = anchor('desk-done', s.serviceFinishedAt);
        if (live(at, at + W.handoff)) flows.push({kind: 'handoff', id: 'ratings', from: 'portfolio-manager', to: ['execution-desk'], at, until: at + W.handoff});
    }
    for (const fill of s?.fills ?? []) {
        if (fill.at > now) continue;
        const at = anchor(`fill:${fill.symbol}:${fill.side}`, fill.at);
        if (live(at, at + W.ticket)) flows.push({kind: 'ticket', id: `ticket:${fill.symbol}:${fill.side}`, symbol: fill.symbol, side: fill.side, executed: fill.executed, at, until: at + W.ticket});
    }
    return flows.sort((a, b) => a.at - b.at || a.id.localeCompare(b.id));
};

// The seat the newest moment belongs to: the Head trader while the session opens, the role whose
// event is newest while the desk runs, the Execution desk once the desk is done.
const focusOf = (s: SessionView | null, run: RunView | null, now: number): WorkerId | null => {
    if (!s) return null;
    if (s.status === 'queued' || s.startedAt === null || s.startedAt > now) return 'head-trader';
    if (s.status === 'failed') return 'head-trader';
    if (s.serviceFinishedAt !== null && s.serviceFinishedAt <= now) return 'execution-desk';
    if (!run) return 'head-trader';
    let best: {role: RoleId; at: number; order: number} | null = null;
    const offer = (role: RoleId, at: number | null) => {
        if (at === null || at > now) return;
        const order = ROLE_IDS.indexOf(role);
        if (best === null || at > best.at || (at === best.at && order > best.order)) best = {role, at, order};
    };
    for (const role of ROLE_IDS) {
        const stage = run.stages[role];
        offer(role, stage?.startedAt ?? null);
        offer(role, stage?.reportAt ?? null);
    }
    for (const tool of run.tools) offer(tool.role, tool.at);
    for (const result of run.toolResults) offer(result.role, result.at);
    for (const turn of run.debate) offer(turn.side, turn.at);
    for (const turn of run.risk) offer(turn.role, turn.at);
    return (best as {role: RoleId} | null)?.role ?? 'head-trader';
};

const tickerText = (event: OfficeEvent, s: SessionView | null): string | null => {
    switch (event.kind) {
        case 'session-started': return TICKER_COPY.opened((s?.symbols ?? []).join(', '));
        case 'run-started': return event.symbol ? TICKER_COPY.turned(event.symbol) : null;
        case 'result': return event.result && event.symbol ? tickerFetch(event.result, event.symbol) : null;
        case 'report': return event.role && event.symbol ? TICKER_COPY.filed(ROLE_COPY[event.role].name, ROLE_OUTPUT_COPY[event.role], event.symbol) : null;
        case 'turn':
            if (!event.role || !event.turn) return null;
            return event.turn.side ? TICKER_COPY.argued(ROLE_COPY[event.role].name, event.turn.side, event.turn.round) : TICKER_COPY.weighed(ROLE_COPY[event.role].name, event.turn.round);
        case 'run-completed': {
            const run = event.run;
            if (!run || !event.symbol) return null;
            return run.rating === null || run.rating === 'REVIEW' ? TICKER_COPY.review(event.symbol) : TICKER_COPY.rated(event.symbol, RATING_LABELS[run.rating]);
        }
        case 'run-failed': return event.symbol ? TICKER_COPY.runStopped(event.symbol, trimStop(event.run?.failure?.message ?? event.run?.failure?.reason ?? 'stopped')) : null;
        case 'limit': return event.limit ? TICKER_COPY.limited(providerLabel(event.limit.provider), event.limit.status) : null;
        case 'desk-done': return TICKER_COPY.deskDone;
        case 'decision': {
            const decision = s?.decision;
            if (!decision) return null;
            if (decision.decision === 'approved') return decision.by === 'auto' ? TICKER_COPY.approvedAuto : TICKER_COPY.approved;
            return decision.decision === 'declined' ? TICKER_COPY.declined : TICKER_COPY.lapsed;
        }
        case 'fill': {
            const fill = event.fill;
            if (!fill) return null;
            return fill.executed && fill.price !== null
                ? TICKER_COPY.filled(fill.symbol, fill.side === 'sell', fill.quantity, `$${fill.price.toLocaleString('en-US', {minimumFractionDigits: 2, maximumFractionDigits: 2})}`)
                : TICKER_COPY.notFilled(fill.symbol, trimStop(fill.message ?? 'not filled'));
        }
        case 'service-stopped': return TICKER_COPY.serviceStopped(trimStop(s?.service?.message ?? s?.service?.outcome ?? 'stopped'));
        default: return null;
    }
};

const tickerOf = (view: LiveView, now: number): TickerLine[] => {
    const lines: TickerLine[] = [];
    const events = officeEvents(view).filter((event) => event.at <= now);
    for (let i = events.length - 1; i >= 0 && lines.length < OFFICE_TICKER_LINES; i -= 1) {
        const event = events[i];
        const text = tickerText(event, view.session);
        if (text !== null) lines.push({id: event.key, at: event.at, clock: officeClock(event.at), text});
    }
    return lines;
};

// ---- the office ----------------------------------------------------------------------------------

const NO_SEEN: ReadonlyMap<string, number> = new Map();

export const officeState = (input: OfficeInput): OfficeState => {
    const {view, now, mode} = input;
    const scale = Math.max(1, input.windowScale ?? 1);
    const W = Object.fromEntries(Object.entries(OFFICE_WINDOWS).map(([name, ms]) => [name, ms * scale])) as Windows;
    const seen = input.seen ?? NO_SEEN;
    const anchor: Anchor = (key, at) => Math.max(at, seen.get(key) ?? at);
    const s = view.session;
    const run = s ? activeRun(view, input.symbol) : null;
    const workers: OfficeWorker[] = WORKER_IDS.map((id) => {
        if (id === 'head-trader') return headTrader(s, now);
        if (id === 'execution-desk') return executionDesk(s, now);
        return roleWorker(id, view, run, now, anchor, W);
    });
    const ratings: OfficeRating[] = (s?.runs ?? []).map((summary) => ({symbol: summary.symbol, status: summary.status, rating: summary.rating, review: summary.review}));
    const extras = input.extras;
    return {
        mode,
        now,
        sessionId: s?.sessionId ?? null,
        symbol: run?.symbol ?? null,
        preview: s?.kind === 'preview',
        workers,
        flows: s ? flowsOf(view, run, now, anchor, W) : [],
        shelves: shelvesOf(view, now, anchor, W),
        ratings,
        tickets: (s?.fills ?? []).filter((fill) => fill.at <= now).map((fill) => ({symbol: fill.symbol, side: fill.side, quantity: fill.quantity, executed: fill.executed, price: fill.price, message: fill.message, at: fill.at})),
        issue: issueOf(s, now),
        lamp: lampOf(s),
        focus: focusOf(s, run, now),
        scoreboard: {
            status: s?.status ?? null,
            kind: s?.kind ?? null,
            elapsed: s ? elapsedText(s.startedAt, s.finishedAt, now) : '',
            symbols: s?.symbols ?? [],
            current: s?.current?.symbol ?? null,
            ratings,
            calls: s?.cost.llmCalls ?? 0,
            fetches: s?.cost.toolCalls ?? 0,
            tokensIn: s?.cost.tokensIn ?? 0,
            tokensOut: s?.cost.tokensOut ?? 0,
            costCents: s?.cost.totalCents ?? 0,
            refusals: (s?.limits ?? []).filter((limit) => limit.at <= now).length,
            sessionsToDate: extras?.sessionsToDate ?? 0,
            costToDateCents: extras?.costToDateCents ?? 0,
            record: comparisonRows(extras?.record ?? null),
            nextSessionAt: extras?.nextSessionAt ?? null,
        },
        ticker: s ? tickerOf(view, now) : [],
    };
};

// ---- the last sessions ---------------------------------------------------------------------------

export type WorkerCareer = {sessions: number; runs: number; texts: number; calls: number; tokens: number; costCents: number; fetches: number; favourite: {vendor: string; share: number} | null; atWorkMs: number};
export type DeskCareer = {sessions: number; costCents: number; decided: {approved: number; declined: number; lapsed: number}; filled: number; tickets: number};
export type CareerStats = {sessions: number; runs: number; from: number | null; roles: Record<RoleId, WorkerCareer>; desks: Record<PaperclipDesk, DeskCareer>};

const emptyCareer = (): WorkerCareer => ({sessions: 0, runs: 0, texts: 0, calls: 0, tokens: 0, costCents: 0, fetches: 0, favourite: null, atWorkMs: 0});
const emptyDesk = (): DeskCareer => ({sessions: 0, costCents: 0, decided: {approved: 0, declined: 0, lapsed: 0}, filled: 0, tickets: 0});

// Each seat's figures over the finished sessions read (lib/agent-world/office-store reads the last
// forty, their runs projected to the stages, the turns' speakers and the fetches' providers).
export const careerStats = (rows: readonly {sessionId: string; run: RunView}[], sessions: readonly SessionRow[]): CareerStats => {
    const roles = Object.fromEntries(ROLE_IDS.map((role) => [role, emptyCareer()])) as Record<RoleId, WorkerCareer>;
    const seenIn = new Map<RoleId, Set<string>>(ROLE_IDS.map((role) => [role, new Set<string>()]));
    const answered = new Map<RoleId, Map<string, number>>(ROLE_IDS.map((role) => [role, new Map<string, number>()]));
    for (const {sessionId, run} of rows) {
        for (const role of ROLE_IDS) {
            const career = roles[role];
            const stage = run.stages[role];
            if (stage && stage.startedAt !== null) {
                seenIn.get(role)?.add(sessionId);
                career.runs += 1;
                career.calls += stage.llmCalls;
                career.tokens += stage.tokensIn + stage.tokensOut;
                career.costCents += stage.costCents;
                if (stage.finishedAt !== null) career.atWorkMs += Math.max(0, stage.finishedAt - stage.startedAt);
                if (stage.reportAt !== null) career.texts += 1;
            }
        }
        for (const turn of run.debate) roles[turn.side].texts += 1;
        for (const turn of run.risk) roles[turn.role].texts += 1;
        for (const result of run.toolResults) {
            roles[result.role].fetches += 1;
            if (result.vendor !== null) {
                const counts = answered.get(result.role);
                counts?.set(result.vendor, (counts.get(result.vendor) ?? 0) + 1);
            }
        }
    }
    for (const role of ROLE_IDS) {
        roles[role].sessions = seenIn.get(role)?.size ?? 0;
        const counts = [...(answered.get(role) ?? new Map<string, number>())];
        const total = counts.reduce((sum, [, n]) => sum + n, 0);
        const top = counts.sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))[0];
        roles[role].favourite = top && total > 0 ? {vendor: top[0], share: top[1] / total} : null;
    }
    const head = emptyDesk();
    const exec = emptyDesk();
    for (const row of sessions) {
        head.sessions += 1;
        head.costCents += row.cost.totalCents;
        if (row.kind !== 'preview') exec.sessions += 1;
        if (row.decision?.decision === 'approved') exec.decided.approved += 1;
        if (row.decision?.decision === 'declined') exec.decided.declined += 1;
        if (row.decision?.decision === 'lapsed') exec.decided.lapsed += 1;
        exec.tickets += row.fills.length;
        exec.filled += row.fills.filter((fill) => fill.executed).length;
    }
    const from = sessions.length > 0 ? Math.min(...sessions.map((row) => row.createdAt)) : null;
    return {sessions: sessions.length, runs: rows.length, from, roles, desks: {'head-trader': head, 'execution-desk': exec}};
};
