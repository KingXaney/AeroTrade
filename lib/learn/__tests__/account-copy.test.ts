// Settings › Account's sentences: descriptive, complete, and honest about what a deletion removes.

import {describe, expect, it} from 'vitest';
import {findBanned} from '@/lib/learn/banned';
import {ACCOUNT_COPY} from '@/lib/learn/copy/account';

const strings = (value: unknown): string[] => {
    if (typeof value === 'string') return [value];
    if (value && typeof value === 'object') return Object.values(value).flatMap(strings);
    return [];
};

describe('the account copy', () => {
    it('describes and never advises', () => {
        const all = [...strings(ACCOUNT_COPY), ACCOUNT_COPY.remove.confirmLabel('ada@example.com')];
        expect(all.length).toBeGreaterThan(20);
        for (const text of all) {
            expect(text, text).not.toMatch(/undefined|NaN|\[object/);
            expect(findBanned(text, 'copy'), text).toEqual([]);
        }
    });

    it('says a deletion cannot be undone and names what goes', () => {
        expect(ACCOUNT_COPY.remove.body).toContain('cannot be undone');
        for (const thing of ['trades', 'watchlist', 'topics', 'friends', 'settings']) expect(ACCOUNT_COPY.remove.body).toContain(thing);
    });
});
