import type {ReactNode} from "react";
import {cn} from "@/lib/utils";

// The one label / value / hint tile: the account summary, the analytics and simulated tiles,
// the learn lenses and the brain's system status are all built from it. `sm` is the denser
// status-strip size; `valueClass` carries the figure's sign or accent colour.
type Props = {
    label: ReactNode;
    value: string;
    valueClass?: string;
    hint?: string;
    size?: 'md' | 'sm';
};

const StatTile = ({label, value, valueClass, hint, size = 'md'}: Props) => (
    <div className={cn('flex flex-col', size === 'sm' ? 'gap-0.5' : 'gap-1')}>
        <span className="font-mono text-[10px] uppercase tracking-[0.1em] text-fg-muted">{label}</span>
        <span className={cn('font-heading font-semibold text-fg', size === 'sm' ? 'text-sm' : 'text-lg', valueClass)}>{value}</span>
        {hint && <span className="font-mono text-[10px] text-fg-muted">{hint}</span>}
    </div>
);

export default StatTile;
