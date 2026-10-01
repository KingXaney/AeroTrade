// What /watchlist and /history say when the watchlist read failed: held to the 'copy' tier of
// lib/learn/banned.ts, and never the empty state's words.

import {describe, expect, it} from 'vitest';
import {findBanned} from '@/lib/learn/banned';
import {WATCHLIST_COPY} from '@/lib/learn/copy/watchlist';

describe('WATCHLIST_COPY', () => {
    it('says the watchlist could not be loaded, without advice', () => {
        expect(WATCHLIST_COPY.unavailable).toBe('Your watchlist could not be loaded right now — try again in a few minutes.');
        expect(findBanned(WATCHLIST_COPY.unavailable, 'copy')).toEqual([]);
    });
});
