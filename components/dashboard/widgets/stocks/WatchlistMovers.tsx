import {cn} from "@/lib/utils";
import {formatChangePercent, getChangeColorClass} from "@/lib/format";
import type {StockWithData} from '@/lib/stocks/types';

const WatchlistMovers = ({movers}: {movers: StockWithData[]}) => (
    movers.length > 0 ? (
        <div className="space-y-2">
            {movers.map((m) => (
                <div key={m.symbol} className="flex items-center justify-between">
                    <span className="text-sm font-bold text-fg font-mono">{m.symbol}</span>
                    <span className={cn('font-mono text-xs', getChangeColorClass(m.changePercent))}>
                        {formatChangePercent(m.changePercent) || '—'}
                    </span>
                </div>
            ))}
        </div>
    ) : (
        <p className="text-sm text-fg-muted">Add symbols to your watchlist to track movers.</p>
    )
);

export default WatchlistMovers;
