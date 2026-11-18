import {formatTimeAgoMs} from "@/lib/format";
import {type JobHealth} from "@/lib/jobs/health";
import {JOB_STAMP_COPY} from "@/lib/learn/copy/jobs";
import RowCard from "@/components/primitives/RowCard";
import {cn} from "@/lib/utils";

// One Inngest job's health card, derived from its completion stamp: a crashed job
// shows up because its stamp stops moving. Shared by /brain and /strategies.

type JobHealthState = 'ok' | 'stale' | 'never' | 'failed';

// A failure no completed run has followed yet outranks everything: the stamp may still be
// fresh (yesterday's run) while today's has just failed.
export const jobHealth = (job: JobHealth, now = Date.now()): JobHealthState => {
    if (job.lastError !== null && job.lastErrorAt !== null && (job.lastRunAt === null || job.lastErrorAt > job.lastRunAt)) return 'failed';
    if (job.lastRunAt === null) return 'never';
    const ageHours = (now - job.lastRunAt) / (60 * 60 * 1000);
    return ageHours > job.staleAfterHours ? 'stale' : 'ok';
};

const DOT_COLORS: Record<JobHealthState, string> = {
    ok: 'bg-brand',
    stale: 'bg-warning',
    never: 'bg-negative',
    failed: 'bg-negative',
};

const JobStamp = ({job}: {job: JobHealth}) => {
    const health = jobHealth(job);
    return (
        <RowCard className="flex items-start gap-2.5 px-3 py-2">
            <span className={cn('mt-1 inline-block w-2 h-2 rounded-full shrink-0', DOT_COLORS[health])} />
            <div className="min-w-0">
                <div className="text-xs font-semibold text-fg font-mono">
                    {job.label}
                    <span className="ml-2 font-normal text-fg-muted">{job.schedule}</span>
                </div>
                <div className="text-[11px] text-fg-muted truncate font-mono">
                    {job.lastRunAt === null
                        ? (job.staleAfterHours === Number.POSITIVE_INFINITY ? 'not run yet' : 'never ran')
                        : `${formatTimeAgoMs(job.lastRunAt)}${health === 'stale' ? ' — overdue' : ''}`}
                </div>
                {job.lastMessage && (
                    <div className="text-[11px] text-fg-soft truncate font-mono" title={job.lastMessage}>
                        {job.lastMessage}
                    </div>
                )}
                {health === 'failed' && job.lastError && job.lastErrorAt !== null && (
                    <div className="text-[11px] text-negative truncate font-mono" title={job.lastError} data-job-error={job.jobId}>
                        {JOB_STAMP_COPY.failed(formatTimeAgoMs(job.lastErrorAt), job.lastError)}
                    </div>
                )}
            </div>
        </RowCard>
    );
};

export default JobStamp;
