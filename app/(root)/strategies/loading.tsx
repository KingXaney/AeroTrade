import RouteLoading from "@/components/shell/RouteLoading";
import {STRATEGIES_PAGE_COPY} from "@/lib/learn/copy/strategies";

// Eight accounts priced from one quote map plus the run and backtest joins.
const Loading = () => (
    <RouteLoading title="Quant Strategies" subtitle={STRATEGIES_PAGE_COPY.loadingSubtitle} panels={3}/>
);

export default Loading;
