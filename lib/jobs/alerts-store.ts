// The owner's alert, on the database: a failed job's error on its row, and the once-a-day claim.
// Server-only (NOT 'use server'). The decisions are lib/jobs/alerts.ts, pure.

import {connectToDatabase} from "@/database/mongoose";
import JobRun from "@/database/models/job-run.model";

// The error of a run Inngest gave up on, on the job's row. The next completed run clears it
// (lib/jobs/job-runs.recordJobRun). A job that never completed a run gets its row here.
export const recordJobFailure = async (jobId: string, error: string): Promise<void> => {
    await connectToDatabase();
    await JobRun.updateOne({jobId}, {$set: {lastError: error, lastErrorAt: new Date()}}, {upsert: true});
};

// Which of these jobs the owner has not been mailed about today: each claimed by its own
// conditional update, so two runs at once (a failure and the daily check) mail a job once.
export const claimAlerts = async (jobIds: readonly string[], day: string): Promise<string[]> => {
    await connectToDatabase();
    const claimed: string[] = [];
    for (const jobId of jobIds) {
        const taken = await JobRun.updateOne({jobId, alertedOn: {$ne: day}}, {$set: {alertedOn: day}});
        if (taken.modifiedCount > 0) claimed.push(jobId);
    }
    return claimed;
};

// A mail that could not be sent gives its claims back: the next failure or check tries again.
export const releaseAlerts = async (jobIds: readonly string[], day: string): Promise<void> => {
    if (jobIds.length === 0) return;
    await connectToDatabase();
    await JobRun.updateMany({jobId: {$in: jobIds}, alertedOn: day}, {$unset: {alertedOn: 1}});
};
