// Completion stamps for background jobs (NOT a 'use server' module). Failures here
// must never fail the job itself — the stamp is observability, not state.

import JobRun from "@/database/models/job-run.model";
import {connectToDatabase} from "@/database/mongoose";

export const recordJobRun = async (jobId: string, message: string): Promise<void> => {
    try {
        await connectToDatabase();
        await JobRun.updateOne(
            {jobId},
            {$set: {lastRunAt: new Date(), lastMessage: message}},
            {upsert: true},
        );
    } catch (error) {
        console.error(`Could not record job run for ${jobId}:`, error);
    }
};
