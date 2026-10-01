import type {ComponentPropsWithoutRef, ReactNode} from "react";
import {cn} from "@/lib/utils";
import SectionHeading from "@/components/primitives/SectionHeading";

// The one collapsible: a native <details> whose summary hides the browser's marker. No
// JavaScript, so it renders in server and client trees alike and still prints.
// - 'link': a small brand-coloured mono line ("What these mean", "What the rule saw"), led by a
//   chevron that turns when open; `chevron={false}` drops it for the one-line replays on a row.
// - 'panel': the summary is the panel's h2, chevron first — reference prose kept below the fold.
// id, `open` and data-* attributes go on the <details>, so selectors and invariant 12's
// switches keep their hooks.
type Props = Omit<ComponentPropsWithoutRef<'details'>, 'children'> & {
    summary: ReactNode;
    variant?: 'link' | 'panel';
    chevron?: boolean;
    children: ReactNode;
};

const MARKERLESS = 'cursor-pointer list-none marker:content-none [&::-webkit-details-marker]:hidden';

const Disclosure = ({summary, variant = 'link', chevron = true, className, children, ...details}: Props) => {
    const turns = variant === 'panel' || chevron;
    return (
        <details {...details} className={cn(turns && 'group', className) || undefined}>
            {variant === 'panel' ? (
                <summary className={MARKERLESS}>
                    <SectionHeading as="h2" spacing="none" className="inline-flex items-center gap-2">
                        <span className="material-symbols-outlined text-base transition-transform group-open:rotate-90" aria-hidden="true">chevron_right</span>
                        {summary}
                    </SectionHeading>
                </summary>
            ) : chevron ? (
                <summary className={`font-mono ${MARKERLESS} text-[11px] text-brand hover:underline inline-flex items-center gap-1`}>
                    <span className="material-symbols-outlined text-sm transition-transform group-open:rotate-90" aria-hidden="true">chevron_right</span>
                    {summary}
                </summary>
            ) : (
                <summary className={`font-mono ${MARKERLESS} text-[11px] text-brand hover:underline`}>{summary}</summary>
            )}
            {children}
        </details>
    );
};

export default Disclosure;
