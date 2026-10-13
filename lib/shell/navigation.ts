// One registry for every nav surface: the icon rail, the tabs under it, the mobile drawer, the
// account menu, ⌘K's "go to page" rows and the Quick Links widget. Before it there were three
// hand-kept copies that had drifted; before sections, a header of eight tabs repeated inside a
// sidebar of thirteen links, on every page.
//
// A section is one rail icon. Its pages are the tabs shown under the header while the reader is
// anywhere in it; a section of one page shows no tabs. `match` names routes that belong to a
// section without being one of its tabs (/stocks/AAPL lights Markets — /stocks alone is no page).
//
// Pure module: no React, no DB, no next/navigation. Tested in lib/shell/__tests__/navigation.test.ts.

// A count the caller supplies. Above zero it is a dot on a rail icon (newsNew, unpriced) or a number
// beside a label (watchlist on its tab, friendRequests in the account menu).
export type NavBadgeKey = 'watchlist' | 'friendRequests' | 'newsNew' | 'unpriced';

export type NavPage = {
    href: string;
    label: string;
    /** Material Symbols name. */
    icon: string;
    /** Which count, if any, rides beside this page's label. */
    badge?: NavBadgeKey;
    /** Shown to the lab's owner only (lib/lab/owner.ts); every other audience's lists drop it. */
    owner?: true;
};

export type NavSection = {
    id: string;
    label: string;
    /** Material Symbols name, on the rail. */
    icon: string;
    /** The first is where the rail icon goes. */
    pages: readonly NavPage[];
    /** Route prefixes that light this section without being a tab. */
    match?: readonly string[];
    /**
     * A count that puts a dot on the rail icon when it is above zero — for News, how many followed
     * topics have an article newer than the reader's last look (lib/shell/sidebar.ts).
     */
    badge?: NavBadgeKey;
    /** The summary the rail shows on hover, where the sidebar's cards used to sit. */
    flyout?: 'news' | 'portfolio';
};

export const NAV_SECTIONS: readonly NavSection[] = [
    {
        id: 'home', label: 'Home', icon: 'home',
        pages: [
            {href: '/', label: 'Today', icon: 'home'},
            {href: '/dashboard', label: 'My dashboard', icon: 'space_dashboard'},
        ],
    },
    {
        id: 'news', label: 'News', icon: 'feed', badge: 'newsNew', flyout: 'news',
        pages: [
            {href: '/news', label: 'Headlines', icon: 'feed'},
            {href: '/topics', label: 'Topics', icon: 'interests'},
        ],
    },
    {
        id: 'markets', label: 'Markets', icon: 'query_stats', match: ['/stocks'],
        pages: [
            {href: '/markets', label: 'Overview', icon: 'query_stats'},
            {href: '/watchlist', label: 'Watchlist', icon: 'bookmark', badge: 'watchlist'},
        ],
    },
    {
        id: 'trade', label: 'Trade', icon: 'candlestick_chart',
        pages: [{href: '/trade', label: 'Trade', icon: 'candlestick_chart'}],
    },
    {
        id: 'portfolio', label: 'Portfolio', icon: 'account_balance_wallet', badge: 'unpriced', flyout: 'portfolio',
        pages: [
            {href: '/portfolio', label: 'Overview', icon: 'account_balance_wallet'},
            {href: '/history', label: 'Activity', icon: 'history'},
        ],
    },
    {
        id: 'strategies', label: 'Strategies', icon: 'auto_graph',
        pages: [{href: '/strategies', label: 'Strategies', icon: 'auto_graph'}],
    },
    {
        id: 'brain', label: 'Brain', icon: 'neurology',
        pages: [
            {href: '/brain', label: 'News brain', icon: 'neurology'},
            {href: '/culture', label: 'Culture brain', icon: 'storefront'},
        ],
    },
    {
        id: 'learn', label: 'Learn', icon: 'school',
        pages: [
            // The owner's lab; any other account's /learn is sent to /games, and their lists
            // (navSectionsFor) begin at the games.
            {href: '/learn', label: 'Lab', icon: 'science', owner: true},
            {href: '/games', label: 'Games', icon: 'sports_esports'},
            {href: '/poker', label: 'Poker solver', icon: 'playing_cards'},
            // The lobby; a table itself (/play/CODE) is full screen, outside the shell and every section.
            {href: '/poker-night', label: 'Poker night', icon: 'celebration'},
            {href: '/glossary', label: 'Glossary', icon: 'menu_book'},
        ],
    },
] as const;

// The account menu's pages: about the person, not a place in the app.
export const ACCOUNT_PAGES: readonly NavPage[] = [
    {href: '/friends', label: 'Friends', icon: 'group', badge: 'friendRequests'},
    {href: '/settings', label: 'Settings', icon: 'settings'},
] as const;

// What ⌘K and the Quick Links widget list: a page under a section's own name when it is the
// section's only page or its first, so "Portfolio" finds /portfolio and "Activity" /history.
export type NavDestination = NavPage & {section: string};

const pagesOf = (sections: readonly NavSection[]): NavDestination[] => [
    ...sections.flatMap((section) => section.pages.map((page, i) => ({
        ...page,
        label: i === 0 ? section.label : page.label,
        section: section.label,
    }))),
    ...ACCOUNT_PAGES.map((page) => ({...page, section: 'Account'})),
];

// The full registry: what the tests hold to page files, and what an owner sees.
export const NAV_PAGES: readonly NavDestination[] = pagesOf(NAV_SECTIONS);

// Who is looking: the (root) layout decides from the session (lib/lab/owner.ts) and hands the
// audience's lists to every nav surface. An owner-only page is dropped for anyone else; a
// section is never emptied, so its first visible page takes its name and its rail icon.
export type NavAudience = {owner: boolean};

export const navSectionsFor = ({owner}: NavAudience): readonly NavSection[] =>
    owner ? NAV_SECTIONS : NAV_SECTIONS.map((section) => ({...section, pages: section.pages.filter((page) => !page.owner)}));

export const navPagesFor = (audience: NavAudience): readonly NavDestination[] => pagesOf(navSectionsFor(audience));

/** Counts supplied by the caller; an absent or zero key renders no badge. */
export type NavBadges = Partial<Record<NavBadgeKey, number>>;

// '/' would prefix-match every route, so it is the one exact comparison. Everything else
// matches its subtree, so /topics stays lit on /topics/ai-chips.
export const isActiveNav = (pathname: string, href: string): boolean =>
    href === '/' ? pathname === '/' : pathname === href || pathname.startsWith(`${href}/`);

// The section a route belongs to, or undefined for the account pages and unknown routes.
export const sectionFor = (pathname: string, sections: readonly NavSection[] = NAV_SECTIONS): NavSection | undefined =>
    sections.find((section) =>
        section.pages.some((page) => isActiveNav(pathname, page.href))
        || (section.match ?? []).some((prefix) => isActiveNav(pathname, prefix)));

// ⌘K's "go to page" rows: a destination whose name, or whose section's, starts a word of the
// query's way — "port" finds Portfolio and its Activity tab, "act" only Activity. Compared as
// plain lower-case text: the query never becomes a regex (invariant 2).
export const searchPages = (query: string, limit = 5, pages: readonly NavDestination[] = NAV_PAGES): NavDestination[] => {
    const q = query.trim().toLowerCase();
    if (!q) return [];
    const starts = (text: string) => text.toLowerCase().split(/\s+/).some((word) => word.startsWith(q));
    const byLabel = pages.filter((page) => starts(page.label));
    const bySection = pages.filter((page) => !byLabel.includes(page) && starts(page.section));
    return [...byLabel, ...bySection].slice(0, limit);
};
