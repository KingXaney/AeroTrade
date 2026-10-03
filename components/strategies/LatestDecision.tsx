import {cn} from "@/lib/utils";
import {DECISION_COPY} from "@/lib/learn/copy/decision";
import type {StrategyDefinition} from "@/lib/strategies/types";
import type {StrategyRunView} from "@/lib/strategies/views";
import Badge from "@/components/primitives/Badge";
import EmptyState from "@/components/primitives/EmptyState";
import MicroLabel from "@/components/primitives/MicroLabel";
import ReasonDisclosure from "@/components/strategies/ReasonDisclosure";
import RowCard from "@/components/primitives/RowCard";

// The most recent run's plan and what came of it: every order with the rule's own
// reason, whether it filled and at what price, and anything it could not do. An order that
// did not fill carries one "What the rule saw" disclosure decoding its reason (the page
// passes `def`); a filled one does not, because its fill in the trade log carries it —
// one per fill (invariant 12).
//
// The signal board renders inside this, under `signals`, rather than in a panel of its
// own: what the rule saw and what it then did are one story, and giving them two
// identical frames side by side is what made the page read as a template.
//
// Every sentence here is DECISION_COPY (lib/learn/copy/decision.ts); what the run stored — its
// summary, the orders' reasons and messages, skipped orders' reasons, data issues — is quoted
// as stored.
type Props = {
    run: StrategyRunView | null;
    // One-line summary of the run (describeLastRun), lifted off the old ranking column.
    headline?: string;
    signals?: React.ReactNode;
    // The strategy whose parameters the decoded reasons quote.
    def: StrategyDefinition;
};

const LatestDecision = ({run, headline, signals, def}: Props) => {
    if (!run) {
        return (
            <EmptyState
                title={DECISION_COPY.emptyTitle}
                description={DECISION_COPY.emptyDescription}
                className="p-0"
            />
        );
    }
    return (
        <div className="space-y-3" id="latest-decision">
            {headline && <p data-run-verdict className="font-mono text-sm text-fg">{headline}</p>}
            <div className="font-mono flex flex-wrap items-center gap-2 text-[11px]">
                <Badge tone={run.mode === 'live' ? 'brand' : 'warning'}>{DECISION_COPY.mode[run.mode]}</Badge>
                <span className="text-fg-muted">{DECISION_COPY.runLine(run.date, run.asOf, run.summary)}</span>
                {run.rebalanceTriggered && run.mode !== 'skipped' && <span className="text-fg-muted">{DECISION_COPY.rebalanced}</span>}
            </div>

            {run.orders.length === 0 && run.mode !== 'skipped' && (
                <p data-run-verdict className="text-sm text-fg-muted">{DECISION_COPY.noOrders}</p>
            )}

            {run.orders.length > 0 && (
                <ul className="space-y-1.5">
                    {run.orders.map((o) => (
                        <RowCard as="li" key={`${o.side}-${o.symbol}`} data-run-verdict className="px-3 py-2">
                            <div className="flex items-center justify-between gap-3">
                                <div className="flex items-center gap-2 min-w-0">
                                    <Badge tone={o.side === 'buy' ? 'brand' : 'negative'} variant="outline" className="capitalize">{o.side}</Badge>
                                    <span className="font-mono text-sm font-bold text-fg">{o.symbol}</span>
                                    <span className="text-xs text-fg-muted">{DECISION_COPY.orderSize(o.quantity, o.kind)}</span>
                                </div>
                                <span className={cn('font-mono text-[11px] shrink-0', o.executed ? 'text-fg-soft' : 'text-warning')}>
                                    {DECISION_COPY.outcome(o, run.mode)}
                                </span>
                            </div>
                            <p data-order-reason className="mt-1 text-[11px] text-fg-muted leading-snug">{o.reason}</p>
                            {!o.executed && <ReasonDisclosure reason={o.reason} symbol={o.symbol} def={def} />}
                        </RowCard>
                    ))}
                </ul>
            )}

            {(run.skippedOrders.length > 0 || run.dataIssues.length > 0) && (
                <ul className="space-y-1" role="status">
                    {run.dataIssues.map((issue) => (
                        <li key={issue} className="font-mono text-[11px] text-warning">{issue}</li>
                    ))}
                    {run.skippedOrders.map((s) => (
                        <li key={`${s.symbol}-${s.reason}`} data-run-verdict className="font-mono text-[11px] text-fg-muted">
                            {DECISION_COPY.skipped(s.symbol, s.reason)}
                        </li>
                    ))}
                </ul>
            )}

            {signals && (
                <div className="pt-3 border-t border-line-strong/20">
                    <MicroLabel as="div" className="mb-2">{DECISION_COPY.watching}</MicroLabel>
                    {signals}
                </div>
            )}
        </div>
    );
};

export default LatestDecision;
