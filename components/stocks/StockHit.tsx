import {TrendingUp} from "lucide-react";
import type {Stock} from '@/lib/stocks/types';

// A stock as a search row draws it: the name over its symbol, exchange and type. The inside of
// one cmdk row, shared by ⌘K (components/shell/SearchCommand.tsx), where the row opens the
// stock's page, and /watchlist's add dialog (components/stocks/AddToWatchlist.tsx), where it
// adds the stock to the list. No hooks, so either side may render it.
const StockHit = ({stock}: {stock: Stock}) => (
    <>
        <TrendingUp className="h-4 w-4 text-brand-dim" />
        <div className="flex-1">
            <div className="search-item-name">
                {stock.name}
            </div>
            <div className="text-sm text-fg-muted font-mono"
                 style={{ fontSize: '11px', letterSpacing: '0.02em' }}>
                {stock.symbol} | {stock.exchange} | {stock.type}
            </div>
        </div>
    </>
);

export default StockHit;
