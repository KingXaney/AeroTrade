import type {ComponentPropsWithoutRef, ReactNode} from "react";
import {cn} from "@/lib/utils";
import SectionHeading from "@/components/primitives/SectionHeading";
import OpenOnHash from "@/components/primitives/OpenOnHash";

// The one collapsible: a native <details> whose summary hides the browser's marker. No
// JavaScript to fold, so it renders in server and client trees alike and still prints.
// - 'link': a small brand-coloured mono line ("What these mean", "What the rule saw"), led by a
//   chevron that turns when open; `chevron={false}` drops it for the one-line replays on a row.
// - 'panel': the summary is the panel's h2, chevron first — reference prose kept below the fold.
// - 'row': a card folded to its title — the caller's title row is the summary (a heading and its
//   badges; a summary allows one heading), the chevron last; the caller swaps a word on group-open.
// id, `open` and data-* attributes go on the <details>, so selectors and invariant 12's
// switches keep their hooks. `openOnHash` (with an id) opens it when the page's hash is that
// address — the list's "Open →" to the problem — through one client leaf (OpenOnHash), which
// never closes it.
type Props = Omit<ComponentPropsWithoutRef<'details'>, 'children'> & {
    summary: ReactNode;
    variant?: 'link' | 'panel' | 'row';
    chevron?: boolean;
    openOnHash?: string;
    children: ReactNode;
};

const MARKERLESS = 'cursor-pointer list-none marker:content-none [&::-webkit-details-marker]:hidden';

const Disclosure = ({summary, variant = 'link', chevron = true, openOnHash, className, children, ...details}: Props) => {
    const turns = variant !== 'link' || chevron;
    return (
        <>
            <details {...details} className={cn(turns && 'group', className) || undefined}>
                {variant === 'panel' ? (
                    <summary className={MARKERLESS}>
                        <SectionHeading as="h2" spacing="none" className="inline-flex items-center gap-2">
                            <span className="material-symbols-outlined text-base transition-transform group-open:rotate-90" aria-hidden="true">chevron_right</span>
                            {summary}
                        </SectionHeading>
                    </summary>
                ) : variant === 'row' ? (
                    <summary className={cn(MARKERLESS, 'flex items-center gap-3 py-1')}>
                        {summary}
                        <span className="material-symbols-outlined shrink-0 text-base text-fg-muted transition-transform group-open:rotate-90" aria-hidden="true">chevron_right</span>
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
            {openOnHash && details.id ? <OpenOnHash hash={openOnHash} id={details.id}/> : null}
        </>
    );
};

export default Disclosure;
