'use client';

import {useState} from "react";
import {useRouter} from "next/navigation";
import {toast} from "sonner";
import {cn, getChangeColorClass} from "@/lib/utils";
import {placeOrder} from "@/lib/actions/trading.actions";

// Compact, horizontally-scrolling open-positions strip for the Trade page.
// Each chip shows symbol · qty · P&L% with a one-click full-close. The full
// positions table + trade history live on /portfolio.
const OpenPositionsStrip = ({positions}: {positions: EnrichedPosition[]}) => {
    const router = useRouter();
    const [closing, setClosing] = useState<string | null>(null);

    if (positions.length === 0) {
        return <p className="text-sm text-[#849495]">No open positions yet. Place an order to get started.</p>;
    }

    const sell = async (p: EnrichedPosition) => {
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
        <div className="flex gap-2 overflow-x-auto pb-1">
            {positions.map((p) => (
                <div key={p.symbol}
                     className="flex items-center gap-3 px-3 py-2 rounded-lg border bg-[rgba(30,32,36,0.4)] border-[rgba(59,73,75,0.25)] shrink-0">
                    <div className="flex flex-col">
                        <span className="text-xs font-bold text-[#e2e2e8]" style={{fontFamily: 'var(--font-jetbrains)'}}>
                            {p.symbol} <span className="text-[#849495] font-normal">×{p.quantity}</span>
                        </span>
                        <span className={cn('text-[11px]', getChangeColorClass(p.unrealizedPnlPct || undefined))}
                              style={{fontFamily: 'var(--font-jetbrains)'}}>
                            {p.unrealizedPnlPct >= 0 ? '+' : ''}{p.unrealizedPnlPct.toFixed(2)}%
                        </span>
                    </div>
                    <button
                        type="button"
                        onClick={() => sell(p)}
                        disabled={closing === p.symbol}
                        className="px-2.5 py-1 rounded text-[11px] font-bold uppercase tracking-wider transition-colors disabled:opacity-50"
                        style={{color: '#ffb4ab', border: '1px solid rgba(255,180,171,0.3)', backgroundColor: 'rgba(255,180,171,0.06)', fontFamily: 'var(--font-jetbrains)'}}
                    >
                        {closing === p.symbol ? '…' : 'Sell'}
                    </button>
                </div>
            ))}
        </div>
    );
};

export default OpenPositionsStrip;
