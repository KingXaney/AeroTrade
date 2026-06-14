import {cn, formatPrice, getChangeColorClass} from "@/lib/utils";

const formatWhen = (ms: number) =>
    new Date(ms).toLocaleString('en-US', {month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit'});

const TradeHistory = ({trades}: {trades: PaperTradeRecord[]}) => {
    if (trades.length === 0) {
        return <p className="text-sm text-[#849495] p-4">No trades yet. Place your first order to get started.</p>;
    }

    return (
        <div className="space-y-1.5">
            {trades.map((t) => {
                const isBuy = t.side === 'buy';
                return (
                    <div key={t.id}
                         className="flex items-center justify-between px-4 py-2.5 rounded-lg border bg-[rgba(30,32,36,0.4)] border-[rgba(59,73,75,0.2)]">
                        <div className="flex items-center gap-3">
                            <span className={cn(
                                'px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider border',
                                isBuy
                                    ? 'bg-[rgba(125,244,255,0.1)] text-[#7df4ff] border-[rgba(125,244,255,0.2)]'
                                    : 'bg-[rgba(255,180,171,0.1)] text-[#ffb4ab] border-[rgba(255,180,171,0.2)]',
                            )} style={{fontFamily: 'var(--font-jetbrains)'}}>
                                {t.side}
                            </span>
                            <div>
                                <span className="text-sm font-bold text-[#e2e2e8]" style={{fontFamily: 'var(--font-jetbrains)'}}>{t.symbol}</span>
                                <span className="text-xs text-[#849495] ml-2">{t.quantity} @ {formatPrice(t.price)}</span>
                            </div>
                        </div>
                        <div className="text-right">
                            <div className="text-sm text-[#e2e2e8]" style={{fontFamily: 'var(--font-jetbrains)'}}>{formatPrice(t.total)}</div>
                            <div className="text-[10px] text-[#849495]">
                                {formatWhen(t.createdAt)}
                                {typeof t.realizedPnl === 'number' && (
                                    <span className={cn('ml-2', getChangeColorClass(t.realizedPnl || undefined))}>
                                        {t.realizedPnl >= 0 ? '+' : ''}{formatPrice(t.realizedPnl)}
                                    </span>
                                )}
                            </div>
                        </div>
                    </div>
                );
            })}
        </div>
    );
};

export default TradeHistory;
