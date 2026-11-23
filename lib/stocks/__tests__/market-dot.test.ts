// The market-status dot (components/stocks/MarketStatus, on Home, /trade and /watchlist): while
// the regular session is open it is the page's one beacon, a halo breathing round it (.fx-beacon
// in app/globals.css); closed, in any of its ways, it is still. The browser QA cannot set the
// session (the badge follows the real NYSE clock), so the two states are held here, from the
// app's own clock.
import {describe, expect, it} from 'vitest';
import {marketStatus} from '@/lib/prices/market-hours';
import {marketDotClass} from '@/lib/stocks/market-dot';

const classes = (at: string): string[] => marketDotClass(marketStatus(new Date(at))).split(/\s+/).sort();

describe('marketDotClass', () => {
    it('gives the open session the positive dot with the beacon round it', () => {
        // Tuesday 24 November 2026, 11:00 in New York.
        expect(marketStatus(new Date('2026-11-24T16:00:00Z')).state).toBe('open');
        expect(classes('2026-11-24T16:00:00Z')).toEqual(['bg-positive', 'fx-beacon']);
    });

    it('keeps the dot still in every way the market is closed', () => {
        const closed = {
            weekend: '2026-11-22T16:00:00Z',
            'before the open': '2026-11-24T13:00:00Z',
            'after the close': '2026-11-24T22:00:00Z',
            holiday: '2026-11-26T16:00:00Z',
        };
        for (const [why, at] of Object.entries(closed)) {
            expect(marketStatus(new Date(at)).state, why).toBe('closed');
            expect(classes(at), why).toEqual(['bg-warning']);
        }
    });
});
