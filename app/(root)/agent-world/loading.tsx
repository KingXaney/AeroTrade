import RouteLoading from "@/components/shell/RouteLoading";

// The floor reads the newest session whole before first paint.
const Loading = () => (
    <RouteLoading title="Trading agent world" subtitle="Opening the floor…" panels={3}/>
);

export default Loading;
