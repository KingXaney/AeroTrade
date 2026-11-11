// The quote sheet's rules: when a stored quote is current, what a read must fetch and whether it
// waits, what a Finnhub answer means and how a refresh is cut to the plan's limits. Pure — the
// rows and the calls are lib/prices/quote-store.ts. Times are epoch milliseconds.

import {
    QUOTE_BACKOFF_MS,
    QUOTE_CLOSE_SETTLE_MS,
    QUOTE_KEEP_DAYS,
    QUOTE_REFUSAL_MEMORY_MS,
    QUOTE_SERVE_STALE_MS,
    QUOTE_WINDOW_MS,
} from "@/lib/prices/config";

// One symbol's stored row. `fetchedAt` is when Finnhub was asked for the price the row holds;
// `refusedAt` the last attempt that got none; `claimedUntil` a refresh in flight.
export type QuoteRow = {
    symbol: string;
    price?: number;
    changePercent?: number;
    fetchedAt?: number;
    refusedAt?: number;
    claimedUntil?: number;
};

// What a reader gets: the price and the moment it was fetched.
export type SheetQuote = {price: number; changePercent?: number; at: number};

// The NYSE session as the sheet needs it (lib/prices/market-hours: marketStatus, lastSessionClose).
export type QuoteSession = {open: boolean; lastClose: number};

// 'recent': a price fetched in the last two minutes is answered as it is and refreshed behind
// the answer (a page). 'current': the answer waits for this window's price (one asked symbol).
export type QuoteWait = 'recent' | 'current';

// The instant a row must have been fetched at or after to be current. Open: the start of the
// clock minute before this one — a row is kept for the minute it was fetched in and the next, so
// rows fetched in one minute fall due together and none is asked for twice inside sixty seconds.
// Closed: the same until the close has settled, then that settled close until the next open.
export const windowStart = (now: number, session: QuoteSession): number => {
    const previousMinute = (Math.floor(now / QUOTE_WINDOW_MS) - 1) * QUOTE_WINDOW_MS;
    return session.open ? previousMinute : Math.min(previousMinute, session.lastClose + QUOTE_CLOSE_SETTLE_MS);
};

export const isCurrent = (row: QuoteRow | undefined, now: number, session: QuoteSession): boolean =>
    typeof row?.price === 'number' && typeof row.fetchedAt === 'number' && row.fetchedAt >= windowStart(now, session);

const backingOff = (row: QuoteRow | undefined, now: number): boolean =>
    typeof row?.refusedAt === 'number' && now - row.refusedAt < QUOTE_BACKOFF_MS;

const claimed = (row: QuoteRow | undefined, now: number): boolean =>
    typeof row?.claimedUntil === 'number' && row.claimedUntil > now;

// A price that may be answered while its refresh runs behind the answer.
const recent = (row: QuoteRow | undefined, now: number): boolean =>
    typeof row?.price === 'number' && typeof row.fetchedAt === 'number' && now - row.fetchedAt <= QUOTE_SERVE_STALE_MS;

// A symbol Finnhub was asked about and answered nothing for — never (it has no price), or a
// short while ago (QUOTE_REFUSAL_MEMORY_MS). Waiting on it again would hold a page up, once a
// minute, for a price that is not coming; it is retried behind the answer instead. Once the
// refusal is old the page waits again: one miss last night must not excuse a stale first page.
const unanswered = (row: QuoteRow | undefined, now: number): boolean =>
    typeof row?.refusedAt === 'number' && (typeof row.price !== 'number' || now - row.refusedAt < QUOTE_REFUSAL_MEMORY_MS);

// What one read must do. `due`: the symbols to claim and fetch — not current, not refused within
// the back-off, not held by another request. `wait`: whether the answer waits for that fetch (a
// due symbol never asked about, or with a price too old to serve and no fresh refusal; any due
// symbol when the caller asked for 'current'), or goes out now with the fetch behind it.
export const planRead = (
    symbols: readonly string[],
    rows: ReadonlyMap<string, QuoteRow>,
    now: number,
    session: QuoteSession,
    wait: QuoteWait,
): {due: string[]; wait: boolean} => {
    const due = symbols.filter((symbol) => {
        const row = rows.get(symbol);
        return !isCurrent(row, now, session) && !backingOff(row, now) && !claimed(row, now);
    });
    const mustWait = wait === 'current'
        ? due.length > 0
        : due.some((symbol) => !recent(rows.get(symbol), now) && !unanswered(rows.get(symbol), now));
    return {due, wait: mustWait};
};

// The price a row may be answered with: any stored price up to QUOTE_KEEP_DAYS old.
export const servable = (row: QuoteRow | undefined, now: number): SheetQuote | null => {
    if (typeof row?.price !== 'number' || typeof row.fetchedAt !== 'number') return null;
    if (now - row.fetchedAt > QUOTE_KEEP_DAYS * 86_400_000) return null;
    return {
        price: row.price,
        ...(typeof row.changePercent === 'number' ? {changePercent: row.changePercent} : {}),
        at: row.fetchedAt,
    };
};

// The price one asked symbol is answered with (the order ticket's Last Price, the chat's quote):
// this window's, or one recent enough to pass for it — never an older one, which a page may
// still show under its own time but which nobody asked "what is it now" should be handed.
export const askedPrice = (row: QuoteRow | undefined, now: number, session: QuoteSession): SheetQuote | null =>
    (isCurrent(row, now, session) || recent(row, now) ? servable(row, now) : null);

// The order a refresh asks in when the minute's budget may cut it short: a symbol with no price
// first, then the oldest price.
export const refreshOrder = (symbols: readonly string[], rows: ReadonlyMap<string, QuoteRow>): string[] => {
    const age = (symbol: string): number => {
        const row = rows.get(symbol);
        return typeof row?.price === 'number' && typeof row.fetchedAt === 'number' ? row.fetchedAt : Number.NEGATIVE_INFINITY;
    };
    return symbols
        .map((symbol, index) => ({symbol, index, at: age(symbol)}))
        .sort((a, b) => (a.at === b.at ? a.index - b.index : a.at < b.at ? -1 : 1))
        .map((entry) => entry.symbol);
};

// Whether a batch of `want` acting calls fits the last sixty seconds under `ceiling`, the minute's
// counter read as grantedOfMinute reads it (`countAfter` with the batch already counted in).
export const fitsTheMinute = ({want, countAfter, previous, now, ceiling}: {want: number; countAfter: number; previous: number; now: number; ceiling: number}): boolean => {
    const elapsed = (now % QUOTE_WINDOW_MS) / QUOTE_WINDOW_MS;
    return (countAfter - want) + previous * (1 - elapsed) + want <= ceiling;
};

// Spaces calls so that no more than `limit` start in any `windowMs`: `next(now)` is when a call
// asked for at `now` may start — now, or when the call `limit` places before it leaves the
// window. First come, first served. One pacer for everything on an instance that asks Finnhub
// for a quote, so two readers refreshing at once cannot add up to a burst past the plan's
// per-second cap.
export const createPacer = (limit: number, windowMs: number): {next: (now: number) => number} => {
    const starts: number[] = [];   // the last `limit` start times, oldest first
    return {
        next: (now) => {
            const at = starts.length < limit ? Math.max(now, starts.at(-1) ?? now) : Math.max(now, starts[0] + windowMs);
            starts.push(at);
            if (starts.length > limit) starts.shift();
            return at;
        },
    };
};

// A Finnhub /quote body as a price, or null: an empty object, a zero `c` (a symbol it does not
// know, and its free plan's answer under a burst) and anything malformed are all "no price".
export const readQuoteAnswer = (body: unknown): {price: number; changePercent?: number} | null => {
    if (typeof body !== 'object' || body === null || Array.isArray(body)) return null;
    const {c, dp} = body as {c?: unknown; dp?: unknown};
    if (typeof c !== 'number' || !Number.isFinite(c) || c <= 0) return null;
    return {price: c, ...(typeof dp === 'number' && Number.isFinite(dp) ? {changePercent: dp} : {})};
};

// How many of `want` calls fit under `ceiling` in the last sixty seconds. The calls are counted
// per clock minute (one atomic increment a refresh, `countAfter` the count once ours are in);
// the minute before weighs by the part of it still inside the last sixty seconds, so a burst
// just before :00 is not forgotten just after it. What others spent is spent; the rest is ours.
export const grantedOfMinute = ({want, countAfter, previous, now, ceiling}: {want: number; countAfter: number; previous: number; now: number; ceiling: number}): number => {
    const elapsed = (now % QUOTE_WINDOW_MS) / QUOTE_WINDOW_MS;
    const spent = (countAfter - want) + previous * (1 - elapsed);
    return Math.max(0, Math.min(want, Math.floor(ceiling - spent)));
};

// The shapes a ticker takes: BRK.B, BF-B, 0700.HK, TSX:SHOP, ^GSPC, EUR=X. Anything else a
// caller hands over — the order ticket quotes whatever is typed, through a server action — is
// not a symbol, so it never becomes a stored row or a call to Finnhub.
const TICKER = /^[A-Z0-9^][A-Z0-9.:=^_-]{0,23}$/;

// Symbols as the sheet keys them: upper case, trimmed, each once, in the order first seen;
// what is not a ticker is dropped.
export const normalizeSymbols = (symbols: readonly string[]): string[] =>
    Array.from(new Set(symbols.flatMap((symbol) => (typeof symbol === 'string' ? [symbol.trim().toUpperCase()] : []))))
        .filter((symbol) => TICKER.test(symbol));
