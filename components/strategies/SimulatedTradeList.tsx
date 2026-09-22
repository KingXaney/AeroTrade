import {cn, formatPrice, getChangeColorClass} from "@/lib/utils";
import type {StrategyBacktestView} from "@/lib/strategies/queries";

// Backtest fills, newest first, dated by bar (no clock time: a simulated fill is "the
// open of that day", not an instant). Capped; the count says how many there were.
const SHOW = 40;

const SimulatedTradeList = ({trades}: {trades: StrategyBacktestView['trades']}) => {
    if (trades.length === 0) {
        return <p className="text-sm text-fg-muted p-4">No simulated fills — the rule never triggered over the window.</p>;
    }
    const recent = [...trades].reverse().slice(0, SHOW);
    return (
        <div className="space-y-1.5" id="simulated-trades">
            <p className="text-[11px] text-warning mb-2" style={{fontFamily: 'var(--type-mono)'}}>
                Simulated — hypothetical fills at the next day&apos;s open, no fees or slippage.
            </p>
            {recent.map((t, i) => (
                <div key={`${t.date}-${t.symbol}-${t.side}-${i}`} className="flex items-center justify-between px-4 py-2 rounded-lg border bg-surface-2/40 border-line-strong/20">
                    <div className="min-w-0">
                        <span className={cn('px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider border mr-2',
                            t.side === 'buy' ? 'bg-brand/10 text-brand border-brand/20' : 'bg-negative/10 text-negative border-negative/20')}
                              style={{fontFamily: 'var(--type-mono)'}}>
                            {t.side}
                        </span>
                        <span className="text-sm font-bold text-fg" style={{fontFamily: 'var(--type-mono)'}}>{t.symbol}</span>
                        <span className="text-xs text-fg-muted ml-2">{t.quantity} @ {formatPrice(t.price)}{t.fill === 'close' ? ' (close)' : ''}</span>
                        <p className="text-[11px] text-fg-muted leading-snug">{t.reason}</p>
                    </div>
                    <div className="text-right shrink-0">
                        <div className="text-sm text-fg" style={{fontFamily: 'var(--type-mono)'}}>{formatPrice(t.total)}</div>
                        <div className="text-[10px] text-fg-muted" style={{fontFamily: 'var(--type-mono)'}}>
                            {t.date}
                            {typeof t.realizedPnl === 'number' && (
                                <span className={cn('ml-2', getChangeColorClass(t.realizedPnl || undefined))}>
                                    {t.realizedPnl >= 0 ? '+' : ''}{formatPrice(t.realizedPnl)}
                                </span>
                            )}
                        </div>
                    </div>
                </div>
            ))}
            {trades.length > SHOW && (
                <p className="px-4 pt-2 text-[11px] text-fg-muted" style={{fontFamily: 'var(--type-mono)'}}>
                    Showing the latest {SHOW} of {trades.length} simulated fills
                </p>
            )}
        </div>
    );
};

export default SimulatedTradeList;
