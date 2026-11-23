import type {MarketStatus as Status} from "@/lib/prices/market-hours";
import {describeMarketStatus, MARKET_COPY} from "@/lib/learn/copy/market";
import {marketDotClass} from "@/lib/stocks/market-dot";
import {cn} from "@/lib/utils";

// Computed on the server and passed down: every (root) page is force-dynamic, so this
// costs nothing, and it avoids a hydration mismatch across the bell.
// While the market is open the dot is the page's one beacon (lib/stocks/market-dot); closed, it
// is still.
const MarketStatus = ({status, className}: {status: Status; className?: string}) => {
    const open = status.state === 'open';
    return (
        <span className={cn('label-type inline-flex items-center gap-2 text-[length:var(--label-size)]', open ? 'text-positive' : 'text-warning', className)}
              title={open ? MARKET_COPY.openTitle : MARKET_COPY.closedTitle}>
            <span className={cn('inline-block size-2 rounded-full', marketDotClass(status))} aria-hidden="true" />
            {describeMarketStatus(status)}
        </span>
    );
};

export default MarketStatus;
