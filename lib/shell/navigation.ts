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
    /** Shown to the owner only (lib/lab/owner.ts); every other audience's lists drop it. */
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
    /** The whole section is the owner's (lib/lab/owner.ts): anyone else has no icon, row or tab for it. */
    owner?: true;
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
        // Markets and Trade were two icons until 2026-10-13: an overview of TradingView screeners
        // and a thin trade desk, both embeds around a symbol. They are one page now, /trade — the
        // ticker tape, the desk, the last fill, the open positions and the market scan — and the
        // old /markets address redirects there (next.config.ts, its ?view= carried over).
        id: 'markets', label: 'Markets', icon: 'candlestick_chart', match: ['/stocks'],
        pages: [
            {href: '/trade', label: 'Trade', icon: 'candlestick_chart'},
            {href: '/watchlist', label: 'Watchlist', icon: 'bookmark', badge: 'watchlist'},
        ],
    },
    {
        id: 'portfolio', label: 'Portfolio', icon: 'account_balance_wallet', badge: 'unpriced', flyout: 'portfolio',
        pages: [
            {href: '/portfolio', label: 'Overview', icon: 'account_balance_wallet'},
            {href: '/history', label: 'Activity', icon: 'history'},
        ],
    },
    {
        id: 'strategies', label: 'Strategies', icon: 'auto_graph', owner: true,
        pages: [{href: '/strategies', label: 'Strategies', icon: 'auto_graph'}],
    },
    {
        // Both brains and the trading agent world (its office, /agent-world/office, is outside the shell).
        id: 'brain', label: 'Brain', icon: 'neurology', owner: true,
        pages: [
            {href: '/brain', label: 'News brain', icon: 'neurology'},
            {href: '/culture', label: 'Culture brain', icon: 'storefront'},
            {href: '/agent-world', label: 'Trading agent world', icon: 'smart_toy'},
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
// `tab` keeps the page's own name (what its tab reads), so "trade" still finds /trade, whose ⌘K
// name is Markets.
export type NavDestination = NavPage & {section: string; tab: string};

const pagesOf = (sections: readonly NavSection[]): NavDestination[] => [
    ...sections.flatMap((section) => section.pages.map((page, i) => ({
        ...page,
        label: i === 0 ? section.label : page.label,
        tab: page.label,
        section: section.label,
    }))),
    ...ACCOUNT_PAGES.map((page) => ({...page, tab: page.label, section: 'Account'})),
];

// The full registry: what the tests hold to page files, and what an owner sees.
export const NAV_PAGES: readonly NavDestination[] = pagesOf(NAV_SECTIONS);

// Who is looking: the (root) layout decides from the session (lib/lab/owner.ts) and hands the
// audience's lists to every nav surface. For anyone else an owner section is dropped whole and an
// owner page from its section, whose first visible page then takes its name and its rail icon; a
// section left with no page goes too, so no icon ever leads nowhere.
export type NavAudience = {owner: boolean};

export const navSectionsFor = ({owner}: NavAudience): readonly NavSection[] =>
    owner ? NAV_SECTIONS : NAV_SECTIONS
        .filter((section) => !section.owner)
        .map((section) => ({...section, pages: section.pages.filter((page) => !page.owner)}))
        .filter((section) => section.pages.length > 0);

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

// ⌘K's "go to page" rows: a destination whose name, whose tab's, or whose section's starts a
// word of the query's way — "port" finds Portfolio and its Activity tab, "act" only Activity,
// "trade" the desk under its Markets name. Compared as plain lower-case text: the query never
// becomes a regex (invariant 2).
export const searchPages = (query: string, limit = 5, pages: readonly NavDestination[] = NAV_PAGES): NavDestination[] => {
    const q = query.trim().toLowerCase();
    if (!q) return [];
    const starts = (text: string) => text.toLowerCase().split(/\s+/).some((word) => word.startsWith(q));
    const byLabel = pages.filter((page) => starts(page.label) || starts(page.tab));
    const bySection = pages.filter((page) => !byLabel.includes(page) && starts(page.section));
    return [...byLabel, ...bySection].slice(0, limit);
};
