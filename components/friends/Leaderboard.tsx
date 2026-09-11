import Link from "next/link";
import {cn, formatPrice, getChangeColorClass} from "@/lib/utils";

// Medal colours come from --rank-* in globals.css, not the palette registry: gold is a
// material, not a semantic role, so it stays gold in every theme (darkened under the
// light palettes, where #ffd700 is unreadable).
const rankStyle = (rank: number): React.CSSProperties | undefined =>
    rank >= 1 && rank <= 3 ? {color: `var(--rank-${rank})`} : undefined;

const rankClass = (rank: number) => (rank >= 1 && rank <= 3 ? '' : 'text-fg-muted');

const Leaderboard = ({entries}: {entries: LeaderboardEntry[]}) => {
    return (
        <div className="glass-panel rounded-xl p-5 shimmer">
            <div className="flex items-center gap-2 mb-4">
                <span className="material-symbols-outlined text-brand">emoji_events</span>
                <h2 className="text-sm font-bold uppercase tracking-[0.1em] text-brand" style={{fontFamily: 'var(--type-mono)'}}>
                    Leaderboard
                </h2>
            </div>

            {entries.length <= 1 ? (
                <p className="text-sm text-fg-muted">
                    Add friends to start competing. Your rank appears here once you and your friends are connected.
                </p>
            ) : (
                <div className="space-y-1.5">
                    {entries.map((e, i) => {
                        const rank = i + 1;
                        const row = (
                            <div className={cn(
                                'flex items-center justify-between px-4 py-3 rounded-lg border transition-colors',
                                e.isYou
                                    ? 'bg-brand-strong/6 border-brand/25'
                                    : 'bg-surface-2/40 border-line-strong/20 hover:border-brand/30',
                            )}>
                                <div className="flex items-center gap-3">
                                    <span className={cn('w-5 text-center font-bold', rankClass(rank))} style={{fontFamily: 'var(--type-mono)', ...rankStyle(rank)}}>
                                        {rank}
                                    </span>
                                    <div>
                                        <span className="text-sm font-semibold text-fg" style={{fontFamily: 'var(--type-display)'}}>
                                            {e.name}
                                        </span>
                                        <div className="text-[10px] text-fg-muted uppercase tracking-[0.08em]" style={{fontFamily: 'var(--type-mono)'}}>
                                            {e.accountName}
                                        </div>
                                    </div>
                                    {!e.isYou && <span className="material-symbols-outlined text-sm text-fg-muted">chevron_right</span>}
                                </div>
                                <div className="text-right" style={{fontFamily: 'var(--type-mono)'}}>
                                    <div className="text-sm text-fg">{formatPrice(e.totalValue)}</div>
                                    <div className={cn('text-xs', getChangeColorClass(e.totalReturnPct || undefined))}>
                                        {e.totalReturnPct >= 0 ? '+' : ''}{e.totalReturnPct.toFixed(2)}%
                                    </div>
                                </div>
                            </div>
                        );
                        return e.isYou ? (
                            <div key={e.id}>{row}</div>
                        ) : (
                            <Link key={e.id} href={`/friends/${e.id}`} className="block">{row}</Link>
                        );
                    })}
                </div>
            )}
        </div>
    );
};

export default Leaderboard;
