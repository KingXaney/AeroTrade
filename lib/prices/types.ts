// The stored price series' shapes that other features read: a T-bill rate point (^IRX's
// close, a discount yield in annual %) and a dividend per share on its ex-date. Pure types.

export type RatePoint = {date: string; discountPct: number};
export type DividendPoint = {symbol: string; exDate: string; perShare: number};

export type FinnhubSearchResult = {
    symbol: string;
    description: string;
    displaySymbol?: string;
    type: string;
};

export type QuoteData = {
    c?: number;
    dp?: number;
};
