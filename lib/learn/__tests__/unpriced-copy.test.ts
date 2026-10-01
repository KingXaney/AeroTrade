// The one "valued at cost" builder, in both lengths, held to the 'copy' tier.

import {describe, expect, it} from 'vitest';
import {findBanned} from '@/lib/learn/banned';
import {UNPRICED_CELL_TITLE, unpricedText} from '@/lib/learn/copy/unpriced';

describe('unpricedText', () => {
    it('says nothing when every holding is priced or there are none', () => {
        for (const form of ['atCost', 'marker'] as const) {
            expect(unpricedText(0, 3, form)).toBeNull();
            expect(unpricedText(0, 0, form)).toBeNull();
            expect(unpricedText(2, 0, form)).toBeNull();
        }
    });

    it('states how much stands at cost beside a figure', () => {
        expect(unpricedText(2, 2)).toBe('valued at cost');
        expect(unpricedText(1, 1)).toBe('valued at cost');
        expect(unpricedText(1, 3)).toBe('1 of 3 valued at cost');
    });

    it('flags a ranked return as unpriced only when nothing behind it is live', () => {
        expect(unpricedText(3, 3, 'marker')).toBe('unpriced');
        expect(unpricedText(1, 3, 'marker')).toBe('partly unpriced');
    });

    it('never advises', () => {
        for (const form of ['atCost', 'marker'] as const) {
            for (const [u, h] of [[1, 1], [1, 4], [3, 4], [4, 4]]) {
                const text = unpricedText(u, h, form) as string;
                expect(findBanned(text, 'copy'), text).toEqual([]);
            }
        }
        expect(findBanned(UNPRICED_CELL_TITLE, 'copy')).toEqual([]);
    });
});
