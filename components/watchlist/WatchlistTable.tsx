import Link from "next/link";
import {cn} from "@/lib/utils";
import WatchlistButton from "@/components/watchlist/WatchlistButton";
import TradeLink from "@/components/trade/TradeLink";

const WatchlistTable = ({watchlist}: WatchlistTableProps) => {
    return (
        <div className="space-y-2">
            {/* Table Header */}
            <div className="hidden md:grid grid-cols-[2fr_1fr_1fr_1fr_1fr_112px] gap-4 px-4 py-2 border-b border-line-strong/30"
                 style={{ fontFamily: 'var(--type-mono)', fontSize: '10px', letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--fg-muted)' }}>
                <div>Asset / Protocol</div>
                <div className="text-right">Price (USD)</div>
                <div className="text-right">24h Chg</div>
                <div className="text-right">Market Cap</div>
                <div className="text-right">P/E Ratio</div>
                <div className="text-right">Actions</div>
            </div>

            {/* Asset Rows */}
            {watchlist.map((row) => (
                <div
                    key={row.symbol}
                    className="group grid grid-cols-1 md:grid-cols-[2fr_1fr_1fr_1fr_1fr_112px] gap-2 md:gap-4 items-center px-4 py-4 rounded-xl transition-all cursor-pointer relative overflow-hidden border bg-surface-2/40 border-line-strong/20 hover:bg-surface-2/60 hover:border-line-strong/60"
                    style={{
                        backdropFilter: 'blur(12px)',
                    }}
                >
                    {/* Active Edge Glow */}
                    <div className="absolute left-0 top-0 bottom-0 w-[2px] bg-gradient-to-b from-transparent via-brand/50 to-transparent opacity-0 group-hover:opacity-100 transition-opacity"></div>

                    {/* Asset Info */}
                    <div className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded flex items-center justify-center text-xs font-bold"
                             style={{
                                 backgroundColor: 'var(--surface-4)',
                                 color: 'var(--brand)',
                                 fontFamily: 'var(--type-display)',
                                 border: '1px solid color-mix(in srgb, var(--brand) 20%, transparent)',
                             }}>
                            {row.symbol.slice(0, 2)}
                        </div>
                        <div>
                            <Link href={`/stocks/${row.symbol}`}
                                  className="font-bold text-sm text-fg hover:text-brand transition-colors"
                                  style={{ fontFamily: 'var(--type-mono)', letterSpacing: '0.02em' }}>
                                {row.symbol}
                            </Link>
                            <div className="text-[11px] leading-tight mt-0.5 text-fg-soft"
                                 style={{ fontFamily: 'var(--type-body)' }}>
                                <Link href={`/stocks/${row.symbol}`} className="hover:text-brand transition-colors">
                                    {row.company}
                                </Link>
                            </div>
                        </div>
                    </div>

                    {/* Below md the header row is hidden, so each cell names itself. */}
                    <div className="flex justify-between md:block md:text-right text-fg"
                         style={{ fontFamily: 'var(--type-mono)', letterSpacing: '0.02em' }}>
                        <span className="md:hidden text-[10px] uppercase tracking-[0.1em] text-fg-muted mr-2">Price</span>
                        {row.priceFormatted ?? '—'}
                    </div>

                    {/* Change */}
                    <div className="flex justify-between md:block md:text-right">
                        <span className="md:hidden text-[10px] uppercase tracking-[0.1em] text-fg-muted mr-2">24h Chg</span>
                        {row.changePercent !== undefined ? (
                            <span
                                className={cn(
                                    "inline-block px-2 py-0.5 rounded text-xs",
                                    row.changePercent > 0
                                        ? "bg-positive/10 text-positive border border-positive/20"
                                        : row.changePercent < 0
                                        ? "bg-negative/10 text-negative border border-negative/20"
                                        : "text-fg-muted"
                                )}
                                style={{ fontFamily: 'var(--type-mono)', letterSpacing: '0.02em' }}
                            >
                                {row.changeFormatted ?? '—'}
                            </span>
                        ) : (
                            <span className="text-fg-muted">—</span>
                        )}
                    </div>

                    {/* Market Cap */}
                    <div className="flex justify-between md:block md:text-right text-fg-soft"
                         style={{ fontFamily: 'var(--type-mono)', letterSpacing: '0.02em', fontSize: '14px' }}>
                        <span className="md:hidden text-[10px] uppercase tracking-[0.1em] text-fg-muted mr-2">Market Cap</span>
                        {row.marketCap ?? '—'}
                    </div>

                    {/* P/E Ratio */}
                    <div className="flex justify-between md:block md:text-right text-fg-soft"
                         style={{ fontFamily: 'var(--type-mono)', letterSpacing: '0.02em', fontSize: '14px' }}>
                        <span className="md:hidden text-[10px] uppercase tracking-[0.1em] text-fg-muted mr-2">P/E Ratio</span>
                        {row.peRatio ?? '—'}
                    </div>

                    {/* Actions */}
                    <div className="flex items-center md:justify-end gap-1 md:opacity-50 group-hover:opacity-100 transition-opacity">
                        <TradeLink symbol={row.symbol} variant="icon" />
                        <WatchlistButton
                            symbol={row.symbol}
                            company={row.company}
                            isInWatchlist={true}
                            showTrashIcon
                            type="icon"
                        />
                    </div>
                </div>
            ))}
        </div>
    );
};

export default WatchlistTable;
