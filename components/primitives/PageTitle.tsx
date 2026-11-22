import type {ReactNode} from "react";
import {cn} from "@/lib/utils";

// The route header. Owning the h1 string in one place is the fix for a real bug:
// RouteLoading and RouteError wrote `tracking-tight` while most pages did not, so the
// title visibly reflowed the moment the real page replaced its skeleton. tracking-tight
// wins because the two shared files already had it and they are what define the reflow.
//
// `pageTitleClass` is that string, its size the look's --title-size (app/globals.css): a page
// that draws its own h1 beside other things (an account's heading, a stock's) takes it too.

export const pageTitleClass = 'font-heading text-(length:--title-size) font-semibold tracking-tight text-fg';

type Props = {
    title: string;
    subtitle?: ReactNode;
    // The small mono line under the subtitle: a valuation basis, an as-of date.
    note?: ReactNode;
    // Right-hand toolbar; switches the header to a two-column layout above md.
    actions?: ReactNode;
    id?: string;
    className?: string;
};

const PageTitle = ({title, subtitle, note, actions, id, className}: Props) => {
    const heading = (
        <div className="min-w-0">
            <h1 className={cn(pageTitleClass, 'mb-1')} id={id}>
                {title}
            </h1>
            {subtitle && <p className="text-sm text-fg-muted">{subtitle}</p>}
            {note && <p className="font-mono text-[11px] text-fg-muted mt-1">{note}</p>}
        </div>
    );

    if (!actions) return <div className={cn('mb-2', className)}>{heading}</div>;

    return (
        <div className={cn('mb-2 flex flex-col gap-4 md:flex-row md:items-end md:justify-between', className)}>
            {heading}
            {actions}
        </div>
    );
};

export default PageTitle;
