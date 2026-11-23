import type {ReactNode} from "react";
import {cn} from "@/lib/utils";

// The heading every panel uses — deliberately no `tone` prop: a section heading is one
// thing, and the dashboard's three competing treatments (10px muted eyebrow / 14px brand
// heading / 12px edit label) were the whole defect.
//
// Its face, weight, case, tracking and colour are the look's heading tokens (--heading-*,
// read by .heading-type in app/globals.css), so one place decides how every panel is headed.

type Props = {
    as?: 'h2' | 'h3';
    size?: 'sm' | 'xs';
    spacing?: 'none' | 'sm' | 'md';
    id?: string;
    className?: string;
    children: ReactNode;
};

// The look is compact: the gap under a heading is a step under its name (md, the default, 12px).
const SPACING = {none: '', sm: 'mb-2', md: 'mb-3'} as const;

const SectionHeading = ({as: Tag = 'h2', size = 'sm', spacing = 'md', id, className, children}: Props) => (
    <Tag
        id={id}
        // The hook the look's heading dot hangs on ([data-panel-title]::before in app/globals.css).
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
