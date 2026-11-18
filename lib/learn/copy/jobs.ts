// The status strip's own words about a job (components/jobs/JobStamp). Pure.

export const JOB_STAMP_COPY = {
    // Under a job whose last run failed and has not completed a run since: when, and the
    // error it ended on, as the job reported it.
    failed: (ago: string, error: string): string => `failed ${ago}: ${error}`,
} as const;
