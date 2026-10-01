import {cn} from "@/lib/utils";
import {roundPct, formatPrice, formatChangePercent} from "@/lib/format";
import WatchlistButton from "@/components/stocks/WatchlistButton";
import FollowTopicButton from "@/components/topics/FollowTopicButton";
import TradeLink from "@/components/trading/TradeLink";
import Panel from "@/components/primitives/Panel";

type StockHeaderProps = {
    symbol: string;
    company: string;
    currentPrice?: number;
    changePercent?: number;
    exchange?: string;
    isInWatchlist: boolean;
    followedTopic?: {id: string; slug: string} | null;
};

const StockHeader = ({
    symbol,
    company,
    currentPrice,
    changePercent,
    exchange,
    isInWatchlist,
    followedTopic = null,
}: StockHeaderProps) => {
    return (
        <Panel as="div" pad={6} className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
                <div className="flex items-baseline gap-3">
                    <h1 className="text-3xl font-semibold text-fg font-heading">
                        {symbol}
                    </h1>
                    {exchange && (
                        <span className="text-[10px] uppercase text-fg-muted tracking-[0.1em] font-mono">
                            {exchange}
                        </span>
                    )}
                </div>
                <p className="mt-1 text-base text-fg-soft font-sans">
                    {company}
                </p>
            </div>

            <div className="flex flex-wrap items-center gap-4 sm:gap-6">
                <div className="text-right">
                    <div className="text-2xl font-semibold text-fg font-mono">
                        {typeof currentPrice === 'number' ? formatPrice(currentPrice) : '—'}
                    </div>
                    <div className="mt-1">
                        {changePercent !== undefined && changePercent !== null ? (
                            <span
                                className={cn(
                                    "font-mono inline-block px-2 py-0.5 rounded text-xs font-medium",
                                    roundPct(changePercent) > 0
                                        ? "bg-positive/10 text-positive border border-positive/20"
                                        : roundPct(changePercent) < 0
                                        ? "bg-negative/10 text-negative border border-negative/20"
                                        : "text-fg-muted"
                                )}
                                style={{ letterSpacing: '0.02em' }}
                            >
                                {formatChangePercent(changePercent)}
                            </span>
                        ) : (
                            <span className="text-sm text-fg-muted">—</span>
                        )}
                    </div>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                    <TradeLink symbol={symbol} variant="button" />
                    <WatchlistButton
                        symbol={symbol}
                        company={company}
                        isInWatchlist={isInWatchlist}
                        type="button"
                    />
                    <FollowTopicButton name={company} keywords={[company, symbol]} followed={followedTopic} type="button" />
                </div>
            </div>
        </Panel>
    );
};

export default StockHeader;
