// A symbol's row for the watchlist and the dashboard's movers: its price and day change from
// the quote sheet (one read for the whole list — lib/prices/quote-store.ts), its name, market
// cap and P/E from Finnhub's profile and financials. Server only.

import {formatChangePercent, formatMarketCapValue, formatPrice} from "@/lib/format";
import {getCompanyProfile, getFinancials} from "@/lib/prices/finnhub";
import {getSheetQuotes} from "@/lib/prices/quote-store";
import type {StockWithData} from '@/lib/stocks/types';

// Callers (the watchlist page) layer their own company and addedAt on top of these rows.
export const getStocksWithData = async (symbols: string[]): Promise<StockWithData[]> => {
    if (!symbols || symbols.length === 0) return [];
    const unique = Array.from(new Set(symbols.map((s) => s.trim().toUpperCase()))).filter(Boolean);

    const quotes = getSheetQuotes(unique);
    return Promise.all(
        unique.map(async (symbol) => {
            const [sheet, profile, financials] = await Promise.all([
                quotes,
                getCompanyProfile(symbol),
                getFinancials(symbol),
            ]);
            const quote = sheet.get(symbol);

            const peRatio = financials.metric?.peTTM ?? financials.metric?.peBasicExclExtraTTM;
            const marketCapUsd = (profile.marketCapitalization ?? 0) * 1_000_000; // Finnhub returns millions

            return {
                userId: '',
                symbol,
                company: profile.name || symbol,
                addedAt: new Date(0),
                currentPrice: quote?.price,
                changePercent: quote?.changePercent,
                priceFormatted: quote ? formatPrice(quote.price) : undefined,
                changeFormatted: formatChangePercent(quote?.changePercent) || undefined,
                marketCap: profile.marketCapitalization ? formatMarketCapValue(marketCapUsd) : undefined,
                peRatio: typeof peRatio === 'number' && Number.isFinite(peRatio) ? peRatio.toFixed(2) : undefined,
            } satisfies StockWithData;
        }),
    );
};
