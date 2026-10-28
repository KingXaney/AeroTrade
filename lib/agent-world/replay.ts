// Playing a finished session back, pure: the view as it stood at a point of its own timeline, cut
// by the times every stage, report, turn and fetch was stored with. The floor walks `progress` from
// 0 to 1 over REPLAY_MS; with motion reduced the duration is 0 and the first frame is the last.

import {REPLAY_MS, ROLE_IDS, type RoleId} from "@/lib/agent-world/config";
import type {LiveView, RunView, SessionCost, StageRecord} from "@/lib/agent-world/types";
import type {ReplayClock} from "@/lib/agent-world/live";

// A CSS time token ("240ms", "0.24s", "0s") in milliseconds; anything unreadable is 0 (no motion).
export const motionUnitMs = (raw: string): number => {
    const match = /^\s*(-?\d*\.?\d+)\s*(ms|s)\s*$/i.exec(raw);
    if (!match) return 0;
    const value = Number(match[1]) * (match[2].toLowerCase() === 's' ? 1000 : 1);
    return Number.isFinite(value) && value > 0 ? value : 0;
};

export const replayDuration = (motionMs: number): number => (motionMs > 0 ? REPLAY_MS : 0);

export const replayProgress = (clock: ReplayClock, now: number): number =>
    clock.duration <= 0 ? 1 : Math.min(1, Math.max(0, (now - clock.startedAt) / clock.duration));

const timesOf = (run: RunView): number[] => [
    run.startedAt, run.finishedAt,
    ...Object.values(run.stages).flatMap((stage) => [stage?.startedAt ?? null, stage?.finishedAt ?? null, stage?.reportAt ?? null]),
    ...run.debate.map((t) => t.at), ...run.risk.map((t) => t.at), ...run.tools.map((t) => t.at), ...run.toolResults.map((t) => t.at),
].filter((t): t is number => typeof t === 'number' && Number.isFinite(t));

// The session's own timeline: its first stored moment to its last, or null when nothing to play.
export const sessionSpan = (view: LiveView): {from: number; to: number} | null => {
    const times = view.runs.flatMap(timesOf);
    if (view.session?.startedAt) times.push(view.session.startedAt);
    if (times.length === 0) return null;
    const from = Math.min(...times);
    const to = Math.max(...times);
    return to > from ? {from, to} : null;
};

const ZERO_COST: SessionCost = {totalCents: 0, tokensIn: 0, tokensOut: 0, llmCalls: 0, toolCalls: 0};

const runAt = (run: RunView, cut: number): RunView => {
    if (run.startedAt === null || run.startedAt > cut) {
        return {...run, status: 'pending', rating: null, review: false, decision: null, finishedAt: null, stages: {}, reports: {}, debate: [], risk: [], tools: [], toolResults: [], cost: ZERO_COST, extraCost: {}, memoryNote: null, failure: null};
    }
    const finished = run.finishedAt !== null && run.finishedAt <= cut;
    const stages: Partial<Record<RoleId, StageRecord>> = {};
    const reports: Partial<Record<RoleId, string>> = {};
    for (const role of ROLE_IDS) {
        const stage = run.stages[role];
        if (!stage || stage.startedAt === null || stage.startedAt > cut) continue;
        const done = stage.finishedAt !== null && stage.finishedAt <= cut;
        stages[role] = done ? stage : {...stage, status: 'working', finishedAt: null, llmCalls: 0, tokensIn: 0, tokensOut: 0, costCents: 0};
        const report = run.reports[role];
        if (report !== undefined && stage.reportAt !== null && stage.reportAt <= cut) reports[role] = report;
    }
    const tools = run.tools.filter((t) => t.at <= cut);
    const doneStages = Object.values(stages).filter((s) => s?.status === 'done');
    const cost: SessionCost = finished ? run.cost : {
        totalCents: doneStages.reduce((sum, s) => sum + (s?.costCents ?? 0), 0),
        tokensIn: doneStages.reduce((sum, s) => sum + (s?.tokensIn ?? 0), 0),
        tokensOut: doneStages.reduce((sum, s) => sum + (s?.tokensOut ?? 0), 0),
        llmCalls: doneStages.reduce((sum, s) => sum + (s?.llmCalls ?? 0), 0),
        toolCalls: tools.length,
    };
    return {
        ...run,
        status: finished ? run.status : 'running',
        rating: finished ? run.rating : null,
        review: finished ? run.review : false,
        decision: finished ? run.decision : null,
        finishedAt: finished ? run.finishedAt : null,
        stages,
        reports,
        debate: run.debate.filter((t) => t.at <= cut),
        risk: run.risk.filter((t) => t.at <= cut),
        tools,
        toolResults: run.toolResults.filter((t) => t.at <= cut),
        cost,
        memoryNote: finished ? run.memoryNote : null,
        failure: finished ? run.failure : null,
    };
};

// The view as it stood `progress` (0–1) of the way through its timeline. At 1 it is the view
// itself; before 1 the session reads as running, on the run in progress at the cut, with no orders,
// approval or fills yet (those came after the desk finished).
export const replayFrame = (view: LiveView, progress: number): LiveView => {
    const span = sessionSpan(view);
    if (span === null || progress >= 1 || view.session === null) return view;
    const cut = span.from + (span.to - span.from) * Math.max(0, progress);
    const runs = view.runs.map((run) => runAt(run, cut));
    const current = runs.find((run) => run.status === 'running') ?? null;
    const cost = runs.reduce<SessionCost>((sum, run) => ({
        totalCents: sum.totalCents + run.cost.totalCents,
        tokensIn: sum.tokensIn + run.cost.tokensIn,
        tokensOut: sum.tokensOut + run.cost.tokensOut,
        llmCalls: sum.llmCalls + run.cost.llmCalls,
        toolCalls: sum.toolCalls + run.cost.toolCalls,
    }), ZERO_COST);
    return {
        ...view,
        runs,
        session: {
            ...view.session,
            status: 'running',
            current: current ? {symbol: current.symbol, index: current.index} : null,
            runs: view.session.runs.map((summary) => {
                const run = runs.find((r) => r.symbol === summary.symbol);
                return run ? {...summary, status: run.status, rating: run.rating, review: run.review, costCents: run.cost.totalCents} : summary;
            }),
            orders: [],
            fills: [],
            decision: null,
            cost,
            finishedAt: null,
        },
    };
};
