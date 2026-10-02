import Link from "next/link";
import {cn} from "@/lib/utils";

// Views switched inside one page, kept in the URL (?tab=, ?view=): the choice survives a
// reload, can be linked to, and renders on the server, so only the active view's content is
// ever read or mounted. A tablist of links — not buttons with state — for that reason.
//
// Pages of their own under one section are not tabs but links (components/shell/SectionTabs).

export type TabItem = {id: string; label: string; href: string};

type Props = {
    tabs: readonly TabItem[];
    active: string;
    // What the views are views of, for a screen reader ("Learn sections").
    label: string;
    className?: string;
};

const Tabs = ({tabs, active, label, className}: Props) => (
    <div role="tablist" aria-label={label} className={cn('flex flex-wrap gap-1', className)}>
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
                        'control-type rounded-lg px-3.5 py-1.5 text-xs transition-colors',
                        on ? 'bg-brand text-on-brand' : 'text-fg-soft hover:bg-surface-3 hover:text-fg',
                    )}
                >
                    {tab.label}
                </Link>
            );
        })}
    </div>
);

export default Tabs;
