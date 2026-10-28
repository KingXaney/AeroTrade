// The office's server read (/agent-world/office), cached for the request: the newest session whole
// (the live view the page starts from), the desk's account against SPY, the totals, each seat's
// figures over the last finished sessions, and each agent's Paperclip budget. Bounded throughout:
// the career is the last CAREER_SESSIONS finished sessions' runs, projected, and memoised for the
// New York day on the newest finished session's stamp; the budgets are one Paperclip call, best
// effort. The shaping is lib/agent-world/office.ts; the page composes this and nothing else.

import {cache} from 'react';
import {isLiveStatus, type ApprovalMode, type PaperclipAgentKey} from "@/lib/agent-world/config";
import {agentWorldEnv, agentWorldOff, agentWorldUniverse, approvalMode, paperclipAgentIdsFromEnv, paperclipSettings, type AgentWorldEnv, type AgentWorldOff} from "@/lib/agent-world/env";
import {nextWeeklySession} from "@/lib/agent-world/job";
import {careerStats, type CareerStats} from "@/lib/agent-world/office";
import {readDeskRecord, type DeskRecordView} from "@/lib/agent-world/page-store";
import {createPaperclipClient} from "@/lib/agent-world/paperclip";
import {agentIdsByName, budgetShare} from "@/lib/agent-world/paperclip-view";
import {getCareerRuns, getFullLiveView, listSessions, sessionTotals} from "@/lib/agent-world/store";
import type {LiveView} from "@/lib/agent-world/types";
import {getEasternDateString} from "@/lib/dates";
import {createDayMemo, remember} from "@/lib/day-memo";

export const CAREER_SESSIONS = 40;

export type OfficeBudget = {spentCents: number; capCents: number; share: number | null; status: string};
export type OfficeBudgets =
    | {status: 'unconfigured'}
    | {status: 'unreachable'}
    | {status: 'ok'; boardUrl: string; agents: Partial<Record<PaperclipAgentKey, OfficeBudget>>};

export type OfficeView = {
    off: AgentWorldOff | null;
    mode: ApprovalMode;
    symbols: string[];
    live: LiveView;
    record: DeskRecordView | null;
    totals: {sessions: number; spentCents: number};
    nextSessionAt: number;
    career: CareerStats;
    budgets: OfficeBudgets;
    serverNow: number;
};

const careerMemo = createDayMemo<CareerStats>(4);

// Each seat's figures over the last finished sessions (a session still live stays "this session").
const readCareer = async (env: AgentWorldEnv): Promise<CareerStats> => {
    const finished = (await listSessions(env, CAREER_SESSIONS)).filter((row) => !isLiveStatus(row.status));
    const newest = finished[0];
    const key = `${env}:${newest?.sessionId ?? 'none'}:${newest?.status ?? ''}:${newest?.fills.length ?? 0}:${finished.length}`;
    return remember(careerMemo, key, getEasternDateString(), async () => careerStats(await getCareerRuns(env, finished.map((row) => row.sessionId)), finished));
};

// Each agent's month in Paperclip: the agents read once with the Execution desk's key.
const readBudgets = async (): Promise<OfficeBudgets> => {
    const settings = paperclipSettings();
    if (!settings) return {status: 'unconfigured'};
    const agents = await createPaperclipClient(settings).agents();
    if (!agents.ok) return {status: 'unreachable'};
    const ids = agentIdsByName(agents.data, paperclipAgentIdsFromEnv());
    const byId = new Map(agents.data.map((agent) => [agent.id, agent]));
    const out: Partial<Record<PaperclipAgentKey, OfficeBudget>> = {};
    for (const [key, id] of Object.entries(ids) as [PaperclipAgentKey, string][]) {
        const agent = byId.get(id);
        if (!agent) continue;
        out[key] = {spentCents: agent.spentMonthlyCents, capCents: agent.budgetMonthlyCents, share: budgetShare(agent.spentMonthlyCents, agent.budgetMonthlyCents), status: agent.status};
    }
    return {status: 'ok', boardUrl: settings.boardUrl, agents: out};
};

export const getOfficeView = cache(async (): Promise<OfficeView> => {
    const env = agentWorldEnv();
    const serverNow = Date.now();
    const [live, record, totals, career, budgets] = await Promise.all([
        getFullLiveView(env),
        readDeskRecord(env),
        sessionTotals(env),
        readCareer(env),
        readBudgets().catch((): OfficeBudgets => ({status: 'unreachable'})),
    ]);
    return {
        off: agentWorldOff(),
        mode: approvalMode(),
        symbols: agentWorldUniverse(),
        live,
        record,
        totals,
        nextSessionAt: nextWeeklySession(serverNow),
        career,
        budgets,
        serverNow,
    };
});
