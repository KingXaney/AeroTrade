import {Document, model, models, Schema} from "mongoose";

export interface AccountSnapshotDoc extends Document {
    accountId: string;
    userId: string;
    date: string;             // 'YYYY-MM-DD' in America/New_York
    totalValue: number;
    cash: number;
    holdingsValue: number;
    startingBalance: number;
    // The account epoch (accountEpoch, epoch ms) whose income this snapshot's cash counts;
    // stamped when the income job first tops it up, so a top-up never mixes epochs.
    epoch?: number;
    // Which income this snapshot's cash already contains: every row of this account epoch
    // dated on or before `incomeThrough`. Absent = none (written before income existed, or
    // before the account's first credit). The income job tops snapshots up from here.
    incomeThrough?: string;
}

const AccountSnapshotSchema = new Schema<AccountSnapshotDoc>({
    accountId: {type: String, required: true},
    userId: {type: String, required: true, index: true},
    date: {type: String, required: true},
    totalValue: {type: Number, required: true},
    cash: {type: Number, required: true},
    holdingsValue: {type: Number, required: true},
    startingBalance: {type: Number, required: true},
    // Declared, not just written: strict mode would strip an undeclared field while the
    // accompanying $inc still applied, and a guard on it would match on every retry.
    epoch: {type: Number},
    incomeThrough: {type: String},
});

// Idempotency key: the daily cron upserts on {accountId, date}, so re-runs overwrite.
AccountSnapshotSchema.index({accountId: 1, date: 1}, {unique: true});

const AccountSnapshot = models?.AccountSnapshot || model<AccountSnapshotDoc>('AccountSnapshot', AccountSnapshotSchema);

export default AccountSnapshot;
