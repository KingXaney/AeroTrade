// An amount of chips as a few short columns of coloured chips (lib/poker-night/chips.chipBreakdown:
// at most three columns of eight, the largest denominations), always with the amount printed
// beside it — the drawing is decoration and may not show every chip. The colours are the viewer's
// chip set (LOOKS_CSS, [data-pn-chips] on the room, [data-denom] on each chip); rounded-full keeps
// them round in brutalist.

import {chipBreakdown, compactChips} from "@/lib/poker-night/chips";
import {cn} from "@/lib/utils";

type Props = {
    amount: number;
    label?: boolean; // the amount as text beside the chips (on by default)
    className?: string;
    amountClassName?: string;
};

const ChipStack = ({amount, label = true, className, amountClassName}: Props) => (
    <span className={cn('inline-flex items-center gap-1', className)} data-chips={amount}>
        <span className="pn-chips" aria-hidden="true">
            {chipBreakdown(amount).map((column) => (
                <span key={column.denom} className="pn-chip-col">
                    {Array.from({length: column.count}, (_, i) => <span key={i} className="pn-chip rounded-full" data-denom={column.denom}/>)}
                </span>
            ))}
        </span>
        {label && <span className={cn('pn-chip-amount', amountClassName)}>{compactChips(amount)}</span>}
    </span>
);

export default ChipStack;
