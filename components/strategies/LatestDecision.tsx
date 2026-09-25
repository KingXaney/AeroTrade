import {cn, formatPrice} from "@/lib/utils";
import type {StrategyRunView} from "@/lib/strategies/views";
import Badge from "@/components/primitives/Badge";
import EmptyState from "@/components/primitives/EmptyState";
import MicroLabel from "@/components/primitives/MicroLabel";

// The most recent run's plan and what came of it: every order with the rule's own
// reason, whether it filled and at what price, and anything it could not do.
//
// The signal board renders inside this, under `signals`, rather than in a panel of its
// own: what the rule saw and what it then did are one story, and giving them two
// identical frames side by side is what made the page read as a template.

const MODE_LABEL: Record<StrategyRunView['mode'], string> = {
    live: 'Live run',
    preview: 'Preview — nothing traded',
    skipped: 'Skipped',
};

type Props = {
    run: StrategyRunView | null;
    // One-line summary of the run (describeLastRun), lifted off the old ranking column.
    headline?: string;
    signals?: React.ReactNode;
};

const LatestDecision = ({run, headline, signals}: Props) => {
    if (!run) {
        return (
            <EmptyState
                title="No decisions yet."
                description="The first run happens on the next trading morning."
                className="p-0"
            />
        );
    }
    return (
        <div className="space-y-3" id="latest-decision">
            {headline && <p className="font-mono text-sm text-fg">{headline}</p>}
            <div className="font-mono flex flex-wrap items-center gap-2 text-[11px]">
                <Badge tone={run.mode === 'live' ? 'brand' : 'warning'}>{MODE_LABEL[run.mode]}</Badge>
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
                                    <Badge tone={o.side === 'buy' ? 'brand' : 'negative'} variant="outline">{o.side}</Badge>
                                    <span className="font-mono text-sm font-bold text-fg">{o.symbol}</span>
                                    <span className="text-xs text-fg-muted">{o.quantity} share{o.quantity === 1 ? '' : 's'} · {o.kind}</span>
                                </div>
                                <span className={cn('font-mono text-[11px] shrink-0', o.executed ? 'text-fg-soft' : 'text-warning')}>
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
                        <li key={issue} className="font-mono text-[11px] text-warning">{issue}</li>
                    ))}
                    {run.skippedOrders.map((s) => (
                        <li key={`${s.symbol}-${s.reason}`} className="font-mono text-[11px] text-fg-muted">
                            {s.symbol}: {s.reason}
                        </li>
                    ))}
                </ul>
            )}

            {signals && (
                <div className="pt-3 border-t border-line-strong/20">
                    <MicroLabel as="div" className="mb-2">What it is watching</MicroLabel>
                    {signals}
                </div>
            )}
        </div>
    );
};

export default LatestDecision;
