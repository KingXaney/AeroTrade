// The /watchlist page's one read (app/(root)/watchlist/page.tsx): the saved rows, then their
// quotes, merged by lib/stocks/watchlist.ts. Server only.

import {getStocksWithData} from "@/lib/prices/finnhub";
import {marketStatus} from "@/lib/prices/market-hours";
import {getWatchlistForUser} from "@/lib/stocks/watchlist-store";
import {mergeWatchlistRows} from "@/lib/stocks/watchlist";
import type {StockWithData} from "@/lib/stocks/types";

type WatchlistBody =
    // A failed read (null) is not an empty watchlist: the page says so instead of "No Assets Tracked".
    | {kind: 'unavailable'}
    | {kind: 'empty'}
    | {kind: 'rows'; rows: StockWithData[]; tracked: number};

export type WatchlistPageView = WatchlistBody & {status: ReturnType<typeof marketStatus>};

export const getWatchlistPageView = async (userId: string): Promise<WatchlistPageView> => {
    const items = await getWatchlistForUser(userId);
    const status = marketStatus();
    if (!items) return {kind: 'unavailable', status};
    if (items.length === 0) return {kind: 'empty', status};
    const enriched = await getStocksWithData(items.map((i) => i.symbol));
    return {kind: 'rows', rows: mergeWatchlistRows(items, enriched, userId), tracked: items.length, status};
};
