import {formatTimeAgo} from "@/lib/utils";
import {type JobHealth} from "@/lib/brain/queries";

// One Inngest job's health card, derived from its completion stamp: a crashed job
// shows up because its stamp stops moving. Shared by /brain and /strategies.

export type JobHealthState = 'ok' | 'stale' | 'never';

export const jobHealth = (job: JobHealth, now = Date.now()): JobHealthState => {
    if (job.lastRunAt === null) return 'never';
    const ageHours = (now - job.lastRunAt) / (60 * 60 * 1000);
    return ageHours > job.staleAfterHours ? 'stale' : 'ok';
};

const DOT_COLORS: Record<JobHealthState, string> = {
    ok: 'var(--brand)',
    stale: 'var(--warning)',
    never: 'var(--negative)',
};

const JobStamp = ({job}: {job: JobHealth}) => {
    const health = jobHealth(job);
    return (
        <div className="flex items-start gap-2.5 px-3 py-2 rounded-lg border bg-surface-2/40 border-line-strong/20">
            <span className="mt-1 inline-block w-2 h-2 rounded-full shrink-0" style={{backgroundColor: DOT_COLORS[health]}} />
            <div className="min-w-0">
                <div className="text-xs font-semibold text-fg" style={{fontFamily: 'var(--type-mono)'}}>
                    {job.label}
                    <span className="ml-2 font-normal text-fg-muted">{job.schedule}</span>
                </div>
                <div className="text-[11px] text-fg-muted truncate" style={{fontFamily: 'var(--type-mono)'}}>
                    {job.lastRunAt === null
                        ? (job.staleAfterHours === Number.POSITIVE_INFINITY ? 'not run yet' : 'never ran')
                        : `${formatTimeAgo(Math.floor(job.lastRunAt / 1000))}${health === 'stale' ? ' — overdue' : ''}`}
                </div>
                {job.lastMessage && (
                    <div className="text-[11px] text-fg-soft truncate" title={job.lastMessage} style={{fontFamily: 'var(--type-mono)'}}>
                        {job.lastMessage}
                    </div>
                )}
            </div>
        </div>
    );
};

export default JobStamp;
