// Every TradingView embed the app shows: the script each one loads and the settings it starts
// from. components/TradingViewWidget themes a config as it renders (colour mode, surface colour)
// and each surface picks the height, so one embed can sit taller on /markets than in a dashboard
// tile. Pure and client-safe — the dashboard widgets and the trade desk are client components.

const SCRIPT_BASE = 'https://s3.tradingview.com/external-embedding/embed-widget-';

type TradingViewScript =
    | 'advanced-chart'
    | 'financials'
    | 'forex-cross-rates'
    | 'screener'
    | 'stock-heatmap'
    | 'symbol-info'
    | 'symbol-profile'
    | 'technical-analysis'
    | 'ticker-tape'
    | 'timeline';

// The embed script for a widget, e.g. tvScript('stock-heatmap') → …/embed-widget-stock-heatmap.js.
export const tvScript = (name: TradingViewScript): string => `${SCRIPT_BASE}${name}.js`;

const HEATMAP_WIDGET_CONFIG = {
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

const TOP_STORIES_WIDGET_CONFIG = {
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
const TICKER_TAPE_WIDGET_CONFIG = {
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

const MARKET_SCREENER_WIDGET_CONFIG = {
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

const CRYPTO_SCREENER_WIDGET_CONFIG = {
    width: '100%',
    height: 490,
    defaultColumn: 'overview',
    screener_type: 'crypto_mkt',
    displayCurrency: 'USD',
    colorTheme: 'dark',
    locale: 'en',
    isTransparent: true,
};

const FOREX_CROSS_RATES_WIDGET_CONFIG = {
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

// The market-wide embeds, each its script and its config. /markets (its ticker tape and tabs) and
// the dashboard's TradingView widgets render these at their own heights; module-level, so a
// config keeps a stable identity and an embed re-inits only on a theme change.
export const MARKET_EMBEDS = {
    heatmap: {script: tvScript('stock-heatmap'), config: HEATMAP_WIDGET_CONFIG},
    topStories: {script: tvScript('timeline'), config: TOP_STORIES_WIDGET_CONFIG},
    tickerTape: {script: tvScript('ticker-tape'), config: TICKER_TAPE_WIDGET_CONFIG},
    stockScreener: {script: tvScript('screener'), config: MARKET_SCREENER_WIDGET_CONFIG},
    cryptoScreener: {script: tvScript('screener'), config: CRYPTO_SCREENER_WIDGET_CONFIG},
    forex: {script: tvScript('forex-cross-rates'), config: FOREX_CROSS_RATES_WIDGET_CONFIG},
};
