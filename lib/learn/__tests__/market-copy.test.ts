// The NYSE session in words (lib/learn/copy/market.ts): the header pill, its tooltip and the
// order ticket's queued-fill note, read off the status lib/prices/market-hours computes, and
// every line held to the 'copy' tier of lib/learn/banned.ts.

import {describe, expect, it} from 'vitest';
import {findBanned} from '@/lib/learn/banned';
import {describeMarketStatus, describeQueuedFill, MARKET_COPY} from '@/lib/learn/copy/market';
import {marketStatus} from '@/lib/prices/market-hours';

// All fixtures are ISO instants; the Eastern wall time is stated in the test name.
const at = (iso: string) => new Date(iso);

describe('describeQueuedFill', () => {
    it('is nothing while the session is open', () => {
        expect(describeQueuedFill(marketStatus(at('2026-09-14T15:00:00Z')))).toBeNull();
    });

    it('names the next open, today or a later day, and a holiday when that is why', () => {
        expect(describeQueuedFill(marketStatus(at('2026-09-14T11:00:00Z')))).toBe('today 9:30 AM ET');
        expect(describeQueuedFill(marketStatus(at('2026-09-12T15:00:00Z')))).toBe('Mon 9:30 AM ET');
        expect(describeQueuedFill(marketStatus(at('2026-11-26T15:00:00Z')))).toBe('Fri 9:30 AM ET (Thanksgiving)');
    });
});

describe('describeMarketStatus', () => {
    it('reads naturally in every state', () => {
        expect(describeMarketStatus(marketStatus(at('2026-09-14T15:00:00Z')))).toBe('Open · closes 4:00 PM ET');
        expect(describeMarketStatus(marketStatus(at('2026-09-14T12:00:00Z')))).toBe('Closed · opens today 9:30 AM ET');
        expect(describeMarketStatus(marketStatus(at('2026-09-12T15:00:00Z')))).toBe('Closed · opens Mon 9:30 AM ET');
        expect(describeMarketStatus(marketStatus(at('2026-11-26T15:00:00Z')))).toBe('Closed · Thanksgiving · opens Fri 9:30 AM ET');
        expect(describeMarketStatus(marketStatus(at('2026-11-27T16:00:00Z')))).toBe('Open · closes 1:00 PM ET');
        // The status carries its own instant, so "today" never depends on a second clock.
        expect(marketStatus(at('2026-09-14T12:00:00Z')).at).toBe(Date.parse('2026-09-14T12:00:00Z'));
    });
});

describe('market copy', () => {
    it('holds every line to the copy tier', () => {
        const lines = [
            MARKET_COPY.openTitle, MARKET_COPY.closedTitle,
            ...['2026-09-14T15:00:00Z', '2026-09-14T12:00:00Z', '2026-09-12T15:00:00Z', '2026-11-26T15:00:00Z', '2026-11-27T16:00:00Z']
                .flatMap((iso) => [describeMarketStatus(marketStatus(at(iso))), describeQueuedFill(marketStatus(at(iso))) ?? '']),
        ];
        for (const line of lines) expect(findBanned(line, 'copy'), line).toEqual([]);
    });
});
