'use client';

import {useState} from "react";
import {cn, getChangeColorClass} from "@/lib/utils";
import SellPositionDialog from "@/components/trade/SellPositionDialog";
import UnpricedNote from "@/components/trade/UnpricedNote";

// Compact, horizontally-scrolling open-positions strip for the Trade page.
// Each chip shows symbol · qty · P&L%; Sell opens the shared partial-sell
// dialog. The full positions table + trade history live on /portfolio.
const OpenPositionsStrip = ({positions, accountId}: {positions: EnrichedPosition[]; accountId: string}) => {
    const [sellTarget, setSellTarget] = useState<EnrichedPosition | null>(null);

    if (positions.length === 0) {
        return <p className="text-sm text-fg-muted">No open positions yet. Place an order to get started.</p>;
    }

    return (
        <div>
            <div className="flex gap-2 overflow-x-auto pb-1">
                {positions.map((p) => (
                    <div key={p.symbol}
                         className="flex items-center gap-3 px-3 py-2 rounded-lg border bg-surface-2/40 border-line-strong/25 shrink-0">
                        <div className="flex flex-col">
                            <span className="text-xs font-bold text-fg" style={{fontFamily: 'var(--type-mono)'}}>
                                {p.symbol} <span className="text-fg-muted font-normal">×{p.quantity}</span>
                            </span>
                            {p.priceStale ? (
                                <span className="text-[11px] text-fg-muted" style={{fontFamily: 'var(--type-mono)'}} title="No live quote — value shown at cost">—</span>
                            ) : (
                                <span className={cn('text-[11px]', getChangeColorClass(p.unrealizedPnlPct || undefined))}
                                      style={{fontFamily: 'var(--type-mono)'}}>
                                    {p.unrealizedPnlPct >= 0 ? '+' : ''}{p.unrealizedPnlPct.toFixed(2)}%
                                </span>
                            )}
                        </div>
                        <button
                            type="button"
                            onClick={() => setSellTarget(p)}
                            className="px-2.5 py-1 rounded text-[11px] font-bold uppercase tracking-wider transition-colors"
                            style={{color: 'var(--negative)', border: '1px solid color-mix(in srgb, var(--negative) 30%, transparent)', backgroundColor: 'color-mix(in srgb, var(--negative) 6%, transparent)', fontFamily: 'var(--type-mono)'}}
                        >
                            Sell
                        </button>
                    </div>
                ))}

                {sellTarget && <SellPositionDialog position={sellTarget} accountId={accountId} onClose={() => setSellTarget(null)} />}
            </div>
            <UnpricedNote positions={positions} className="mt-1" />
        </div>
    );
};

export default OpenPositionsStrip;
