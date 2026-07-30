import {Document, model, models, Schema} from "mongoose";

export interface PaperPositionDoc {
    symbol: string;
    company: string;
    quantity: number;
    avgCost: number;
}

export interface PaperAccountDoc extends Document {
    userId: string;
    name: string;
    cash: number;
    startingBalance: number;
    inceptionAt: Date;
    positions: PaperPositionDoc[];
    createdAt: Date;
    updatedAt: Date;
}

const PaperPositionSchema = new Schema<PaperPositionDoc>(
    {
        symbol: {type: String, required: true, uppercase: true, trim: true},
        company: {type: String, default: ''},
        quantity: {type: Number, required: true, min: 0},
        avgCost: {type: Number, required: true, min: 0},
    },
    {_id: false},
);

const PaperAccountSchema = new Schema<PaperAccountDoc>(
    {
        userId: {type: String, required: true, index: true},
        name: {type: String, required: true, trim: true, maxlength: 40, default: 'Main Strategy'},
        cash: {type: Number, required: true},
        startingBalance: {type: Number, required: true},
        // No default: Mongoose applies defaults on hydration too, which would mask a
        // missing (pre-migration) value as "now" and break the `|| createdAt` fallback
        // in toAccountSummary. Every creation site sets this explicitly.
        inceptionAt: {type: Date},
        positions: {type: [PaperPositionSchema], default: []},
    },
    {timestamps: true},
);

// One strategy account per name per user. The old single-account `userId_1` unique
// index must be dropped by scripts/migrate-multi-account.mjs before second accounts
// can be created (Mongoose adds indexes but never drops them).
PaperAccountSchema.index({userId: 1, name: 1}, {unique: true});

const PaperAccount = models?.PaperAccount || model<PaperAccountDoc>('PaperAccount', PaperAccountSchema);

export default PaperAccount;
