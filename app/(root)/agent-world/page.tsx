import type {Metadata} from "next";
import AgentWorldLegend from "@/components/agent-world/AgentWorldLegend";
import CompanyPanel from "@/components/agent-world/CompanyPanel";
import DataPanels from "@/components/agent-world/DataPanels";
import DeskRecord from "@/components/agent-world/DeskRecord";
import LiveFloor from "@/components/agent-world/LiveFloor";
import SessionsList from "@/components/agent-world/SessionsList";
import WhatTheseMean from "@/components/learn/WhatTheseMean";
import PageTitle from "@/components/primitives/PageTitle";
import Panel from "@/components/primitives/Panel";
import Tabs from "@/components/primitives/Tabs";
import {actionButton} from "@/components/primitives/ActionButton";
import {agentWorldOff, agentWorldUniverse, approvalMode, isAgentWorldOwner} from "@/lib/agent-world/env";
import {getCompanyView, getDataView, getFloorView} from "@/lib/agent-world/page-store";
import {requireOwner} from "@/lib/auth/session";
import {formatEasternTimestamp} from "@/lib/format";
import {GLOSSARY} from "@/lib/learn/glossary";
import {AGENT_WORLD_COPY, DECISION_TERMS, REPORT_TERMS, STRIP_TERMS} from "@/lib/learn/copy/agent-world";
import {OFFICE_COPY} from "@/lib/learn/copy/agent-world-office";

// The browser tab's title; app/layout.tsx appends the app's name.
export const metadata: Metadata = {title: "Trading agent world"};

// Three views, one at a time in the URL, each reading only its own data:
//   floor   — the newest session as it runs (or played back), the account against SPY, the sessions
//   company — the Paperclip company around the desk: org chart, budgets, this session's issue
//   data    — where the desk's data comes from (OpenBB first), what the service says of itself,
//             what the last session fetched, the job's stamp and this desk's limits rows
// The owner's alone (LAB_OWNER_EMAILS, lib/lab/owner.ts); AGENT_WORLD_OWNER_EMAILS (else
// LAB_OWNER_EMAILS) names who starts and decides sessions. The page composes
// lib/agent-world/page-store's reads and nothing else.
const VIEW_IDS = ['floor', 'company', 'data'] as const;
type ViewId = (typeof VIEW_IDS)[number];
const isView = (value: unknown): value is ViewId => typeof value === 'string' && (VIEW_IDS as readonly string[]).includes(value);

const TABS = VIEW_IDS.map((id) => ({id, label: AGENT_WORLD_COPY.views[id], href: id === 'floor' ? '/agent-world' : `/agent-world?view=${id}`}));

type AgentWorldPageProps = {
    searchParams: Promise<{view?: string}>;
};

const FloorView = async ({owner, enabled}: {owner: boolean; enabled: boolean}) => {
    const floor = await getFloorView();
    return (
        <>
            <LiveFloor
                initial={floor.live}
                owner={owner}
                enabled={enabled}
                ratingTitle={GLOSSARY['desk-rating'].short}
                nextSessionNote={enabled ? AGENT_WORLD_COPY.nextSession(formatEasternTimestamp(floor.nextSessionAt)) : null}
                terms={{
                    strip: <WhatTheseMean keys={STRIP_TERMS} />,
                    reports: <WhatTheseMean keys={REPORT_TERMS} />,
                    decision: <WhatTheseMean keys={DECISION_TERMS} />,
                }}
            />
            <DeskRecord record={floor.record} sessions={floor.sessionCount} spentCents={floor.spentCents} />
            <SessionsList rows={floor.sessions} />
        </>
    );
};

const CompanyView = async () => <CompanyPanel view={await getCompanyView()} />;

const DataView = async () => <DataPanels view={await getDataView()} />;

const AgentWorldPage = async ({searchParams}: AgentWorldPageProps) => {
    // The owner's alone (lib/lab/owner.ts): anyone else is sent Home.
    const user = await requireOwner();
    const {view: viewParam} = await searchParams;
    const view: ViewId = isView(viewParam) ? viewParam : 'floor';
    const off = agentWorldOff();
    const symbols = agentWorldUniverse();

    return (
        <div className="space-y-4">
            <PageTitle
                title={AGENT_WORLD_COPY.title}
                subtitle={AGENT_WORLD_COPY.pageSubtitle(symbols.length)}
                actions={
                    // The office: the same session as a 3D floor of fourteen seats, in a tab of its own.
                    <a href="/agent-world/office" target="_blank" rel="noopener noreferrer" data-aw-office title={OFFICE_COPY.openHint}
                        className={actionButton({variant: 'secondary', size: 'sm'})}>
                        <span className="material-symbols-outlined text-base" aria-hidden="true">view_in_ar</span>
                        {OFFICE_COPY.open}
                    </a>
                }
            />
            <Tabs tabs={TABS} active={view} label="Trading agent world views" />
            {off && (
                <Panel pad={4}>
                    <p className="text-sm text-fg-muted max-w-3xl" data-aw-off={off}>{AGENT_WORLD_COPY.off[off]}</p>
                </Panel>
            )}

            {view === 'floor' && <FloorView owner={isAgentWorldOwner(user.email)} enabled={off === null} />}
            {view === 'company' && <CompanyView />}
            {view === 'data' && <DataView />}

            {/* How a session runs, the desk, the ratings and the rails: reference for every view, collapsed. */}
            <AgentWorldLegend mode={approvalMode()} symbols={symbols} />
        </div>
    );
};

export default AgentWorldPage;
