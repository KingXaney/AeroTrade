import RouteLoading from "@/components/system/RouteLoading";

// Prices across every friend's positions before the leaderboard can rank.
const Loading = () => (
    <RouteLoading title="Friends & Competition" subtitle="Ranking the leaderboard…" panels={2}/>
);

export default Loading;
