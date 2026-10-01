import type {ReactNode} from "react";
import {requireUserId} from "@/lib/auth/session";
import {getWatchlistPageView} from "@/lib/stocks/watchlist-page-store";
import WatchlistTable from "@/components/stocks/WatchlistTable";
import WatchlistEmpty from "@/components/stocks/WatchlistEmpty";
import MarketStatus from "@/components/stocks/MarketStatus";
import Panel from "@/components/primitives/Panel";
import PageTitle from "@/components/primitives/PageTitle";
import {WATCHLIST_COPY} from "@/lib/learn/copy/watchlist";

// The same PageTitle as watchlist/loading.tsx, so the title does not reflow when the skeleton
// is replaced. mb-0: the page's space-y-6 already spaces it.
const header = (actions: ReactNode) => (
    <PageTitle
        title="Active Watchlist"
        subtitle="Quotes, market cap and P/E for the stocks you track"
        actions={actions}
        className="mb-0"
    />
);

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
                {header(<MarketStatus status={status} />)}
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
            {header(
                <div className="flex items-center gap-3">
                    <MarketStatus status={status} />
                    <div className="text-[10px] text-fg-muted font-mono"
                         style={{ letterSpacing: '0.02em' }}>
                        {view.tracked} TRACKED
                    </div>
                </div>
            )}
            <WatchlistTable watchlist={view.rows} />
        </div>
    );
};

export default WatchlistPage;
