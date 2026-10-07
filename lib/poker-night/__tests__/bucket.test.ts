// The in-memory token buckets on an injected clock: a burst, then the refill rate; keys apart from
// each other; a clock that steps back refilling nothing; and the key cap dropping the least
// recently used.

import {describe, expect, it} from 'vitest';
import {BUCKET_KEYS_MAX, createBuckets} from '@/lib/poker-night/bucket';
import {BUCKETS} from '@/lib/poker-night/limits';

const takes = (b: ReturnType<typeof createBuckets>, key: string, now: number, n: number) =>
    Array.from({length: n}, () => b.take(key, now)).filter(Boolean).length;

describe('createBuckets', () => {
    it('allows a burst, then refuses until tokens refill at the rate', () => {
        const b = createBuckets(BUCKETS.get);
        expect(takes(b, 'a', 0, 20)).toBe(15);
        expect(b.take('a', 0)).toBe(false);
        // 3 a second: one more token after a third of a second, three after a second.
        expect(b.take('a', 300)).toBe(false);
        expect(b.take('a', 334)).toBe(true);
        expect(takes(b, 'a', 1334, 10)).toBe(3);
        // A long rest refills to the burst, never past it.
        expect(takes(b, 'a', 3_600_000, 100)).toBe(15);
    });

    it('keeps each key apart', () => {
        const b = createBuckets(BUCKETS.post);
        expect(takes(b, 'a', 0, 25)).toBe(20);
        expect(b.take('b', 0)).toBe(true);
    });

    it('refills nothing when the clock steps back', () => {
        const b = createBuckets({rate: 1, burst: 2});
        expect(takes(b, 'a', 10_000, 3)).toBe(2);
        expect(b.take('a', 0)).toBe(false);
        expect(b.take('a', 1000)).toBe(true);
    });

    it('keeps at most max keys, dropping the least recently used', () => {
        const b = createBuckets({rate: 1, burst: 1, max: 3});
        b.take('a', 0);
        b.take('b', 0);
        b.take('c', 0);
        // 'a' is used again, so 'b' is the oldest when 'd' arrives.
        expect(b.take('a', 0)).toBe(false);
        b.take('d', 0);
        expect(b.size()).toBe(3);
        // 'b' was forgotten, so it starts full again; 'a' was kept, so it is still empty.
        expect(b.take('b', 0)).toBe(true);
        expect(b.take('a', 0)).toBe(false);
    });

    it('caps the map at 5,000 keys by default', () => {
        const b = createBuckets(BUCKETS.get);
        for (let i = 0; i < BUCKET_KEYS_MAX + 500; i++) b.take(`k${i}`, i);
        expect(BUCKET_KEYS_MAX).toBe(5000);
        expect(b.size()).toBe(5000);
    });

    it('refuses a config that could never allow a request', () => {
        expect(() => createBuckets({rate: 0, burst: 5})).toThrow(RangeError);
        expect(() => createBuckets({rate: 1, burst: 0})).toThrow(RangeError);
    });
});
