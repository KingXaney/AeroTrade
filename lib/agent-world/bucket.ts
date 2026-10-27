// A small in-memory token bucket per key, for the live route's polls: a reader's tab polls every few
// seconds, so a key spending faster than that is a loop, not a reader. Per server instance, which is
// enough to keep one runaway client from turning each poll into database reads; the session check in
// front of it is what keeps strangers out. Pure apart from the Map it is handed.

export type Bucket = {tokens: number; at: number};

export const takeToken = (buckets: Map<string, Bucket>, key: string, nowMs: number, {rate, burst}: {rate: number; burst: number}): boolean => {
    const held = buckets.get(key) ?? {tokens: burst, at: nowMs};
    const tokens = Math.min(burst, held.tokens + ((nowMs - held.at) / 1000) * rate);
    if (tokens < 1) {
        buckets.set(key, {tokens, at: nowMs});
        return false;
    }
    buckets.set(key, {tokens: tokens - 1, at: nowMs});
    // Old keys are let go once the map grows: a full bucket is the same as no bucket.
    if (buckets.size > 5_000) {
        for (const [name, bucket] of buckets) if (nowMs - bucket.at > 60_000) buckets.delete(name);
    }
    return true;
};
