import Link from "next/link";
import {cn, getChangeColorClass} from "@/lib/utils";
import {
    columnHasSpark,
    excessReturnPct,
    formatPct,
    signedForColor,
    sparkDomain,
    unpricedNote,
    type StrategyLeaderboardRow,
} from "@/lib/strategies/views";
import EmptyState from "@/components/primitives/EmptyState";
import MicroLabel from "@/components/primitives/MicroLabel";
import Sparkline from "@/components/strategies/Sparkline";

// The leaderboard's top rows for the dashboard: followed strategies first, then the
// best live returns — so no position number, which would read as a rank. Panel chrome,
// so each row can be its own link.
//
// These rows keep their card treatment: unlike the ranking's list items, each one IS a
// link inside the widget's panel, so the border is the affordance, not a second frame.

const notNull = (s: number[] | null): s is number[] => s !== null;

const QuantStrategiesList = ({rows, span}: {rows: StrategyLeaderboardRow[]; span: number}) => {
    const wide = span >= 8;
    const pickLive = (r: StrategyLeaderboardRow) => r.live?.spark ?? null;
    // Only at a wide span: a 48px curve squeezed beside a name in a 4-column widget is
    // decoration. The domain is shared across the rows shown, as on the full ranking.
    const domain = wide && columnHasSpark(rows, pickLive) ? sparkDomain(rows.map(pickLive).filter(notNull)) : null;
    const unpriced = unpricedNote(rows);

    return (
        <div>
            {rows.length === 0 ? (
                <EmptyState
                    title="The strategies have not run yet."
                    description="The leaderboard fills on the first trading morning."
                    className="p-0"
                />
            ) : (
                <ul className="space-y-1.5" data-testid="quant-strategies-widget">
                    {rows.map((row) => {
                        const live = row.live;
                        return (
                            <li key={row.id}>
                                <Link href={`/strategies/${row.id}`} data-strategy={row.id}
                                      className="flex items-center justify-between gap-3 px-3 py-2 rounded-lg border bg-surface-2/40 border-line-strong/20 hover:border-brand/30 transition-colors">
                                    <div className="min-w-0">
                                        <div className="flex items-center gap-1.5">
                                            <span className="font-heading text-sm font-semibold text-fg truncate">{row.name}</span>
                                            {row.followed && (
                                                <>
                                                    <span className="material-symbols-outlined text-[14px] text-brand" style={{fontVariationSettings: "'FILL' 1"}} aria-hidden="true">star</span>
                                                    <span className="sr-only">Followed</span>
                                                </>
                                            )}
                                        </div>
                                        <MicroLabel as="div" className="truncate">
                                            {row.family}{wide ? ` · ${live ? 'since launch' : 'not started'}` : ''}
                                        </MicroLabel>
                                    </div>
                                    <div className="font-mono flex items-center gap-2 shrink-0">
                                        {domain && live && (
                                            <Sparkline values={live.spark} min={domain.min} max={domain.max} basis="live"
                                                       label={`${row.name}: live equity curve, now ${formatPct(live.totalReturnPct)}`}
                                                       className="w-12" />
                                        )}
                                        <div className="text-right">
                                            <div className={cn('text-sm', live ? getChangeColorClass(signedForColor(live.totalReturnPct)) : 'text-fg-muted')}>
                                                {live ? formatPct(live.totalReturnPct) : 'not started'}
                                            </div>
                                            <div className="text-[10px] text-fg-muted">
                                                {live ? `vs SPY ${formatPct(excessReturnPct(live))}` : ''}
                                            </div>
                                        </div>
                                    </div>
                                </Link>
                            </li>
                        );
                    })}
                </ul>
            )}
            {unpriced && (
                <p className="font-mono mt-2 text-[10px] text-fg-muted">
                    {unpriced.mode === 'panel' ? unpriced.text : unpriced.legend}
                </p>
            )}
            <Link href="/strategies" className="font-mono inline-block mt-3 text-xs text-brand hover:underline">
                Full leaderboard →
            </Link>
        </div>
    );
};

export default QuantStrategiesList;
