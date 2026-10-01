import RouteLoading from "@/components/shell/RouteLoading";

// One quote, profile and financials call per tracked symbol before first paint.
const Loading = () => (
    <RouteLoading title="Active Watchlist" subtitle="Loading your tracked assets…" panels={4}/>
);

export default Loading;
