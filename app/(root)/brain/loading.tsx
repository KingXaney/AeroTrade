import RouteLoading from "@/components/shell/RouteLoading";

// Nine parallel brain queries before first paint.
const Loading = () => (
    <RouteLoading title="News Brain" subtitle="Reading the narrative graph…" panels={4}/>
);

export default Loading;
