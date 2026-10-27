// The /agent-world page's reads, one per view, each cached for the request (React `cache`) and each
// reading only its own data: the floor (the newest session whole, the desk's record against SPY,
// the sessions list), the company (Paperclip, best effort) and the data (the service's health, the
// last session's fetches, the job's stamp, this desk's limits rows). Shaping is lib/agent-world/
// page-view.ts; the page composes these and nothing else.

import {cache} from 'react';
import {z} from 'zod';
import AccountSnapshot from "@/database/models/account-snapshot.model";
import {connectToDatabase} from "@/database/mongoose";
import {AGENT_WORLD_OWNER_ID, type ApprovalMode} from "@/lib/agent-world/config";
import {agentWorldEnv, agentWorldOff, agentWorldService, agentWorldUniverse, approvalMode, paperclipSettings, type AgentWorldOff} from "@/lib/agent-world/env";
import {nextWeeklySession} from "@/lib/agent-world/job";
import {fetchesByVendor, type VendorFetches} from "@/lib/agent-world/page-view";
import {
    createPaperclipClient,
    type PaperclipActivity,
    type PaperclipCompany,
    type PaperclipCostRow,
    type PaperclipDashboard,
    type PaperclipIssue,
} from "@/lib/agent-world/paperclip";
import {orgTree, type OrgNode} from "@/lib/agent-world/paperclip-view";
import {findAgentWorldAccountId, getFullLiveView, getRuns, latestRunSessionId, latestSession, listSessions, sessionTotals} from "@/lib/agent-world/store";
import type {LiveView, SessionRow} from "@/lib/agent-world/types";
import {getEasternDateString} from "@/lib/dates";
import {getJobHealth, type JobHealth} from "@/lib/jobs/health";
import {JOBS} from "@/lib/jobs/registry";
import {getLimitsView} from "@/lib/limits/store";
import type {LimitRow} from "@/lib/limits/view";
import {getAccountAnalytics} from "@/lib/trading/analytics-store";
import type {PerfPoint} from "@/lib/trading/types";

export type DeskRecordView = {
    series: PerfPoint[];
    since: string;
    totalReturnPct: number;
    benchmarkReturnPct: number | null;
    snapshotDays: number;
};

export type FloorView = {
    off: AgentWorldOff | null;
    mode: ApprovalMode;
    symbols: string[];
    live: LiveView;
    record: DeskRecordView | null;
    sessions: SessionRow[];
    sessionCount: number;
    spentCents: number;
    nextSessionAt: number;
    serverNow: number;
};

// The desk's account against SPY since its first session (also read by the office's page).
export const readDeskRecord = async (env: ReturnType<typeof agentWorldEnv>): Promise<DeskRecordView | null> => {
    const accountId = await findAgentWorldAccountId(env);
    if (!accountId) return null;
    const [analytics, snapshotDays] = await Promise.all([
        getAccountAnalytics(AGENT_WORLD_OWNER_ID, accountId),
        connectToDatabase().then(() => AccountSnapshot.countDocuments({accountId})),
    ]);
    if (!analytics) return null;
    return {
        series: analytics.series,
        since: getEasternDateString(new Date(analytics.account.inceptionAt)),
        // SPY's total return since inception, on the same basis as the curve's last point.
        benchmarkReturnPct: analytics.series.at(-1)?.benchmarkPct ?? null,
        totalReturnPct: analytics.summary.totalReturnPct,
        snapshotDays,
    };
};

export const getFloorView = cache(async (): Promise<FloorView> => {
    const env = agentWorldEnv();
    const serverNow = Date.now();
    const [live, record, sessions, totals] = await Promise.all([getFullLiveView(env), readDeskRecord(env), listSessions(env, 12), sessionTotals(env)]);
    return {
        off: agentWorldOff(),
        mode: approvalMode(),
        symbols: agentWorldUniverse(),
        live,
        record,
        sessions,
        sessionCount: totals.sessions,
        spentCents: totals.spentCents,
        nextSessionAt: nextWeeklySession(serverNow),
        serverNow,
    };
});

// ---- the company view ----

export type CompanyView =
    | {status: 'unconfigured'}
    | {status: 'unreachable'; boardUrl: string; message: string}
    | {
        status: 'ok';
        boardUrl: string;
        company: PaperclipCompany | null;
        dashboard: PaperclipDashboard | null;
        tree: OrgNode[];
        agentNames: Record<string, string>;
        costs: PaperclipCostRow[];
        issue: PaperclipIssue | null;
        issueUrl: string | null;
        activity: PaperclipActivity[];
    };

// The company as Paperclip holds it, read with the Execution desk's key: one failed read leaves its
// part out; the agents unreadable means the company is unreachable, and the page says so while the
// floor and the record stand on Mongo alone.
export const getCompanyView = cache(async (): Promise<CompanyView> => {
    const settings = paperclipSettings();
    if (!settings) return {status: 'unconfigured'};
    const client = createPaperclipClient(settings);
    const latest = await latestSession(agentWorldEnv());
    const issueId = latest?.paperclip.issueId ?? null;
    const [company, agents, costs, activity, dashboard, issue] = await Promise.all([
        client.company(),
        client.agents(),
        client.costsByAgent(),
        client.activity(20),
        client.dashboard(),
        issueId ? client.issue(issueId) : Promise.resolve(null),
    ]);
    if (!agents.ok) return {status: 'unreachable', boardUrl: settings.boardUrl, message: agents.message};
    return {
        status: 'ok',
        boardUrl: settings.boardUrl,
        company: company.ok ? company.data : null,
        dashboard: dashboard.ok ? dashboard.data : null,
        tree: orgTree(agents.data),
        agentNames: Object.fromEntries(agents.data.map((agent) => [agent.id, agent.name])),
        costs: costs.ok ? costs.data : [],
        issue: issue && issue.ok ? issue.data : null,
        issueUrl: latest?.paperclip.url ?? null,
        activity: activity.ok ? activity.data : [],
    };
});

// ---- the data view ----

// What the service says of itself at GET /health (services/agent-world app.py), read leniently: a
// field it adds later is ignored, one it drops reads as unknown.
const HealthSchema = z.object({
    ok: z.boolean().optional(),
    service: z.object({version: z.string().max(40).optional(), uptimeS: z.number().optional()}).partial().optional(),
    versions: z.record(z.string(), z.string().max(40).nullable()).optional(),
    providers: z.record(z.string(), z.boolean()).optional(),
    keys: z.record(z.string(), z.union([z.boolean(), z.number()])).optional(),
    models: z.object({provider: z.string().max(40), quick: z.string().max(80), deep: z.string().max(80)}).partial().optional(),
    worker: z.object({busy: z.boolean().optional(), sessionId: z.string().max(80).nullable().optional()}).partial().optional(),
});
export type ServiceHealth = z.output<typeof HealthSchema> & {checkedAt: number};

export type HealthRead = {status: 'unconfigured'} | {status: 'unreachable'; message: string} | {status: 'ok'; health: ServiceHealth};

const HEALTH_TIMEOUT_MS = 4000;

const readHealth = async (): Promise<HealthRead> => {
    const service = agentWorldService();
    if (!service) return {status: 'unconfigured'};
    try {
        const response = await fetch(`${service.url}/health`, {cache: 'no-store', signal: AbortSignal.timeout(HEALTH_TIMEOUT_MS)});
        if (!response.ok) return {status: 'unreachable', message: `HTTP ${response.status}`};
        const parsed = HealthSchema.safeParse(await response.json());
        return parsed.success ? {status: 'ok', health: {...parsed.data, checkedAt: Date.now()}} : {status: 'unreachable', message: 'an answer that could not be read'};
    } catch (error) {
        return {status: 'unreachable', message: (error as Error).name === 'TimeoutError' ? 'no answer in time' : 'no answer'};
    }
};

export type DataView = {
    health: HealthRead;
    fetches: VendorFetches[];
    fetchesFrom: string | null;
    jobs: JobHealth[];
    limits: LimitRow[];
};

export const getDataView = cache(async (): Promise<DataView> => {
    const env = agentWorldEnv();
    const [health, fetchedIn, jobs, limits] = await Promise.all([
        readHealth(),
        latestRunSessionId(env),
        getJobHealth([JOBS.agentWorldWeekly.id]),
        getLimitsView(),
    ]);
    const runs = fetchedIn ? await getRuns(env, fetchedIn) : [];
    return {
        health,
        fetches: fetchesByVendor(runs),
        fetchesFrom: fetchedIn,
        jobs,
        limits: limits.filter((row) => row.jobs.includes(JOBS.agentWorldWeekly.id)),
    };
});
