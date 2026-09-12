import {cn, formatPrice, formatChangePercent} from "@/lib/utils";
import WatchlistButton from "@/components/watchlist/WatchlistButton";
import FollowTopicButton from "@/components/topics/FollowTopicButton";
import TradeLink from "@/components/trade/TradeLink";

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
        <div className="glass-panel rounded-xl p-6 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
                <div className="flex items-baseline gap-3">
                    <h1 className="text-3xl font-semibold text-fg"
                        style={{ fontFamily: 'var(--type-display)' }}>
                        {symbol}
                    </h1>
                    {exchange && (
                        <span className="text-[10px] uppercase text-fg-muted tracking-[0.1em]"
                              style={{ fontFamily: 'var(--type-mono)' }}>
                            {exchange}
                        </span>
                    )}
                </div>
                <p className="mt-1 text-base text-fg-soft"
                   style={{ fontFamily: 'var(--type-body)' }}>
                    {company}
                </p>
            </div>

            <div className="flex flex-wrap items-center gap-4 sm:gap-6">
                <div className="text-right">
                    <div className="text-2xl font-semibold text-fg"
                         style={{ fontFamily: 'var(--type-mono)' }}>
                        {typeof currentPrice === 'number' ? formatPrice(currentPrice) : '—'}
                    </div>
                    <div className="mt-1">
                        {changePercent !== undefined && changePercent !== null ? (
                            <span
                                className={cn(
                                    "inline-block px-2 py-0.5 rounded text-xs font-medium",
                                    changePercent > 0
                                        ? "bg-positive/10 text-positive border border-positive/20"
                                        : changePercent < 0
                                        ? "bg-negative/10 text-negative border border-negative/20"
                                        : "text-fg-muted"
                                )}
                                style={{ fontFamily: 'var(--type-mono)', letterSpacing: '0.02em' }}
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
        </div>
    );
};

export default StockHeader;
