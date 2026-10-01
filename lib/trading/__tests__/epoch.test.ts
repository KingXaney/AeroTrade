import {describe, expect, it} from 'vitest';
import {accountEpoch} from '@/lib/trading/epoch';

describe('accountEpoch', () => {
    const createdAt = new Date('2026-01-05T15:00:00Z');

    it('is inceptionAt, which a reset re-anchors', () => {
        const inceptionAt = new Date('2026-09-01T13:30:00Z');
        expect(accountEpoch({inceptionAt, createdAt})).toEqual(inceptionAt);
    });

    it('falls back to createdAt for accounts from before inceptionAt existed', () => {
        expect(accountEpoch({createdAt})).toEqual(createdAt);
        expect(accountEpoch({inceptionAt: null, createdAt})).toEqual(createdAt);
    });

    it('reads stored dates and epoch milliseconds alike', () => {
        expect(accountEpoch({inceptionAt: '2026-09-01T13:30:00.000Z', createdAt}).getTime()).toBe(Date.UTC(2026, 8, 1, 13, 30));
        expect(accountEpoch({createdAt: createdAt.getTime()})).toEqual(createdAt);
    });
});
