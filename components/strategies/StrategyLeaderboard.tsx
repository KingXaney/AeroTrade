import Link from "next/link";
import type {CSSProperties} from "react";
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
import MicroLabel from "@/components/primitives/MicroLabel";
import FollowStar from "@/components/strategies/FollowStar";
import Sparkline from "@/components/strategies/Sparkline";

// The ranking: every quant strategy side by side, ordered by its LIVE return, with the
// simulated record kept in its own dimmed column so the two bases never read as one.
//
// Only columns that carry information are here. Win rate (no closed trades yet), last
// action (the same string on every row) and max drawdown (0.00% on half of them) used to
// fill three of seven columns with nothing, which is what made the table look generated.
// Drawdown still lives on the detail page, where it has a curve next to it.
//
// Rows are list items with a hairline, not cards: a bordered rounded row inside a
// bordered rounded panel gives the eye two frames and no hierarchy.

const rankStyle = (rank: number): CSSProperties | undefined =>
    rank >= 1 && rank <= 3 ? {color: `var(--rank-${rank})`} : undefined;

const CADENCE_LABEL: Record<StrategyLeaderboardRow['cadence'], string> = {
    once: 'buy once',
    daily: 'daily',
    monthly: 'monthly',
    quarterly: 'quarterly',
};

// One source for the header and the cells, so the two cannot drift apart. (They had:
// the header set its type in an inline style object while the rows used Tailwind.)
const COLUMNS = [
    {key: 'name', label: 'Strategy', align: 'text-left'},
    {key: 'live', label: 'Live return', align: 'text-right'},
    {key: 'excess', label: 'vs SPY', align: 'text-right'},
    {key: 'simulated', label: 'Simulated 3y', align: 'text-right'},
] as const;

const GRID = 'md:grid-cols-[2.4fr_minmax(9.5rem,1.3fr)_minmax(5rem,0.8fr)_minmax(9.5rem,1.3fr)]';

const notNull = (s: number[] | null): s is number[] => s !== null;

const StrategyLeaderboard = ({rows, canFollow}: {rows: StrategyLeaderboardRow[]; canFollow: boolean}) => {
    // Ranks count only started rows; rows come pre-sorted with the pending ones last.
    const ranks = rows.map((row, i) => (row.live === null ? null : rows.slice(0, i).filter((r) => r.live !== null).length + 1));

    // A column draws all of its sparks or none of them, on one shared y-domain.
    const pickLive = (r: StrategyLeaderboardRow) => r.live?.spark ?? null;
    const pickSim = (r: StrategyLeaderboardRow) => r.simulated?.spark ?? null;
    const liveDomain = columnHasSpark(rows, pickLive) ? sparkDomain(rows.map(pickLive).filter(notNull)) : null;
    const simDomain = columnHasSpark(rows, pickSim) ? sparkDomain(rows.map(pickSim).filter(notNull)) : null;

    const unpriced = unpricedNote(rows);
    const marker = unpriced?.mode === 'marker';

    return (
        <div data-testid="strategy-leaderboard">
            <div className={cn('hidden md:grid gap-4 px-4 py-2 border-b border-line-strong/30', GRID)}>
                {COLUMNS.map((c) => <MicroLabel key={c.key} className={c.align}>{c.label}</MicroLabel>)}
            </div>

            <ul>
                {rows.map((row, i) => {
                    const rank = ranks[i] ?? 0;
                    const started = rank > 0;
                    const live = row.live;
                    const excess = live ? excessReturnPct(live) : null;
                    const atCost = marker && !!live && live.unpriced > 0;
                    return (
                        <li
                            key={row.id}
                            data-strategy={row.id}
                            data-rank={started ? rank : undefined}
                            className={cn(
                                'relative grid grid-cols-1 gap-1 md:gap-4 md:items-center px-4 py-3 transition-colors',
                                'border-b border-line-strong/15 last:border-b-0 hover:bg-surface-2/30',
                                GRID,
                                !started && 'opacity-80',
                            )}
                        >
                            <div className="flex items-center gap-3 min-w-0">
                                <span className={cn('font-mono w-5 text-center text-sm font-bold', started && rank <= 3 ? '' : 'text-fg-muted')}
                                      style={started ? rankStyle(rank) : undefined}>
                                    {started ? rank : '·'}
                                </span>
                                <div className="min-w-0">
                                    <div className="flex items-center gap-2">
                                        <Link href={`/strategies/${row.id}`}
                                              className="font-heading text-sm font-semibold text-fg truncate after:absolute after:inset-0">
                                            {row.name}
                                        </Link>
                                        {canFollow && <FollowStar slug={row.id} name={row.name} followed={row.followed} className="relative z-10" />}
                                    </div>
                                    <MicroLabel as="div">
                                        {row.family} · {CADENCE_LABEL[row.cadence]}
                                        {live && <span className="normal-case tracking-normal"> · {live.holdings} holding{live.holdings === 1 ? '' : 's'}</span>}
                                        {!started && <span className="text-warning normal-case tracking-normal"> · not started</span>}
                                    </MicroLabel>
                                </div>
                            </div>

                            <div data-cell="live"
                                 className={cn('font-mono text-sm flex items-center gap-2 md:justify-end',
                                     live ? getChangeColorClass(signedForColor(live.totalReturnPct)) : 'text-fg-muted')}>
                                {liveDomain && live && (
                                    <Sparkline values={live.spark} min={liveDomain.min} max={liveDomain.max} basis="live"
                                               label={`${row.name}: live equity curve, now ${formatPct(live.totalReturnPct)}`} />
                                )}
                                <span>
                                    {live ? formatPct(live.totalReturnPct) : '—'}
                                    {atCost && <><span aria-hidden="true">*</span><span className="sr-only"> (valued at cost)</span></>}
                                </span>
                            </div>

                            <div data-cell="excess"
                                 className={cn('font-mono text-sm md:text-right',
                                     excess !== null ? getChangeColorClass(signedForColor(excess)) : 'text-fg-muted')}>
                                <span className="md:hidden text-fg-muted">vs SPY </span>
                                {formatPct(excess)}
                            </div>

                            <div data-cell="simulated" className="font-mono text-sm text-fg-muted flex items-center gap-2 md:justify-end">
                                {row.simulated ? (
                                    <>
                                        <span className="md:hidden">sim 3y</span>
                                        {simDomain && (
                                            <Sparkline values={row.simulated.spark} min={simDomain.min} max={simDomain.max} basis="simulated"
                                                       label={`${row.name}: simulated three-year curve, ending ${formatPct(row.simulated.stats.totalReturnPct, 1)}`} />
                                        )}
                                        <span title={`Backtest ${row.simulated.from} → ${row.simulated.to}, next-open fills, no fees`}>
                                            {formatPct(row.simulated.stats.totalReturnPct, 1)}
                                        </span>
                                    </>
                                ) : <span>not computed</span>}
                            </div>
                        </li>
                    );
                })}
            </ul>

            {/* One note for the whole ranking. The same caveat under all eight returns
                stopped being a warning and became wallpaper. */}
            {unpriced && (
                <p className="font-mono mt-3 px-4 text-[10px] text-fg-muted">
                    {unpriced.mode === 'panel' ? unpriced.text : unpriced.legend}
                </p>
            )}
        </div>
    );
};

export default StrategyLeaderboard;
