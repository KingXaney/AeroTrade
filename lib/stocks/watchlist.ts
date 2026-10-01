// The watchlist page's rows: each saved symbol's quote, profile and ratios (getStocksWithData)
// with the user's own saved company name and added date laid over them. Pure; the reads are
// getWatchlistPageView (lib/stocks/watchlist-page-store.ts).

import type {StockWithData, WatchlistEntry} from "@/lib/stocks/types";

// Rows follow the quote list's order; a symbol matches its saved entry whatever its case. The
// saved company name wins unless it is empty, the saved date always.
export const mergeWatchlistRows = (
    items: readonly WatchlistEntry[],
    enriched: readonly StockWithData[],
    userId: string,
): StockWithData[] => {
    const byDbSymbol = new Map(items.map((i) => [i.symbol.toUpperCase(), i]));
    return enriched.map((row) => {
        const fromDb = byDbSymbol.get(row.symbol.toUpperCase());
        return {
            ...row,
            userId,
            company: fromDb?.company || row.company,
            addedAt: fromDb?.addedAt ?? row.addedAt,
        };
    });
};
