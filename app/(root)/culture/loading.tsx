import RouteLoading from "@/components/shell/RouteLoading";

// The brand board reads every entity before first paint.
const Loading = () => (
    <RouteLoading title="Culture Brain" subtitle="Reading what younger consumers are into…" panels={3}/>
);

export default Loading;
