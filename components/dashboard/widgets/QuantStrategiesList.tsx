import Link from "next/link";
import {cn, getChangeColorClass} from "@/lib/utils";
import {unpricedLabel} from "@/lib/trading/analytics";
import {excessReturnPct, formatPct, signedForColor, type StrategyLeaderboardRow} from "@/lib/strategies/views";

// The leaderboard's top rows for the dashboard: followed strategies first, then the
// best live returns — so no position number, which would read as a rank. Panel chrome,
// so each row can be its own link.

const QuantStrategiesList = ({rows, span}: {rows: StrategyLeaderboardRow[]; span: number}) => {
    const wide = span >= 8;
    return (
        <div>
            {rows.length === 0 ? (
                <p className="text-sm text-fg-muted">The strategies have not run yet — the leaderboard fills on the first trading morning.</p>
            ) : (
                <ul className="space-y-1.5" data-testid="quant-strategies-widget">
                    {rows.map((row) => {
                        const live = row.live;
                        const unpriced = live ? unpricedLabel(live.unpriced, live.holdings) : null;
                        return (
                            <li key={row.id}>
                                <Link href={`/strategies/${row.id}`} data-strategy={row.id}
                                      className="flex items-center justify-between gap-3 px-3 py-2 rounded-lg border bg-surface-2/40 border-line-strong/20 hover:border-brand/30 transition-colors">
                                    <div className="flex items-center gap-2 min-w-0">
                                        <div className="min-w-0">
                                            <div className="flex items-center gap-1.5">
                                                <span className="text-sm font-semibold text-fg truncate" style={{fontFamily: 'var(--type-display)'}}>{row.name}</span>
                                                {row.followed && (
                                                    <>
                                                        <span className="material-symbols-outlined text-[14px] text-brand" style={{fontVariationSettings: "'FILL' 1"}} aria-hidden="true">star</span>
                                                        <span className="sr-only">Followed</span>
                                                    </>
                                                )}
                                            </div>
                                            <div className="text-[10px] uppercase tracking-[0.08em] text-fg-muted truncate" style={{fontFamily: 'var(--type-mono)'}}>
                                                {row.family}{wide ? ` · ${row.lastAction}` : ''}
                                            </div>
                                        </div>
                                    </div>
                                    <div className="text-right shrink-0" style={{fontFamily: 'var(--type-mono)'}}>
                                        <div className={cn('text-sm', live ? getChangeColorClass(signedForColor(live.totalReturnPct)) : 'text-fg-muted')}>
                                            {live ? formatPct(live.totalReturnPct) : 'not started'}
                                        </div>
                                        <div className="text-[10px] text-fg-muted">
                                            {unpriced ? <span className="text-warning">{unpriced}</span> : live ? `vs SPY ${formatPct(excessReturnPct(live))}` : ''}
                                        </div>
                                    </div>
                                </Link>
                            </li>
                        );
                    })}
                </ul>
            )}
            <Link href="/strategies" className="inline-block mt-3 text-xs text-brand hover:underline" style={{fontFamily: 'var(--type-mono)'}}>
                Full leaderboard →
            </Link>
        </div>
    );
};

export default QuantStrategiesList;
