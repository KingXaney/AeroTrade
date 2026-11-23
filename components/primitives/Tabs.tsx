'use client';

import Link from "next/link";
import {cn} from "@/lib/utils";
import {useCurrentInTrack} from "@/hooks/useCurrentInTrack";

// Views switched inside one page, kept in the URL (?tab=, ?view=): the choice survives a
// reload, can be linked to, and renders on the server, so only the active view's content is
// ever read or mounted. A tablist of links — not buttons with state — for that reason.
//
// Pages of their own under one section are not tabs but links (components/shell/SectionTabs).
// Both are drawn in the one tab track (.tab-track in app/globals.css, never a rule on the
// tablist role), the current one lifted; a view's label keeps the brand colour, so a page's own
// views read apart from its section's pages above the title. On a phone the track is one row
// that scrolls sideways, the current view kept in sight (the one thing this needs the client
// for: the views are still the server's links).
//
// `size`: 'sm', the default, is the compact strip most pages use, each tab --tab-pad-y above and
// below its text (a 44px target under a coarse pointer); 'md' makes each tab a 44px touch target
// everywhere, for a page read mostly on a phone (the poker night lobby).

export type TabItem = {id: string; label: string; href: string};

type Props = {
    tabs: readonly TabItem[];
    active: string;
    // What the views are views of, for a screen reader ("Learn sections").
    label: string;
    size?: 'sm' | 'md';
    className?: string;
};

const SIZE = {
    sm: 'px-3.5 py-(--tab-pad-y) text-xs pointer-coarse:min-h-11',
    md: 'min-h-11 px-4 text-sm',
} as const;

const Tabs = ({tabs, active, label, size = 'sm', className}: Props) => {
    const track = useCurrentInTrack<HTMLDivElement>(active);
    return (
        <div ref={track} role="tablist" aria-label={label} className={cn('tab-track', className)}>
            {tabs.map((tab) => {
                const on = tab.id === active;
                return (
                    <Link
                        key={tab.id}
                        href={tab.href}
                        replace
                        scroll={false}
                        role="tab"
                        aria-selected={on}
                        data-tab={tab.id}
                        className={cn(
                            'control-type inline-flex shrink-0 items-center whitespace-nowrap rounded-full transition-colors',
                            SIZE[size],
                            on ? 'lifted text-brand' : 'text-fg-soft hover:bg-surface-3 hover:text-fg',
                        )}
                    >
                        {tab.label}
                    </Link>
                );
            })}
        </div>
    );
};

export default Tabs;
