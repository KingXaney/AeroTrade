import type {ReactNode} from "react";
import {cn} from "@/lib/utils";

// The heading every panel uses. Brand cyan, mono, uppercase — deliberately no `tone`
// prop: a section heading is one thing, and the dashboard's three competing treatments
// (10px muted eyebrow / 14px brand heading / 12px edit label) were the whole defect.
//
// font-mono resolves to var(--type-mono) via the @theme inline block in globals.css, so
// it follows the style axis (JetBrains in most styles, IBM Plex Mono in brutalist).

type Props = {
    as?: 'h2' | 'h3';
    size?: 'sm' | 'xs';
    spacing?: 'none' | 'sm' | 'md';
    id?: string;
    className?: string;
    children: ReactNode;
};

const SPACING = {none: '', sm: 'mb-3', md: 'mb-4'} as const;

const SectionHeading = ({as: Tag = 'h2', size = 'sm', spacing = 'md', id, className, children}: Props) => (
    <Tag
        id={id}
        className={cn(
            'font-mono font-bold uppercase tracking-[0.1em] text-brand',
            size === 'sm' ? 'text-sm' : 'text-xs',
            SPACING[spacing],
            className,
        )}
    >
        {children}
    </Tag>
);

export default SectionHeading;
