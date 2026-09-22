import RouteLoading from "@/components/system/RouteLoading";

// Eight accounts priced from one quote map plus the run and backtest joins.
const Loading = () => (
    <RouteLoading title="Quant Strategies" subtitle="Valuing eight strategy accounts…" panels={3}/>
);

export default Loading;
