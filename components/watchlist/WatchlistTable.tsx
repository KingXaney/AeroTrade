import Link from "next/link";
import {WATCHLIST_TABLE_HEADER} from "@/lib/constants";
import {getChangeColorClass, cn} from "@/lib/utils";
import WatchlistButton from "@/components/watchlist/WatchlistButton";

const cellClass = 'px-4 py-3 text-sm';

const WatchlistTable = ({watchlist}: WatchlistTableProps) => {
    return (
        <div className="overflow-x-auto rounded-lg border border-gray-800 bg-gray-900/40">
            <table className="w-full min-w-[720px] border-collapse">
                <thead>
                    <tr className="border-b border-gray-800 text-left text-xs uppercase tracking-wider text-gray-500">
                        {WATCHLIST_TABLE_HEADER.map((h) => (
                            <th key={h} className={cn(cellClass, 'font-medium')}>{h}</th>
                        ))}
                    </tr>
                </thead>
                <tbody>
                    {watchlist.map((row) => (
                        <tr
                            key={row.symbol}
                            className="border-b border-gray-800/60 hover:bg-gray-800/30 transition-colors"
                        >
                            <td className={cn(cellClass, 'text-gray-100 font-medium')}>
                                <Link href={`/stocks/${row.symbol}`} className="hover:text-yellow-500">
                                    {row.company}
                                </Link>
                            </td>
                            <td className={cn(cellClass, 'text-gray-300')}>
                                <Link href={`/stocks/${row.symbol}`} className="hover:text-yellow-500">
                                    {row.symbol}
                                </Link>
                            </td>
                            <td className={cn(cellClass, 'text-gray-100')}>
                                {row.priceFormatted ?? '—'}
                            </td>
                            <td className={cn(cellClass, getChangeColorClass(row.changePercent))}>
                                {row.changeFormatted ?? '—'}
                            </td>
                            <td className={cn(cellClass, 'text-gray-300')}>
                                {row.marketCap ?? '—'}
                            </td>
                            <td className={cn(cellClass, 'text-gray-300')}>
                                {row.peRatio ?? '—'}
                            </td>
                            <td className={cellClass}>
                                <span className="text-xs text-gray-500">—</span>
                            </td>
                            <td className={cn(cellClass, 'text-right')}>
                                <WatchlistButton
                                    symbol={row.symbol}
                                    company={row.company}
                                    isInWatchlist={true}
                                    showTrashIcon
                                    type="icon"
                                />
                            </td>
                        </tr>
                    ))}
                </tbody>
            </table>
        </div>
    );
};

export default WatchlistTable;
