// A stock as search lists it, and a watchlist row with its live quote.

export type Stock = {
    symbol: string;
    name: string;
    exchange: string;
    type: string;
};

export type StockWithData = {
    userId: string;
    symbol: string;
    company: string;
    addedAt: Date;
    currentPrice?: number;
    changePercent?: number;
    priceFormatted?: string;
    changeFormatted?: string;
    marketCap?: string;
    peRatio?: string;
};
