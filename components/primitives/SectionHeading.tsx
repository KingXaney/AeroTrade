import type {ReactNode} from "react";
import {cn} from "@/lib/utils";

// The heading every panel uses — deliberately no `tone` prop: a section heading is one
// thing, and the dashboard's three competing treatments (10px muted eyebrow / 14px brand
// heading / 12px edit label) were the whole defect.
//
// Its face, weight, case, tracking and colour are the active style's heading tokens
// (.heading-type in app/globals.css), so each visual style words its panels its own way.

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
        // The hook each style decorates a panel's heading through (app/globals.css).
        data-panel-title=""
        className={cn(
            'heading-type',
            size === 'sm' ? 'text-sm' : 'text-xs',
            SPACING[spacing],
            className,
        )}
    >
        {children}
    </Tag>
);

export default SectionHeading;
