'use server';

// The market-data reads client components call: the ⌘K search and the order ticket. One-to-one
// wrappers over the Finnhub client (lib/prices/finnhub.ts) — server code imports that directly.
// They take no user id, so they read nothing of anyone's.

import {getQuote as fetchQuote, searchStocks as fetchStocks} from "@/lib/prices/finnhub";
import type {QuoteData} from '@/lib/prices/types';
import type {Stock} from '@/lib/stocks/types';

export const searchStocks = async (query?: string): Promise<Stock[]> => fetchStocks(query);

export const getQuote = async (symbol: string): Promise<QuoteData> => fetchQuote(symbol);
