// The stock search's curated default: what an empty query shows (lib/prices/finnhub.ts
// searchStocks), each as a card that links through to its /stocks page.
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
];

// The same companies by name. A list that saves what it shows needs them: /watchlist's add
// dialog stores the name beside the symbol (lib/stocks/watchlist-add.ts), and a saved name is
// the one the watchlist row prints. The test holds this to the symbols above, one name each.
export const POPULAR_STOCK_NAMES: Readonly<Record<string, string>> = {
    AAPL: 'Apple Inc',
    MSFT: 'Microsoft Corp',
    GOOGL: 'Alphabet Inc',
    AMZN: 'Amazon.com Inc',
    TSLA: 'Tesla Inc',
    META: 'Meta Platforms Inc',
    NVDA: 'NVIDIA Corp',
    NFLX: 'Netflix Inc',
    ORCL: 'Oracle Corp',
    CRM: 'Salesforce Inc',
    ADBE: 'Adobe Inc',
    INTC: 'Intel Corp',
    AMD: 'Advanced Micro Devices Inc',
    PYPL: 'PayPal Holdings Inc',
    UBER: 'Uber Technologies Inc',
};
