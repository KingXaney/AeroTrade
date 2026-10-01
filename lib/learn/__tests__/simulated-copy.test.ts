// Copy for a simulated record's tiles: every label and hint is rendered and held to the 'copy'
// tier of lib/learn/banned.ts, and the win-rate hint counts fills in the singular and plural.

import {describe, expect, it} from 'vitest';
import {findBanned} from '@/lib/learn/banned';
import {SIM_STATS_COPY} from '@/lib/learn/copy/simulated';

const clean = (text: string) => {
    expect(text, text).not.toMatch(/undefined|NaN|null|\[object|Infinity/);
    expect(findBanned(text, 'copy'), text).toEqual([]);
};

describe('SIM_STATS_COPY', () => {
    it('labels and hints every tile without advice', () => {
        const {vsSpyHint, winRateHint, ...fixed} = SIM_STATS_COPY;
        for (const text of Object.values(fixed)) clean(text);
        for (const spy of ['+12.34%', '0.00%', '-3.10%', '—']) clean(vsSpyHint(spy));
        for (const [wins, losses, tradeCount] of [[0, 0, 1], [3, 2, 12], [1, 0, 2]]) clean(winRateHint({wins, losses, tradeCount}));
    });

    it('prints the benchmark beside the tile and counts fills plainly', () => {
        expect(SIM_STATS_COPY.vsSpyHint('+9.80%')).toBe('SPY +9.80%');
        expect(SIM_STATS_COPY.winRateHint({wins: 3, losses: 2, tradeCount: 12})).toBe('3W / 2L · 12 fills');
        expect(SIM_STATS_COPY.winRateHint({wins: 0, losses: 1, tradeCount: 1})).toBe('0W / 1L · 1 fill');
    });
});
