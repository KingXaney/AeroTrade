// The dashboard widget registry. Deliberately PURE — no React, no DB, no server
// imports — so the layout logic and its vitest suite run in plain node. Rendering
// lives in components/dashboard/widgets/registry.tsx and data loading in
// lib/dashboard/loaders.ts; both key off this table.
//
// Not widgets in v1, on purpose:
// - PositionsTable: needs the full width plus an account-scoped sell flow.
// - WatchlistTable: unbounded Finnhub fan-out (one quote per row).
// - Full SecondOpinionCard: self-scheduled router.refresh() timers plus a paid
//   action; the read-only excerpt is the widget instead.
// - EvidenceList: driven by the ?entity= query param.
// - Pinned advanced chart: needs per-widget settings (v2).

export const WIDGET_SPANS = [3, 4, 6, 8, 12] as const;
export type WidgetSpan = (typeof WIDGET_SPANS)[number];

export const SPAN_LABELS: Record<WidgetSpan, string> = {3: 'XS', 4: 'S', 6: 'M', 8: 'L', 12: 'XL'};

export type WidgetCategory = 'topics' | 'personal' | 'markets' | 'strategy' | 'social' | 'brain' | 'tools';

// Library grouping order; WIDGET_IDS below is kept in this order too.
export const CATEGORY_ORDER: readonly WidgetCategory[] = ['topics', 'personal', 'markets', 'strategy', 'social', 'brain', 'tools'];

export const CATEGORY_LABELS: Record<WidgetCategory, string> = {
    topics: 'Topics',
    personal: 'Personal',
    markets: 'Markets',
    strategy: 'Strategy',
    social: 'Social',
    brain: 'News Brain & AI',
    tools: 'Tools',
};

export const DATA_KEYS = [
    'portfolios',
    'watchlistSymbols',
    'movers',
    'leaderboard',
    'theses',
    'suggestions',
    'activeAccount',
    'analytics',
    'trades',
    'comparisonStats',
    'navigatorStatus',
    'topEntities',
    'brainGraph',
    'brainStatus',
    'secondOpinion',
    'news',
    'topicsOverview',
    'topicsLatest',
] as const;
export type DataKey = (typeof DATA_KEYS)[number];

// A key's loader needs these keys' results first (movers are priced from the
// watchlist symbols, analytics belong to the active account, ...).
export const DATA_KEY_DEPS: Record<DataKey, readonly DataKey[]> = {
    portfolios: [],
    watchlistSymbols: [],
    movers: ['watchlistSymbols'],
    leaderboard: [],
    theses: [],
    suggestions: [],
    activeAccount: ['portfolios'],
    analytics: ['activeAccount'],
    trades: ['activeAccount'],
    comparisonStats: ['portfolios'],
    navigatorStatus: [],
    topEntities: [],
    brainGraph: [],
    brainStatus: [],
    secondOpinion: [],
    news: ['watchlistSymbols'],
    topicsOverview: [],
    topicsLatest: [],
};

// Streamed under <Suspense> because they are slow or fan out to third parties;
// their loaders resolve their own dependencies, so those never join the eager pass.
export const LAZY_DATA_KEYS: readonly DataKey[] = ['movers', 'news', 'analytics', 'brainStatus', 'topicsLatest'];

// 'link' = the clickable PersonalRow card · 'panel' = glass-panel + heading ·
// 'panel-lg' / 'panel-sm' = panel with the TradingView paddings · 'bare' = the
// component already draws its own glass-panel.
export type WidgetChrome = 'link' | 'panel' | 'panel-lg' | 'panel-sm' | 'bare';

export type WidgetAvailability = 'always' | 'multiAccount' | 'advanced';

export type AvailabilityContext = {
    accountCount: number;
    advanced: boolean;
};

export type WidgetDefinition = {
    id: WidgetId;
    title: string;
    description: string;
    category: WidgetCategory;
    icon: string;                     // Material Symbols name
    spans: readonly WidgetSpan[];     // ascending
    defaultSpan: WidgetSpan;
    minHeight: number;                // px; sizes the skeleton so the grid doesn't jump while streaming
    dataKeys: readonly DataKey[];
    availability: WidgetAvailability;
    chrome: WidgetChrome;
    href?: string;                    // required for 'link' chrome
    showTitle: boolean;
    wideOnTablet: boolean;            // iframes/charts that need the full row below xl
    isClient: boolean;
    heavy?: boolean;                  // extra third-party calls; surfaced as a badge in the library
    isNew?: boolean;                  // shipped after the layout system; badged so customised dashboards find it
};

export const WIDGET_IDS = [
    // topics
    'topics-overview',
    'topics-latest',
    'topic-briefs',
    // personal
    'portfolio-snapshot',
    'watchlist-movers',
    'friends-rank',
    'news-brain-tile',
    // markets
    'tv-heatmap',
    'tv-top-stories',
    'tv-ticker-tape',
    'tv-market-screener',
    'tv-crypto-screener',
    'tv-forex',
    // strategy
    'account-summary',
    'top-holdings',
    'open-positions',
    'recent-trades',
    'performance-chart',
    'analytics-stats',
    'strategy-comparison',
    // social
    'leaderboard',
    // brain
    'ai-navigator',
    'weekly-decisions',
    'active-theses',
    'narrative-leaderboard',
    'knowledge-graph',
    'second-opinion',
    'brain-status',
    // tools
    'quick-trade',
    'market-news',
    'quick-links',
] as const;
export type WidgetId = (typeof WIDGET_IDS)[number];

type RequiredFields = 'id' | 'title' | 'description' | 'category' | 'icon' | 'spans' | 'defaultSpan' | 'minHeight';
type WidgetInput<Id extends WidgetId> = Pick<WidgetDefinition, RequiredFields> & {id: Id} & Partial<Omit<WidgetDefinition, RequiredFields>>;

const define = <Id extends WidgetId>(input: WidgetInput<Id>): WidgetDefinition & {id: Id} => ({
    dataKeys: [],
    availability: 'always',
    chrome: 'panel',
    showTitle: true,
    wideOnTablet: false,
    isClient: false,
    ...input,
});

const tradingView = <Id extends WidgetId>(input: WidgetInput<Id>): WidgetDefinition & {id: Id} =>
    define({chrome: 'panel-lg', isClient: true, wideOnTablet: true, ...input});

export const WIDGETS: {readonly [K in WidgetId]: WidgetDefinition & {id: K}} = {
    // --- Topics (what the user follows; the topics-first default starts here) ---
    'topics-overview': define({
        id: 'topics-overview',
        title: 'Your topics',
        description: 'Everything you follow, with what\'s new since your last visit.',
        category: 'topics',
        icon: 'interests',
        spans: [4, 6, 8, 12],
        defaultSpan: 4,
        minHeight: 200,
        dataKeys: ['topicsOverview'],
        isNew: true,
    }),
    'topics-latest': define({
        id: 'topics-latest',
        title: 'Latest across your topics',
        description: 'The newest articles matched to any topic you follow.',
        category: 'topics',
        icon: 'feed',
        spans: [6, 8, 12],
        defaultSpan: 8,
        minHeight: 320,
        dataKeys: ['topicsLatest'],
        isNew: true,
    }),
    'topic-briefs': define({
        id: 'topic-briefs',
        title: 'Today\'s briefs',
        description: 'The AI "what changed today" summary for each topic with fresh news.',
        category: 'topics',
        icon: 'auto_awesome',
        spans: [6, 8, 12],
        defaultSpan: 6,
        minHeight: 240,
        dataKeys: ['topicsOverview'],
        isNew: true,
    }),

    // --- Personal ---
    'portfolio-snapshot': define({
        id: 'portfolio-snapshot',
        title: 'Portfolio',
        description: 'Total value, return and cash across all your strategy accounts.',
        category: 'personal',
        icon: 'account_balance_wallet',
        spans: [3, 4, 6],
        defaultSpan: 4,
        minHeight: 160,
        dataKeys: ['portfolios'],
        chrome: 'link',
        href: '/portfolio',
    }),
    'watchlist-movers': define({
        id: 'watchlist-movers',
        title: 'Watchlist movers',
        description: 'The biggest movers on your watchlist right now.',
        category: 'personal',
        icon: 'trending_up',
        spans: [3, 4, 6],
        defaultSpan: 4,
        minHeight: 160,
        dataKeys: ['movers'],
        chrome: 'link',
        href: '/watchlist',
        heavy: true,
    }),
    'friends-rank': define({
        id: 'friends-rank',
        title: 'Friends',
        description: 'Where you stand among your friends on total return.',
        category: 'personal',
        icon: 'group',
        spans: [3, 4, 6],
        defaultSpan: 4,
        minHeight: 160,
        dataKeys: ['leaderboard'],
        chrome: 'link',
        href: '/friends',
    }),
    'news-brain-tile': define({
        id: 'news-brain-tile',
        title: 'News Brain',
        description: 'The strongest live thesis and the latest Navigator decisions.',
        category: 'personal',
        icon: 'neurology',
        spans: [6, 8, 12],
        defaultSpan: 12,
        minHeight: 72,
        dataKeys: ['theses', 'suggestions'],
        chrome: 'link',
        href: '/brain',
        showTitle: false,
    }),

    // --- Markets (TradingView embeds, no data of our own) ---
    'tv-heatmap': tradingView({
        id: 'tv-heatmap',
        title: 'Market Heatmap',
        description: 'The market sized by market cap and coloured by today\'s move.',
        category: 'markets',
        icon: 'grid_view',
        spans: [6, 8, 12],
        defaultSpan: 8,
        minHeight: 460,
    }),
    'tv-top-stories': tradingView({
        id: 'tv-top-stories',
        title: 'Top Stories',
        description: 'A live timeline of market headlines.',
        category: 'markets',
        icon: 'newspaper',
        spans: [4, 6, 8],
        defaultSpan: 4,
        minHeight: 460,
    }),
    'tv-ticker-tape': tradingView({
        id: 'tv-ticker-tape',
        title: 'Ticker Tape',
        description: 'A scrolling strip of index, crypto and FX quotes.',
        category: 'markets',
        icon: 'ssid_chart',
        spans: [8, 12],
        defaultSpan: 12,
        minHeight: 72,
        chrome: 'panel-sm',
        showTitle: false,
    }),
    'tv-market-screener': tradingView({
        id: 'tv-market-screener',
        title: 'Market Screener',
        description: 'Screen US stocks by price, change and volume.',
        category: 'markets',
        icon: 'filter_list',
        spans: [8, 12],
        defaultSpan: 12,
        minHeight: 460,
        heavy: true,
    }),
    'tv-crypto-screener': tradingView({
        id: 'tv-crypto-screener',
        title: 'Crypto Screener',
        description: 'Screen crypto pairs by price and 24h change.',
        category: 'markets',
        icon: 'currency_bitcoin',
        spans: [6, 8, 12],
        defaultSpan: 8,
        minHeight: 460,
        heavy: true,
    }),
    'tv-forex': tradingView({
        id: 'tv-forex',
        title: 'Forex Cross Rates',
        description: 'Cross rates for the major currency pairs.',
        category: 'markets',
        icon: 'currency_exchange',
        spans: [6, 8, 12],
        defaultSpan: 6,
        minHeight: 400,
    }),

    // --- Strategy ---
    'account-summary': define({
        id: 'account-summary',
        title: 'Account Summary',
        description: 'Cash, holdings value, total value and return across all strategies.',
        category: 'strategy',
        icon: 'account_balance',
        spans: [6, 8, 12],
        defaultSpan: 12,
        minHeight: 120,
        dataKeys: ['portfolios'],
        chrome: 'bare',
        showTitle: false,
    }),
    'top-holdings': define({
        id: 'top-holdings',
        title: 'Top Holdings',
        description: 'Your six largest positions in the active strategy, with a link to the full list.',
        category: 'strategy',
        icon: 'pie_chart',
        spans: [6, 8, 12],
        defaultSpan: 8,
        minHeight: 280,
        dataKeys: ['activeAccount'],
    }),
    'open-positions': define({
        id: 'open-positions',
        title: 'Open Positions',
        description: 'Every open position in the active strategy, with quick sell.',
        category: 'strategy',
        icon: 'candlestick_chart',
        spans: [8, 12],
        defaultSpan: 12,
        minHeight: 200,
        dataKeys: ['activeAccount'],
        isClient: true,
    }),
    'recent-trades': define({
        id: 'recent-trades',
        title: 'Recent Trades',
        description: 'The last eight fills in the active strategy.',
        category: 'strategy',
        icon: 'history',
        spans: [4, 6, 8, 12],
        defaultSpan: 6,
        minHeight: 280,
        dataKeys: ['trades'],
    }),
    'performance-chart': define({
        id: 'performance-chart',
        title: 'Performance vs S&P 500',
        description: 'Return since inception versus the S&P 500 for the active strategy.',
        category: 'strategy',
        icon: 'show_chart',
        spans: [6, 8, 12],
        defaultSpan: 8,
        minHeight: 320,
        dataKeys: ['activeAccount', 'analytics'],
        isClient: true,
        wideOnTablet: true,
    }),
    'analytics-stats': define({
        id: 'analytics-stats',
        title: 'Analytics',
        description: 'Win rate, max drawdown, realised P&L and trade count for the active strategy.',
        category: 'strategy',
        icon: 'analytics',
        spans: [6, 8, 12],
        defaultSpan: 12,
        minHeight: 120,
        dataKeys: ['activeAccount', 'analytics'],
        chrome: 'bare',
        showTitle: false,
    }),
    'strategy-comparison': define({
        id: 'strategy-comparison',
        title: 'Strategy Comparison',
        description: 'Every strategy account side by side — which one is winning.',
        category: 'strategy',
        icon: 'compare_arrows',
        spans: [8, 12],
        defaultSpan: 12,
        minHeight: 200,
        dataKeys: ['activeAccount', 'comparisonStats'],
        availability: 'multiAccount',
        isClient: true,
    }),

    // --- Social ---
    leaderboard: define({
        id: 'leaderboard',
        title: 'Leaderboard',
        description: 'The full friends leaderboard ranked by total return.',
        category: 'social',
        icon: 'leaderboard',
        spans: [4, 6, 8, 12],
        defaultSpan: 6,
        minHeight: 280,
        dataKeys: ['leaderboard'],
        chrome: 'bare',
        showTitle: false,
    }),

    // --- Brain ---
    'ai-navigator': define({
        id: 'ai-navigator',
        title: 'AI Navigator',
        description: 'Enrol a strategy in the weekly AI Navigator and watch its status.',
        category: 'brain',
        icon: 'explore',
        spans: [3, 4, 6],
        defaultSpan: 4,
        minHeight: 200,
        dataKeys: ['navigatorStatus'],
        chrome: 'bare',
        showTitle: false,
        isClient: true,
    }),
    'weekly-decisions': define({
        id: 'weekly-decisions',
        title: 'Weekly Decisions',
        description: 'This week\'s Navigator buy, sell and hold calls, with one-click apply.',
        category: 'brain',
        icon: 'checklist',
        spans: [4, 6, 8, 12],
        defaultSpan: 6,
        minHeight: 280,
        dataKeys: ['suggestions', 'portfolios'],
        isClient: true,
    }),
    'active-theses': define({
        id: 'active-theses',
        title: 'Active Theses',
        description: 'The market narratives the news brain currently believes in.',
        category: 'brain',
        icon: 'psychology',
        spans: [4, 6, 8, 12],
        defaultSpan: 6,
        minHeight: 280,
        dataKeys: ['theses'],
    }),
    'narrative-leaderboard': define({
        id: 'narrative-leaderboard',
        title: 'Narrative Leaderboard',
        description: 'The entities gathering the most weight in recent news.',
        category: 'brain',
        icon: 'format_list_numbered',
        spans: [6, 8, 12],
        defaultSpan: 12,
        minHeight: 240,
        dataKeys: ['topEntities'],
    }),
    'knowledge-graph': define({
        id: 'knowledge-graph',
        title: 'Knowledge Graph',
        description: 'How the brain\'s tickers, sectors and themes connect.',
        category: 'brain',
        icon: 'hub',
        spans: [8, 12],
        defaultSpan: 12,
        minHeight: 420,
        dataKeys: ['brainGraph'],
        isClient: true,
        wideOnTablet: true,
    }),
    'second-opinion': define({
        id: 'second-opinion',
        title: 'Second Opinion',
        description: 'Claude\'s latest critique of the brain\'s picture, read-only.',
        category: 'brain',
        icon: 'rate_review',
        spans: [4, 6, 8, 12],
        defaultSpan: 6,
        minHeight: 240,
        dataKeys: ['secondOpinion'],
    }),
    'brain-status': define({
        id: 'brain-status',
        title: 'Brain Status',
        description: 'Ingestion, extraction and scoring health for the news brain.',
        category: 'brain',
        icon: 'monitor_heart',
        spans: [8, 12],
        defaultSpan: 12,
        minHeight: 120,
        dataKeys: ['brainStatus'],
        availability: 'advanced',
        chrome: 'bare',
        showTitle: false,
    }),

    // --- Tools ---
    'quick-trade': define({
        id: 'quick-trade',
        title: 'Quick Trade',
        description: 'Place a paper order in the active strategy without leaving the dashboard.',
        category: 'tools',
        icon: 'bolt',
        spans: [3, 4, 6],
        defaultSpan: 4,
        minHeight: 360,
        dataKeys: ['activeAccount'],
        chrome: 'bare',
        showTitle: false,
        isClient: true,
    }),
    'market-news': define({
        id: 'market-news',
        title: 'Market News',
        description: 'Latest headlines for your watchlist symbols.',
        category: 'tools',
        icon: 'feed',
        spans: [4, 6, 8, 12],
        defaultSpan: 6,
        minHeight: 320,
        dataKeys: ['news'],
        heavy: true,
    }),
    'quick-links': define({
        id: 'quick-links',
        title: 'Quick Links',
        description: 'Shortcuts to the pages you use most.',
        category: 'tools',
        icon: 'link',
        spans: [3, 4, 6],
        defaultSpan: 4,
        minHeight: 160,
    }),
};

export const isWidgetId = (value: unknown): value is WidgetId =>
    typeof value === 'string' && Object.prototype.hasOwnProperty.call(WIDGETS, value);

// Nearest allowed span for the widget; ties go to the smaller span so a
// clamped layout never grows. Unknown ids get the full row, which is always safe.
export const clampSpan = (id: string, span: number): WidgetSpan => {
    if (!isWidgetId(id)) return 12;
    const spans = WIDGETS[id].spans;
    let best = spans[0];
    for (const candidate of spans) {
        if (Math.abs(candidate - span) < Math.abs(best - span)) best = candidate;
    }
    return best;
};

export const isWidgetAvailable = (def: WidgetDefinition, ctx: AvailabilityContext): boolean => {
    switch (def.availability) {
        case 'always':
            return true;
        case 'multiAccount':
            return ctx.accountCount > 1;
        case 'advanced':
            return ctx.advanced;
    }
};

export type ResolvedDataKeys = {
    eager: DataKey[];
    lazy: DataKey[];
    needsActiveAccount: boolean;
};

const byDeclarationOrder = (a: DataKey, b: DataKey) => DATA_KEYS.indexOf(a) - DATA_KEYS.indexOf(b);

// Splits the transitive data needs of a set of widgets into the eager pass
// (one Promise.all before render) and the lazy pass (streamed under Suspense).
// Expansion stops at a lazy key: its loader fetches its own dependencies, so
// e.g. movers alone never drags watchlistSymbols into the eager pass.
export const resolveDataKeys = (ids: readonly WidgetId[]): ResolvedDataKeys => {
    const eager = new Set<DataKey>();
    const lazy = new Set<DataKey>();
    const everything = new Set<DataKey>();

    const visitAll = (key: DataKey) => {
        if (everything.has(key)) return;
        everything.add(key);
        DATA_KEY_DEPS[key].forEach(visitAll);
    };
    const visit = (key: DataKey) => {
        if (eager.has(key) || lazy.has(key)) return;
        if (LAZY_DATA_KEYS.includes(key)) {
            lazy.add(key);
            return;
        }
        eager.add(key);
        DATA_KEY_DEPS[key].forEach(visit);
    };

    for (const id of ids) {
        const def = WIDGETS[id];
        if (!def) continue;
        def.dataKeys.forEach(visit);
        def.dataKeys.forEach(visitAll);
    }

    return {
        eager: [...eager].sort(byDeclarationOrder),
        lazy: [...lazy].sort(byDeclarationOrder),
        // The account switcher must appear for any account-scoped widget, even one
        // whose only account-scoped key is fetched lazily.
        needsActiveAccount: everything.has('activeAccount'),
    };
};
