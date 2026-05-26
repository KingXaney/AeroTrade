import {cn, formatPrice, formatChangePercent, getChangeColorClass} from "@/lib/utils";
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
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between mb-8">
            <div>
                <div className="flex items-baseline gap-3">
                    <h1 className="text-3xl font-semibold text-gray-100">{symbol}</h1>
                    {exchange && <span className="text-sm uppercase text-gray-500">{exchange}</span>}
                </div>
                <p className="mt-1 text-base text-gray-400">{company}</p>
            </div>

            <div className="flex items-center gap-6">
                <div className="text-right">
                    <div className="text-2xl font-semibold text-gray-100">
                        {typeof currentPrice === 'number' ? formatPrice(currentPrice) : '—'}
                    </div>
                    <div className={cn('text-sm font-medium', getChangeColorClass(changePercent))}>
                        {formatChangePercent(changePercent) || '—'}
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
