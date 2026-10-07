// In-memory token buckets: the first rate limit a poker night request meets, before any database
// call, so a loop of requests costs no Mongo writes (lib/rate-limit's counters are each a write).
// Per server instance and best effort — fluid compute reuses instances, which is what catches a
// loop; the Mongo counters guard the few routes where a write is worth it. Pure: the clock is the
// caller's, and the map keeps at most `max` keys, dropping the least recently used.

export const BUCKET_KEYS_MAX = 5000;

export type BucketConfig = {rate: number; burst: number; max?: number};

export type Buckets = {
    // True when the key has a token to spend (and spends it); false when it is empty.
    take(key: string, now: number): boolean;
    size(): number;
};

type Bucket = {tokens: number; at: number};

// A bucket holds up to `burst` tokens and refills at `rate` tokens a second. A new key starts full.
export const createBuckets = ({rate, burst, max = BUCKET_KEYS_MAX}: BucketConfig): Buckets => {
    if (!(rate > 0) || !(burst >= 1) || !(max >= 1)) throw new RangeError('bad bucket config');
    const buckets = new Map<string, Bucket>();
    return {
        take(key, now) {
            const last = buckets.get(key);
            let tokens = burst;
            if (last) {
                buckets.delete(key);
                // A clock that steps back refills nothing.
                tokens = Math.min(burst, last.tokens + (Math.max(0, now - last.at) * rate) / 1000);
            }
            const allowed = tokens >= 1;
            // Re-inserted, so the map's order is least recently used first.
            buckets.set(key, {tokens: allowed ? tokens - 1 : tokens, at: now});
            while (buckets.size > max) buckets.delete(buckets.keys().next().value as string);
            return allowed;
        },
        size: () => buckets.size,
    };
};
