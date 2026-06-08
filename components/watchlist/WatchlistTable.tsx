import Link from "next/link";
import {cn} from "@/lib/utils";
import WatchlistButton from "@/components/watchlist/WatchlistButton";

const WatchlistTable = ({watchlist}: WatchlistTableProps) => {
    return (
        <div className="space-y-2">
            {/* Table Header */}
            <div className="hidden md:grid grid-cols-[2fr_1fr_1fr_1fr_1fr_80px] gap-4 px-4 py-2 border-b border-[rgba(59,73,75,0.3)]"
                 style={{ fontFamily: 'var(--font-jetbrains)', fontSize: '10px', letterSpacing: '0.1em', textTransform: 'uppercase', color: '#849495' }}>
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
                    className="group grid grid-cols-1 md:grid-cols-[2fr_1fr_1fr_1fr_1fr_80px] gap-4 items-center px-4 py-4 rounded-xl transition-all cursor-pointer relative overflow-hidden border bg-[rgba(30,32,36,0.4)] border-[rgba(59,73,75,0.2)] hover:bg-[rgba(30,32,36,0.6)] hover:border-[rgba(59,73,75,0.6)]"
                    style={{
                        backdropFilter: 'blur(12px)',
                    }}
                >
                    {/* Active Edge Glow */}
                    <div className="absolute left-0 top-0 bottom-0 w-[2px] bg-gradient-to-b from-transparent via-[rgba(125,244,255,0.5)] to-transparent opacity-0 group-hover:opacity-100 transition-opacity"></div>

                    {/* Asset Info */}
                    <div className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded flex items-center justify-center text-xs font-bold"
                             style={{
                                 backgroundColor: '#333539',
                                 color: '#7df4ff',
                                 fontFamily: 'var(--font-sora)',
                                 border: '1px solid rgba(125, 244, 255, 0.2)',
                             }}>
                            {row.symbol.slice(0, 2)}
                        </div>
                        <div>
                            <Link href={`/stocks/${row.symbol}`}
                                  className="font-bold text-sm text-[#e2e2e8] hover:text-[#7df4ff] transition-colors"
                                  style={{ fontFamily: 'var(--font-jetbrains)', letterSpacing: '0.02em' }}>
                                {row.symbol}
                            </Link>
                            <div className="text-[11px] leading-tight mt-0.5 text-[#b9cacb]"
                                 style={{ fontFamily: 'var(--font-hanken)' }}>
                                <Link href={`/stocks/${row.symbol}`} className="hover:text-[#7df4ff] transition-colors">
                                    {row.company}
                                </Link>
                            </div>
                        </div>
                    </div>

                    {/* Price */}
                    <div className="text-right text-[#e2e2e8]"
                         style={{ fontFamily: 'var(--font-jetbrains)', letterSpacing: '0.02em' }}>
                        {row.priceFormatted ?? '—'}
                    </div>

                    {/* Change */}
                    <div className="text-right">
                        {row.changePercent !== undefined ? (
                            <span
                                className={cn(
                                    "inline-block px-2 py-0.5 rounded text-xs",
                                    row.changePercent > 0
                                        ? "bg-[rgba(125,244,255,0.1)] text-[#7df4ff] border border-[rgba(125,244,255,0.2)]"
                                        : row.changePercent < 0
                                        ? "bg-[rgba(255,180,171,0.1)] text-[#ffb4ab] border border-[rgba(255,180,171,0.2)]"
                                        : "text-[#849495]"
                                )}
                                style={{ fontFamily: 'var(--font-jetbrains)', letterSpacing: '0.02em' }}
                            >
                                {row.changeFormatted ?? '—'}
                            </span>
                        ) : (
                            <span className="text-[#849495]">—</span>
                        )}
                    </div>

                    {/* Market Cap */}
                    <div className="text-right text-[#b9cacb]"
                         style={{ fontFamily: 'var(--font-jetbrains)', letterSpacing: '0.02em', fontSize: '14px' }}>
                        {row.marketCap ?? '—'}
                    </div>

                    {/* P/E Ratio */}
                    <div className="text-right text-[#b9cacb]"
                         style={{ fontFamily: 'var(--font-jetbrains)', letterSpacing: '0.02em', fontSize: '14px' }}>
                        {row.peRatio ?? '—'}
                    </div>

                    {/* Actions */}
                    <div className="flex items-center justify-end gap-1 opacity-50 group-hover:opacity-100 transition-opacity">
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
