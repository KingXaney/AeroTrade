// Header order: topics first, then the dashboard and the market pages. Watchlist,
// Friends and History stay reachable from the sidebar, the dropdown and ⌘K.
export const NAV_ITEMS = [
    { href: '/topics', label: 'Topics' },
    { href: '/', label: 'Dashboard' },
    { href: '/brain', label: 'Brain' },
    { href: '/portfolio', label: 'Portfolio' },
    { href: '/trade', label: 'Trade' },
    { href: '/markets', label: 'Markets' },
    { href: '/search', label: 'Search' },
];

// Paper-trading: default starting virtual cash; users may pick a custom amount
// at account creation / AI enrollment within these bounds.
export const PAPER_STARTING_BALANCE = 100_000;
export const MIN_STARTING_BALANCE = 1_000;
export const MAX_STARTING_BALANCE = 10_000_000;

// Paper-trading: max strategy accounts per user.
export const MAX_PAPER_ACCOUNTS = 10;

// Benchmark ETF snapshotted daily for the performance comparison chart.
export const BENCHMARK_SYMBOL = 'SPY';

// HTTP-only cookie holding the id of the strategy account the UI operates on.
export const ACTIVE_ACCOUNT_COOKIE = 'aero-active-account';

// Sign-up form select options
export const INVESTMENT_GOALS = [
    { value: 'Growth', label: 'Growth' },
    { value: 'Income', label: 'Income' },
    { value: 'Balanced', label: 'Balanced' },
    { value: 'Conservative', label: 'Conservative' },
];

export const RISK_TOLERANCE_OPTIONS = [
    { value: 'Low', label: 'Low' },
    { value: 'Medium', label: 'Medium' },
    { value: 'High', label: 'High' },
];

export const PREFERRED_INDUSTRIES = [
    { value: 'Technology', label: 'Technology' },
    { value: 'Healthcare', label: 'Healthcare' },
    { value: 'Finance', label: 'Finance' },
    { value: 'Energy', label: 'Energy' },
    { value: 'Consumer Goods', label: 'Consumer Goods' },
];

// TradingView embed script base; each widget appends its script name (e.g. `stock-heatmap.js`).
export const TV_SCRIPT_BASE = 'https://s3.tradingview.com/external-embedding/embed-widget-';

export const HEATMAP_WIDGET_CONFIG = {
    dataSource: 'SPX500',
    blockSize: 'market_cap_basic',
    blockColor: 'change',
    grouping: 'sector',
    isTransparent: true,
    locale: 'en',
    symbolUrl: '',
    colorTheme: 'dark',
    exchanges: [],
    hasTopBar: false,
    isDataSetEnabled: false,
    isZoomEnabled: true,
    hasSymbolTooltip: true,
    isMonoSize: false,
    width: '100%',
    height: '600',
};

export const TOP_STORIES_WIDGET_CONFIG = {
    displayMode: 'regular',
    feedMode: 'market',
    colorTheme: 'dark',
    isTransparent: true,
    locale: 'en',
    market: 'stock',
    width: '100%',
    height: '600',
};

export const SYMBOL_INFO_WIDGET_CONFIG = (symbol: string) => ({
    symbol: symbol.toUpperCase(),
    colorTheme: 'dark',
    isTransparent: true,
    locale: 'en',
    width: '100%',
    height: 170,
});

export const CANDLE_CHART_WIDGET_CONFIG = (symbol: string) => ({
    allow_symbol_change: false,
    calendar: false,
    details: true,
    hide_side_toolbar: true,
    hide_top_toolbar: false,
    hide_legend: false,
    hide_volume: false,
    hotlist: false,
    interval: 'D',
    locale: 'en',
    save_image: false,
    style: 1,
    symbol: symbol.toUpperCase(),
    theme: 'dark',
    timezone: 'Etc/UTC',
    backgroundColor: '#111318',
    gridColor: '#111318',
    watchlist: [],
    withdateranges: false,
    compareSymbols: [],
    studies: [],
    width: '100%',
    height: 600,
});

export const TECHNICAL_ANALYSIS_WIDGET_CONFIG = (symbol: string) => ({
    symbol: symbol.toUpperCase(),
    colorTheme: 'dark',
    isTransparent: 'true',
    locale: 'en',
    width: '100%',
    height: 400,
    interval: '1h',
    largeChartUrl: '',
});

export const COMPANY_PROFILE_WIDGET_CONFIG = (symbol: string) => ({
    symbol: symbol.toUpperCase(),
    colorTheme: 'dark',
    isTransparent: 'true',
    locale: 'en',
    width: '100%',
    height: 440,
});

export const COMPANY_FINANCIALS_WIDGET_CONFIG = (symbol: string) => ({
    symbol: symbol.toUpperCase(),
    colorTheme: 'dark',
    isTransparent: 'true',
    locale: 'en',
    width: '100%',
    height: 464,
    displayMode: 'regular',
    largeChartUrl: '',
});

// --- Markets page widgets ---
export const TICKER_TAPE_WIDGET_CONFIG = {
    symbols: [
        { proName: 'FOREXCOM:SPXUSD', title: 'S&P 500' },
        { proName: 'FOREXCOM:NSXUSD', title: 'Nasdaq 100' },
        { proName: 'NASDAQ:AAPL', title: 'Apple' },
        { proName: 'NASDAQ:NVDA', title: 'Nvidia' },
        { proName: 'NASDAQ:TSLA', title: 'Tesla' },
        { proName: 'BITSTAMP:BTCUSD', title: 'Bitcoin' },
        { proName: 'BITSTAMP:ETHUSD', title: 'Ethereum' },
    ],
    showSymbolLogo: true,
    isTransparent: true,
    displayMode: 'adaptive',
    colorTheme: 'dark',
    locale: 'en',
};

export const MARKET_SCREENER_WIDGET_CONFIG = {
    width: '100%',
    height: 600,
    defaultColumn: 'overview',
    defaultScreen: 'most_capitalized',
    market: 'america',
    showToolbar: true,
    colorTheme: 'dark',
    locale: 'en',
    isTransparent: true,
};

export const CRYPTO_SCREENER_WIDGET_CONFIG = {
    width: '100%',
    height: 490,
    defaultColumn: 'overview',
    screener_type: 'crypto_mkt',
    displayCurrency: 'USD',
    colorTheme: 'dark',
    locale: 'en',
    isTransparent: true,
};

export const FOREX_CROSS_RATES_WIDGET_CONFIG = {
    width: '100%',
    height: 490,
    currencies: ['EUR', 'USD', 'JPY', 'GBP', 'CHF', 'AUD', 'CAD'],
    isTransparent: true,
    colorTheme: 'dark',
    locale: 'en',
    backgroundColor: '#111318',
};

// --- Trade page: full advanced chart with symbol search + drawing toolbar enabled ---
export const TRADE_CHART_WIDGET_CONFIG = (symbol: string) => ({
    allow_symbol_change: true,
    calendar: false,
    details: true,
    hide_side_toolbar: false,
    hide_top_toolbar: false,
    hide_legend: false,
    hide_volume: false,
    hotlist: true,
    interval: 'D',
    locale: 'en',
    save_image: true,
    style: 1,
    symbol: symbol.toUpperCase(),
    theme: 'dark',
    timezone: 'Etc/UTC',
    backgroundColor: '#111318',
    gridColor: '#111318',
    watchlist: [],
    withdateranges: true,
    compareSymbols: [],
    studies: [],
    width: '100%',
    height: 640,
});

export const POPULAR_STOCK_SYMBOLS = [
    // Tech Giants (the big technology companies)
    'AAPL',
    'MSFT',
    'GOOGL',
    'AMZN',
    'TSLA',
    'META',
    'NVDA',
    'NFLX',
    'ORCL',
    'CRM',

    // Growing Tech Companies
    'ADBE',
    'INTC',
    'AMD',
    'PYPL',
    'UBER',
    'ZOOM',
    'SPOT',
    'SQ',
    'SHOP',
    'ROKU',

    // Newer Tech Companies
    'SNOW',
    'PLTR',
    'COIN',
    'RBLX',
    'DDOG',
    'CRWD',
    'NET',
    'OKTA',
    'TWLO',
    'ZM',

    // Consumer & Delivery Apps
    'DOCU',
    'PTON',
    'PINS',
    'SNAP',
    'LYFT',
    'DASH',
    'ABNB',
    'RIVN',
    'LCID',
    'NIO',

    // International Companies
    'XPEV',
    'LI',
    'BABA',
    'JD',
    'PDD',
    'TME',
    'BILI',
    'DIDI',
    'GRAB',
    'SE',
];

// --- Chat assistant ---
export const CHAT_WELCOME_MESSAGE =
    "Hi — I'm your AeroTrade Advisor. Ask what's new in your topics, follow something new, look up a stock, or manage your watchlist.";

export const CHAT_SUGGESTIONS = [
    "What's new in my topics?",
    "Follow news about AI chips",
    "How is my paper portfolio doing?",
    "What's in my watchlist?",
    "Should I add NVDA?",
];