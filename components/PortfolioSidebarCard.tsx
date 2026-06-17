import Link from "next/link";
import {cn, formatPrice, getChangeColorClass} from "@/lib/utils";

// Compact, glanceable portfolio summary for the left sidebar. Mirrors the
// watchlist card pattern in Sidebar.tsx; links through to the full /portfolio page.
export type SidebarPortfolio = {
    totalValue: number;
    totalReturnPct: number;
    cash: number;
    top: {symbol: string; quantity: number; unrealizedPnlPct: number}[];
};

const PortfolioSidebarCard = ({portfolio}: {portfolio: SidebarPortfolio}) => {
    const sign = portfolio.totalReturnPct >= 0 ? '+' : '';

    return (
        <Link
            href="/portfolio"
            className="relative block rounded-xl p-4 mb-6 shimmer overflow-hidden transition-all hover:brightness-110"
            style={{
                backgroundColor: 'rgba(209, 188, 255, 0.06)',
                border: '1px solid rgba(209, 188, 255, 0.15)',
            }}
        >
            <div className="relative z-10">
                <div className="flex items-center gap-3 mb-2">
                    <span className="material-symbols-outlined text-[#d1bcff]"
                          style={{fontVariationSettings: "'FILL' 1"}}
                    >account_balance_wallet</span>
                    <span className="text-[#d1bcff] text-xs font-bold tracking-[0.1em] uppercase"
                          style={{fontFamily: 'var(--font-jetbrains)'}}
                    >Portfolio</span>
                </div>

                <p className="text-2xl font-semibold text-[#e2e2e8]"
                   style={{fontFamily: 'var(--font-sora)'}}
                >{formatPrice(portfolio.totalValue)}</p>
                <p className="text-sm" style={{fontFamily: 'var(--font-jetbrains)'}}>
                    <span className={getChangeColorClass(portfolio.totalReturnPct || undefined)}>
                        {sign}{portfolio.totalReturnPct.toFixed(2)}%
                    </span>
                    <span className="text-[#849495] text-xs"> total return</span>
                </p>

                <div className="mt-3 pt-3 border-t border-[rgba(209,188,255,0.12)] flex items-center justify-between">
                    <span className="text-[10px] uppercase tracking-[0.1em] text-[#849495]"
                          style={{fontFamily: 'var(--font-jetbrains)'}}>Cash</span>
                    <span className="text-xs text-[#b9cacb]"
                          style={{fontFamily: 'var(--font-jetbrains)'}}>{formatPrice(portfolio.cash)}</span>
                </div>

                {portfolio.top.length > 0 ? (
                    <div className="mt-3 space-y-1.5">
                        {portfolio.top.map((h) => (
                            <div key={h.symbol} className="flex items-center justify-between">
                                <span className="text-xs font-bold text-[#e2e2e8]"
                                      style={{fontFamily: 'var(--font-jetbrains)'}}>
                                    {h.symbol} <span className="text-[#849495] font-normal">×{h.quantity}</span>
                                </span>
                                <span className={cn('text-xs', getChangeColorClass(h.unrealizedPnlPct || undefined))}
                                      style={{fontFamily: 'var(--font-jetbrains)'}}>
                                    {h.unrealizedPnlPct >= 0 ? '+' : ''}{h.unrealizedPnlPct.toFixed(2)}%
                                </span>
                            </div>
                        ))}
                    </div>
                ) : (
                    <p className="mt-3 text-xs text-[#849495]">No holdings yet — start trading.</p>
                )}
            </div>
        </Link>
    );
};

export default PortfolioSidebarCard;
