import {Document, model, models, Schema, type Types} from "mongoose";

export interface PaperPositionDoc {
    symbol: string;
    company: string;
    quantity: number;
    avgCost: number;
}

export interface IncomeTotalsDoc {
    interest?: number;
    dividends?: number;
}

// A fill the account has already taken (cash and positions moved in the same write) whose trade
// row is still to be inserted: lib/trading/pending-fill.ts. `tradeId` is that row's _id, chosen
// before either write, so settling it twice is one row.
export interface PendingFillDoc {
    tradeId: Types.ObjectId;
    symbol: string;
    company: string;
    side: 'buy' | 'sell';
    quantity: number;
    price: number;
    total: number;
    realizedPnl?: number;
    source?: string;
    reason?: string;
    idempotencyKey?: string;
    createdAt: Date;
}

// A stock split this account's position already reflects (lib/trading/splits.ts): fills of
// `symbol` before `before` are in old shares and are restated when the ledger is read.
export interface AppliedSplitDoc {
    symbol: string;
    exDate: string;
    numerator: number;
    denominator: number;
    before: Date;
    appliedAt: Date;
}

export interface PaperAccountDoc extends Document {
    userId: string;
    name: string;
    cash: number;
    startingBalance: number;
    inceptionAt: Date;
    positions: PaperPositionDoc[];
    // Every AccountIncome row dated on or before this ET date is already in `cash`. Absent
    // means nothing has been credited yet, and the income job replays from inception.
    incomeThrough?: string;
    incomeTotals?: IncomeTotalsDoc;
    pendingFill?: PendingFillDoc;
    splits?: AppliedSplitDoc[];
    // Bumped by every split applied: a fill's guarded write names the value it read, so an order
    // that read the positions before a split cannot write them back after it (cash, the fill's
    // other guard, does not move in a split).
    splitRev?: number;
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

const PendingFillSchema = new Schema<PendingFillDoc>(
    {
        tradeId: {type: Schema.Types.ObjectId, required: true},
        symbol: {type: String, required: true, uppercase: true, trim: true},
        company: {type: String, default: ''},
        side: {type: String, required: true, enum: ['buy', 'sell']},
        quantity: {type: Number, required: true, min: 0},
        price: {type: Number, required: true, min: 0},
        total: {type: Number, required: true},
        realizedPnl: {type: Number},
        source: {type: String},
        reason: {type: String},
        idempotencyKey: {type: String},
        createdAt: {type: Date, required: true},
    },
    {_id: false},
);

const AppliedSplitSchema = new Schema<AppliedSplitDoc>(
    {
        symbol: {type: String, required: true, uppercase: true, trim: true},
        exDate: {type: String, required: true},
        numerator: {type: Number, required: true},
        denominator: {type: Number, required: true},
        before: {type: Date, required: true},
        appliedAt: {type: Date, required: true},
    },
    {_id: false},
);

const PaperAccountSchema = new Schema<PaperAccountDoc>(
    {
        userId: {type: String, required: true, index: true},
        name: {type: String, required: true, trim: true, maxlength: 40, default: 'Main account'},  // = DEFAULT_ACCOUNT_NAME (lib/trading/accounts imports this model)
        cash: {type: Number, required: true},
        startingBalance: {type: Number, required: true},
        // No default: Mongoose applies defaults on hydration too, which would mask a
        // missing (pre-migration) value as "now" and break the `|| createdAt` fallback
        // in toAccountSummary. Every creation site sets this explicitly.
        inceptionAt: {type: Date},
        positions: {type: [PaperPositionSchema], default: []},
        // No defaults on either: a default would be hydrated onto every existing account and
        // read as "credited through <nothing>" — the income job keys the back-credit on absence.
        incomeThrough: {type: String},
        incomeTotals: {
            type: new Schema<IncomeTotalsDoc>({interest: {type: Number}, dividends: {type: Number}}, {_id: false}),
            required: false,
        },
        // No defaults on any of the three: absent means "none", and a default would be hydrated
        // onto every stored account (an empty `splits` array would then be written back by a save).
        pendingFill: {type: PendingFillSchema, required: false},
        splits: {type: [AppliedSplitSchema], default: undefined},
        splitRev: {type: Number},
    },
    {timestamps: true},
);

// One paper account per name per user. The old single-account `userId_1` unique
// index must be dropped by scripts/migrate-multi-account.mjs before second accounts
// can be created (Mongoose adds indexes but never drops them).
PaperAccountSchema.index({userId: 1, name: 1}, {unique: true});

const PaperAccount = models?.PaperAccount || model<PaperAccountDoc>('PaperAccount', PaperAccountSchema);

export default PaperAccount;
