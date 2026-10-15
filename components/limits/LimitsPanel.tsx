import Panel from "@/components/primitives/Panel";
import RowCard from "@/components/primitives/RowCard";
import SectionHeading from "@/components/primitives/SectionHeading";
import MicroLabel from "@/components/primitives/MicroLabel";
import {formatTimeAgoMs} from "@/lib/format";
import {JOB_LIST} from "@/lib/jobs/registry";
import {LIMIT_RETENTION_DAYS, limitProvider} from "@/lib/limits/registry";
import {sortedLimitRows, type LimitRow, type LimitState} from "@/lib/limits/view";
import {LIMIT_STATE_LABELS, LIMITS_COPY, providerLine} from "@/lib/learn/copy/limits";
import {cn} from "@/lib/utils";

// The limits tracker on /brain?view=system, under the jobs strip: one row per outside service
// the app meters, the rows with a recorded hit first (newest first). Each row says the service
// and its use, the cap as the provider publishes it with the day it was read, the app's planned
// use, the hits today and over the week, and the last hit — its kind, when, which job, its
// words. A row with no hit says "no hit recorded", never "within limits" (lib/limits/view.ts).
// Inngest's and Vercel's own counters cannot be read; the note links their dashboards.

const DOT: Record<LimitState, string> = {
    'clear': 'bg-line-strong',
    'hit-week': 'bg-warning',
    'hit-today': 'bg-negative',
};

const jobLabel = (jobId: string | null): string | null => {
    if (!jobId) return null;
    const job = JOB_LIST.find((candidate) => candidate.id === jobId);
    return job?.health?.label ?? jobId;
};

const jobLabels = (ids: readonly string[]): string[] => ids.map((id) => jobLabel(id) ?? id);

const LimitRowCard = ({row}: {row: LimitRow}) => (
    <RowCard className="flex items-start gap-2.5 px-3 py-2" data-limit={row.id} data-limit-state={row.state}>
        <span className={cn('mt-1.5 inline-block w-2 h-2 rounded-full shrink-0', DOT[row.state])} aria-hidden />
        <div className="min-w-0 flex-1 space-y-0.5">
            <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5">
                <span className="text-xs font-semibold text-fg font-mono">{providerLine(row)}</span>
                <span className="text-[11px] text-fg-muted font-mono" data-limit-hits>
                    {row.lastHit ? LIMITS_COPY.hits(row.hitsToday, row.hitsWeek) : LIMIT_STATE_LABELS[row.state]}
                </span>
            </div>
            <div className="text-[11px] text-fg-soft font-mono">
                <span className="text-fg-muted">{LIMITS_COPY.columns.cap}: </span>{row.cap}
                <span className="text-fg-muted"> · {LIMITS_COPY.capAsOf(row.capAsOf)}</span>
            </div>
            <div className="text-[11px] text-fg-soft font-mono">
                <span className="text-fg-muted">{LIMITS_COPY.columns.planned}: </span>{row.planned ?? LIMITS_COPY.plannedNone}
                <span className="text-fg-muted"> · {LIMITS_COPY.jobsLine(jobLabels(row.jobs))}</span>
            </div>
            {row.lastHit && (
                <div className="text-[11px] text-fg font-mono" data-limit-last title={row.lastHit.message}>
                    <span className="text-fg-muted">{LIMITS_COPY.columns.last}: </span>
                    {LIMITS_COPY.lastHit(row.lastHit.kind, formatTimeAgoMs(row.lastHit.at), jobLabel(row.lastHit.jobId))}
                    {row.lastHit.message && <span className="text-fg-muted"> — {row.lastHit.message}</span>}
                </div>
            )}
            <div className="text-[11px] font-mono flex flex-wrap gap-3">
                <a href={row.docsUrl} target="_blank" rel="noopener noreferrer" className="text-brand hover:underline">{LIMITS_COPY.docs} ↗</a>
                {row.dashboardUrl && <a href={row.dashboardUrl} target="_blank" rel="noopener noreferrer" className="text-brand hover:underline">{LIMITS_COPY.dashboard} ↗</a>}
            </div>
        </div>
    </RowCard>
);

const LimitsPanel = ({rows}: {rows: LimitRow[]}) => {
    const sorted = sortedLimitRows(rows);
    const hitToday = rows.filter((row) => row.state === 'hit-today').length;
    const hitWeek = rows.filter((row) => row.state !== 'clear').length;
    const inngest = limitProvider('inngest');
    return (
        <Panel id="limits" aria-labelledby="limits-heading" data-limits>
            <div className="flex flex-wrap items-center justify-between gap-3 mb-2">
                <SectionHeading id="limits-heading" spacing="none">{LIMITS_COPY.heading}</SectionHeading>
                <MicroLabel tone={hitToday > 0 ? 'warning' : 'muted'} data-limits-summary>{LIMITS_COPY.summary(hitToday, hitWeek, rows.length)}</MicroLabel>
            </div>
            <p className="text-xs text-fg-muted mb-4 max-w-3xl">{LIMITS_COPY.lead}</p>
            <div className="grid grid-cols-1 xl:grid-cols-2 gap-2">
                {sorted.map((row) => <LimitRowCard key={row.id} row={row} />)}
            </div>
            <p className="mt-3 text-[11px] text-fg-muted font-mono">
                {LIMITS_COPY.dashboardsNote}{' '}
                {inngest.dashboardUrl && <a href={inngest.dashboardUrl} target="_blank" rel="noopener noreferrer" className="text-brand hover:underline">Inngest ↗</a>}{' '}
                <a href={LIMITS_COPY.vercelDashboard} target="_blank" rel="noopener noreferrer" className="text-brand hover:underline">Vercel ↗</a>
                {' · '}{LIMITS_COPY.retention(LIMIT_RETENTION_DAYS)}
            </p>
        </Panel>
    );
};

export default LimitsPanel;
