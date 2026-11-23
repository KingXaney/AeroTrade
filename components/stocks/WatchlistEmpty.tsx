import Panel from "@/components/primitives/Panel";
import AddToWatchlist from "@/components/stocks/AddToWatchlist";

// Not EmptyState: the watchlist's first-run panel is its own design (a ringed icon, a
// larger title, a call to search) and EmptyState would flatten it. The call is the page's own
// add control — a button here, where a caption once pointed at the header's search.
const WatchlistEmpty = () => {
    return (
        <Panel as="div" pad={12} className="flex flex-col items-center justify-center text-center">
            <div className="w-16 h-16 rounded-full flex items-center justify-center mb-6 bg-brand-strong/8 border border-brand/15">
                <span className="material-symbols-outlined text-3xl text-brand">bookmark</span>
            </div>
            <h3 className="text-xl font-semibold text-fg mb-2 font-heading">
                No Assets Tracked
            </h3>
            <p className="text-fg-muted mb-6 max-w-md font-sans">
                Search for stocks to add them to your watchlist. See their quotes, market cap and P/E in one place, jump to the trade desk, or follow their news as a topic.
            </p>
            <AddToWatchlist place="empty"/>
        </Panel>
    );
};

export default WatchlistEmpty;
