import Link from "next/link";
import {cn, formatPrice, getChangeColorClass} from "@/lib/utils";

const rankColor = (rank: number) => {
    if (rank === 1) return 'text-[#ffd700]';
    if (rank === 2) return 'text-[#c0c8d0]';
    if (rank === 3) return 'text-[#cd7f32]';
    return 'text-[#849495]';
};

const Leaderboard = ({entries}: {entries: LeaderboardEntry[]}) => {
    return (
        <div className="glass-panel rounded-xl p-5 shimmer">
            <div className="flex items-center gap-2 mb-4">
                <span className="material-symbols-outlined text-[#7df4ff]">emoji_events</span>
                <h2 className="text-sm font-bold uppercase tracking-[0.1em] text-[#7df4ff]" style={{fontFamily: 'var(--font-jetbrains)'}}>
                    Leaderboard
                </h2>
            </div>

            {entries.length <= 1 ? (
                <p className="text-sm text-[#849495]">
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
                                    ? 'bg-[rgba(0,240,255,0.06)] border-[rgba(125,244,255,0.25)]'
                                    : 'bg-[rgba(30,32,36,0.4)] border-[rgba(59,73,75,0.2)] hover:border-[rgba(125,244,255,0.3)]',
                            )}>
                                <div className="flex items-center gap-3">
                                    <span className={cn('w-5 text-center font-bold', rankColor(rank))} style={{fontFamily: 'var(--font-jetbrains)'}}>
                                        {rank}
                                    </span>
                                    <span className="text-sm font-semibold text-[#e2e2e8]" style={{fontFamily: 'var(--font-sora)'}}>
                                        {e.name}
                                    </span>
                                    {!e.isYou && <span className="material-symbols-outlined text-sm text-[#849495]">chevron_right</span>}
                                </div>
                                <div className="text-right" style={{fontFamily: 'var(--font-jetbrains)'}}>
                                    <div className="text-sm text-[#e2e2e8]">{formatPrice(e.totalValue)}</div>
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
