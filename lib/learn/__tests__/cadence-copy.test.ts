// The cadence labels: one map, every catalog cadence in both lengths, held to the 'copy' tier.

import {describe, expect, it} from 'vitest';
import {findBanned} from '@/lib/learn/banned';
import {CADENCE_COPY} from '@/lib/learn/copy/cadence';
import {STRATEGIES} from '@/lib/strategies/catalog';

describe('CADENCE_COPY', () => {
    it('names every catalog cadence in both lengths without advice', () => {
        for (const def of STRATEGIES) {
            for (const text of [CADENCE_COPY.short[def.cadence], CADENCE_COPY.long[def.cadence]]) {
                expect(text, def.id).toMatch(/\S/);
                expect(findBanned(text, 'copy'), text).toEqual([]);
            }
        }
    });

    it('keeps the wording each surface printed', () => {
        expect(CADENCE_COPY.short).toEqual({once: 'once', daily: 'daily', monthly: 'monthly', quarterly: 'quarterly'});
        expect(CADENCE_COPY.long).toEqual({once: 'buys once', daily: 'checked daily', monthly: 'rebalances monthly', quarterly: 'rebalances quarterly'});
    });
});
