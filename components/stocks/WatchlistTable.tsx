import Link from "next/link";
import {cn} from "@/lib/utils";
import {roundPct} from "@/lib/format";
import WatchlistButton from "@/components/stocks/WatchlistButton";
import TradeLink from "@/components/trading/TradeLink";
import Term from "@/components/primitives/Term";
import WhatTheseMean from "@/components/learn/WhatTheseMean";
import Panel from "@/components/primitives/Panel";
import type {StockWithData} from '@/lib/stocks/types';
import MicroLabel from "@/components/primitives/MicroLabel";

type WatchlistTableProps = {
    watchlist: StockWithData[];
};

const WatchlistTable = ({watchlist}: WatchlistTableProps) => {
    return (
        <div className="space-y-2">
            {/* Table Header */}
            <div className="hidden md:grid grid-cols-[2fr_1fr_1fr_1fr_1fr_112px] gap-4 px-4 py-2 border-b border-line-strong/30 label-type text-[length:var(--label-size)] text-fg-muted">
                <div>Asset</div>
                <div className="text-right">Price (USD)</div>
                <div className="text-right">24h Chg</div>
                <div className="text-right"><Term k="market-cap">Market Cap</Term></div>
                <div className="text-right"><Term k="pe-ratio">P/E Ratio</Term></div>
                <div className="text-right">Actions</div>
            </div>

            {/* Asset Rows — the theme's own surface, so every visual style frames them. The
                symbol, company and action links navigate; the row itself does not. */}
            {watchlist.map((row) => (
                <Panel
                    as="div"
                    pad={4}
                    key={row.symbol}
                    className="group grid grid-cols-1 md:grid-cols-[2fr_1fr_1fr_1fr_1fr_112px] gap-2 md:gap-4 items-center"
                >
                    {/* Active Edge Glow */}
                    <div className="absolute left-0 top-0 bottom-0 w-[2px] bg-gradient-to-b from-transparent via-brand/50 to-transparent opacity-0 group-hover:opacity-100 transition-opacity"></div>

                    {/* Asset Info */}
                    <div className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded flex items-center justify-center text-xs font-bold font-heading bg-surface-4 text-brand border border-brand/20">
                            {row.symbol.slice(0, 2)}
                        </div>
                        <div>
                            <Link href={`/stocks/${row.symbol}`}
                                  className="font-bold text-sm text-fg hover:text-brand transition-colors font-mono"
                                  style={{ letterSpacing: '0.02em' }}>
                                {row.symbol}
                            </Link>
                            <div className="text-[11px] leading-tight mt-0.5 text-fg-soft font-sans">
                                <Link href={`/stocks/${row.symbol}`} className="hover:text-brand transition-colors">
                                    {row.company}
                                </Link>
                            </div>
                        </div>
                    </div>

                    {/* Below md the header row is hidden, so each cell names itself. */}
                    <div className="flex justify-between md:block md:text-right text-fg font-mono"
                         style={{ letterSpacing: '0.02em' }}>
                        <MicroLabel className="md:hidden mr-2">Price</MicroLabel>
                        {row.priceFormatted ?? '—'}
                    </div>

                    {/* Change */}
                    <div className="flex justify-between md:block md:text-right">
                        <span className="label-type md:hidden text-[length:var(--label-size)] text-fg-muted mr-2">24h Chg</span>
                        {row.changePercent !== undefined ? (
                            <span
                                className={cn(
                                    "font-mono inline-block px-2 py-0.5 rounded text-xs",
                                    roundPct(row.changePercent) > 0
                                        ? "bg-positive/10 text-positive border border-positive/20"
                                        : roundPct(row.changePercent) < 0
                                        ? "bg-negative/10 text-negative border border-negative/20"
                                        : "text-fg-muted"
                                )}
                                style={{ letterSpacing: '0.02em' }}
                            >
                                {row.changeFormatted ?? '—'}
                            </span>
                        ) : (
                            <span className="text-fg-muted">—</span>
                        )}
                    </div>

                    {/* Market Cap */}
                    <div className="flex justify-between md:block md:text-right text-fg-soft font-mono"
                         style={{ letterSpacing: '0.02em', fontSize: '14px' }}>
                        <MicroLabel className="md:hidden mr-2">Market Cap</MicroLabel>
                        {row.marketCap ?? '—'}
                    </div>

                    {/* P/E Ratio */}
                    <div className="flex justify-between md:block md:text-right text-fg-soft font-mono"
                         style={{ letterSpacing: '0.02em', fontSize: '14px' }}>
                        <MicroLabel className="md:hidden mr-2">P/E Ratio</MicroLabel>
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
                </Panel>
            ))}
            <WhatTheseMean keys={['market-cap', 'pe-ratio']} />
        </div>
    );
};

export default WatchlistTable;
