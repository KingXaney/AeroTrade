import {describe, expect, it} from 'vitest';
import {pickFirstRunTopic, pickStalestTopic} from '@/lib/topics/first-run';

const topic = (name: string, createdAt: number, lastFetchedAt: number | null) => ({name, createdAt, lastFetchedAt});

describe('pickFirstRunTopic', () => {
    it('is null with no topics or when every topic has been fetched', () => {
        expect(pickFirstRunTopic([])).toBeNull();
        expect(pickFirstRunTopic([topic('a', 1, 100), topic('b', 2, 200)])).toBeNull();
    });

    it('picks the oldest never-fetched topic, ignoring fetched ones created earlier', () => {
        const picked = pickFirstRunTopic([
            topic('fetched-first', 1, 50),
            topic('never-newer', 3, null),
            topic('never-older', 2, null),
        ]);
        expect(picked?.name).toBe('never-older');
    });

    it('keeps the first of two created at the same instant', () => {
        expect(pickFirstRunTopic([topic('x', 5, null), topic('y', 5, null)])?.name).toBe('x');
    });
});

describe('pickStalestTopic', () => {
    it('is null with no topics', () => {
        expect(pickStalestTopic([])).toBeNull();
    });

    it('prefers a never-fetched topic over any fetched one', () => {
        expect(pickStalestTopic([topic('old-fetch', 1, 10), topic('never', 9, null)])?.name).toBe('never');
    });

    it('otherwise picks the longest-ago fetch', () => {
        expect(pickStalestTopic([topic('a', 1, 300), topic('b', 2, 100), topic('c', 3, 200)])?.name).toBe('b');
    });

    it('breaks a tie by creation order', () => {
        expect(pickStalestTopic([topic('later', 2, 100), topic('earlier', 1, 100)])?.name).toBe('earlier');
    });
});
