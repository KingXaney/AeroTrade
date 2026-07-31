import {Document, model, models, Schema} from "mongoose";

// One row per background job, stamped on every successful completion. The /brain
// status strip derives health from staleness: a job that crashes (or never fires)
// simply stops refreshing its stamp, so no explicit error recording is needed.
export interface JobRunDoc extends Document {
    jobId: string;
    lastRunAt: Date;
    lastMessage: string;
}

const JobRunSchema = new Schema<JobRunDoc>({
    jobId: {type: String, required: true, unique: true, index: true},
    lastRunAt: {type: Date, required: true},
    lastMessage: {type: String, default: ''},
});

const JobRun = models?.JobRun || model<JobRunDoc>('JobRun', JobRunSchema);

export default JobRun;
