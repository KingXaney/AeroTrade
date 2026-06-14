import Link from "next/link";
import {cn, formatPrice, formatChangePercent, getChangeColorClass} from "@/lib/utils";

// Read-only holdings table — used on the friend profile page (and as the visual base
// the interactive PositionsTable mirrors on the trade page).
const PortfolioHoldings = ({positions, emptyText = 'No open positions.'}: {positions: EnrichedPosition[]; emptyText?: string}) => {
    if (positions.length === 0) {
        return <p className="text-sm text-[#849495] p-4">{emptyText}</p>;
    }

    return (
        <div className="space-y-2">
            <div className="hidden md:grid grid-cols-[2fr_1fr_1fr_1fr_1.2fr] gap-4 px-4 py-2 border-b border-[rgba(59,73,75,0.3)]"
                 style={{fontFamily: 'var(--font-jetbrains)', fontSize: '10px', letterSpacing: '0.1em', textTransform: 'uppercase', color: '#849495'}}>
                <div>Asset</div>
                <div className="text-right">Qty</div>
                <div className="text-right">Avg Cost</div>
                <div className="text-right">Price</div>
                <div className="text-right">Value / P&L</div>
            </div>

            {positions.map((p) => (
                <div key={p.symbol}
                     className="grid grid-cols-1 md:grid-cols-[2fr_1fr_1fr_1fr_1.2fr] gap-2 md:gap-4 items-center px-4 py-3 rounded-xl border bg-[rgba(30,32,36,0.4)] border-[rgba(59,73,75,0.2)]">
                    <div className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded flex items-center justify-center text-xs font-bold"
                             style={{backgroundColor: '#333539', color: '#7df4ff', fontFamily: 'var(--font-sora)', border: '1px solid rgba(125,244,255,0.2)'}}>
                            {p.symbol.slice(0, 2)}
                        </div>
                        <div>
                            <Link href={`/stocks/${p.symbol}`}
                                  className="font-bold text-sm text-[#e2e2e8] hover:text-[#7df4ff] transition-colors"
                                  style={{fontFamily: 'var(--font-jetbrains)'}}>
                                {p.symbol}
                            </Link>
                            <div className="text-[11px] text-[#b9cacb] truncate max-w-[160px]">{p.company}</div>
                        </div>
                    </div>
                    <div className="text-right text-[#e2e2e8]" style={{fontFamily: 'var(--font-jetbrains)'}}>{p.quantity}</div>
                    <div className="text-right text-[#b9cacb]" style={{fontFamily: 'var(--font-jetbrains)'}}>{formatPrice(p.avgCost)}</div>
                    <div className="text-right text-[#e2e2e8]" style={{fontFamily: 'var(--font-jetbrains)'}}>
                        {typeof p.currentPrice === 'number' ? formatPrice(p.currentPrice) : '—'}
                    </div>
                    <div className="text-right" style={{fontFamily: 'var(--font-jetbrains)'}}>
                        <div className="text-[#e2e2e8]">{formatPrice(p.marketValue)}</div>
                        <div className={cn('text-xs', getChangeColorClass(p.unrealizedPnl || undefined))}>
                            {p.unrealizedPnl >= 0 ? '+' : ''}{formatPrice(p.unrealizedPnl)} ({formatChangePercent(p.unrealizedPnlPct) || '0.00%'})
                        </div>
                    </div>
                </div>
            ))}
        </div>
    );
};

export default PortfolioHoldings;
