import Link from "next/link";
import {cn, formatPrice, getChangeColorClass} from "@/lib/utils";

// Compact, glanceable portfolio summary for the left sidebar. Mirrors the
// watchlist card pattern in Sidebar.tsx; links through to the full /portfolio page.
export type SidebarPortfolio = {
    totalValue: number;
    totalReturnPct: number;
    cash: number;
    strategiesCount: number;
    unpriced: number;      // holdings with no live quote, across every account
    top: {symbol: string; quantity: number; unrealizedPnlPct: number; priceStale: boolean}[];
};

const PortfolioSidebarCard = ({portfolio}: {portfolio: SidebarPortfolio}) => {
    const sign = portfolio.totalReturnPct >= 0 ? '+' : '';

    return (
        <Link
            href="/portfolio"
            className="relative block rounded-xl p-4 mb-6 shimmer overflow-hidden transition-all hover:brightness-110"
            style={{
                backgroundColor: 'color-mix(in srgb, var(--brand) 6%, transparent)',
                border: '1px solid color-mix(in srgb, var(--brand) 15%, transparent)',
            }}
        >
            <div className="relative z-10">
                <div className="flex items-center gap-3 mb-2">
                    <span className="material-symbols-outlined text-brand"
                          style={{fontVariationSettings: "'FILL' 1"}}
                    >account_balance_wallet</span>
                    <span className="text-brand text-xs font-bold tracking-[0.1em] uppercase"
                          style={{fontFamily: 'var(--type-mono)'}}
                    >Portfolio</span>
                </div>

                <p className="text-2xl font-semibold text-fg"
                   style={{fontFamily: 'var(--type-display)'}}
                >{formatPrice(portfolio.totalValue)}</p>
                <p className="text-sm" style={{fontFamily: 'var(--type-mono)'}}>
                    <span className={getChangeColorClass(portfolio.totalReturnPct || undefined)}>
                        {sign}{portfolio.totalReturnPct.toFixed(2)}%
                    </span>
                    <span className="text-fg-muted text-xs"> total return</span>
                    {/* The headline return includes holdings valued at cost; say so in the
                        one place on every page that quotes it without the summary panel. */}
                    {portfolio.unpriced > 0 && (
                        <span className="text-warning text-xs"> · {portfolio.unpriced} unpriced</span>
                    )}
                </p>
                {portfolio.strategiesCount > 1 && (
                    <p className="text-[10px] uppercase tracking-[0.08em] text-fg-muted mt-1" style={{fontFamily: 'var(--type-mono)'}}>
                        All accounts · {portfolio.strategiesCount} strategies
                    </p>
                )}

                <div className="mt-3 pt-3 border-t border-brand/12 flex items-center justify-between">
                    <span className="text-[10px] uppercase tracking-[0.1em] text-fg-muted"
                          style={{fontFamily: 'var(--type-mono)'}}>Cash</span>
                    <span className="text-xs text-fg-soft"
                          style={{fontFamily: 'var(--type-mono)'}}>{formatPrice(portfolio.cash)}</span>
                </div>

                {portfolio.top.length > 0 ? (
                    <div className="mt-3 space-y-1.5">
                        {portfolio.top.map((h) => (
                            <div key={h.symbol} className="flex items-center justify-between">
                                <span className="text-xs font-bold text-fg"
                                      style={{fontFamily: 'var(--type-mono)'}}>
                                    {h.symbol} <span className="text-fg-muted font-normal">×{h.quantity}</span>
                                </span>
                                {h.priceStale ? (
                                    <span className="text-xs text-fg-muted" style={{fontFamily: 'var(--type-mono)'}} title="No live quote">—</span>
                                ) : (
                                    <span className={cn('text-xs', getChangeColorClass(h.unrealizedPnlPct || undefined))}
                                          style={{fontFamily: 'var(--type-mono)'}}>
                                        {h.unrealizedPnlPct >= 0 ? '+' : ''}{h.unrealizedPnlPct.toFixed(2)}%
                                    </span>
                                )}
                            </div>
                        ))}
                    </div>
                ) : (
                    <p className="mt-3 text-xs text-fg-muted">No holdings yet — start trading.</p>
                )}
            </div>
        </Link>
    );
};

export default PortfolioSidebarCard;
