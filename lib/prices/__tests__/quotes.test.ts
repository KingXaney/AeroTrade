import {describe, expect, it} from 'vitest';
import {
    QUOTE_BACKOFF_MS,
    QUOTE_BURST,
    QUOTE_BURST_SPACING_MS,
    QUOTE_CLOSE_SETTLE_MS,
    QUOTE_KEEP_DAYS,
    QUOTE_REFUSAL_MEMORY_MS,
    QUOTE_SERVE_STALE_MS,
    QUOTE_WINDOW_MS,
} from '@/lib/prices/config';
import {
    askedPrice,
    createPacer,
    fitsTheMinute,
    grantedOfMinute,
    isCurrent,
    normalizeSymbols,
    planRead,
    readQuoteAnswer,
    refreshOrder,
    servable,
    windowStart,
    type QuoteRow,
    type QuoteSession,
} from '@/lib/prices/quotes';

// Tuesday 2026-11-10, EST (UTC-5): the session runs 14:30Z to 21:00Z.
const ms = (iso: string) => Date.parse(iso);
const OPEN: QuoteSession = {open: true, lastClose: ms('2026-11-09T21:00:00Z')};
const AFTER_CLOSE: QuoteSession = {open: false, lastClose: ms('2026-11-10T21:00:00Z')};
const NOW = ms('2026-11-10T19:15:37Z');   // 14:15:37 ET

const rowsOf = (...rows: QuoteRow[]) => new Map(rows.map((row) => [row.symbol, row]));

describe('windowStart', () => {
    it('is the start of the previous clock minute while the session is open: a price is kept for its minute and the next', () => {
        expect(windowStart(NOW, OPEN)).toBe(ms('2026-11-10T19:14:00Z'));
        expect(windowStart(ms('2026-11-10T19:16:00Z'), OPEN)).toBe(ms('2026-11-10T19:15:00Z'));
        expect(QUOTE_WINDOW_MS).toBe(60_000);
    });

    it('never has a symbol asked twice within a minute, yet rolls every price fetched in one minute together', () => {
        // Fetched at 14:14:02 and at 14:14:58: both current through 14:15:59, both due at 14:16:00.
        const early = {symbol: 'A', price: 1, fetchedAt: ms('2026-11-10T19:14:02Z')};
        const late = {symbol: 'B', price: 1, fetchedAt: ms('2026-11-10T19:14:58Z')};
        const lastSecond = ms('2026-11-10T19:15:59.999Z');
        const boundary = ms('2026-11-10T19:16:00Z');
        expect(isCurrent(early, lastSecond, OPEN) && isCurrent(late, lastSecond, OPEN)).toBe(true);
        expect(isCurrent(early, boundary, OPEN) || isCurrent(late, boundary, OPEN)).toBe(false);
        // The shortest a price is kept: fetched in a minute's last instant, due two boundaries on.
        expect(boundary - late.fetchedAt).toBeGreaterThanOrEqual(QUOTE_WINDOW_MS);
        // Two seconds across :00 is not a new window: what was fetched at :58 is still current at :02.
        expect(isCurrent(late, ms('2026-11-10T19:15:02Z'), OPEN)).toBe(true);
    });

    it('keeps that pace until the close has settled, then stops at the settled close', () => {
        // 16:01:30 ET, inside the settle: still the previous minute.
        expect(windowStart(ms('2026-11-10T21:01:30Z'), AFTER_CLOSE)).toBe(ms('2026-11-10T21:00:00Z'));
        // From the settle on, and all night: the same instant.
        const settled = AFTER_CLOSE.lastClose + QUOTE_CLOSE_SETTLE_MS;
        expect(windowStart(settled + QUOTE_WINDOW_MS, AFTER_CLOSE)).toBe(settled);
        expect(windowStart(ms('2026-11-11T03:00:00Z'), AFTER_CLOSE)).toBe(settled);
    });

    it('is the settled close of the last session over a weekend and before the open', () => {
        const friday: QuoteSession = {open: false, lastClose: ms('2026-11-13T21:00:00Z')};
        expect(windowStart(ms('2026-11-14T15:00:10Z'), friday)).toBe(friday.lastClose + QUOTE_CLOSE_SETTLE_MS);
        const monday: QuoteSession = {open: false, lastClose: ms('2026-11-09T21:00:00Z')};
        expect(windowStart(ms('2026-11-10T13:00:00Z'), monday)).toBe(monday.lastClose + QUOTE_CLOSE_SETTLE_MS);
    });
});

describe('isCurrent', () => {
    it('needs a price fetched inside the window', () => {
        const start = windowStart(NOW, OPEN);
        expect(isCurrent({symbol: 'A', price: 10, fetchedAt: start}, NOW, OPEN)).toBe(true);
        expect(isCurrent({symbol: 'A', price: 10, fetchedAt: start - 1}, NOW, OPEN)).toBe(false);
        expect(isCurrent({symbol: 'A', fetchedAt: start}, NOW, OPEN)).toBe(false);
        expect(isCurrent(undefined, NOW, OPEN)).toBe(false);
    });

    it('stays current all night once fetched after the settled close', () => {
        expect(QUOTE_CLOSE_SETTLE_MS).toBeLessThanOrEqual(5 * 60_000);
        const fetchedAt = ms('2026-11-10T21:10:00Z');   // the 16:10 snapshot job's quote
        expect(isCurrent({symbol: 'A', price: 10, fetchedAt}, ms('2026-11-11T13:00:00Z'), AFTER_CLOSE)).toBe(true);
        expect(isCurrent({symbol: 'A', price: 10, fetchedAt: ms('2026-11-10T20:50:00Z')}, ms('2026-11-11T13:00:00Z'), AFTER_CLOSE)).toBe(false);
    });
});

describe('planRead', () => {
    const start = windowStart(NOW, OPEN);

    it('asks for nothing while every row is current', () => {
        const rows = rowsOf({symbol: 'A', price: 10, fetchedAt: start + 5_000}, {symbol: 'B', price: 20, fetchedAt: start});
        expect(planRead(['A', 'B'], rows, NOW, OPEN, 'recent')).toEqual({due: [], wait: false});
        expect(planRead(['A', 'B'], rows, NOW, OPEN, 'current')).toEqual({due: [], wait: false});
    });

    it('refreshes a row from the last minute behind the answer, and before it when the caller asked for current', () => {
        const rows = rowsOf({symbol: 'A', price: 10, fetchedAt: start - 20_000}, {symbol: 'B', price: 20, fetchedAt: start + 1});
        expect(planRead(['A', 'B'], rows, NOW, OPEN, 'recent')).toEqual({due: ['A'], wait: false});
        expect(planRead(['A', 'B'], rows, NOW, OPEN, 'current')).toEqual({due: ['A'], wait: true});
    });

    it('waits for a price too old to serve and for a symbol never asked about', () => {
        const old = rowsOf({symbol: 'A', price: 10, fetchedAt: NOW - QUOTE_SERVE_STALE_MS - 1});
        expect(planRead(['A'], old, NOW, OPEN, 'recent')).toEqual({due: ['A'], wait: true});
        expect(planRead(['A', 'NEW'], rowsOf({symbol: 'A', price: 10, fetchedAt: start}), NOW, OPEN, 'recent')).toEqual({due: ['NEW'], wait: true});
    });

    it('serves a price at the edge of what may be served without waiting', () => {
        const edge = rowsOf({symbol: 'A', price: 10, fetchedAt: NOW - QUOTE_SERVE_STALE_MS});
        expect(planRead(['A'], edge, NOW, OPEN, 'recent')).toEqual({due: ['A'], wait: false});
    });

    it('never waits on a symbol Finnhub has already answered nothing for', () => {
        const unanswered = rowsOf({symbol: 'ZZZZ', refusedAt: NOW - QUOTE_BACKOFF_MS - 1});
        expect(planRead(['ZZZZ'], unanswered, NOW, OPEN, 'recent')).toEqual({due: ['ZZZZ'], wait: false});
    });

    it('leaves a refused symbol alone for the back-off, whatever its age', () => {
        const refused = rowsOf(
            {symbol: 'A', price: 10, fetchedAt: NOW - 3_600_000, refusedAt: NOW - QUOTE_BACKOFF_MS + 1},
            {symbol: 'B', refusedAt: NOW - 1_000},
        );
        expect(planRead(['A', 'B'], refused, NOW, OPEN, 'current')).toEqual({due: [], wait: false});
    });

    it('retries a price Finnhub refused a moment ago behind the answer: an outage never holds every page up', () => {
        const refused = rowsOf({symbol: 'A', price: 10, fetchedAt: NOW - 3_600_000, refusedAt: NOW - QUOTE_BACKOFF_MS});
        expect(planRead(['A'], refused, NOW, OPEN, 'recent')).toEqual({due: ['A'], wait: false});
        // One asked symbol still waits: the caller asked for this window's price.
        expect(planRead(['A'], refused, NOW, OPEN, 'current')).toEqual({due: ['A'], wait: true});
    });

    it('waits again once the refusal is old: a miss last night does not excuse a stale first page this morning', () => {
        const refusedLongAgo = rowsOf({symbol: 'A', price: 10, fetchedAt: NOW - 7_200_000, refusedAt: NOW - QUOTE_REFUSAL_MEMORY_MS});
        expect(planRead(['A'], refusedLongAgo, NOW, OPEN, 'recent')).toEqual({due: ['A'], wait: true});
    });

    it('leaves a symbol another request is fetching, until that claim runs out', () => {
        const claimed = rowsOf({symbol: 'A', price: 10, fetchedAt: start - 20_000, claimedUntil: NOW + 5_000});
        expect(planRead(['A'], claimed, NOW, OPEN, 'recent')).toEqual({due: [], wait: false});
        expect(planRead(['A'], claimed, NOW + 5_000, OPEN, 'recent').due).toEqual(['A']);
    });

    it('asks once after the close has settled and never again until the open', () => {
        const night = ms('2026-11-11T02:00:00Z');
        const beforeClose = rowsOf({symbol: 'A', price: 10, fetchedAt: ms('2026-11-10T20:50:00Z')});
        expect(planRead(['A'], beforeClose, night, AFTER_CLOSE, 'recent')).toEqual({due: ['A'], wait: true});
        const afterSettle = rowsOf({symbol: 'A', price: 10, fetchedAt: ms('2026-11-10T21:10:00Z')});
        expect(planRead(['A'], afterSettle, night, AFTER_CLOSE, 'current')).toEqual({due: [], wait: false});
    });

    it('retries a refusal after the close: a refusal never freezes a pre-close price', () => {
        const night = ms('2026-11-11T02:00:00Z');
        const refused = rowsOf({symbol: 'A', price: 10, fetchedAt: ms('2026-11-10T20:50:00Z'), refusedAt: night - QUOTE_BACKOFF_MS});
        expect(planRead(['A'], refused, night, AFTER_CLOSE, 'recent').due).toEqual(['A']);
    });
});

describe('servable', () => {
    it('is the stored price with the moment it was fetched', () => {
        expect(servable({symbol: 'A', price: 10, changePercent: 1.5, fetchedAt: NOW - 90_000}, NOW)).toEqual({price: 10, changePercent: 1.5, at: NOW - 90_000});
        expect(servable({symbol: 'A', price: 10, fetchedAt: NOW}, NOW)).toEqual({price: 10, at: NOW});
    });

    it('is nothing without a price, and nothing once the price is older than a week', () => {
        expect(servable({symbol: 'A', refusedAt: NOW}, NOW)).toBeNull();
        expect(servable(undefined, NOW)).toBeNull();
        const week = QUOTE_KEEP_DAYS * 86_400_000;
        expect(servable({symbol: 'A', price: 10, fetchedAt: NOW - week}, NOW)).not.toBeNull();
        expect(servable({symbol: 'A', price: 10, fetchedAt: NOW - week - 1}, NOW)).toBeNull();
    });
});

describe('askedPrice', () => {
    it('is a price that is this window\'s, or recent enough to pass for it', () => {
        const start = windowStart(NOW, OPEN);
        expect(askedPrice({symbol: 'A', price: 10, fetchedAt: start + 1}, NOW, OPEN)).toEqual({price: 10, at: start + 1});
        expect(askedPrice({symbol: 'A', price: 10, fetchedAt: NOW - QUOTE_SERVE_STALE_MS}, NOW, OPEN)).toEqual({price: 10, at: NOW - QUOTE_SERVE_STALE_MS});
    });

    it('is nothing for a price older than that: the ticket and the chat never pass off a stale price as the last one', () => {
        expect(askedPrice({symbol: 'A', price: 10, fetchedAt: NOW - QUOTE_SERVE_STALE_MS - 1}, NOW, OPEN)).toBeNull();
        expect(askedPrice({symbol: 'A', price: 10, fetchedAt: NOW - 3 * 86_400_000, refusedAt: NOW - 1_000}, NOW, OPEN)).toBeNull();
        expect(askedPrice({symbol: 'A', refusedAt: NOW}, NOW, OPEN)).toBeNull();
        expect(askedPrice(undefined, NOW, OPEN)).toBeNull();
    });

    it('is the settled close all night, however many hours old', () => {
        const night = ms('2026-11-11T08:00:00Z');
        expect(askedPrice({symbol: 'A', price: 10, fetchedAt: ms('2026-11-10T21:10:00Z')}, night, AFTER_CLOSE)).toEqual({price: 10, at: ms('2026-11-10T21:10:00Z')});
        expect(askedPrice({symbol: 'A', price: 10, fetchedAt: ms('2026-11-10T20:30:00Z')}, night, AFTER_CLOSE)).toBeNull();
    });
});

describe('fitsTheMinute', () => {
    const at = ms('2026-11-10T19:15:15Z');   // a quarter of the way into the clock minute

    it('lets a job\'s chunk go when the last sixty seconds have room for it', () => {
        expect(fitsTheMinute({want: 25, countAfter: 25, previous: 0, now: at, ceiling: 56})).toBe(true);
        expect(fitsTheMinute({want: 25, countAfter: 55, previous: 0, now: at, ceiling: 56})).toBe(true);    // 30 spent + 25
    });

    it('holds it when a page got there first', () => {
        expect(fitsTheMinute({want: 26, countAfter: 62, previous: 0, now: at, ceiling: 56})).toBe(false);   // 36 spent + 26
        // 36 calls late in the minute before still weigh three quarters.
        expect(fitsTheMinute({want: 26, countAfter: 26, previous: 44, now: at, ceiling: 56})).toBe(false);
        expect(fitsTheMinute({want: 26, countAfter: 26, previous: 36, now: at, ceiling: 56})).toBe(true);
    });
});

describe('refreshOrder', () => {
    it('puts a symbol never fetched first, then the oldest price', () => {
        const rows = rowsOf(
            {symbol: 'NEWER', price: 1, fetchedAt: NOW - 60_000},
            {symbol: 'OLDER', price: 1, fetchedAt: NOW - 600_000},
            {symbol: 'REFUSED', refusedAt: NOW - 120_000},
        );
        expect(refreshOrder(['NEWER', 'UNSEEN', 'OLDER', 'REFUSED'], rows)).toEqual(['UNSEEN', 'REFUSED', 'OLDER', 'NEWER']);
    });
});

describe('createPacer', () => {
    it('lets a burst through at once and holds the rest until the first has left the second', () => {
        const pacer = createPacer(QUOTE_BURST, QUOTE_BURST_SPACING_MS);
        const starts = Array.from({length: 36}, () => pacer.next(NOW));
        expect(starts.slice(0, QUOTE_BURST).every((at) => at === NOW)).toBe(true);
        expect(starts.slice(QUOTE_BURST).every((at) => at === NOW + QUOTE_BURST_SPACING_MS)).toBe(true);
        expect(QUOTE_BURST).toBeLessThan(30);
        expect(QUOTE_BURST_SPACING_MS).toBeGreaterThan(1_000);
    });

    it('never starts more than the burst inside any second, whoever asks and whenever', () => {
        const pacer = createPacer(QUOTE_BURST, QUOTE_BURST_SPACING_MS);
        // Three readers on one instance: 40 symbols now, 30 a quarter second later, 10 after 1.2 s.
        const starts = [
            ...Array.from({length: 40}, () => pacer.next(NOW)),
            ...Array.from({length: 30}, () => pacer.next(NOW + 250)),
            ...Array.from({length: 10}, () => pacer.next(NOW + 1_200)),
        ];
        const sorted = [...starts].sort((a, b) => a - b);
        expect(sorted).toEqual(starts);    // first come, first served
        for (let i = 0; i + QUOTE_BURST < sorted.length; i += 1) {
            expect(sorted[i + QUOTE_BURST] - sorted[i]).toBeGreaterThanOrEqual(QUOTE_BURST_SPACING_MS);
        }
    });

    it('costs nothing once the instance has been quiet for a second', () => {
        const pacer = createPacer(QUOTE_BURST, QUOTE_BURST_SPACING_MS);
        for (let i = 0; i < QUOTE_BURST; i += 1) pacer.next(NOW);
        const later = NOW + QUOTE_BURST_SPACING_MS;
        expect(pacer.next(later)).toBe(later);
    });
});

describe('readQuoteAnswer', () => {
    it('reads a price and its day change', () => {
        expect(readQuoteAnswer({c: 101.5, d: 1.2, dp: 1.19, h: 102, l: 100, o: 100.5, pc: 100.3, t: 1_794_000_000})).toEqual({price: 101.5, changePercent: 1.19});
        expect(readQuoteAnswer({c: 101.5})).toEqual({price: 101.5});
        expect(readQuoteAnswer({c: 101.5, dp: null})).toEqual({price: 101.5});
    });

    it('reads an empty, zero or malformed answer as no price', () => {
        for (const body of [{}, {c: 0, dp: null, t: 0}, {c: -1}, {c: '101'}, {c: Number.NaN}, {c: Number.POSITIVE_INFINITY}, null, undefined, [], 'no', 42]) {
            expect(readQuoteAnswer(body)).toBeNull();
        }
    });
});

describe('grantedOfMinute', () => {
    // `now` 15 s into a clock minute: three quarters of the minute before still lies inside the last 60 s.
    const at = ms('2026-11-10T19:15:15Z');

    it('is what a refresh may take once its own calls are counted, with nothing spent before', () => {
        expect(grantedOfMinute({want: 36, countAfter: 36, previous: 0, now: at, ceiling: 40})).toBe(36);
        expect(grantedOfMinute({want: 5, countAfter: 5, previous: 0, now: at, ceiling: 40})).toBe(5);
        expect(grantedOfMinute({want: 0, countAfter: 10, previous: 0, now: at, ceiling: 40})).toBe(0);
    });

    it('takes what others spent this minute off the ceiling', () => {
        expect(grantedOfMinute({want: 36, countAfter: 50, previous: 0, now: at, ceiling: 40})).toBe(26);    // 14 spent before
        expect(grantedOfMinute({want: 5, countAfter: 80, previous: 0, now: at, ceiling: 40})).toBe(0);
    });

    it('counts the last sixty seconds, not the clock minute: calls just before :00 still weigh just after it', () => {
        // 36 calls at :58, then the same page at :02 — the clock minute is new, the last minute is not.
        const justAfter = ms('2026-11-10T19:16:02Z');
        expect(grantedOfMinute({want: 36, countAfter: 36, previous: 36, now: justAfter, ceiling: 40})).toBe(5);
        // Half a minute on, half of them have left the last sixty seconds.
        expect(grantedOfMinute({want: 36, countAfter: 36, previous: 36, now: ms('2026-11-10T19:16:30Z'), ceiling: 40})).toBe(22);
        // At the very end of the minute the one before has all but gone.
        expect(grantedOfMinute({want: 36, countAfter: 36, previous: 36, now: ms('2026-11-10T19:16:59Z'), ceiling: 40})).toBe(36);
    });

    it('never grants more than was asked, nor less than nothing', () => {
        expect(grantedOfMinute({want: 3, countAfter: 3, previous: 0, now: at, ceiling: 40})).toBe(3);
        expect(grantedOfMinute({want: 3, countAfter: 500, previous: 500, now: at, ceiling: 40})).toBe(0);
    });
});

describe('normalizeSymbols', () => {
    it('upper-cases, trims, drops blanks and repeats, and keeps the order', () => {
        expect(normalizeSymbols(['msft', ' AAPL ', 'MSFT', '', 'brk.b'])).toEqual(['MSFT', 'AAPL', 'BRK.B']);
    });

    it('keeps the shapes a ticker takes', () => {
        const tickers = ['BRK.B', 'BF-B', 'ATZAF', '0700.HK', 'TSX:SHOP', '^GSPC', 'EUR=X', 'A'];
        expect(normalizeSymbols(tickers)).toEqual(tickers);
    });

    it('drops what is no ticker, so a typed string can never become a stored row or a call', () => {
        expect(normalizeSymbols(['AAPL; DROP', '$(whoami)', 'A'.repeat(25), '<script>', 'NVDA\n', '{"$gt":""}', '.', '-AAPL'])).toEqual(['NVDA']);
        expect(normalizeSymbols([42, null, undefined, {symbol: 'AAPL'}] as unknown as string[])).toEqual([]);
    });
});
