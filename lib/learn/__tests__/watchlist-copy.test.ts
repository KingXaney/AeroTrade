// What /watchlist and /history say when the watchlist read failed, and the sentences of
// /watchlist's own add control: held to the 'copy' tier of lib/learn/banned.ts. The failed read
// is never the empty state's words.

import {describe, expect, it} from 'vitest';
import {findBanned} from '@/lib/learn/banned';
import {WATCHLIST_COPY} from '@/lib/learn/copy/watchlist';
import {MISSION_COPY} from '@/lib/learn/copy/missions';

const clean = (text: string) => {
    expect(text, text).not.toMatch(/undefined|NaN|null|\[object|Infinity/);
    expect(findBanned(text, 'copy'), text).toEqual([]);
};

describe('WATCHLIST_COPY', () => {
    it('says the watchlist could not be loaded, without advice', () => {
        expect(WATCHLIST_COPY.unavailable).toBe('Your watchlist could not be loaded right now — try again in a few minutes.');
        expect(findBanned(WATCHLIST_COPY.unavailable, 'copy')).toEqual([]);
    });
});

describe('WATCHLIST_COPY.add', () => {
    const copy = WATCHLIST_COPY.add;

    it('never advises', () => {
        for (const value of Object.values(copy)) {
            if (typeof value === 'string') clean(value);
        }
        for (const text of [copy.none('nvidia'), copy.added('NVDA')]) clean(text);
    });

    it('names the control as the first-week step does', () => {
        const step = MISSION_COPY.find((mission) => mission.id === 'watch-symbol');
        expect(step?.href).toBe('/watchlist');
        expect(step?.title).toBe(copy.title);
        expect(copy.button).toBe('Add a stock');
    });

    it('says which stock was added, and which search found nothing', () => {
        expect(copy.added('NVDA')).toBe('NVDA added to watchlist');
        expect(copy.none('zzzz')).toBe('No stocks found for “zzzz”.');
    });

    it('says a pick places no order', () => {
        expect(copy.lead).toMatch(/no order/i);
    });
});
