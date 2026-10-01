import type {ReactNode} from "react";
import Link from "next/link";
import {cn} from "@/lib/utils";
import {formatSignedPrice, formatPrice, formatChangePercent, getChangeColorClass} from "@/lib/format";
import UnpricedNote from "@/components/trading/UnpricedNote";
import Term from "@/components/primitives/Term";
import type {EnrichedPosition} from '@/lib/trading/types';

// The one holdings table. Read-only as rendered by the friend profile page, the strategy
// detail page and the dashboard's Top Holdings widget; /portfolio's PositionsTable passes
// `actions`, which adds the Action column (Trade + Sell) and the row hover. No hooks, so a
// server page and the client PositionsTable both render it.
//
// showUnpricedNote exists because the strategy detail page already carries the same
// sentence on its headline tiles, and the identical amber line twice on one screen is
// how a warning turns into wallpaper. The Price column still shows "—" per row there.
type Props = {
    positions: EnrichedPosition[];
    emptyText?: string;
    showUnpricedNote?: boolean;
    actions?: (position: EnrichedPosition) => ReactNode;
};

const HoldingsTable = ({positions, emptyText = 'No open positions.', showUnpricedNote = true, actions}: Props) => {
    if (positions.length === 0) {
        return <p className="text-sm text-fg-muted p-4">{emptyText}</p>;
    }
    // Whole class names, so Tailwind's scanner finds both grids.
    const columns = actions ? 'grid-cols-[2fr_0.8fr_1fr_1fr_1.2fr_0.8fr]' : 'grid-cols-[2fr_1fr_1fr_1fr_1.2fr]';
    const rowColumns = actions ? 'md:grid-cols-[2fr_0.8fr_1fr_1fr_1.2fr_0.8fr]' : 'md:grid-cols-[2fr_1fr_1fr_1fr_1.2fr]';
    const rowHover = actions ? ' hover:border-line-strong/60 transition-colors' : '';

    return (
        <div className="space-y-2">
            <div className={`hidden md:grid ${columns} gap-4 px-4 py-2 border-b border-line-strong/30`}
                 style={{fontFamily: 'var(--type-mono)', fontSize: '10px', letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--fg-muted)'}}>
                <div>Asset</div>
                <div className="text-right">Qty</div>
                <div className="text-right"><Term k="avg-cost">Avg Cost</Term></div>
                <div className="text-right">Price</div>
                <div className="text-right">Value / P&L</div>
                {actions && <div className="text-right">Action</div>}
            </div>

            {positions.map((p) => (
                <div key={p.symbol}
                     className={`grid grid-cols-1 ${rowColumns} gap-2 md:gap-4 items-center px-4 py-3 rounded-xl border bg-surface-2/40 border-line-strong/20${rowHover}`}>
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
                    {/* Below md the header row is hidden, so each cell names itself. */}
                    <div className="flex justify-between md:block md:text-right text-fg" style={{fontFamily: 'var(--type-mono)'}}><span className="md:hidden text-[10px] uppercase tracking-[0.1em] text-fg-muted mr-2">Qty</span>{p.quantity}</div>
                    <div className="flex justify-between md:block md:text-right text-fg-soft" style={{fontFamily: 'var(--type-mono)'}}><span className="md:hidden text-[10px] uppercase tracking-[0.1em] text-fg-muted mr-2">Avg Cost</span>{formatPrice(p.avgCost)}</div>
                    <div className="flex justify-between md:block md:text-right text-fg" style={{fontFamily: 'var(--type-mono)'}}>
                        <span className="md:hidden text-[10px] uppercase tracking-[0.1em] text-fg-muted mr-2">Price</span>
                        {typeof p.currentPrice === 'number' ? formatPrice(p.currentPrice) : '—'}
                    </div>
                    <div className="flex justify-between md:block md:text-right" style={{fontFamily: 'var(--type-mono)'}}>
                        <span className="md:hidden text-[10px] uppercase tracking-[0.1em] text-fg-muted mr-2">Value / P&L</span>
                        <div className="text-right">
                        <div className="text-fg">{formatPrice(p.marketValue)}</div>
                        {p.priceStale ? (
                            <div className="text-xs text-fg-muted" title="No live quote — value shown at cost">—</div>
                        ) : (
                            <div className={cn('text-xs', getChangeColorClass(p.unrealizedPnl))}>
                                {formatSignedPrice(p.unrealizedPnl)} ({formatChangePercent(p.unrealizedPnlPct)})
                            </div>
                        )}
                        </div>
                    </div>
                    {actions && <div className="flex md:justify-end gap-2">{actions(p)}</div>}
                </div>
            ))}
            {showUnpricedNote && <UnpricedNote positions={positions} className="px-4 pt-1" />}
        </div>
    );
};

export default HoldingsTable;
