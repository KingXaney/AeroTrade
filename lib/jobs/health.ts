// Read side of the jobs' completion stamps (NOT a 'use server' module): each job's last
// JobRun beside its registry row. Health is derived from staleness — a crashed or never-wired
// job stops refreshing its stamp. lib/jobs/job-runs.ts writes the stamps.

import {connectToDatabase} from "@/database/mongoose";
import JobRun from "@/database/models/job-run.model";
import {JOB_LIST} from "@/lib/jobs/registry";

export type JobHealth = {
    jobId: string;
    label: string;
    schedule: string;
    lastRunAt: number | null;     // epoch ms
    lastMessage: string | null;
    staleAfterHours: number;
};

// Cadence-aware staleness (lib/jobs/registry.ts): daily jobs get slack for one miss; the
// weekday jobs skip weekends; the navigator is weekly; on-demand jobs never go stale.
// Every job that stamps a JobRun, in registry order.
export const JOB_DEFINITIONS: Array<Omit<JobHealth, 'lastRunAt' | 'lastMessage'>> = JOB_LIST.flatMap((job) =>
    job.health ? [{jobId: job.id, ...job.health}] : []);

const withStamps = (defs: typeof JOB_DEFINITIONS, runs: {jobId: string; lastRunAt: Date; lastMessage?: string}[]): JobHealth[] => {
    const runByJob = new Map(runs.map((r) => [r.jobId, r]));
    return defs.map((def) => {
        const run = runByJob.get(def.jobId);
        return {
            ...def,
            lastRunAt: run ? new Date(run.lastRunAt).getTime() : null,
            lastMessage: run?.lastMessage ?? null,
        };
    });
};

// Job stamps for a subset of jobs (the strategies page only needs its own row).
export const getJobHealth = async (jobIds: readonly string[]): Promise<JobHealth[]> => {
    await connectToDatabase();
    const runs = await JobRun.find({jobId: {$in: jobIds}}).lean();
    return withStamps(JOB_DEFINITIONS.filter((def) => jobIds.includes(def.jobId)), runs);
};

// Every job's row (the /brain status strip).
export const getAllJobHealth = async (): Promise<JobHealth[]> => {
    await connectToDatabase();
    const runs = await JobRun.find({}).lean();
    return withStamps(JOB_DEFINITIONS, runs);
};
