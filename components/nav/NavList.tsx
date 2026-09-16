'use client';

import Link from "next/link";
import {cn} from "@/lib/utils";
import {NAV_ITEMS, isActiveNav, type NavBadges, type NavItem} from "@/lib/navigation";

// The row renderer shared by the desktop sidebar and the mobile drawer. Extracted so the
// two can't drift the way the three hard-coded nav arrays did — the sidebar was the only
// surface that ever listed /watchlist, /friends and /history.
type Props = {
    pathname: string;
    /** Counts to show; an absent or zero key renders nothing. */
    badges?: NavBadges;
    /** Fires on any row click — the drawer uses it to close itself. */
    onNavigate?: () => void;
    items?: readonly NavItem[];
};

const badgeLabel = (item: NavItem, count: number) =>
    item.badge === 'friendRequests'
        ? `${count} pending friend ${count === 1 ? 'request' : 'requests'}`
        : `${count} ${count === 1 ? 'symbol' : 'symbols'} on watchlist`;

const NavList = ({pathname, badges = {}, onNavigate, items = NAV_ITEMS}: Props) => (
    <nav className="space-y-1">
        {items.map((item) => {
            const active = isActiveNav(pathname, item.href);
            const count = item.badge ? (badges[item.badge] ?? 0) : 0;
            // A pending friend request is an ask, not a tally, so it gets the brand tint
            // rather than the muted treatment the watchlist count uses.
            const actionable = item.badge === 'friendRequests';
            return (
                <Link
                    key={item.href}
                    href={item.href}
                    onClick={onNavigate}
                    aria-current={active ? 'page' : undefined}
                    className={cn(
                        "flex items-center gap-4 px-4 py-3 transition-all text-xs font-bold tracking-[0.1em] uppercase",
                        active
                            ? "text-brand border-l-4 border-brand"
                            : "text-fg-soft hover:text-fg hover:bg-surface-3",
                    )}
                    style={{fontFamily: 'var(--type-mono)'}}
                >
                    <span
                        className="material-symbols-outlined"
                        style={active ? {fontVariationSettings: "'FILL' 1"} : undefined}
                    >{item.icon}</span>
                    <span>{item.label}</span>
                    {count > 0 && (
                        <span
                            className={cn(
                                "ml-auto rounded-full px-1.5 py-0.5 text-[10px]",
                                actionable ? "bg-brand/15 text-brand" : "bg-surface-3 text-fg-muted",
                            )}
                            aria-label={badgeLabel(item, count)}
                        >{count}</span>
                    )}
                </Link>
            );
        })}
    </nav>
);

export default NavList;
