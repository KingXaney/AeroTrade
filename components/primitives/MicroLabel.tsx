import type {ReactNode} from "react";
import {cn} from "@/lib/utils";

// The small uppercase caption over a value, a column or a row — the app had 28 spellings
// of this one idea at four sizes and five trackings. One spelling now: 10px, 0.1em, mono,
// which is what 128 of the 175 sites already used and which matches SectionHeading, so an
// eyebrow and a section heading read as the same idea at two sizes.
//
// Scope: uppercase eyebrows only. Small *body* copy (10-11px sentence case) is not a
// label and must not be migrated here.

type Props = {
    as?: 'span' | 'div' | 'p' | 'dt';
    tone?: 'muted' | 'soft' | 'fg' | 'brand' | 'warning';
    id?: string;
    className?: string;
    // Column headers carry the catalog's `help` text as a native tooltip.
    title?: string;
    children: ReactNode;
};

const TONE = {
    muted: 'text-fg-muted',
    soft: 'text-fg-soft',
    fg: 'text-fg',
    brand: 'text-brand',
    warning: 'text-warning',
} as const;

const MicroLabel = ({as: Tag = 'span', tone = 'muted', className, children, ...rest}: Props) => (
    <Tag className={cn('font-mono text-[10px] uppercase tracking-[0.1em]', TONE[tone], className)} {...rest}>
        {children}
    </Tag>
);

export default MicroLabel;
