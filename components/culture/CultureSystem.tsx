import JobStamp, {jobHealth} from "@/components/jobs/JobStamp";
import Panel from "@/components/primitives/Panel";
import SectionHeading from "@/components/primitives/SectionHeading";
import StatTile from "@/components/primitives/StatTile";
import type {CultureSystemView} from "@/lib/culture/page-store";
import {CULTURE_SOURCES} from "@/lib/culture/types";
import {CULTURE_SYSTEM_COPY as COPY, SOURCE_LABELS} from "@/lib/learn/copy/culture";

// Is the machinery running, and is the brain actually reading? The counters, the last day each
// source stored, the Wikipedia drift alarm (a brand whose article has gone quiet is a renamed
// title, not a quiet brand), the earnings calendar and the week's quote check, the pickers'
// accounts, and the three jobs' stamps. Health is derived from stamp staleness, so a crashed
// job shows up because its stamp stops moving.
const CultureSystem = ({view}: {view: CultureSystemView}) => {
    const anyNever = view.jobs.some((job) => job.staleAfterHours !== Number.POSITIVE_INFINITY && jobHealth(job) === 'never');
    const {counts} = view;
    return (
        <Panel id="culture-system">
            <div className="flex items-center justify-between mb-4">
                <SectionHeading spacing="none">{COPY.heading}</SectionHeading>
                {anyNever && (
                    <span className="label-type text-[length:var(--label-size)] text-negative">{COPY.neverRan}</span>
                )}
            </div>

            <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-4 mb-4" data-culture-counters>
                <StatTile size="sm" label={COPY.brands} value={String(counts.brands)} hint={COPY.brandsHint(counts.listed, counts.privateBrands)} />
                <StatTile size="sm" label={COPY.entities} value={String(counts.entities)} hint={COPY.entitiesHint} />
                <StatTile size="sm" label={COPY.theses} value={String(counts.theses)} hint={COPY.thesesHint} />
                <StatTile size="sm" label={COPY.items} value={String(counts.itemsTotal)} hint={COPY.itemsHint(counts.itemsLabelled)} />
                <StatTile size="sm" label={COPY.attention} value={String(counts.attentionDocs)} hint={COPY.attentionHint} />
                <StatTile size="sm" label={COPY.suggestions} value={String(counts.suggestions)} hint={COPY.suggestionsHint} />
            </div>

            <div className="font-mono text-[11px] text-fg-muted space-y-1 mb-4" data-culture-lines>
                <p>
                    <span className="label-type text-fg-muted">{COPY.freshnessHeading} </span>
                    {CULTURE_SOURCES.map((source, i) => (
                        <span key={source}>
                            {i > 0 && <span aria-hidden="true"> · </span>}
                            {SOURCE_LABELS[source]} <span className="text-fg-soft">{view.freshness[source] ?? COPY.never}</span>
                        </span>
                    ))}
                </p>
                <p className={view.drift.brands.length > 0 ? 'text-warning' : undefined} data-drift-alarm={view.drift.brands.length}>
                    {view.drift.brands.length > 0 ? COPY.driftAlarm(view.drift.brands, view.drift.days) : COPY.driftClear(view.drift.days)}
                </p>
                <p>{view.earnings.configured ? COPY.earnings(view.earnings.dated) : COPY.earningsOff}</p>
                <p>{view.universe ? COPY.universe(view.universe.weekKey, view.universe.quoted, view.universe.tickers) : COPY.universeNone}</p>
            </div>

            <div className="mb-4" data-culture-accounts>
                <h3 className="label-type text-[length:var(--label-size)] text-fg-muted mb-1">{COPY.accountsHeading}</h3>
                {view.accounts.length === 0 ? (
                    <p className="font-mono text-[11px] text-fg-muted">{COPY.accountsNone}</p>
                ) : (
                    <ul className="font-mono text-[11px] text-fg-muted space-y-0.5">
                        {view.accounts.map((account) => (
                            <li key={account.id}>
                                {COPY.accountLine(account.label, account.launchDate, account.lastRunDate)}
                                {account.lastError && <span className="text-warning"> · {account.lastError}</span>}
                            </li>
                        ))}
                    </ul>
                )}
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-2" data-culture-jobs>
                {view.jobs.map((job) => <JobStamp key={job.jobId} job={job} />)}
            </div>
        </Panel>
    );
};

export default CultureSystem;
