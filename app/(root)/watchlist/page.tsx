import {redirect} from "next/navigation";
import {getCurrentUserId, getWatchlistForUser} from "@/lib/actions/watchlist.actions";
import {getStocksWithData} from "@/lib/actions/finnhub.actions";
import WatchlistTable from "@/components/watchlist/WatchlistTable";
import WatchlistEmpty from "@/components/watchlist/WatchlistEmpty";

const WatchlistPage = async () => {
    const userId = await getCurrentUserId();
    if (!userId) redirect('/sign-in');

    const items = await getWatchlistForUser(userId);

    if (items.length === 0) {
        return (
            <div className="space-y-6">
                <div className="flex flex-col md:flex-row justify-between items-start md:items-end gap-4">
                    <div>
                        <h1 className="text-2xl font-semibold text-[#e2e2e8] mb-1 tracking-tight"
                            style={{ fontFamily: 'var(--font-sora)' }}>
                            Active Watchlist
                        </h1>
                        <p className="text-sm text-[#b9cacb]"
                           style={{ fontFamily: 'var(--font-hanken)' }}>
                            Real-time telemetry for your tracked assets
                        </p>
                    </div>
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
                    <h1 className="text-2xl font-semibold text-[#e2e2e8] mb-1 tracking-tight"
                        style={{ fontFamily: 'var(--font-sora)' }}>
                        Active Watchlist
                    </h1>
                    <p className="text-sm text-[#b9cacb]"
                       style={{ fontFamily: 'var(--font-hanken)' }}>
                        Real-time telemetry for your tracked assets
                    </p>
                </div>
                <div className="flex items-center gap-3">
                    <div className="flex items-center gap-2 text-[10px] text-[#849495]"
                         style={{ fontFamily: 'var(--font-jetbrains)', letterSpacing: '0.02em' }}>
                        <div className="w-2 h-2 rounded-full bg-[#7df4ff] animate-pulse"></div>
                        {items.length} ASSETS TRACKED
                    </div>
                </div>
            </div>
            <WatchlistTable watchlist={rows} />
        </div>
    );
};

export default WatchlistPage;
