import {describe, expect, it} from 'vitest';
import {
    closeMinutesFor,
    describeMarketStatus,
    describeQueuedFill,
    easternParts,
    easternToInstant,
    isMarketOpen,
    isTradingDay,
    marketStatus,
    nextOpen,
} from '@/lib/prices/market-hours';

// All fixtures are ISO instants; the Eastern wall time is stated in the test name.
const at = (iso: string) => new Date(iso);

describe('easternToInstant', () => {
    it('maps Eastern wall time to UTC on both sides of the spring-forward change (2026-03-08)', () => {
        expect(easternToInstant('2026-03-06', 9, 30)).toBe(Date.parse('2026-03-06T14:30:00Z'));  // EST, UTC-5
        expect(easternToInstant('2026-03-09', 9, 30)).toBe(Date.parse('2026-03-09T13:30:00Z'));  // EDT, UTC-4
    });

    it('maps across the fall-back change (2026-11-01)', () => {
        expect(easternToInstant('2026-10-30', 16, 0)).toBe(Date.parse('2026-10-30T20:00:00Z'));  // EDT
        expect(easternToInstant('2026-11-02', 16, 0)).toBe(Date.parse('2026-11-02T21:00:00Z'));  // EST
    });

    it('round-trips through easternParts', () => {
        const instant = easternToInstant('2026-09-14', 9, 30);
        expect(easternParts(new Date(instant))).toMatchObject({date: '2026-09-14', weekday: 1, minutes: 570});
    });
});

describe('calendar', () => {
    it('knows weekends, holidays and half days', () => {
        expect(isTradingDay('2026-09-12')).toBe(false);   // Saturday
        expect(isTradingDay('2026-09-13')).toBe(false);   // Sunday
        expect(isTradingDay('2026-09-14')).toBe(true);
        expect(isTradingDay('2026-11-26')).toBe(false);   // Thanksgiving
        expect(isTradingDay('2026-07-03')).toBe(false);   // Independence Day observed (the 4th is a Saturday)
        expect(closeMinutesFor('2026-11-27')).toBe(13 * 60);
        expect(closeMinutesFor('2026-11-30')).toBe(16 * 60);
    });

    // NYSE's published 2028 schedule: New Year's Day is a Saturday and is not observed on
    // the Friday before, and July 3 closes early ahead of a Tuesday Independence Day.
    it('carries the 2028 schedule', () => {
        expect(isTradingDay('2027-12-31')).toBe(true);
        expect(isTradingDay('2028-01-03')).toBe(true);
        expect(isTradingDay('2028-04-14')).toBe(false);   // Good Friday
        expect(isTradingDay('2028-07-04')).toBe(false);
        expect(isTradingDay('2028-11-23')).toBe(false);   // Thanksgiving
        expect(closeMinutesFor('2028-07-03')).toBe(13 * 60);
        expect(closeMinutesFor('2028-11-24')).toBe(13 * 60);
        expect(closeMinutesFor('2028-12-26')).toBe(16 * 60);
    });
});

describe('marketStatus', () => {
    it('is closed one second before the open and open at the bell (Mon 2026-09-14, EDT)', () => {
        expect(marketStatus(at('2026-09-14T13:29:59Z'))).toMatchObject({state: 'closed', reason: 'pre-open'});
        expect(marketStatus(at('2026-09-14T13:30:00Z'))).toMatchObject({state: 'open', reason: 'regular'});
    });

    it('is open until 16:00 exclusive', () => {
        expect(isMarketOpen(at('2026-09-14T19:59:59Z'))).toBe(true);
        expect(marketStatus(at('2026-09-14T20:00:00Z'))).toMatchObject({state: 'closed', reason: 'after-close'});
    });

    it('closes at 13:00 on a half day', () => {
        expect(isMarketOpen(at('2026-11-27T17:59:00Z'))).toBe(true);    // 12:59 EST
        expect(isMarketOpen(at('2026-11-27T18:00:00Z'))).toBe(false);   // 13:00 EST
    });

    it('is closed on weekends and holidays, and names the holiday', () => {
        expect(marketStatus(at('2026-09-12T15:00:00Z'))).toMatchObject({state: 'closed', reason: 'weekend', holiday: null});
        expect(marketStatus(at('2026-11-26T15:00:00Z'))).toMatchObject({state: 'closed', reason: 'holiday', holiday: 'Thanksgiving'});
    });

    it('points at the next open: later today, Monday after a weekend, Friday after Thanksgiving', () => {
        expect(nextOpen(at('2026-09-14T12:00:00Z'))).toBe(Date.parse('2026-09-14T13:30:00Z'));
        expect(nextOpen(at('2026-09-12T15:00:00Z'))).toBe(Date.parse('2026-09-14T13:30:00Z'));
        expect(nextOpen(at('2026-11-26T15:00:00Z'))).toBe(Date.parse('2026-11-27T14:30:00Z'));
        // Labor Day weekend 2026: Fri 4 Sep after close → Tue 8 Sep
        expect(nextOpen(at('2026-09-04T21:00:00Z'))).toBe(Date.parse('2026-09-08T13:30:00Z'));
    });

    it('still works across the DST boundaries', () => {
        expect(marketStatus(at('2026-03-09T13:30:00Z')).state).toBe('open');    // first EDT Monday, 9:30
        expect(marketStatus(at('2026-03-09T13:29:00Z')).state).toBe('closed');
        expect(marketStatus(at('2026-11-02T14:30:00Z')).state).toBe('open');    // first EST Monday, 9:30
        expect(marketStatus(at('2026-11-02T14:29:00Z')).state).toBe('closed');
    });
});

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
