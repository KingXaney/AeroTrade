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
                <h1 className="text-2xl font-semibold text-gray-100">Watchlist</h1>
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
            <h1 className="text-2xl font-semibold text-gray-100">Watchlist</h1>
            <WatchlistTable watchlist={rows} />
        </div>
    );
};

export default WatchlistPage;
