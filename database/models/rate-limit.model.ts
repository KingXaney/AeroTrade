import {Document, model, models, Schema} from "mongoose";

// A keyed counter with a hard window, kept in the database so every serverless
// instance shares one view of it. better-auth's own rateLimit config never runs here:
// it lives in the HTTP router, and this app calls auth.api.* directly from server
// actions — so before this model nothing in the app was rate-limited at all.
export interface RateLimitDoc extends Document {
    key: string;              // e.g. 'pwreset:someone@example.com'
    count: number;            // requests seen in the current window
    windowStartedAt: Date;
    expiresAt: Date;          // TTL index below removes the row once the window has passed
}

const RateLimitSchema = new Schema<RateLimitDoc>({
    key: {type: String, required: true, unique: true},
    count: {type: Number, required: true, default: 0},
    windowStartedAt: {type: Date, required: true},
    expiresAt: {type: Date, required: true},
});

RateLimitSchema.index({expiresAt: 1}, {expireAfterSeconds: 0});

const RateLimit = models?.RateLimit || model<RateLimitDoc>('RateLimit', RateLimitSchema);

export default RateLimit;
