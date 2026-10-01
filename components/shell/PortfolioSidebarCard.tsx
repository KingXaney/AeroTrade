import Link from "next/link";
import {cn} from "@/lib/utils";
import {formatPct, formatPrice, getChangeColorClass} from "@/lib/format";
import type {SidebarPortfolio} from "@/lib/shell/sidebar";

// Compact, glanceable portfolio summary for the left sidebar, under the topics card
// (Sidebar.tsx); links through to the full /portfolio page.
const PortfolioSidebarCard = ({portfolio}: {portfolio: SidebarPortfolio}) => {
    return (
        <Link
            href="/portfolio"
            className="relative block rounded-xl p-4 mb-6 shimmer overflow-hidden transition-all hover:brightness-110 bg-brand/6 border border-brand/15"
        >
            <div className="relative z-10">
                <div className="flex items-center gap-3 mb-2">
                    <span className="material-symbols-outlined text-brand"
                          style={{fontVariationSettings: "'FILL' 1"}}
                    >account_balance_wallet</span>
                    <span className="text-brand text-xs font-bold tracking-[0.1em] uppercase font-mono"
                    >Portfolio</span>
                </div>

                <p className="text-2xl font-semibold text-fg font-heading"
                >{formatPrice(portfolio.totalValue)}</p>
                <p className="text-sm font-mono">
                    <span className={getChangeColorClass(portfolio.totalReturnPct)}>
                        {formatPct(portfolio.totalReturnPct)}
                    </span>
                    <span className="text-fg-muted text-xs"> total return</span>
                    {/* The headline return includes holdings valued at cost; say so in the
                        one place on every page that quotes it without the summary panel. */}
                    {portfolio.unpriced > 0 && (
                        <span className="text-warning text-xs"> · {portfolio.unpriced} unpriced</span>
                    )}
                </p>
                {portfolio.accountsCount > 1 && (
                    <p className="text-[10px] uppercase tracking-[0.08em] text-fg-muted mt-1 font-mono">
                        All {portfolio.accountsCount} accounts
                    </p>
                )}

                <div className="mt-3 pt-3 border-t border-brand/12 flex items-center justify-between">
                    <span className="text-[10px] uppercase tracking-[0.1em] text-fg-muted font-mono">Cash</span>
                    <span className="text-xs text-fg-soft font-mono">{formatPrice(portfolio.cash)}</span>
                </div>

                {portfolio.top.length > 0 ? (
                    <div className="mt-3 space-y-1.5">
                        {portfolio.top.map((h) => (
                            <div key={h.symbol} className="flex items-center justify-between">
                                <span className="text-xs font-bold text-fg font-mono">
                                    {h.symbol} <span className="text-fg-muted font-normal">×{h.quantity}</span>
                                </span>
                                {h.priceStale ? (
                                    <span className="text-xs text-fg-muted font-mono" title="No live quote">—</span>
                                ) : (
                                    <span className={cn('font-mono text-xs', getChangeColorClass(h.unrealizedPnlPct))}>
                                        {formatPct(h.unrealizedPnlPct)}
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
