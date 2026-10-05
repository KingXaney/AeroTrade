import {Document, model, models, Schema} from "mongoose";

// One daily brief mailed to one reader on one ET day: the row is the claim, written just before
// the send and removed again if the send fails, so a second run of the job that day — a retry, a
// manual trigger, a duplicate environment — cannot mail the same reader twice. A test send
// (the job's `email` filter) takes no claim. Written and read only by lib/email/digest-store.ts.
export interface DigestSendDoc extends Document {
    userId: string;
    day: string;             // 'YYYY-MM-DD', the ET day the brief went out
    sentAt: Date;
    createdAt: Date;
    updatedAt: Date;
}

const DigestSendSchema = new Schema<DigestSendDoc>(
    {
        userId: {type: String, required: true},
        day: {type: String, required: true},
        sentAt: {type: Date, required: true},
    },
    {timestamps: true},
);

DigestSendSchema.index({userId: 1, day: 1}, {unique: true});

const DigestSend = models?.DigestSend || model<DigestSendDoc>('DigestSend', DigestSendSchema);

export default DigestSend;
