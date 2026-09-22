import {cn, formatPrice} from "@/lib/utils";
import type {StrategyRunView} from "@/lib/strategies/views";

// The most recent run's plan and what came of it: every order with the rule's own
// reason, whether it filled and at what price, and anything it could not do.

const MODE_LABEL: Record<StrategyRunView['mode'], string> = {
    live: 'Live run',
    preview: 'Preview — nothing traded',
    skipped: 'Skipped',
};

const LatestDecision = ({run}: {run: StrategyRunView | null}) => {
    if (!run) {
        return <p className="text-sm text-fg-muted p-4">No decisions yet — the first run happens on the next trading morning.</p>;
    }
    return (
        <div className="space-y-3" id="latest-decision">
            <div className="flex flex-wrap items-center gap-2 text-[11px]" style={{fontFamily: 'var(--type-mono)'}}>
                <span className={cn('px-2 py-0.5 rounded uppercase tracking-[0.08em]',
                    run.mode === 'live' ? 'bg-brand/10 text-brand' : 'bg-warning/10 text-warning')}>
                    {MODE_LABEL[run.mode]}
                </span>
                <span className="text-fg-muted">{run.date} · from the {run.asOf} close · {run.summary}</span>
                {run.rebalanceTriggered && run.mode !== 'skipped' && <span className="text-fg-muted">· rule evaluated its allocation today</span>}
            </div>

            {run.orders.length === 0 && run.mode !== 'skipped' && (
                <p className="text-sm text-fg-muted">Nothing to do — the rule held its positions.</p>
            )}

            {run.orders.length > 0 && (
                <ul className="space-y-1.5">
                    {run.orders.map((o) => (
                        <li key={`${o.side}-${o.symbol}`} className="px-3 py-2 rounded-lg border bg-surface-2/40 border-line-strong/20">
                            <div className="flex items-center justify-between gap-3">
                                <div className="flex items-center gap-2 min-w-0">
                                    <span className={cn('px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider border shrink-0',
                                        o.side === 'buy' ? 'bg-brand/10 text-brand border-brand/20' : 'bg-negative/10 text-negative border-negative/20')}
                                          style={{fontFamily: 'var(--type-mono)'}}>
                                        {o.side}
                                    </span>
                                    <span className="text-sm font-bold text-fg" style={{fontFamily: 'var(--type-mono)'}}>{o.symbol}</span>
                                    <span className="text-xs text-fg-muted">{o.quantity} share{o.quantity === 1 ? '' : 's'} · {o.kind}</span>
                                </div>
                                <span className={cn('text-[11px] shrink-0', o.executed ? 'text-fg-soft' : 'text-warning')} style={{fontFamily: 'var(--type-mono)'}}>
                                    {o.executed
                                        ? `filled${o.price !== null ? ` @ ${formatPrice(o.price)}` : ''}`
                                        : (run.mode === 'preview' ? 'not filled (preview)' : `not filled${o.message ? ` — ${o.message}` : ''}`)}
                                </span>
                            </div>
                            <p className="mt-1 text-[11px] text-fg-muted leading-snug">{o.reason}</p>
                        </li>
                    ))}
                </ul>
            )}

            {(run.skippedOrders.length > 0 || run.dataIssues.length > 0) && (
                <ul className="space-y-1" role="status">
                    {run.dataIssues.map((issue) => (
                        <li key={issue} className="text-[11px] text-warning" style={{fontFamily: 'var(--type-mono)'}}>{issue}</li>
                    ))}
                    {run.skippedOrders.map((s) => (
                        <li key={`${s.symbol}-${s.reason}`} className="text-[11px] text-fg-muted" style={{fontFamily: 'var(--type-mono)'}}>
                            {s.symbol}: {s.reason}
                        </li>
                    ))}
                </ul>
            )}
        </div>
    );
};

export default LatestDecision;
