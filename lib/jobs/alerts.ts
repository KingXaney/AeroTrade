// The owner's alert, as decisions. Pure.
//
// A job's health used to be only its completion stamp: a job that failed simply stopped
// refreshing it, and the one place that showed is the status strip on /brain?view=system, which
// someone has to open. Two things now reach the owner by mail (lib/jobs/functions/alerts.ts):
// a job that FAILED, the moment Inngest gives up on it, and, once a day, every job OVERDUE on
// its stamp. Each at most once per job per ET day.

import {JOB_LIST} from "@/lib/jobs/registry";

type JobRow = (typeof JOB_LIST)[number];

// The job a failed Inngest function is. Inngest names a function by its app id and its own id
// ("aerotrade-daily-account-snapshots"); the longest registry id the name ends with is the job,
// so "…-ai-navigator-weekly" is never read as some shorter id's.
export const jobOfFunctionId = (functionId: string): JobRow | null => {
    let found: JobRow | null = null;
    for (const job of JOB_LIST) {
        if (functionId !== job.id && !functionId.endsWith(`-${job.id}`)) continue;
        if (found === null || job.id.length > found.id.length) found = job;
    }
    return found;
};

export type StampedJob = {jobId: string; label: string; schedule: string; lastRunAt: number | null; staleAfterHours: number};

// The scheduled jobs whose last completed run is older than their own allowance
// (lib/jobs/registry: staleAfterHours). A job that has never completed a run is left out: it
// has no stamp to be late against (a job just added has not had its first run yet), and the
// strip already shows it as never run. On-demand jobs are never overdue.
export const overdueJobs = <J extends StampedJob>(jobs: readonly J[], now: number): J[] =>
    jobs.filter((job) => job.lastRunAt !== null
        && Number.isFinite(job.staleAfterHours)
        && (now - job.lastRunAt) / 3_600_000 > job.staleAfterHours);

// An error message as one bounded line: it is stored on the job's row and printed in a mail.
export const ERROR_LINE_MAX = 300;
export const errorLine = (message: unknown): string => {
    const flat = String(message ?? '').replace(/[\u0000-\u001F\u007F]+/g, ' ').replace(/\s+/g, ' ').trim();
    if (flat === '') return 'no error message';
    return flat.length > ERROR_LINE_MAX ? `${flat.slice(0, ERROR_LINE_MAX - 1).trimEnd()}…` : flat;
};
