import {Document, model, models, Schema} from "mongoose";
import {ENVS, type Env} from "@/lib/poker-night/env";

// An account's night at one poker night table: absolute totals as the bank figures them
// (lib/poker-night/ledger.ledgerDigest), never increments, upserted after a commit that moved one
// of them by lib/poker-night/results-store.ts, guarded on `seq` so an older write never replaces a
// newer one (lib/poker-night/results.resultWrite). No TTL: this is the history that outlives the
// room — the lobby's "Recent nights". Guests have no rows.
export interface PokerResultDoc extends Document {
    env: Env;
    roomId: string;          // PokerRoom _id, as hex
    code: string;
    tableName: string;
    userId: string;
    pid: string;
    bought: number;
    cashedOut: number;
    chips: number;           // at the table when written: the stack plus anything in a live pot
    net: number;
    buys: number;
    hands: number;
    wins: number;
    biggestWin: number;
    allIns: number;
    peakChips: number;
    closed: boolean;         // written at the table's close
    seq: number;
    firstAt: Date;
    lastAt: Date;
    createdAt: Date;
    updatedAt: Date;
}

const PokerResultSchema = new Schema<PokerResultDoc>(
    {
        env: {type: String, required: true, enum: [...ENVS]},
        roomId: {type: String, required: true},
        code: {type: String, required: true},
        tableName: {type: String, default: ''},
        userId: {type: String, required: true},
        pid: {type: String, required: true},
        bought: {type: Number, required: true},
        cashedOut: {type: Number, required: true},
        chips: {type: Number, required: true},
        net: {type: Number, required: true},
        buys: {type: Number, required: true},
        hands: {type: Number, required: true},
        wins: {type: Number, required: true},
        biggestWin: {type: Number, required: true},
        allIns: {type: Number, required: true},
        peakChips: {type: Number, required: true},
        closed: {type: Boolean, required: true, default: false},
        seq: {type: Number, required: true},
        firstAt: {type: Date, required: true},
        lastAt: {type: Date, required: true},
    },
    {timestamps: true},
);

// One row per account per table.
PokerResultSchema.index({env: 1, roomId: 1, userId: 1}, {unique: true});
// An account's recent nights, newest first.
PokerResultSchema.index({env: 1, userId: 1, lastAt: -1});

const PokerResult = models?.PokerResult || model<PokerResultDoc>('PokerResult', PokerResultSchema);

export default PokerResult;
