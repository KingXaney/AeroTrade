import {Document, model, models, Schema} from "mongoose";
import {LIMIT_RETENTION_DAYS} from "@/lib/limits/registry";

// One row per time a job or a request ran into an outside service's limit — a daily quota, a
// rate, an auth refusal or an outage — filed by lib/limits/record.ts against a provider the
// registry names (lib/limits/registry.ts). The limits panel on /brain?view=system reads the last
// week of them; rows expire after LIMIT_RETENTION_DAYS. A hit is recorded only where an error is
// caught, so an empty collection says nothing was recorded, never that every call was within
// its limits.

export interface LimitEventDoc extends Document {
    provider: string;
    kind: 'quota' | 'rate' | 'auth' | 'outage';
    jobId?: string;
    message: string;    // at most 200 characters, the error's own words
    at: Date;
    day: string;        // the ET day, 'YYYY-MM-DD'
}

const LimitEventSchema = new Schema<LimitEventDoc>({
    provider: {type: String, required: true},
    kind: {type: String, enum: ['quota', 'rate', 'auth', 'outage'], required: true},
    jobId: {type: String},
    message: {type: String, default: ''},
    at: {type: Date, required: true},
    day: {type: String, required: true},
});

LimitEventSchema.index({provider: 1, at: -1});
LimitEventSchema.index({at: -1});
LimitEventSchema.index({at: 1}, {expireAfterSeconds: LIMIT_RETENTION_DAYS * 24 * 60 * 60});

const LimitEvent = models?.LimitEvent || model<LimitEventDoc>('LimitEvent', LimitEventSchema);

export default LimitEvent;
