import {countUnpriced, describeUnpriced} from "@/lib/trading/analytics";
import {cn} from "@/lib/utils";

// The one place a panel admits that some of its holdings have no live quote. Rows
// show "—" for the P&L; this line explains why. Renders nothing when every
// position is priced, so it costs callers no conditional.
const UnpricedNote = ({positions, className}: {positions: readonly {priceStale: boolean}[]; className?: string}) => {
    const text = describeUnpriced(countUnpriced(positions), positions.length);
    if (!text) return null;
    return (
        <p role="status" className={cn('text-[11px] text-warning', className)} style={{fontFamily: 'var(--type-mono)'}}>
            {text}
        </p>
    );
};

export default UnpricedNote;
