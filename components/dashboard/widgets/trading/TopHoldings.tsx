import Link from "next/link";
import HoldingsTable from "@/components/trading/portfolio/HoldingsTable";
import type {EnrichedPosition} from '@/lib/trading/types';
import MicroLabel from "@/components/primitives/MicroLabel";

const TOP_HOLDINGS_COUNT = 6;

// The active account's positions, largest first.
const TopHoldings = ({positions, accountName}: {positions: EnrichedPosition[]; accountName: string}) => {
    const sorted = [...positions].sort((a, b) => b.marketValue - a.marketValue);
    return (
        <div>
            <MicroLabel as="div" className="mb-2">{accountName}</MicroLabel>
            <HoldingsTable positions={sorted.slice(0, TOP_HOLDINGS_COUNT)} emptyText="No open positions yet — start trading." />
            {sorted.length > TOP_HOLDINGS_COUNT && (
                <Link href="/portfolio" className="inline-block mt-3 text-xs text-brand hover:underline font-mono">
                    View all {sorted.length} holdings →
                </Link>
            )}
        </div>
    );
};

export default TopHoldings;
