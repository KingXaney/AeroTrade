import {Document, model, models, Schema} from "mongoose";

// One row per background job, stamped on every successful completion. The /brain status strip
// derives health from staleness: a job that never fires simply stops refreshing its stamp. A
// job that FAILS also leaves its error here (lib/jobs/functions/alerts.ts, on Inngest's own
// failure event), cleared by its next completed run, and `alertedOn` is the ET day the owner
// was last mailed about the job, the claim that keeps it to one mail per job per day.
export interface JobRunDoc extends Document {
    jobId: string;
    // Absent on a row a failure created before the job ever completed a run.
    lastRunAt?: Date;
    lastMessage: string;
    lastError?: string;
    lastErrorAt?: Date;
    alertedOn?: string;
}

const JobRunSchema = new Schema<JobRunDoc>({
    jobId: {type: String, required: true, unique: true},
    lastRunAt: {type: Date},
    lastMessage: {type: String, default: ''},
    lastError: {type: String},
    lastErrorAt: {type: Date},
    alertedOn: {type: String},
});

const JobRun = models?.JobRun || model<JobRunDoc>('JobRun', JobRunSchema);

export default JobRun;
