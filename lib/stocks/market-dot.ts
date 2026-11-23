import type {MarketStatus} from "@/lib/prices/market-hours";

// The market-status dot's class (components/stocks/MarketStatus, on Home, /trade and /watchlist).
// While the regular session is open the dot is the page's one beacon (.fx-beacon in
// app/globals.css: a halo in its own colour breathes round it); closed, in any of its ways, it is
// still. Pure, so its test holds both states: the browser QA cannot set the session.
export const marketDotClass = (status: Pick<MarketStatus, 'state'>): string =>
    status.state === 'open' ? 'bg-positive fx-beacon' : 'bg-warning';
