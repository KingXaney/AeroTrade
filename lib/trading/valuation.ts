// What an account is worth: live, every holding priced from one shared quote map, or stored, a
// day's closing snapshot. computePortfolio and aggregatePortfolios are pure; the rest read.
// Server-only (NOT 'use server').

import {cache} from "react";
import {connectToDatabase} from "@/database/mongoose";
import AccountSnapshot from "@/database/models/account-snapshot.model";
import {getQuote} from "@/lib/prices/finnhub";
import {getLatestBars} from "@/lib/prices/store";
import {addCalendarDays, getEasternDateString} from "@/lib/dates";
import {CLOSE_FALLBACK_DAYS} from "@/lib/trading/config";
import {enrichPosition, symbolsWithoutPrice, withStoredCloses, type PriceInfo} from "@/lib/trading/analytics";
import {getAccountsForUser, getCachedAccountsForUser, getOwnedAccount, toAccountSummary, toPlainPositions} from "@/lib/trading/accounts";
import type {AccountWithPortfolio, EnrichedPosition, PaperPosition, PortfolioSummary} from '@/lib/trading/types';

// Minimal plain shape used to compute a portfolio (works for Mongoose docs after
// mapping, lean docs, or a synthesized default account).
export type AccountLike = {cash: number; startingBalance: number; positions: PaperPosition[]};

// Build a symbol -> live price map. One Finnhub quote call per unique symbol
// (company names come from the stored position, so no profile/financials calls).
export const buildPriceMap = async (symbols: string[]): Promise<Map<string, PriceInfo>> => {
    const map = new Map<string, PriceInfo>();
    const unique = Array.from(new Set(symbols.map((s) => s.toUpperCase()))).filter(Boolean);
    if (unique.length === 0) return map;

    const quotes = await Promise.all(unique.map((s) => getQuote(s)));
    unique.forEach((symbol, i) => {
        const q = quotes[i];
        map.set(symbol, {
            // c <= 0 means Finnhub doesn't know the symbol (delisted/unknown) — treat as missing,
            // never as a real $0 price.
            price: typeof q.c === 'number' && q.c > 0 ? q.c : undefined,
            changePercent: q.dp,
        });
    });
    return map;
};

// The quote map a page values holdings with: live quotes first, then, for each symbol Finnhub gave
// no price (a 429 under a burst of page loads, an outage), its newest stored daily close within
// CLOSE_FALLBACK_DAYS, dated (PriceInfo.closeDate), so a refusal shows the last close instead of
// the cost basis. Request paths only: the snapshot job, fills and the Navigator's plan keep
// buildPriceMap, where a missing quote must stay missing. A failed bars read is no fallback.
export const buildHoldingsPriceMap = async (symbols: string[]): Promise<Map<string, PriceInfo>> => {
    const live = await buildPriceMap(symbols);
    const missing = symbolsWithoutPrice(live);
    if (missing.length === 0) return live;
    const today = getEasternDateString();
    const closes = await getLatestBars(missing, {since: addCalendarDays(today, -CLOSE_FALLBACK_DAYS), onOrBefore: today})
        .catch((error) => {
            console.error('Stored closes for unquoted holdings could not be read:', error);
            return new Map<string, {date: string; close: number}>();
        });
    return withStoredCloses(live, closes);
};

// Pure computation: turn a stored account + price map into a serializable portfolio summary.
export const computePortfolio = (
    account: AccountLike,
    priceMap: Map<string, PriceInfo>,
): PortfolioSummary => {
    const positions: EnrichedPosition[] = account.positions.map((p) =>
        enrichPosition(p, priceMap.get(p.symbol.toUpperCase())),
    );

    const holdingsValue = positions.reduce((sum, p) => sum + p.marketValue, 0);
    const totalValue = account.cash + holdingsValue;
    const totalReturnAbs = totalValue - account.startingBalance;
    const totalReturnPct = account.startingBalance > 0 ? (totalReturnAbs / account.startingBalance) * 100 : 0;

    return {
        startingBalance: account.startingBalance,
        cash: account.cash,
        positions: positions.sort((a, b) => b.marketValue - a.marketValue),
        holdingsValue,
        totalValue,
        totalReturnAbs,
        totalReturnPct,
    };
};

// Full portfolio for one account (prices fetched fresh). Without an owned accountId this
// falls back to the user's first account.
export const getPortfolio = async (userId: string, accountId?: string): Promise<PortfolioSummary> => {
    const account = (accountId ? await getOwnedAccount(userId, accountId) : null)
        ?? (await getAccountsForUser(userId))[0];
    const positions = toPlainPositions(account);
    const priceMap = await buildHoldingsPriceMap(positions.map((p) => p.symbol));
    return computePortfolio({cash: account.cash, startingBalance: account.startingBalance, positions}, priceMap);
};

// Every account priced from ONE shared quote map (same trick as the friends leaderboard).
// cache() dedupes within one server render (layout + dashboard widgets); it is a
// pass-through outside React, so Inngest callers are unaffected.
export const getPortfoliosForUser = cache(async (userId: string): Promise<AccountWithPortfolio[]> => {
    const accounts = await getCachedAccountsForUser(userId);
    const allSymbols = accounts.flatMap((a) => a.positions.map((p) => p.symbol));
    const priceMap = await buildHoldingsPriceMap(allSymbols);
    return accounts.map((a) => ({
        account: toAccountSummary(a),
        summary: computePortfolio(
            {cash: a.cash, startingBalance: a.startingBalance, positions: toPlainPositions(a)},
            priceMap,
        ),
    }));
});

// Pure: collapse all of a user's paper accounts into one summary (sidebar/dashboard).
export const aggregatePortfolios = (list: AccountWithPortfolio[]): PortfolioSummary => {
    const cash = list.reduce((sum, x) => sum + x.summary.cash, 0);
    const startingBalance = list.reduce((sum, x) => sum + x.summary.startingBalance, 0);
    const holdingsValue = list.reduce((sum, x) => sum + x.summary.holdingsValue, 0);
    const positions = list
        .flatMap((x) => x.summary.positions)
        .sort((a, b) => b.marketValue - a.marketValue);
    const totalValue = cash + holdingsValue;
    const totalReturnAbs = totalValue - startingBalance;
    const totalReturnPct = startingBalance > 0 ? (totalReturnAbs / startingBalance) * 100 : 0;

    return {startingBalance, cash, positions, holdingsValue, totalValue, totalReturnAbs, totalReturnPct};
};

// The account's latest stored daily snapshot dated from `from` through `to` — a closing value
// the snapshot job wrote with every holding priced, never a live one. One point read on the
// {accountId, date} index; null when there is none in the range.
export const getLastSnapshotBetween = async (
    accountId: string,
    from: string,
    to: string,
): Promise<{date: string; totalValue: number; startingBalance: number} | null> => {
    if (from > to) return null;
    await connectToDatabase();
    return AccountSnapshot.findOne({accountId, date: {$gte: from, $lte: to}}, {_id: 0, date: 1, totalValue: 1, startingBalance: 1})
        .sort({date: -1})
        .lean<{date: string; totalValue: number; startingBalance: number} | null>();
};
