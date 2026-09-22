import Link from "next/link";
import {cn, formatPrice, getChangeColorClass} from "@/lib/utils";

const formatWhen = (ms: number) =>
    new Date(ms).toLocaleString('en-US', {month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit'});

// Only automated fills get a chip: 'user' is the default reading of a trade log, and
// rows from before the field existed carry no source at all — that absence is honest
// ("unknown"), not something to dress up as either.
const SOURCE_LABEL: Partial<Record<TradeSource, string>> = {
    'ai-navigator': 'AI Navigator',
    'ai-suggestion': 'AI suggestion',
    'strategy': 'Strategy',
};
const SOURCE_TITLE: Partial<Record<TradeSource, string>> = {
    'ai-navigator': 'Placed by the AI, not by you',
    'ai-suggestion': 'Placed by the AI, not by you',
    'strategy': 'Placed by a quant strategy\'s rule, not by a person',
};

type Props = {
    trades: PaperTradeRecord[];
    totalCount?: number;      // the account's full trade count, when the list is capped
    exportHref?: string;      // where the complete history lives
};

const TradeHistory = ({trades, totalCount, exportHref}: Props) => {
    if (trades.length === 0) {
        return <p className="text-sm text-fg-muted p-4">No trades yet. Place your first order to get started.</p>;
    }
    const capped = typeof totalCount === 'number' && totalCount > trades.length;

    return (
        <div className="space-y-1.5">
            {trades.map((t) => {
                const isBuy = t.side === 'buy';
                const source = t.source ? SOURCE_LABEL[t.source] : undefined;
                const sourceTitle = t.source ? SOURCE_TITLE[t.source] : undefined;
                return (
                    <div key={t.id}
                         className="flex items-center justify-between px-4 py-2.5 rounded-lg border bg-surface-2/40 border-line-strong/20">
                        <div className="flex items-center gap-3 min-w-0">
                            <span className={cn(
                                'px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider border shrink-0',
                                isBuy
                                    ? 'bg-brand/10 text-brand border-brand/20'
                                    : 'bg-negative/10 text-negative border-negative/20',
                            )} style={{fontFamily: 'var(--type-mono)'}}>
                                {t.side}
                            </span>
                            <div className="min-w-0">
                                <Link href={`/stocks/${t.symbol}`} className="text-sm font-bold text-fg hover:text-brand transition-colors" style={{fontFamily: 'var(--type-mono)'}}>
                                    {t.symbol}
                                </Link>
                                <span className="text-xs text-fg-muted ml-2">{t.quantity} @ {formatPrice(t.price)}</span>
                                {t.accountName && (
                                    <span className="ml-2 text-[10px] uppercase tracking-[0.08em] text-fg-muted" style={{fontFamily: 'var(--type-mono)'}}>{t.accountName}</span>
                                )}
                                {source && (
                                    <span className="ml-2 px-1.5 py-0.5 rounded text-[10px] uppercase tracking-wider whitespace-nowrap border border-line-strong/40 text-fg-soft"
                                          style={{fontFamily: 'var(--type-mono)'}} title={sourceTitle}>
                                        {source}
                                    </span>
                                )}
                                {t.reason && (
                                    <p className="mt-0.5 text-[11px] text-fg-muted leading-snug">{t.reason}</p>
                                )}
                            </div>
                        </div>
                        <div className="text-right shrink-0">
                            <div className="text-sm text-fg" style={{fontFamily: 'var(--type-mono)'}}>{formatPrice(t.total)}</div>
                            <div className="text-[10px] text-fg-muted">
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
            {capped && (
                <p className="px-4 pt-2 text-[11px] text-fg-muted" style={{fontFamily: 'var(--type-mono)'}}>
                    Showing the latest {trades.length} of {totalCount} trades
                    {exportHref ? <> · <a href={exportHref} download className="text-brand hover:underline">export the full history as CSV</a></> : null}
                </p>
            )}
        </div>
    );
};

export default TradeHistory;
