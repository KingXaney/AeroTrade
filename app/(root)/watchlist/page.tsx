import type {Metadata} from "next";
import type {ReactNode} from "react";
import {requireUserId} from "@/lib/auth/session";
import {getWatchlistPageView} from "@/lib/stocks/watchlist-page-store";
import WatchlistTable from "@/components/stocks/WatchlistTable";
import WatchlistEmpty from "@/components/stocks/WatchlistEmpty";
import AddToWatchlist from "@/components/stocks/AddToWatchlist";
import MarketStatus from "@/components/stocks/MarketStatus";
import Panel from "@/components/primitives/Panel";
import PageTitle from "@/components/primitives/PageTitle";
import {WATCHLIST_COPY} from "@/lib/learn/copy/watchlist";

// The browser tab's title; app/layout.tsx appends the app's name.
export const metadata: Metadata = {title: "Watchlist"};

// The same PageTitle as watchlist/loading.tsx, under the same space-y-4, so neither the title
// nor the panel under it moves when the skeleton is replaced.
const header = (actions: ReactNode) => (
    <PageTitle
        title="Active Watchlist"
        subtitle="Quotes, market cap and P/E for the stocks you track"
        actions={actions}
    />
);

// The reads and the merge of saved rows with quotes live in getWatchlistPageView
// (lib/stocks/watchlist-page-store.ts, lib/stocks/watchlist.ts); the page only composes.
const WatchlistPage = async () => {
    const userId = await requireUserId();

    const view = await getWatchlistPageView(userId);
    const {status} = view;

    // The page's own way to add a stock (components/stocks/AddToWatchlist.tsx) stands in the
    // title's actions, in the same place with or without rows, so it is one control across the
    // first add; the empty panel carries the main one, and this one is then the quiet button
    // beside it. Not when the read failed: the page could not show what was added.
    const actions = (
        <div className="flex flex-wrap items-center gap-3">
            <MarketStatus status={status} />
            {view.kind === 'rows' && (
                <div className="text-[10px] text-fg-muted font-mono"
                     style={{ letterSpacing: '0.02em' }}>
                    {view.tracked} TRACKED
                </div>
            )}
            {view.kind !== 'unavailable' && (
                <AddToWatchlist
                    place="title"
                    variant={view.kind === 'empty' ? 'secondary' : 'primary'}
                    tracked={view.kind === 'rows' ? view.rows.map((row) => row.symbol) : []}
                />
            )}
        </div>
    );

    // A failed read is not an empty watchlist: say so instead of "No Assets Tracked".
    if (view.kind !== 'rows') {
        return (
            <div className="space-y-4">
                {header(actions)}
                {view.kind === 'empty' ? <WatchlistEmpty /> : (
                    <Panel>
                        <p className="text-sm text-fg-muted">{WATCHLIST_COPY.unavailable}</p>
                    </Panel>
                )}
            </div>
        );
    }

    return (
        <div className="space-y-4">
            {header(actions)}
            <WatchlistTable watchlist={view.rows} />
        </div>
    );
};

export default WatchlistPage;
