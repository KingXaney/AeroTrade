import {Document, model, models, Schema} from "mongoose";

export interface AccountSnapshotDoc extends Document {
    accountId: string;
    userId: string;
    date: string;             // 'YYYY-MM-DD' in America/New_York
    totalValue: number;
    cash: number;
    holdingsValue: number;
    startingBalance: number;
}

const AccountSnapshotSchema = new Schema<AccountSnapshotDoc>({
    accountId: {type: String, required: true},
    userId: {type: String, required: true, index: true},
    date: {type: String, required: true},
    totalValue: {type: Number, required: true},
    cash: {type: Number, required: true},
    holdingsValue: {type: Number, required: true},
    startingBalance: {type: Number, required: true},
});

// Idempotency key: the daily cron upserts on {accountId, date}, so re-runs overwrite.
AccountSnapshotSchema.index({accountId: 1, date: 1}, {unique: true});

const AccountSnapshot = models?.AccountSnapshot || model<AccountSnapshotDoc>('AccountSnapshot', AccountSnapshotSchema);

export default AccountSnapshot;
