import {cn, formatPrice, formatChangePercent} from "@/lib/utils";
import WatchlistButton from "@/components/watchlist/WatchlistButton";

type StockHeaderProps = {
    symbol: string;
    company: string;
    currentPrice?: number;
    changePercent?: number;
    exchange?: string;
    isInWatchlist: boolean;
};

const StockHeader = ({
    symbol,
    company,
    currentPrice,
    changePercent,
    exchange,
    isInWatchlist,
}: StockHeaderProps) => {
    return (
        <div className="glass-panel rounded-xl p-6 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
                <div className="flex items-baseline gap-3">
                    <h1 className="text-3xl font-semibold text-[#e2e2e8]"
                        style={{ fontFamily: 'var(--font-sora)' }}>
                        {symbol}
                    </h1>
                    {exchange && (
                        <span className="text-[10px] uppercase text-[#849495] tracking-[0.1em]"
                              style={{ fontFamily: 'var(--font-jetbrains)' }}>
                            {exchange}
                        </span>
                    )}
                </div>
                <p className="mt-1 text-base text-[#b9cacb]"
                   style={{ fontFamily: 'var(--font-hanken)' }}>
                    {company}
                </p>
            </div>

            <div className="flex items-center gap-6">
                <div className="text-right">
                    <div className="text-2xl font-semibold text-[#e2e2e8]"
                         style={{ fontFamily: 'var(--font-jetbrains)' }}>
                        {typeof currentPrice === 'number' ? formatPrice(currentPrice) : '—'}
                    </div>
                    <div className="mt-1">
                        {changePercent !== undefined && changePercent !== null ? (
                            <span
                                className={cn(
                                    "inline-block px-2 py-0.5 rounded text-xs font-medium",
                                    changePercent > 0
                                        ? "bg-[rgba(125,244,255,0.1)] text-[#7df4ff] border border-[rgba(125,244,255,0.2)]"
                                        : changePercent < 0
                                        ? "bg-[rgba(255,180,171,0.1)] text-[#ffb4ab] border border-[rgba(255,180,171,0.2)]"
                                        : "text-[#849495]"
                                )}
                                style={{ fontFamily: 'var(--font-jetbrains)', letterSpacing: '0.02em' }}
                            >
                                {formatChangePercent(changePercent)}
                            </span>
                        ) : (
                            <span className="text-sm text-[#849495]">—</span>
                        )}
                    </div>
                </div>
                <WatchlistButton
                    symbol={symbol}
                    company={company}
                    isInWatchlist={isInWatchlist}
                    type="button"
                />
            </div>
        </div>
    );
};

export default StockHeader;
