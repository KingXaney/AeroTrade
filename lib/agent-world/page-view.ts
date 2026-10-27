// What the floor, the company and the data views draw, shaped from the stored views. Pure and
// client-safe: the stage strip, the lanes, the elapsed clocks, the decision box's state, the record
// against SPY and the fetches by provider, unit-tested without a page.

import {RATING_LABELS, ROLES, type RoleId, type RunStatus, type StageStatus, type TeamId} from "@/lib/agent-world/config";
import type {RunView, SessionRow, SessionView, ToolResult} from "@/lib/agent-world/types";

export type StageView = {
    role: RoleId;
    team: TeamId;
    status: StageStatus;
    startedAt: number | null;
    finishedAt: number | null;
    llmCalls: number;
    tokensIn: number;
    tokensOut: number;
    costCents: number;
    vendors: {vendor: string; count: number}[];
    hasReport: boolean;
};

// The providers a role's fetches were answered by, in the order first seen, counted.
export const vendorBadges = (results: readonly ToolResult[], role: RoleId): {vendor: string; count: number}[] => {
    const counts = new Map<string, number>();
    for (const result of results) {
        if (result.role !== role || result.vendor === null) continue;
        counts.set(result.vendor, (counts.get(result.vendor) ?? 0) + 1);
    }
    return [...counts].map(([vendor, count]) => ({vendor, count}));
};

// The twelve roles in run order, each as the run stands. A role that was working when its run
// stopped did not finish.
export const stageViews = (run: RunView | null): StageView[] => ROLES.map((role) => {
    const stage = run?.stages[role.id];
    const stopped = run?.status === 'failed' && stage?.status === 'working';
    return {
        role: role.id,
        team: role.team,
        status: stopped ? 'failed' : stage?.status ?? 'waiting',
        startedAt: stage?.startedAt ?? null,
        finishedAt: stage?.finishedAt ?? null,
        llmCalls: stage?.llmCalls ?? 0,
        tokensIn: stage?.tokensIn ?? 0,
        tokensOut: stage?.tokensOut ?? 0,
        costCents: stage?.costCents ?? 0,
        vendors: run ? vendorBadges(run.toolResults, role.id) : [],
        hasReport: run?.reports[role.id] !== undefined,
    };
});

// A lane's state: the run's own when it has one, else the session's summary of it.
export const laneStatus = (run: RunView | undefined, summary: {status: RunStatus} | undefined): RunStatus => run?.status ?? summary?.status ?? 'pending';

// "m:ss" since a stage started, to its finish or to now; blank before it starts.
export const elapsedText = (startedAt: number | null, finishedAt: number | null, now: number): string => {
    if (startedAt === null) return '';
    const seconds = Math.max(0, Math.floor(((finishedAt ?? now) - startedAt) / 1000));
    return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`;
};

export type ApprovalState = 'pending' | 'approved' | 'approved-auto' | 'declined' | 'lapsed' | 'preview' | 'none';

// Where the session's decision stands, for the decision box.
export const approvalState = (session: Pick<SessionView, 'status' | 'kind' | 'decision' | 'orders'>): ApprovalState => {
    if (session.kind === 'preview') return 'preview';
    if (session.status === 'awaiting-approval') return 'pending';
    if (session.decision?.decision === 'approved') return session.decision.by === 'auto' ? 'approved-auto' : 'approved';
    if (session.decision?.decision === 'declined') return 'declined';
    if (session.decision?.decision === 'lapsed') return 'lapsed';
    return 'none';
};

export type DeskRecord = {totalReturnPct: number; benchmarkReturnPct: number | null; since: string};
export type ComparisonRow = {id: 'desk' | 'spy'; returnPct: number | null; since: string | null};

// The desk's account and SPY over the same days, always in that order: the strip ranks nothing.
export const comparisonRows = (record: DeskRecord | null): ComparisonRow[] => [
    {id: 'desk', returnPct: record?.totalReturnPct ?? null, since: record?.since ?? null},
    {id: 'spy', returnPct: record?.benchmarkReturnPct ?? null, since: record?.since ?? null},
];

export type VendorFetches = {vendor: string; totalMs: number; calls: {name: string; symbol: string; role: RoleId; ms: number | null; status: ToolResult['status']; attempts: ToolResult['attempts']; at: number}[]};

// Every fetch of a session by the provider that answered it (no answer: its own group), the
// busiest provider first.
export const fetchesByVendor = (runs: readonly RunView[]): VendorFetches[] => {
    const groups = new Map<string, VendorFetches>();
    for (const run of runs) {
        for (const result of run.toolResults) {
            const vendor = result.vendor ?? 'none';
            const group = groups.get(vendor) ?? {vendor, totalMs: 0, calls: []};
            group.calls.push({name: result.name, symbol: run.symbol, role: result.role, ms: result.ms, status: result.status, attempts: result.attempts, at: result.at});
            group.totalMs += result.ms ?? 0;
            groups.set(vendor, group);
        }
    }
    return [...groups.values()].sort((a, b) => b.calls.length - a.calls.length || a.vendor.localeCompare(b.vendor));
};

// "12.4k" for a token count; the whole number below a thousand.
export const formatTokens = (n: number): string => {
    if (n < 1000) return String(Math.round(n));
    if (n < 1_000_000) return `${Number((n / 1000).toFixed(1))}k`;
    return `${Number((n / 1_000_000).toFixed(2))}M`;
};

// A model cost in dollars, to the cent, with "<$0.01" for a fraction of one.
export const formatCents = (cents: number): string => {
    if (cents <= 0) return '$0.00';
    if (cents < 1) return '<$0.01';
    return `$${(cents / 100).toFixed(2)}`;
};

// "AAPL Buy · MSFT Review": each symbol before its rating's label, so no part opens on the rating.
export const ratingParts = (session: Pick<SessionRow, 'runs'>): string[] =>
    session.runs.filter((run) => run.rating !== null).map((run) => `${run.symbol} ${RATING_LABELS[run.rating ?? 'REVIEW']}`);

// The role whose text arrived last in a run (a report filed, a turn spoken): the pane the floor
// shows while it follows the run.
export const latestRole = (run: RunView | null): RoleId | null => {
    if (!run) return null;
    let best: {role: RoleId; at: number} | null = null;
    const offer = (role: RoleId, at: number | null) => {
        if (at !== null && (best === null || at >= best.at)) best = {role, at};
    };
    for (const role of ROLES) offer(role.id, run.stages[role.id]?.reportAt ?? null);
    for (const turn of run.debate) offer(turn.side, turn.at);
    for (const turn of run.risk) offer(turn.role, turn.at);
    return (best as {role: RoleId; at: number} | null)?.role ?? null;
};

// Whether a role has anything to read yet: a report, or turns for the researchers and the risk desk.
export const hasText = (run: RunView | null, role: RoleId): boolean => {
    if (!run) return false;
    if (role === 'bull' || role === 'bear') return run.debate.some((turn) => turn.side === role);
    if (role === 'risk-aggressive' || role === 'risk-conservative' || role === 'risk-neutral') return run.risk.some((turn) => turn.role === role);
    return run.reports[role] !== undefined;
};

// The run shown first in a replay or on the floor: the one in progress, else the first.
export const runFor = (runs: readonly RunView[], symbol: string | null): RunView | null =>
    runs.find((run) => run.symbol === symbol) ?? runs[0] ?? null;
