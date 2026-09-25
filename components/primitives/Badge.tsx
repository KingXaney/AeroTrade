import type {ReactNode} from "react";
import {cn} from "@/lib/utils";

// Chips, tags and count pills — 24 hand-rolled spellings before this.
//
// `shape` carries typography as well as radius, which is what stops it from being a
// cosmetic prop: a `tag` holds a word (uppercase, tracked), a `pill` holds a number
// (tabular, untracked). `pill` uses the literal rounded-full because that is the named
// exception in the brutalist radius kill switch (globals.css), so counts stay round
// there while tags correctly square off.

type Tone = 'neutral' | 'brand' | 'positive' | 'negative' | 'warning';
type Variant = 'soft' | 'solid' | 'outline';

type Props = {
    tone?: Tone;
    variant?: Variant;
    shape?: 'tag' | 'pill';
    id?: string;
    className?: string;
    title?: string;
    'aria-label'?: string;
    children: ReactNode;
};

// Full literal class strings: Tailwind cannot see a class name assembled at runtime.
const STYLES: Record<Tone, Record<Variant, string>> = {
    neutral: {
        soft: 'bg-surface-3 text-fg-soft',
        solid: 'bg-surface-4 text-fg',
        outline: 'border border-line-strong/40 text-fg-soft',
    },
    brand: {
        soft: 'bg-brand/10 text-brand',
        solid: 'bg-brand text-on-brand',
        outline: 'border border-brand/30 text-brand',
    },
    positive: {
        soft: 'bg-positive/10 text-positive',
        solid: 'bg-positive text-bg',
        outline: 'border border-positive/30 text-positive',
    },
    negative: {
        soft: 'bg-negative/10 text-negative',
        solid: 'bg-negative text-on-negative',
        outline: 'border border-negative/30 text-negative',
    },
    warning: {
        soft: 'bg-warning/10 text-warning',
        solid: 'bg-warning text-bg',
        outline: 'border border-warning/30 text-warning',
    },
};

const SHAPE = {
    tag: 'px-2 py-0.5 rounded-[var(--control-radius)] font-bold uppercase tracking-[0.1em]',
    pill: 'px-1.5 py-0.5 rounded-full font-bold tabular-nums',
} as const;

const Badge = ({tone = 'neutral', variant = 'soft', shape = 'tag', className, children, ...rest}: Props) => (
    <span
        className={cn(
            'inline-flex items-center gap-1 shrink-0 whitespace-nowrap font-mono text-[10px]',
            SHAPE[shape],
            STYLES[tone][variant],
            className,
        )}
        {...rest}
    >
        {children}
    </span>
);

export default Badge;
