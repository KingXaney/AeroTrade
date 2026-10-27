import WhatTheseMean from "@/components/learn/WhatTheseMean";
import Badge from "@/components/primitives/Badge";
import MicroLabel from "@/components/primitives/MicroLabel";
import Panel from "@/components/primitives/Panel";
import RowCard from "@/components/primitives/RowCard";
import SectionHeading from "@/components/primitives/SectionHeading";
import {formatCents, formatTokens} from "@/lib/agent-world/page-view";
import type {CompanyView} from "@/lib/agent-world/page-store";
import {budgetShare, type OrgNode} from "@/lib/agent-world/paperclip-view";
import {formatTimeAgoMs} from "@/lib/format";
import {COMPANY_COPY, COMPANY_TERMS} from "@/lib/learn/copy/agent-world";

// A spend bar: the month's spend over the cap, never past full; the width is the one runtime value.
const BudgetBar = ({spent, cap, label}: {spent: number; cap: number; label: string}) => {
    const share = budgetShare(spent, cap);
    return (
        <div className="min-w-0">
            <div className="h-1.5 rounded-full bg-surface-3 overflow-hidden" aria-hidden>
                {share !== null && <div className="h-full bg-brand/70" style={{width: `${Math.min(100, Math.round(share * 100))}%`}} />}
            </div>
            <p className="mt-1 text-xs text-fg-muted tabular-nums">{share === null ? `${formatCents(spent)} · ${COMPANY_COPY.noCap}` : label}</p>
        </div>
    );
};

// The org chart as Paperclip holds it: each agent under its manager, deterministic, no physics.
const OrgList = ({nodes}: {nodes: readonly OrgNode[]}) => (
    <ul className="space-y-2">
        {nodes.map((node) => (
            <li key={node.agent.id} data-aw-agent={node.agent.id} data-depth={node.depth}>
                <RowCard className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                        <span className="text-sm font-medium text-fg">{node.agent.name}</span>
                        {node.agent.title && <span className="text-xs text-fg-muted">{node.agent.title}</span>}
                        <Badge tone={node.agent.status === 'paused' ? 'warning' : 'neutral'}>{node.agent.status}</Badge>
                    </div>
                    <div className="mt-2" data-aw-budget={node.agent.id}>
                        <BudgetBar spent={node.agent.spentMonthlyCents} cap={node.agent.budgetMonthlyCents} label={COMPANY_COPY.agentBudget(formatCents(node.agent.spentMonthlyCents), formatCents(node.agent.budgetMonthlyCents))} />
                    </div>
                </RowCard>
                {node.children.length > 0 && <div className="mt-2 pl-4 md:pl-6 border-l border-line"><OrgList nodes={node.children} /></div>}
            </li>
        ))}
    </ul>
);

const STAGE_WORD = (state: string | null): string => {
    if (state === 'pending') return COMPANY_COPY.stage.pending;
    if (state === 'completed') return COMPANY_COPY.stage.completed;
    if (state === 'changes_requested') return COMPANY_COPY.stage.changes;
    if (state === 'idle') return COMPANY_COPY.stage.idle;
    return COMPANY_COPY.stage.none;
};

const CompanyPanel = ({view}: {view: CompanyView}) => {
    if (view.status === 'unconfigured') {
        return (
            <Panel id="agent-world-company">
                <SectionHeading>{COMPANY_COPY.heading}</SectionHeading>
                <p className="text-sm text-fg-muted max-w-3xl" data-aw-company="unconfigured">{COMPANY_COPY.unconfigured}</p>
                <div className="mt-4"><WhatTheseMean keys={COMPANY_TERMS} label={COMPANY_COPY.howSummary} /></div>
            </Panel>
        );
    }
    const board = (
        <a href={view.boardUrl} target="_blank" rel="noopener noreferrer" data-aw-board className="text-sm text-brand underline-offset-4 hover:underline">
            {COMPANY_COPY.board}
        </a>
    );
    if (view.status === 'unreachable') {
        return (
            <Panel id="agent-world-company">
                <SectionHeading>{COMPANY_COPY.heading}</SectionHeading>
                <div data-aw-unreachable className="space-y-2">
                    <p className="text-sm text-warning max-w-3xl">{COMPANY_COPY.unreachable}</p>
                    {board}
                </div>
                <div className="mt-4"><WhatTheseMean keys={COMPANY_TERMS} label={COMPANY_COPY.howSummary} /></div>
            </Panel>
        );
    }
    const execution = view.issue?.executionState ?? null;
    return (
        <>
            <Panel id="agent-world-company">
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                    <SectionHeading>{view.company?.name ?? COMPANY_COPY.heading}</SectionHeading>
                    {board}
                </div>
                <p className="text-sm text-fg-soft max-w-3xl">{COMPANY_COPY.lead}</p>
                {view.dashboard && (
                    <div className="mt-3 max-w-md" data-aw-company-budget>
                        <MicroLabel>{COMPANY_COPY.budgetsHeading}</MicroLabel>
                        <BudgetBar
                            spent={view.dashboard.monthSpendCents}
                            cap={view.dashboard.monthBudgetCents}
                            label={COMPANY_COPY.companyBudget(formatCents(view.dashboard.monthSpendCents), formatCents(view.dashboard.monthBudgetCents))}
                        />
                    </div>
                )}
                <div className="mt-4">
                    <SectionHeading as="h3" size="sm">{COMPANY_COPY.orgHeading}</SectionHeading>
                    <div data-aw-org><OrgList nodes={view.tree} /></div>
                </div>
                <div className="mt-4"><WhatTheseMean keys={COMPANY_TERMS} label={COMPANY_COPY.howSummary} /></div>
            </Panel>

            <Panel id="agent-world-issue">
                <SectionHeading>{COMPANY_COPY.issueHeading}</SectionHeading>
                {view.issue ? (
                    <RowCard data-aw-issue data-aw-stage={execution?.status ?? 'none'}>
                        <div className="flex flex-wrap items-center gap-2">
                            {view.issue.identifier && <span className="font-mono text-xs text-fg-muted">{view.issue.identifier}</span>}
                            <span className="text-sm text-fg">{view.issue.title}</span>
                            <Badge tone="neutral">{view.issue.status}</Badge>
                        </div>
                        <p className="mt-1 text-xs text-fg-muted">{STAGE_WORD(execution?.status ?? null)}</p>
                        {view.issueUrl && (
                            <a href={view.issueUrl} target="_blank" rel="noopener noreferrer" className="mt-1 inline-block text-xs text-brand underline-offset-4 hover:underline">{view.issue.identifier ?? view.issue.id}</a>
                        )}
                    </RowCard>
                ) : <p className="text-sm text-fg-muted">{COMPANY_COPY.issueNone}</p>}

                <SectionHeading as="h3" size="sm" className="mt-4">{COMPANY_COPY.activityHeading}</SectionHeading>
                {view.activity.length > 0 ? (
                    <ul data-aw-activity className="space-y-1 text-xs text-fg-muted">
                        {view.activity.map((row, index) => (
                            <li key={`${row.at}-${index}`} className="flex flex-wrap gap-x-2">
                                <span className="tabular-nums">{formatTimeAgoMs(row.at)}</span>
                                <span className="text-fg">{view.agentNames[row.actor] ?? row.actor}</span>
                                <span>{row.action}</span>
                                <span>{row.entityType}</span>
                            </li>
                        ))}
                    </ul>
                ) : <p className="text-sm text-fg-muted">{COMPANY_COPY.activityEmpty}</p>}
            </Panel>

            <Panel id="agent-world-costs">
                <SectionHeading>{COMPANY_COPY.costsHeading}</SectionHeading>
                {view.costs.length > 0 ? (
                    <div className="overflow-x-auto">
                        <table data-aw-costs className="w-full text-sm">
                            <thead>
                                <tr className="text-left">
                                    {[COMPANY_COPY.costColumns.agent, COMPANY_COPY.costColumns.tokens, COMPANY_COPY.costColumns.cost].map((label) => (
                                        <th key={label} className="pb-1 pr-4 font-normal"><MicroLabel>{label}</MicroLabel></th>
                                    ))}
                                </tr>
                            </thead>
                            <tbody>
                                {[...view.costs].sort((a, b) => b.costCents - a.costCents).map((row) => (
                                    <tr key={row.agentId} className="border-t border-line">
                                        <td className="py-1.5 pr-4 text-fg">{view.agentNames[row.agentId] ?? row.agentId}</td>
                                        <td className="py-1.5 pr-4 tabular-nums text-fg-muted">{formatTokens(row.inputTokens)} / {formatTokens(row.outputTokens)}</td>
                                        <td className="py-1.5 pr-4 tabular-nums text-fg">{formatCents(row.costCents)}</td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                ) : <p className="text-sm text-fg-muted">{COMPANY_COPY.costsEmpty}</p>}
            </Panel>
        </>
    );
};

export default CompanyPanel;
