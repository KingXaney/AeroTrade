import {Document, model, models, Schema} from "mongoose";
import {ENVS, type Env} from "@/lib/poker-night/env";
import type {HandSummary} from "@/lib/poker-night/types";

// One completed poker night hand, for the table's history: written after the commit that completed
// it (or showed cards in it during the pause) by lib/poker-night/hands-store.ts, which also reads it.
// Kept out of the room document so the room stays small.
//
// PRIVATE: the summary holds every dealt hole card. lib/poker-night/views.historyView is the only
// way out, keeping the shown ones and the viewer's own.
export interface PokerHandDoc extends Document {
    env: Env;
    roomId: string;          // PokerRoom _id, as hex
    code: string;
    handNo: number;
    seq: number;             // the room's seq when written: an older write never replaces a newer one
    completedAt: Date;
    summary: HandSummary;    // Mixed
    expiresAt: Date;         // TTL: a week past completion, like the room
    createdAt: Date;
    updatedAt: Date;
}

const PokerHandSchema = new Schema<PokerHandDoc>(
    {
        env: {type: String, required: true, enum: [...ENVS]},
        roomId: {type: String, required: true},
        code: {type: String, required: true},
        handNo: {type: Number, required: true},
        seq: {type: Number, required: true},
        completedAt: {type: Date, required: true},
        summary: {type: Schema.Types.Mixed, required: true},
        expiresAt: {type: Date, required: true},
    },
    {timestamps: true, minimize: false},
);

// One row per hand; the history reads a room's newest hands first along it.
PokerHandSchema.index({env: 1, roomId: 1, handNo: 1}, {unique: true});
PokerHandSchema.index({expiresAt: 1}, {expireAfterSeconds: 0});

const PokerHand = models?.PokerHand || model<PokerHandDoc>('PokerHand', PokerHandSchema);

export default PokerHand;
