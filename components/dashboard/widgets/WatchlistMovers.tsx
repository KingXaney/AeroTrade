import {cn} from "@/lib/utils";
import {formatChangePercent, getChangeColorClass} from "@/lib/format";

const WatchlistMovers = ({movers}: {movers: StockWithData[]}) => (
    movers.length > 0 ? (
        <div className="space-y-2">
            {movers.map((m) => (
                <div key={m.symbol} className="flex items-center justify-between">
                    <span className="text-sm font-bold text-fg" style={{fontFamily: 'var(--type-mono)'}}>{m.symbol}</span>
                    <span className={cn('text-xs', getChangeColorClass(m.changePercent))}
                          style={{fontFamily: 'var(--type-mono)'}}>
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
