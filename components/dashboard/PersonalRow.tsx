import Link from "next/link";
import {type ReactNode} from "react";
import {cn, formatPrice, formatChangePercent, getChangeColorClass} from "@/lib/utils";

// The dashboard's "your data first" row: portfolio snapshot, watchlist movers,
// and friends rank. Plain presentational component fed by existing server actions.
type Props = {
    portfolio: PortfolioSummary;
    movers: StockWithData[];
    leaderboard: LeaderboardEntry[];
};

const Card = ({href, label, children}: {href: string; label: string; children: ReactNode}) => (
    <Link href={href} className="glass-panel rounded-xl p-5 block transition-colors hover:border-[rgba(125,244,255,0.25)]">
        <div className="text-[10px] uppercase tracking-[0.14em] text-[#849495] mb-3" style={{fontFamily: 'var(--font-jetbrains)'}}>
            {label}
        </div>
        {children}
    </Link>
);

const PersonalRow = ({portfolio, movers, leaderboard}: Props) => {
    const sign = portfolio.totalReturnPct >= 0 ? '+' : '';
    const myRank = leaderboard.findIndex((e) => e.isYou) + 1;
    const hasFriends = leaderboard.length > 1;

    const topMovers = [...movers]
        .filter((m) => typeof m.changePercent === 'number')
        .sort((a, b) => Math.abs(b.changePercent as number) - Math.abs(a.changePercent as number))
        .slice(0, 4);

    return (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <Card href="/portfolio" label="Portfolio">
                <div className="text-2xl font-semibold text-[#e2e2e8]" style={{fontFamily: 'var(--font-sora)'}}>
                    {formatPrice(portfolio.totalValue)}
                </div>
                <div className={cn('text-sm mt-1', getChangeColorClass(portfolio.totalReturnPct || undefined))}
                     style={{fontFamily: 'var(--font-jetbrains)'}}>
                    {sign}{portfolio.totalReturnPct.toFixed(2)}% <span className="text-[#849495]">total return</span>
                </div>
                <div className="text-xs text-[#849495] mt-3" style={{fontFamily: 'var(--font-jetbrains)'}}>
                    Cash {formatPrice(portfolio.cash)}
                </div>
            </Card>

            <Card href="/watchlist" label="Watchlist movers">
                {topMovers.length > 0 ? (
                    <div className="space-y-2">
                        {topMovers.map((m) => (
                            <div key={m.symbol} className="flex items-center justify-between">
                                <span className="text-sm font-bold text-[#e2e2e8]" style={{fontFamily: 'var(--font-jetbrains)'}}>{m.symbol}</span>
                                <span className={cn('text-xs', getChangeColorClass(m.changePercent || undefined))}
                                      style={{fontFamily: 'var(--font-jetbrains)'}}>
                                    {formatChangePercent(m.changePercent) || '—'}
                                </span>
                            </div>
                        ))}
                    </div>
                ) : (
                    <p className="text-sm text-[#849495]">Add symbols to your watchlist to track movers.</p>
                )}
            </Card>

            <Card href="/friends" label="Friends">
                {hasFriends ? (
                    <>
                        <div className="text-2xl font-semibold text-[#e2e2e8]" style={{fontFamily: 'var(--font-sora)'}}>#{myRank}</div>
                        <div className="text-sm text-[#849495] mt-1" style={{fontFamily: 'var(--font-jetbrains)'}}>of {leaderboard.length} traders</div>
                        <div className="text-xs text-[#849495] mt-3" style={{fontFamily: 'var(--font-jetbrains)'}}>Leader: {leaderboard[0]?.name}</div>
                    </>
                ) : (
                    <p className="text-sm text-[#849495]">Add friends to start competing on returns.</p>
                )}
            </Card>
        </div>
    );
};

export default PersonalRow;
