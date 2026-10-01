import {requireUserId} from "@/lib/auth/session";
import {getWatchlistPageView} from "@/lib/stocks/watchlist-page-store";
import WatchlistTable from "@/components/stocks/WatchlistTable";
import WatchlistEmpty from "@/components/stocks/WatchlistEmpty";
import MarketStatus from "@/components/stocks/MarketStatus";
import Panel from "@/components/primitives/Panel";
import {WATCHLIST_COPY} from "@/lib/learn/copy/watchlist";

// The reads and the merge of saved rows with quotes live in getWatchlistPageView
// (lib/stocks/watchlist-page-store.ts, lib/stocks/watchlist.ts); the page only composes.
const WatchlistPage = async () => {
    const userId = await requireUserId();

    const view = await getWatchlistPageView(userId);
    const {status} = view;

    // A failed read is not an empty watchlist: say so instead of "No Assets Tracked".
    if (view.kind !== 'rows') {
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
                {view.kind === 'empty' ? <WatchlistEmpty /> : (
                    <Panel pad={6}>
                        <p className="text-sm text-fg-muted">{WATCHLIST_COPY.unavailable}</p>
                    </Panel>
                )}
            </div>
        );
    }

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
                        {view.tracked} TRACKED
                    </div>
                </div>
            </div>
            <WatchlistTable watchlist={view.rows} />
        </div>
    );
};

export default WatchlistPage;
