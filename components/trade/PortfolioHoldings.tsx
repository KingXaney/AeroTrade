import Link from "next/link";
import {cn, formatPrice, formatChangePercent, getChangeColorClass} from "@/lib/utils";
import UnpricedNote from "@/components/trade/UnpricedNote";

// Read-only holdings table — used on the friend profile page (and as the visual base
// the interactive PositionsTable mirrors on the trade page).
const PortfolioHoldings = ({positions, emptyText = 'No open positions.'}: {positions: EnrichedPosition[]; emptyText?: string}) => {
    if (positions.length === 0) {
        return <p className="text-sm text-fg-muted p-4">{emptyText}</p>;
    }

    return (
        <div className="space-y-2">
            <div className="hidden md:grid grid-cols-[2fr_1fr_1fr_1fr_1.2fr] gap-4 px-4 py-2 border-b border-line-strong/30"
                 style={{fontFamily: 'var(--type-mono)', fontSize: '10px', letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--fg-muted)'}}>
                <div>Asset</div>
                <div className="text-right">Qty</div>
                <div className="text-right">Avg Cost</div>
                <div className="text-right">Price</div>
                <div className="text-right">Value / P&L</div>
            </div>

            {positions.map((p) => (
                <div key={p.symbol}
                     className="grid grid-cols-1 md:grid-cols-[2fr_1fr_1fr_1fr_1.2fr] gap-2 md:gap-4 items-center px-4 py-3 rounded-xl border bg-surface-2/40 border-line-strong/20">
                    <div className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded flex items-center justify-center text-xs font-bold"
                             style={{backgroundColor: 'var(--surface-4)', color: 'var(--brand)', fontFamily: 'var(--type-display)', border: '1px solid color-mix(in srgb, var(--brand) 20%, transparent)'}}>
                            {p.symbol.slice(0, 2)}
                        </div>
                        <div>
                            <Link href={`/stocks/${p.symbol}`}
                                  className="font-bold text-sm text-fg hover:text-brand transition-colors"
                                  style={{fontFamily: 'var(--type-mono)'}}>
                                {p.symbol}
                            </Link>
                            <div className="text-[11px] text-fg-soft truncate max-w-[160px]">{p.company}</div>
                        </div>
                    </div>
                    <div className="text-right text-fg" style={{fontFamily: 'var(--type-mono)'}}>{p.quantity}</div>
                    <div className="text-right text-fg-soft" style={{fontFamily: 'var(--type-mono)'}}>{formatPrice(p.avgCost)}</div>
                    <div className="text-right text-fg" style={{fontFamily: 'var(--type-mono)'}}>
                        {typeof p.currentPrice === 'number' ? formatPrice(p.currentPrice) : '—'}
                    </div>
                    <div className="text-right" style={{fontFamily: 'var(--type-mono)'}}>
                        <div className="text-fg">{formatPrice(p.marketValue)}</div>
                        {p.priceStale ? (
                            <div className="text-xs text-fg-muted" title="No live quote — value shown at cost">—</div>
                        ) : (
                            <div className={cn('text-xs', getChangeColorClass(p.unrealizedPnl || undefined))}>
                                {p.unrealizedPnl >= 0 ? '+' : ''}{formatPrice(p.unrealizedPnl)} ({formatChangePercent(p.unrealizedPnlPct) || '0.00%'})
                            </div>
                        )}
                    </div>
                </div>
            ))}
            <UnpricedNote positions={positions} className="px-4 pt-1" />
        </div>
    );
};

export default PortfolioHoldings;
