// A poker night table's history: one PokerHand row per completed hand (database/models/
// poker-hand.model.ts), kept out of the room document so the room stays small. Server-only (on the
// poker-night server guard's list). The rows hold every dealt hole card: they leave only through
// lib/poker-night/views.historyView, which keeps the shown ones and the viewer's own.
//
// writeHands runs in a route's after() (store.afterCommit), with the hands a commit completed or
// showed cards in. A row is upserted whole behind a seq guard: a hand shown during the pause is
// written again, and a late write from an older commit never replaces it.

import {connectToDatabase} from "@/database/mongoose";
import PokerHand from "@/database/models/poker-hand.model";
import {TIMING} from "@/lib/poker-night/config";
import type {Commit, RoomRef} from "@/lib/poker-night/room-doc";
import type {HandSummary} from "@/lib/poker-night/types";

// A page of history.
export const HISTORY_PAGE = 10;

const messageOf = (error: unknown): string => (error instanceof Error ? error.message : String(error));

// Every failure in a bulk write is a duplicate key: each one a newer row that the seq guard kept.
const onlyNewerRows = (error: unknown): boolean => {
    const writeErrors = (error as {writeErrors?: {code?: number}[]} | null)?.writeErrors;
    if (Array.isArray(writeErrors) && writeErrors.length > 0) return writeErrors.every((e) => e.code === 11000);
    return (error as {code?: number} | null)?.code === 11000;
};

export const writeHands = async (commit: Commit): Promise<void> => {
    const {ref, room, hands} = commit;
    if (hands.length === 0) return;
    const where = {code: room.core.code, env: ref.env, seq: room.seq};
    try {
        await connectToDatabase();
        await PokerHand.bulkWrite(hands.map((summary) => ({
            updateOne: {
                filter: {env: ref.env, roomId: ref.id, handNo: summary.no, seq: {$lt: room.seq}},
                update: {
                    $set: {
                        code: room.core.code, seq: room.seq, completedAt: new Date(summary.completedAt), summary,
                        expiresAt: new Date(summary.completedAt + TIMING.ROOM_TTL_MS),
                    },
                },
                upsert: true,
            },
        })), {ordered: false});
    } catch (error) {
        if (onlyNewerRows(error)) return;
        console.error('poker night: writing hands failed', {...where, message: messageOf(error)});
    }
};

type HandRow = {summary: HandSummary};

// One completed hand, or null.
export const readHand = async (ref: RoomRef, handNo: number): Promise<HandSummary | null> => {
    await connectToDatabase();
    const row = await PokerHand.findOne({env: ref.env, roomId: ref.id, handNo, expiresAt: {$gt: new Date()}}, {_id: 0, summary: 1}).lean<HandRow | null>();
    return row?.summary ?? null;
};

// The newest completed hands before hand `before` (all of them when null), newest first.
export const readHands = async (ref: RoomRef, before: number | null, limit: number = HISTORY_PAGE): Promise<HandSummary[]> => {
    await connectToDatabase();
    const rows = await PokerHand.find({
        env: ref.env, roomId: ref.id, expiresAt: {$gt: new Date()}, ...(before === null ? {} : {handNo: {$lt: before}}),
    }, {_id: 0, summary: 1}).sort({handNo: -1}).limit(limit).lean<HandRow[]>();
    return rows.map((row) => row.summary);
};
