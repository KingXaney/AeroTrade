import {describe, expect, it} from 'vitest';
import {BAR_PROJECTION, toBar, toSetFields} from '@/lib/prices/bar-fields';

describe('bar field round trip', () => {
    it('carries every optional field out to the store and back, dividend included', () => {
        const bar = {date: '2026-09-18', close: 660.1, open: 658, high: 661.2, low: 657.4, volume: 81_000_000, adjClose: 660.1, dividend: 1.889};
        const stored = {symbol: 'SPY', date: bar.date, ...toSetFields(bar, 'yahoo')};

        expect(toBar(stored as never)).toEqual(bar);
        for (const field of Object.keys(bar)) expect(BAR_PROJECTION).toHaveProperty(field, 1);
    });

    // Absent means "this payload could not tell"; writing it would erase a value an earlier
    // payload inferred.
    it('never writes an unknown dividend, and reads a missing one as unknown', () => {
        expect(toSetFields({date: '2026-09-18', close: 660.1}, 'stooq')).not.toHaveProperty('dividend');
        expect(toBar({symbol: 'SPY', date: '2026-09-18', close: 660.1, dividend: null})).not.toHaveProperty('dividend');
    });

    it('keeps a known zero', () => {
        expect(toSetFields({date: '2026-09-18', close: 660.1, dividend: 0}, 'yahoo')).toHaveProperty('dividend', 0);
    });
});
