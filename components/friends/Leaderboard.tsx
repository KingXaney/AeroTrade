import Link from "next/link";
import {cn} from "@/lib/utils";
import {formatPct, formatPrice, getChangeColorClass} from "@/lib/format";
import {unpricedLabel} from "@/lib/trading/analytics";
import type {LeaderboardEntry} from '@/lib/friends/types';
import Panel from '@/components/primitives/Panel';
import {rowCard} from "@/components/primitives/RowCard";

// Medal colours come from --rank-* in globals.css, not the palette registry: gold is a
// material, not a semantic role, so it stays gold in every theme (darkened under the
// light palettes, where #ffd700 is unreadable).
const rankStyle = (rank: number): React.CSSProperties | undefined =>
    rank >= 1 && rank <= 3 ? {color: `var(--rank-${rank})`} : undefined;

const rankClass = (rank: number) => (rank >= 1 && rank <= 3 ? '' : 'text-fg-muted');

const Leaderboard = ({entries}: {entries: LeaderboardEntry[]}) => {
    return (
        <Panel as="div" className="shimmer">
            <div className="flex items-center gap-2 mb-4">
                <span className="material-symbols-outlined text-brand">emoji_events</span>
                <h2 className="text-sm font-bold uppercase tracking-[0.1em] text-brand font-mono">
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
                            <div className={rowCard({
                                tone: e.isYou ? 'selected' : 'plain',
                                interactive: !e.isYou,
                                className: 'flex items-center justify-between transition-colors',
                            })}>
                                <div className="flex items-center gap-3">
                                    <span className={cn('font-mono w-5 text-center font-bold', rankClass(rank))} style={{...rankStyle(rank)}}>
                                        {rank}
                                    </span>
                                    <div>
                                        <span className="text-sm font-semibold text-fg font-heading">
                                            {e.name}
                                        </span>
                                        <div className="text-[10px] text-fg-muted uppercase tracking-[0.08em] font-mono">
                                            {e.accountName}
                                            {unpricedLabel(e.unpriced, e.holdings) && (
                                                <span className="text-warning normal-case tracking-normal"> · {unpricedLabel(e.unpriced, e.holdings)}</span>
                                            )}
                                        </div>
                                    </div>
                                    {!e.isYou && <span className="material-symbols-outlined text-sm text-fg-muted">chevron_right</span>}
                                </div>
                                <div className="text-right font-mono">
                                    <div className="text-sm text-fg">{formatPrice(e.totalValue)}</div>
                                    <div className={cn('text-xs', getChangeColorClass(e.totalReturnPct))}>
                                        {formatPct(e.totalReturnPct)}
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
        </Panel>
    );
};

export default Leaderboard;
