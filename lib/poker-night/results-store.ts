// An account's nights at poker night tables: PokerResult rows (database/models/poker-result.model.ts),
// the history that outlives the room. Server-only (on the poker-night server guard's list). What to
// write is decided in lib/poker-night/results.ts (pure): rows for the account holders whose figures
// moved, absolute totals behind a seq guard, a duplicate key retried once as a plain update.
//
// writeResults runs in a route's after() (store.afterCommit) when a commit moved a ledger figure —
// a hand completing, chips landing, a cash-out, the close — and never fails the request.

import {connectToDatabase} from "@/database/mongoose";
import PokerResult from "@/database/models/poker-result.model";
import type {Env} from "@/lib/poker-night/env";
import {onWriteError, resultRows, resultWrite, type RecentNight} from "@/lib/poker-night/results";
import type {Commit} from "@/lib/poker-night/room-doc";

// The lobby's "Recent nights".
export const RECENT_NIGHTS = 20;

const messageOf = (error: unknown): string => (error instanceof Error ? error.message : String(error));

export const writeResults = async (commit: Commit): Promise<void> => {
    const {ref, room, prevState} = commit;
    const dealt = commit.hands.flatMap((hand) => hand.players.map((p) => p.pid));
    const rows = resultRows(room.core.players, prevState, room.core.state, dealt);
    if (rows.length === 0) return;
    const ctx = {env: ref.env, roomId: ref.id, code: room.core.code, tableName: room.core.state.settings.name, seq: room.seq, at: room.readAt};
    const log = (error: unknown) => console.error('poker night: writing a result failed', {code: ctx.code, env: ctx.env, seq: ctx.seq, message: messageOf(error)});
    try {
        await connectToDatabase();
    } catch (error) {
        log(error);
        return;
    }
    await Promise.all(rows.map(async (row) => {
        const write = resultWrite(row, ctx);
        try {
            await PokerResult.updateOne(write.filter, write.update, {upsert: true});
        } catch (error) {
            if (onWriteError(error, 'upsert') !== 'retry-update') return log(error);
            try {
                // A row exists that the filter did not match: a twin upsert's, which this update now
                // matches, or a newer one, which it leaves alone (results.afterRetry: 'newer-row-won').
                await PokerResult.updateOne(write.filter, write.update);
            } catch (retryError) {
                log(retryError);
            }
        }
    }));
};

type ResultRowDoc = Omit<RecentNight, 'firstAt' | 'lastAt'> & {firstAt: Date; lastAt: Date};

// An account's latest nights, newest first.
export const readRecentResults = async (env: Env, userId: string, limit: number = RECENT_NIGHTS): Promise<RecentNight[]> => {
    await connectToDatabase();
    const rows = await PokerResult.find({env, userId}, {
        _id: 0, roomId: 1, code: 1, tableName: 1, bought: 1, cashedOut: 1, chips: 1, net: 1, hands: 1, wins: 1, biggestWin: 1, closed: 1, firstAt: 1, lastAt: 1,
    }).sort({lastAt: -1}).limit(limit).lean<ResultRowDoc[]>();
    return rows.map((row) => ({
        roomId: row.roomId, code: row.code, tableName: row.tableName ?? '', bought: row.bought, cashedOut: row.cashedOut, chips: row.chips,
        net: row.net, hands: row.hands, wins: row.wins, biggestWin: row.biggestWin, closed: row.closed === true,
        firstAt: new Date(row.firstAt).getTime(), lastAt: new Date(row.lastAt).getTime(),
    }));
};
