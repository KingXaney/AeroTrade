import JobStamp from "@/components/jobs/JobStamp";
import WhatTheseMean from "@/components/learn/WhatTheseMean";
import LimitsPanel from "@/components/limits/LimitsPanel";
import Badge from "@/components/primitives/Badge";
import Disclosure from "@/components/primitives/Disclosure";
import MicroLabel from "@/components/primitives/MicroLabel";
import Panel from "@/components/primitives/Panel";
import SectionHeading from "@/components/primitives/SectionHeading";
import {DATA_TOOLS} from "@/lib/agent-world/config";
import type {DataView} from "@/lib/agent-world/page-store";
import {formatTimeAgoMs} from "@/lib/format";
import {DATA_CATEGORY_COPY, DATA_COPY, DATA_TERMS, ROLE_COPY, vendorLabel} from "@/lib/learn/copy/agent-world";

const msText = (ms: number): string => (ms >= 1000 ? `${(ms / 1000).toFixed(1)} s` : `${Math.round(ms)} ms`);

// Where the desk's data comes from, and whether the machinery ran: each data tool's chain of
// providers (OpenBB first where it has a keyless provider), what the service says of itself, what
// the last session fetched and from whom, the job's stamp, and the limits rows of the services this
// desk calls. Every framed surface a sibling; the limits panel frames itself.
const DataPanels = ({view}: {view: DataView}) => {
    const health = view.health.status === 'ok' ? view.health.health : null;
    return (
        <>
            <Panel id="agent-world-vendors">
                <SectionHeading>{DATA_COPY.vendorsHeading}</SectionHeading>
                <p className="text-sm text-fg-soft max-w-3xl mb-3">{DATA_COPY.lead}</p>
                <div className="overflow-x-auto">
                    <table data-aw-vendors className="w-full text-sm">
                        <thead>
                            <tr className="text-left">
                                {[DATA_COPY.columns.tool, DATA_COPY.columns.category, DATA_COPY.columns.chain, DATA_COPY.columns.route].map((label) => (
                                    <th key={label} className="pb-1 pr-4 font-normal"><MicroLabel>{label}</MicroLabel></th>
                                ))}
                            </tr>
                        </thead>
                        <tbody>
                            {DATA_TOOLS.map((tool) => (
                                <tr key={tool.tool} data-tool={tool.tool} data-category={tool.category} className="border-t border-line align-top">
                                    <td className="py-1.5 pr-4 font-mono text-xs text-fg">{tool.tool}</td>
                                    <td className="py-1.5 pr-4 text-fg-muted">{DATA_CATEGORY_COPY[tool.category]}</td>
                                    <td className="py-1.5 pr-4 text-fg">{tool.chain.map(vendorLabel).join(' → ')}</td>
                                    <td className="py-1.5 pr-4 font-mono text-xs text-fg-muted">{tool.openbb ?? DATA_COPY.notOpenbb}</td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
                <div className="mt-4"><WhatTheseMean keys={DATA_TERMS} label={DATA_COPY.howSummary} /></div>
            </Panel>

            <Panel id="agent-world-service">
                <SectionHeading>{DATA_COPY.healthHeading}</SectionHeading>
                {view.health.status === 'unconfigured' && <p className="text-sm text-fg-muted" data-aw-health="unconfigured">{DATA_COPY.healthUnconfigured}</p>}
                {view.health.status === 'unreachable' && <p className="text-sm text-warning" data-aw-health="unreachable">{DATA_COPY.healthUnreachable} ({view.health.message})</p>}
                {health && (
                    <div data-aw-health="ok" className="space-y-3 text-sm">
                        <dl className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-1">
                            {Object.entries(health.versions ?? {}).map(([name, version]) => (
                                <div key={name} className="flex justify-between gap-3 min-w-0" data-aw-version={name}>
                                    <dt className="text-fg-muted font-mono text-xs truncate">{name}</dt>
                                    <dd className="text-fg font-mono text-xs">{version ?? '—'}</dd>
                                </div>
                            ))}
                        </dl>
                        <div className="flex flex-wrap gap-1.5">
                            {Object.entries(health.keys ?? {}).map(([name, value]) => {
                                const present = typeof value === 'number' ? value > 0 : value;
                                return (
                                    <Badge key={name} tone="neutral" data-aw-key={name} data-present={present ? 'true' : 'false'}>
                                        {name}: {present ? DATA_COPY.keySet : DATA_COPY.keyMissing}
                                    </Badge>
                                );
                            })}
                        </div>
                        <p className="text-xs text-fg-muted">
                            {health.models ? `${health.models.provider ?? ''} · ${health.models.quick ?? ''} / ${health.models.deep ?? ''} · ` : ''}
                            {DATA_COPY.worker(health.worker?.busy === true)} · {DATA_COPY.checked(formatTimeAgoMs(health.checkedAt))}
                        </p>
                    </div>
                )}
            </Panel>

            <Panel id="agent-world-fetches">
                <SectionHeading>{DATA_COPY.fetchesHeading}</SectionHeading>
                {view.fetches.length === 0 ? (
                    <p className="text-sm text-fg-muted">{DATA_COPY.fetchesNone}</p>
                ) : (
                    <div data-aw-fetches data-aw-session={view.fetchesFrom ?? ''} className="space-y-2">
                        {view.fetchesFrom && <p className="text-xs text-fg-muted">{DATA_COPY.fetchedIn(view.fetchesFrom)}</p>}
                        {view.fetches.map((group) => (
                            <Disclosure key={group.vendor} variant="row" data-aw-vendor={group.vendor} summary={DATA_COPY.vendorGroup(vendorLabel(group.vendor), group.calls.length, msText(group.totalMs))}>
                                <ul className="mt-2 space-y-1 text-xs">
                                    {group.calls.map((call, index) => (
                                        <li key={`${call.at}-${index}`} data-aw-call data-ok={call.status === 'ok' ? 'true' : 'false'} className="flex flex-wrap gap-x-2 text-fg-muted">
                                            <span className="font-mono text-fg">{call.name}</span>
                                            <span>{call.symbol}</span>
                                            <span>{ROLE_COPY[call.role].name}</span>
                                            {call.ms !== null && <span className="tabular-nums">{msText(call.ms)}</span>}
                                            <span>{DATA_COPY.callStatus[call.status]}</span>
                                            {call.attempts.length > 1 && <span>{DATA_COPY.fellBack(call.attempts.filter((a) => !a.ok).map((a) => vendorLabel(a.vendor)).join(', '))}</span>}
                                        </li>
                                    ))}
                                </ul>
                            </Disclosure>
                        ))}
                    </div>
                )}
            </Panel>

            <Panel id="agent-world-jobs">
                <SectionHeading>{DATA_COPY.jobsHeading}</SectionHeading>
                <div data-aw-jobs className="space-y-2">
                    {view.jobs.map((job) => <JobStamp key={job.jobId} job={job} />)}
                </div>
                <p className="mt-3 text-xs text-fg-muted">{DATA_COPY.limitsNote}</p>
            </Panel>
            <LimitsPanel rows={view.limits} />
        </>
    );
};

export default DataPanels;
