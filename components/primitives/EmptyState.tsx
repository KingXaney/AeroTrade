import type {ReactNode} from "react";
import {cn} from "@/lib/utils";
import Panel from "@/components/primitives/Panel";

// "There is nothing here yet", said the same way everywhere. Two sizes only:
//   inline — inside a panel that already exists (a list with no rows)
//   panel  — the whole surface is empty (a route, a failed boundary)
//
// `action` is a ReactNode rather than an onClick so this stays a server component and
// can be rendered directly from an RSC page. Icons are Material Symbols, matching
// WidgetDefinition.icon; lucide stays for interactive affordances.

type Props = {
    size?: 'inline' | 'panel';
    icon?: string;
    title: string;
    description?: ReactNode;
    action?: ReactNode;
    // The small mono line under the actions — a caveat, a next-run time.
    note?: ReactNode;
    className?: string;
};

const EmptyState = ({size = 'inline', icon, title, description, action, note, className}: Props) => {
    if (size === 'inline') {
        return (
            <div className={cn('flex flex-col items-start gap-2 p-4', className)}>
                <p className="text-sm text-fg-muted">{title}</p>
                {description && <p className="text-xs text-fg-muted leading-relaxed">{description}</p>}
                {action}
                {note && <p className="font-mono text-[10px] text-fg-muted">{note}</p>}
            </div>
        );
    }

    return (
        <Panel pad={8} className={cn('text-center', className)}>
            {icon && <span className="material-symbols-outlined text-3xl text-fg-muted">{icon}</span>}
            <h3 className={cn('font-heading text-base font-semibold text-fg', icon && 'mt-2')}>{title}</h3>
            {description && <p className="mt-1 text-sm text-fg-muted max-w-md mx-auto">{description}</p>}
            {action && <div className="mt-4 flex flex-wrap items-center justify-center gap-3">{action}</div>}
            {note && <p className="mt-4 font-mono text-[10px] text-fg-muted">{note}</p>}
        </Panel>
    );
};

export default EmptyState;
