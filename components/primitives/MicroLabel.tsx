import type {ReactNode} from "react";
import {cn} from "@/lib/utils";

// The small caption over a value, a column, a row or a form field. Its face, size, case and
// tracking are the active style's label tokens (.label-type in app/globals.css): uppercase mono
// in a terminal style, plain words in a quiet one. Every hand-written site of exactly this recipe uses it. Labels still
// spelled by hand are other recipes (9-11px; 0.08em, 0.14em or tracking-wider; no tone of
// their own) — moving them here would change how they look, so that is a design decision,
// not a refactor.
//
// Scope: uppercase eyebrows only. Small *body* copy (10-11px sentence case) is not a
// label and must not be migrated here.

type Props = {
    as?: 'span' | 'div' | 'p' | 'dt' | 'label';
    tone?: 'muted' | 'soft' | 'fg' | 'brand' | 'warning';
    id?: string;
    className?: string;
    // Column headers carry the catalog's `help` text as a native tooltip.
    title?: string;
    // Only with as="label".
    htmlFor?: string;
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
    <Tag className={cn('label-type text-[length:var(--label-size)]', TONE[tone], className)} {...rest}>
        {children}
    </Tag>
);

export default MicroLabel;
