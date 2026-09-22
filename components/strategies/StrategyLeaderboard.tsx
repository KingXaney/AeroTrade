import Link from "next/link";
import type {CSSProperties} from "react";
import {cn, getChangeColorClass} from "@/lib/utils";
import {unpricedLabel} from "@/lib/trading/analytics";
import {excessReturnPct, formatDrawdown, formatPct, roundPct, signedForColor, type StrategyLeaderboardRow} from "@/lib/strategies/views";
import FollowStar from "@/components/strategies/FollowStar";

// The ranking: every quant strategy side by side, ordered by its LIVE return. The
// simulated columns sit apart, dimmed and chip-labelled, so the two bases never read
// as one number. The whole row is clickable through a stretched link on the name, so the
// follow star can be a sibling of the link rather than a button nested inside it.

const rankStyle = (rank: number): CSSProperties | undefined =>
    rank >= 1 && rank <= 3 ? {color: `var(--rank-${rank})`} : undefined;


const CADENCE_LABEL: Record<StrategyLeaderboardRow['cadence'], string> = {
    once: 'buy once',
    daily: 'daily',
    monthly: 'monthly',
    quarterly: 'quarterly',
};

const Cell = ({label, className, children}: {label: string; className?: string; children: React.ReactNode}) => (
    <div className={cn('flex justify-between md:block md:text-right text-sm', className)} style={{fontFamily: 'var(--type-mono)'}}>
        <span className="md:hidden text-[10px] uppercase tracking-[0.1em] text-fg-muted mr-2">{label}</span>
        <span>{children}</span>
    </div>
);

const GRID = 'md:grid-cols-[2.2fr_1fr_0.9fr_0.9fr_0.8fr_1.6fr_1.4fr]';

const StrategyLeaderboard = ({rows, canFollow}: {rows: StrategyLeaderboardRow[]; canFollow: boolean}) => {
    // Ranks count only started rows; rows come pre-sorted with the pending ones last.
    const ranks = rows.map((row, i) => (row.live === null ? null : rows.slice(0, i).filter((r) => r.live !== null).length + 1));
    return (
        <div className="space-y-2" data-testid="strategy-leaderboard">
            <div className={cn('hidden md:grid gap-4 px-4 py-2 border-b border-line-strong/30', GRID)}
                 style={{fontFamily: 'var(--type-mono)', fontSize: '10px', letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--fg-muted)'}}>
                <div>Strategy</div>
                <div className="text-right">Live return</div>
                <div className="text-right">vs SPY</div>
                <div className="text-right">Max drawdown</div>
                <div className="text-right">Win rate</div>
                <div className="text-right">Last action</div>
                <div className="text-right text-fg-muted/70">Simulated 3y</div>
            </div>

            {rows.map((row, i) => {
                const rank = ranks[i] ?? 0;
                const started = rank > 0;
                const live = row.live;
                const unpriced = live ? unpricedLabel(live.unpriced, live.holdings) : null;
                return (
                    <div
                        key={row.id}
                        data-strategy={row.id}
                        data-rank={started ? rank : undefined}
                        className={cn(
                            'relative grid grid-cols-1 gap-1.5 md:gap-4 items-center px-4 py-3 rounded-xl border transition-colors',
                            GRID,
                            'bg-surface-2/40 border-line-strong/20 hover:border-brand/30',
                            !started && 'opacity-80',
                        )}
                    >
                        <div className="flex items-center gap-3 min-w-0">
                            <span className={cn('w-5 text-center text-sm font-bold', started && rank <= 3 ? '' : 'text-fg-muted')}
                                  style={{fontFamily: 'var(--type-mono)', ...(started ? rankStyle(rank) : {})}}>
                                {started ? rank : '·'}
                            </span>
                            <div className="min-w-0">
                                <div className="flex items-center gap-2">
                                    <Link href={`/strategies/${row.id}`}
                                          className="text-sm font-semibold text-fg truncate after:absolute after:inset-0 after:rounded-xl"
                                          style={{fontFamily: 'var(--type-display)'}}>
                                        {row.name}
                                    </Link>
                                    {canFollow && <FollowStar slug={row.id} name={row.name} followed={row.followed} className="relative z-10" />}
                                </div>
                                <div className="text-[10px] text-fg-muted uppercase tracking-[0.08em]" style={{fontFamily: 'var(--type-mono)'}}>
                                    {row.family} · {CADENCE_LABEL[row.cadence]}
                                    {live && <span className="normal-case tracking-normal"> · {live.holdings} holding{live.holdings === 1 ? '' : 's'}</span>}
                                    {!started && <span className="text-warning normal-case tracking-normal"> · not started</span>}
                                </div>
                            </div>
                        </div>

                        <Cell label="Live return" className={live ? getChangeColorClass(signedForColor(live.totalReturnPct)) : 'text-fg-muted'}>
                            {live ? formatPct(live.totalReturnPct) : '—'}
                            {unpriced && <span className="block text-[10px] text-warning">{unpriced}</span>}
                        </Cell>
                        <Cell label="vs SPY" className={live && excessReturnPct(live) !== null ? getChangeColorClass(signedForColor(excessReturnPct(live))) : 'text-fg-muted'}>
                            {live ? formatPct(excessReturnPct(live)) : '—'}
                        </Cell>
                        <Cell label="Max drawdown" className={live && live.maxDrawdownPct !== null && roundPct(live.maxDrawdownPct) > 0 ? 'text-negative' : 'text-fg-soft'}>
                            {live ? formatDrawdown(live.maxDrawdownPct) : '—'}
                        </Cell>
                        <Cell label="Win rate" className="text-fg-soft">
                            {live && live.winRatePct !== null ? `${live.winRatePct.toFixed(0)}%` : '—'}
                        </Cell>
                        <Cell label="Last action" className="text-fg-soft text-xs md:text-[11px]">
                            {row.lastAction}
                        </Cell>
                        <Cell label="Simulated 3y" className="text-fg-muted">
                            {row.simulated ? (
                                <span title={`Backtest ${row.simulated.from} → ${row.simulated.to}, next-open fills, no fees`}>
                                    {formatPct(row.simulated.stats.totalReturnPct, 1)}
                                    <span className="text-fg-muted/70"> · dd {formatDrawdown(row.simulated.stats.maxDrawdownPct)}</span>
                                </span>
                            ) : 'not computed'}
                        </Cell>
                    </div>
                );
            })}
        </div>
    );
};

export default StrategyLeaderboard;
