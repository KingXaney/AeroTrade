// One registry for every nav surface. Before this there were three copies — NAV_ITEMS in
// lib/constants.ts (header), sidebarNavItems in components/Sidebar.tsx, and LINKS in
// components/dashboard/widgets/QuickLinks.tsx — and they had already drifted: the sidebar
// was the only one carrying /watchlist, /friends, /history and /settings, and it is
// `hidden lg:flex`, so those four pages were unreachable by click below 1024px.
//
// Pure module: no React, no DB, no next/navigation. Tested in lib/__tests__/navigation.ts.

export type NavBadgeKey = 'watchlist' | 'friendRequests';

export type NavItem = {
    href: string;
    label: string;
    /** Material Symbols name. */
    icon: string;
    /** Which count, if any, rides on this row. */
    badge?: NavBadgeKey;
    /** The header has room for six; the rest live in the sidebar and the mobile drawer. */
    inHeader: boolean;
};

// Sidebar order: topics lead, the market pages follow, the account pages close it out.
export const NAV_ITEMS: readonly NavItem[] = [
    {href: '/topics', label: 'Topics', icon: 'interests', inHeader: true},
    {href: '/', label: 'Dashboard', icon: 'space_dashboard', inHeader: true},
    {href: '/brain', label: 'Brain', icon: 'neurology', inHeader: true},
    {href: '/portfolio', label: 'Portfolio', icon: 'account_balance_wallet', inHeader: true},
    {href: '/trade', label: 'Trade', icon: 'candlestick_chart', inHeader: true},
    {href: '/markets', label: 'Markets', icon: 'query_stats', inHeader: true},
    {href: '/watchlist', label: 'Watchlist', icon: 'bookmark', badge: 'watchlist', inHeader: false},
    {href: '/friends', label: 'Friends', icon: 'group', badge: 'friendRequests', inHeader: false},
    {href: '/history', label: 'History', icon: 'history', inHeader: false},
    {href: '/settings', label: 'Settings', icon: 'settings', inHeader: false},
] as const;

export const HEADER_NAV_ITEMS: readonly NavItem[] = NAV_ITEMS.filter((i) => i.inHeader);

/** Counts supplied by the caller; an absent or zero key renders no badge. */
export type NavBadges = Partial<Record<NavBadgeKey, number>>;

// '/' would prefix-match every route, so it is the one exact comparison. Everything else
// matches its subtree, so /topics stays lit on /topics/ai-chips.
export const isActiveNav = (pathname: string, href: string): boolean =>
    href === '/' ? pathname === '/' : pathname === href || pathname.startsWith(`${href}/`);
