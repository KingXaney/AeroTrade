'use client';

import Link from "next/link";
import {cn} from "@/lib/utils";
import {ACCOUNT_PAGES, NAV_SECTIONS, isActiveNav, sectionFor, type NavBadges} from "@/lib/shell/navigation";

// The mobile drawer's rows: the rail's sections by name, then the account pages. A section's
// other pages are the tabs on the page itself (SectionTabs), so the drawer stays as short as
// the rail it stands in for.
type Props = {
    pathname: string;
    /** Counts to show; an absent or zero key renders nothing. */
    badges?: NavBadges;
    /** Fires on any row click — the drawer uses it to close itself. */
    onNavigate?: () => void;
};

const ROW = 'control-type flex items-center gap-4 px-4 py-3 transition-all text-xs';
const rowTone = (active: boolean) => active ? 'text-brand border-l-4 border-brand' : 'text-fg-soft hover:text-fg hover:bg-surface-3';

const NavList = ({pathname, badges = {}, onNavigate}: Props) => {
    const current = sectionFor(pathname);
    const requests = badges.friendRequests ?? 0;
    return (
        <nav aria-label="Sections" className="space-y-1">
            {NAV_SECTIONS.map((section) => {
                const active = current?.id === section.id;
                return (
                    <Link key={section.id} href={section.pages[0].href} onClick={onNavigate}
                          aria-current={active ? 'page' : undefined} className={cn(ROW, rowTone(active))}>
                        <span className="material-symbols-outlined" aria-hidden="true"
                              style={active ? {fontVariationSettings: "'FILL' 1"} : undefined}>{section.icon}</span>
                        <span>{section.label}</span>
                    </Link>
                );
            })}
            <div className="mx-4 my-2 border-t border-line-strong/15"/>
            {ACCOUNT_PAGES.map((page) => {
                const active = isActiveNav(pathname, page.href);
                const count = page.badge === 'friendRequests' ? requests : 0;
                return (
                    <Link key={page.href} href={page.href} onClick={onNavigate}
                          aria-current={active ? 'page' : undefined} className={cn(ROW, rowTone(active))}>
                        <span className="material-symbols-outlined" aria-hidden="true"
                              style={active ? {fontVariationSettings: "'FILL' 1"} : undefined}>{page.icon}</span>
                        <span>{page.label}</span>
                        {/* A pending friend request is an ask, not a tally, so it takes the brand tint. */}
                        {count > 0 && (
                            <span className="ml-auto rounded-full bg-brand/15 px-1.5 py-0.5 font-mono text-[10px] text-brand"
                                  aria-label={`${count} pending friend ${count === 1 ? 'request' : 'requests'}`}>{count}</span>
                        )}
                    </Link>
                );
            })}
        </nav>
    );
};

export default NavList;
