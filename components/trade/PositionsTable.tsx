'use client';

import {useState} from "react";
import Link from "next/link";
import {useRouter} from "next/navigation";
import {toast} from "sonner";
import {cn, formatPrice, formatChangePercent, getChangeColorClass} from "@/lib/utils";
import {placeOrder} from "@/lib/actions/trading.actions";

// Interactive holdings table for the trade page — each row can be sold to close.
const PositionsTable = ({positions}: {positions: EnrichedPosition[]}) => {
    const router = useRouter();
    const [closing, setClosing] = useState<string | null>(null);

    if (positions.length === 0) {
        return <p className="text-sm text-[#849495] p-4">No open positions. Use the order panel to buy your first stock.</p>;
    }

    const sellAll = async (p: EnrichedPosition) => {
        if (closing) return;
        setClosing(p.symbol);
        try {
            const result = await placeOrder({symbol: p.symbol, side: 'sell', quantity: p.quantity});
            if (result.success) {
                toast.success(result.message || `Closed ${p.symbol}`);
                router.refresh();
            } else {
                toast.error(result.message || 'Sell failed');
            }
        } finally {
            setClosing(null);
        }
    };

    return (
        <div className="space-y-2">
            <div className="hidden md:grid grid-cols-[2fr_0.8fr_1fr_1fr_1.2fr_0.8fr] gap-4 px-4 py-2 border-b border-[rgba(59,73,75,0.3)]"
                 style={{fontFamily: 'var(--font-jetbrains)', fontSize: '10px', letterSpacing: '0.1em', textTransform: 'uppercase', color: '#849495'}}>
                <div>Asset</div>
                <div className="text-right">Qty</div>
                <div className="text-right">Avg Cost</div>
                <div className="text-right">Price</div>
                <div className="text-right">Value / P&L</div>
                <div className="text-right">Action</div>
            </div>

            {positions.map((p) => (
                <div key={p.symbol}
                     className="grid grid-cols-1 md:grid-cols-[2fr_0.8fr_1fr_1fr_1.2fr_0.8fr] gap-2 md:gap-4 items-center px-4 py-3 rounded-xl border bg-[rgba(30,32,36,0.4)] border-[rgba(59,73,75,0.2)] hover:border-[rgba(59,73,75,0.6)] transition-colors">
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
                    <div className="flex md:justify-end">
                        <button
                            type="button"
                            onClick={() => sellAll(p)}
                            disabled={closing === p.symbol}
                            className="px-3 py-1.5 rounded text-xs font-bold uppercase tracking-wider transition-colors disabled:opacity-50"
                            style={{color: '#ffb4ab', border: '1px solid rgba(255,180,171,0.3)', backgroundColor: 'rgba(255,180,171,0.06)', fontFamily: 'var(--font-jetbrains)'}}
                        >
                            {closing === p.symbol ? '…' : 'Sell'}
                        </button>
                    </div>
                </div>
            ))}
        </div>
    );
};

export default PositionsTable;
