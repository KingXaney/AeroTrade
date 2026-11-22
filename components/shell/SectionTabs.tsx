'use client';

import Link from "next/link";
import {usePathname} from "next/navigation";
import {cn} from "@/lib/utils";
import {NAV_SECTIONS, isActiveNav, sectionFor, type NavBadges, type NavSection} from "@/lib/shell/navigation";

// The pages of the section the reader is in, as links above the page: News has Headlines and
// Topics, Markets the trade desk and the Watchlist, Portfolio its Overview and Activity. A
// section of one page shows nothing. Links with aria-current, not role="tab" — each is a page of
// its own with its own URL (the tablist role belongs to a view switched inside one page, as the
// market scan on /trade).
//
// The tabs are pills in a pill track, the current one lifted (.lifted in app/globals.css).
const SectionTabs = ({badges = {}, sections = NAV_SECTIONS}: {badges?: NavBadges; sections?: readonly NavSection[]}) => {
    const pathname = usePathname();
    const section = sectionFor(pathname, sections);
    if (!section || section.pages.length < 2) return null;

    return (
        <nav aria-label={`${section.label} pages`} data-section-tabs={section.id}
             className="mb-4 flex w-fit max-w-full flex-wrap items-center gap-1 rounded-full bg-fg/5 p-1">
            {section.pages.map((page) => {
                const active = isActiveNav(pathname, page.href);
                const count = page.badge ? (badges[page.badge] ?? 0) : 0;
                return (
                    <Link
                        key={page.href}
                        href={page.href}
                        aria-current={active ? 'page' : undefined}
                        className={cn(
                            'control-type inline-flex items-center gap-2 rounded-full px-3.5 py-1.5 text-xs transition-colors',
                            active ? 'lifted text-fg' : 'text-fg-soft hover:bg-surface-3 hover:text-fg',
                        )}
                    >
                        {page.label}
                        {count > 0 && (
                            <span className="rounded-full bg-surface-3 px-1.5 py-0.5 font-mono text-[10px] text-fg-muted"
                                  aria-label={`${count} ${count === 1 ? 'symbol' : 'symbols'} on watchlist`}>{count}</span>
                        )}
                    </Link>
                );
            })}
        </nav>
    );
};

export default SectionTabs;
