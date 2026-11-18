// A holding whose symbol has stopped quoting. Pure.
//
// "Gone" is the difference between an outage and a symbol Finnhub no longer answers for (a
// delisting, a merger, a renamed ticker): no price for GONE_AFTER_SESSIONS sessions running. An
// outage holds an account's snapshot back for the day, because a number built on a missing
// quote would sit in its history for good. A gone holding would hold it back for ever, so it is
// valued at its last stored close instead and may be closed out at that close
// (lib/trading/snapshots.ts, lib/trading/close-out.ts). The quote sheet says which symbols are
// (lib/prices/quote-store.getGoneSymbols).

import {previousTradingDay, sessionCloseOf} from "@/lib/prices/market-hours";
import {getEasternDateString} from "@/lib/dates";

export const GONE_AFTER_SESSIONS = 3;

// A quote older than this is from before the last GONE_AFTER_SESSIONS sessions: the close of
// the session that many trading days before today (ET).
export const goneCutoff = (now: number): number => {
    let day = getEasternDateString(new Date(now));
    for (let i = 0; i < GONE_AFTER_SESSIONS; i += 1) day = previousTradingDay(day);
    return sessionCloseOf(day);
};

// `lastQuoteAt`: when the quote sheet last received a price for the symbol; null when it never
// has. Every held symbol is asked about at least once a session (the snapshot job), so a held
// symbol with no price in that long is not waiting on an outage.
export const isGone = (lastQuoteAt: number | null, now: number): boolean =>
    lastQuoteAt === null || lastQuoteAt < goneCutoff(now);
