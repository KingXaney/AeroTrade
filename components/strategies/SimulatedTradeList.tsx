import {cn} from "@/lib/utils";
import {formatSignedPrice, formatPrice, getChangeColorClass} from "@/lib/format";
import type {StrategyBacktestView} from "@/lib/strategies/page-store";
import type {StrategyDefinition} from "@/lib/strategies/types";
import ReasonDisclosure from "@/components/strategies/ReasonDisclosure";
import RowCard from "@/components/primitives/RowCard";
import {SIMULATED_TRADES_COPY} from "@/lib/learn/copy/strategies";

// Backtest fills, newest first, dated by bar (no clock time: a simulated fill is "the
// open of that day", not an instant). Capped; the count says how many there were. Each
// fill carries one "What the rule saw" disclosure decoding its reason.
const SHOW = 40;

const SimulatedTradeList = ({trades, def}: {trades: StrategyBacktestView['trades']; def: StrategyDefinition}) => {
    if (trades.length === 0) {
        return <p className="text-sm text-fg-muted p-4">{SIMULATED_TRADES_COPY.none}</p>;
    }
    const recent = [...trades].reverse().slice(0, SHOW);
    return (
        <div className="space-y-1.5" id="simulated-trades">
            <p className="text-[11px] text-warning mb-2 font-mono">
                {SIMULATED_TRADES_COPY.banner}
            </p>
            {recent.map((t, i) => (
                <RowCard key={`${t.date}-${t.symbol}-${t.side}-${i}`} className="flex items-center justify-between py-2">
                    <div className="min-w-0">
                        <span className={cn('control-type capitalize px-2 py-0.5 rounded text-[10px] border mr-2',
                            t.side === 'buy' ? 'bg-brand/10 text-brand border-brand/20' : 'bg-negative/10 text-negative border-negative/20')}>
                            {t.side}
                        </span>
                        <span className="text-sm font-bold text-fg font-mono">{t.symbol}</span>
                        <span className="text-xs text-fg-muted ml-2">{t.quantity} @ {formatPrice(t.price)}{t.fill === 'close' ? ' (close)' : ''}</span>
                        <p className="text-[11px] text-fg-muted leading-snug">{t.reason}</p>
                        <ReasonDisclosure reason={t.reason} symbol={t.symbol} def={def} />
                    </div>
                    <div className="text-right shrink-0">
                        <div className="text-sm text-fg font-mono">{formatPrice(t.total)}</div>
                        <div className="text-[10px] text-fg-muted font-mono">
                            {t.date}
                            {typeof t.realizedPnl === 'number' && (
                                <span className={cn('ml-2', getChangeColorClass(t.realizedPnl))}>
                                    {formatSignedPrice(t.realizedPnl)}
                                </span>
                            )}
                        </div>
                    </div>
                </RowCard>
            ))}
            {trades.length > SHOW && (
                <p className="px-4 pt-2 text-[11px] text-fg-muted font-mono">
                    Showing the latest {SHOW} of {trades.length} simulated fills
                </p>
            )}
        </div>
    );
};

export default SimulatedTradeList;
