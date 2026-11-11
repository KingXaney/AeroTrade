// Fixed-window rate limiting on a database counter. Server-only (Mongoose); the
// server actions that guard sign-in-adjacent endpoints call this at the top. The limits and
// keys they pass live in lib/auth/limits.ts (import-free, unit-tested). peekRateLimit reads
// a window without spending it (the chat's usage caption). bumpCounter is the same counter
// without a verdict: it adds to a keyed window and says the count, for a caller with a rule of
// its own (the quote sheet's budget, lib/prices/quote-store.ts).

import {connectToDatabase} from "@/database/mongoose";
import RateLimit from "@/database/models/rate-limit.model";

const isDuplicateKey = (error: unknown): boolean =>
    typeof error === 'object' && error !== null && (error as {code?: number}).code === 11000;

// True when the request is within `limit` for its window; false once it is over.
// Two atomic steps: bump a live window, else start a new one. The unique index on
// `key` turns the race between two "start a new window" writers into a bump.
export const takeRateLimit = async (key: string, limit: number, windowMs: number): Promise<boolean> => {
    await connectToDatabase();
    const now = new Date();

    const live = await RateLimit.findOneAndUpdate(
        {key, expiresAt: {$gt: now}},
        {$inc: {count: 1}},
        {new: true},
    ).lean<{count: number} | null>();
    if (live) return live.count <= limit;

    try {
        await RateLimit.updateOne(
            {key, expiresAt: {$lte: now}},
            {$set: {count: 1, windowStartedAt: now, expiresAt: new Date(now.getTime() + windowMs)}},
            {upsert: true},
        );
        return true;
    } catch (error) {
        if (!isDuplicateKey(error)) throw error;
        // Someone else opened the window between our two statements: count into theirs.
        const bumped = await RateLimit.findOneAndUpdate({key}, {$inc: {count: 1}}, {new: true}).lean<{count: number} | null>();
        return (bumped?.count ?? 1) <= limit;
    }
};

// Adds `by` to a counter that is its own window (the caller puts the window in the key — the
// clock minute, say) and returns the count after it: one atomic step, so two writers in the same
// instant each see the other's share. What the count allows is the caller's rule (the quote
// sheet's ceilings, lib/prices/quotes.grantedOfMinute). The row lapses `ttlMs` after its first write.
export const bumpCounter = async (key: string, by: number, ttlMs: number): Promise<number> => {
    await connectToDatabase();
    const now = new Date();
    const bump = () => RateLimit.findOneAndUpdate(
        {key},
        {$inc: {count: by}, $setOnInsert: {windowStartedAt: now, expiresAt: new Date(now.getTime() + ttlMs)}},
        {upsert: true, returnDocument: 'after'},
    ).lean<{count: number} | null>();
    try {
        return (await bump())?.count ?? by;
    } catch (error) {
        if (!isDuplicateKey(error)) throw error;
        // Two writers raced to open the row: the loser's retry finds it.
        return (await bump())?.count ?? by;
    }
};

export type RateLimitPeek = {count: number; expiresAt: number};

// Read-only pair of takeRateLimit: one findOne, never a write. A missing row, or one whose
// window has passed (the TTL monitor deletes lazily), is null.
export const peekRateLimit = async (key: string): Promise<RateLimitPeek | null> => {
    await connectToDatabase();
    const row = await RateLimit.findOne({key, expiresAt: {$gt: new Date()}}).lean<{count: number; expiresAt: Date} | null>();
    return row ? {count: row.count, expiresAt: new Date(row.expiresAt).getTime()} : null;
};
