import {redirect} from "next/navigation";
import {getCurrentUserId, getWatchlistForUser} from "@/lib/actions/watchlist.actions";
import {getStocksWithData} from "@/lib/actions/finnhub.actions";
import WatchlistTable from "@/components/watchlist/WatchlistTable";
import WatchlistEmpty from "@/components/watchlist/WatchlistEmpty";
import MarketStatus from "@/components/system/MarketStatus";
import {marketStatus} from "@/lib/prices/market-hours";

const WatchlistPage = async () => {
    const userId = await getCurrentUserId();
    if (!userId) redirect('/sign-in');

    const items = await getWatchlistForUser(userId);
    const status = marketStatus();

    if (items.length === 0) {
        return (
            <div className="space-y-6">
                <div className="flex flex-col md:flex-row justify-between items-start md:items-end gap-4">
                    <div>
                        <h1 className="text-2xl font-semibold text-fg mb-1 tracking-tight"
                            style={{ fontFamily: 'var(--type-display)' }}>
                            Active Watchlist
                        </h1>
                        <p className="text-sm text-fg-soft"
                           style={{ fontFamily: 'var(--type-body)' }}>
                            Quotes, market cap and P/E for the stocks you track
                        </p>
                    </div>
                    <MarketStatus status={status} />
                </div>
                <WatchlistEmpty />
            </div>
        );
    }

    const enriched = await getStocksWithData(items.map((i) => i.symbol));
    // Merge DB-side company/addedAt onto each row so the table shows the user's saved company name.
    const byDbSymbol = new Map(items.map((i) => [i.symbol.toUpperCase(), i]));
    const rows: StockWithData[] = enriched.map((row) => {
        const fromDb = byDbSymbol.get(row.symbol.toUpperCase());
        return {
            ...row,
            userId,
            company: fromDb?.company || row.company,
            addedAt: fromDb?.addedAt ?? row.addedAt,
        };
    });

    return (
        <div className="space-y-6">
            <div className="flex flex-col md:flex-row justify-between items-start md:items-end gap-4">
                <div>
                    <h1 className="text-2xl font-semibold text-fg mb-1 tracking-tight"
                        style={{ fontFamily: 'var(--type-display)' }}>
                        Active Watchlist
                    </h1>
                    <p className="text-sm text-fg-soft"
                       style={{ fontFamily: 'var(--type-body)' }}>
                        Quotes, market cap and P/E for the stocks you track
                    </p>
                </div>
                <div className="flex items-center gap-3">
                    <MarketStatus status={status} />
                    <div className="text-[10px] text-fg-muted"
                         style={{ fontFamily: 'var(--type-mono)', letterSpacing: '0.02em' }}>
                        {items.length} TRACKED
                    </div>
                </div>
            </div>
            <WatchlistTable watchlist={rows} />
        </div>
    );
};

export default WatchlistPage;
