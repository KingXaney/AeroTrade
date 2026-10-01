'use client';

import {useState} from "react";
import {cn} from "@/lib/utils";
import {formatPct, getChangeColorClass} from "@/lib/format";
import SellPositionDialog from "@/components/trading/desk/SellPositionDialog";
import type {Lot} from "@/lib/trading/lots";
import UnpricedNote from "@/components/trading/UnpricedNote";
import TradeLink from "@/components/trading/TradeLink";
import type {EnrichedPosition} from '@/lib/trading/types';

// Compact, horizontally-scrolling open-positions strip for the Trade page and the
// dashboard's positions widget.
// Each chip shows symbol · qty · P&L%; Sell opens the shared partial-sell
// dialog. The full positions table + trade history live on /portfolio.
// lotNotes: the learner's notes on the shares still held, by symbol (pages only).
const OpenPositionsStrip = ({positions, accountId, lotNotes}: {positions: EnrichedPosition[]; accountId: string; lotNotes?: Readonly<Record<string, readonly Lot[]>>}) => {
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
                                <span className={cn('text-[11px]', getChangeColorClass(p.unrealizedPnlPct))}
                                      style={{fontFamily: 'var(--type-mono)'}}>
                                    {formatPct(p.unrealizedPnlPct)}
                                </span>
                            )}
                        </div>
                        <TradeLink symbol={p.symbol} variant="icon" className="size-7" />
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

                {sellTarget && <SellPositionDialog position={sellTarget} accountId={accountId} notes={lotNotes?.[sellTarget.symbol]} onClose={() => setSellTarget(null)} />}
            </div>
            <UnpricedNote positions={positions} className="mt-1" />
        </div>
    );
};

export default OpenPositionsStrip;
