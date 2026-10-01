import type {MarketStatus as Status} from "@/lib/prices/market-hours";
import {describeMarketStatus, MARKET_COPY} from "@/lib/learn/copy/market";
import {cn} from "@/lib/utils";

// Computed on the server and passed down: every (root) page is force-dynamic, so this
// costs nothing, and it avoids a hydration mismatch across the bell.
const MarketStatus = ({status, className}: {status: Status; className?: string}) => {
    const open = status.state === 'open';
    return (
        <span className={cn('font-mono inline-flex items-center gap-2 text-[10px] uppercase tracking-[0.1em]', open ? 'text-positive' : 'text-warning', className)}
              title={open ? MARKET_COPY.openTitle : MARKET_COPY.closedTitle}>
            <span className={cn('inline-block size-2 rounded-full', open ? 'bg-positive animate-pulse' : 'bg-warning')} aria-hidden="true" />
            {describeMarketStatus(status)}
        </span>
    );
};

export default MarketStatus;
