// The learner's own figure for the metric the chat is defining: "what is MY max drawdown?"
// explainTerm answers with the glossary entry plus, for the keys below, one value per paper
// account. Each key reads the least it needs:
//   buying-power, income       — the account documents themselves (readAccountsForUser);
//   win-rate, realized-pnl     — the account's sells, counted and summed in the database;
//   total-return, max-drawdown — the priced path, quoting at most CHAT_MAX_PRICED_SYMBOLS.
// No reader touches PaperTrade.reason: a learner's "why" notes are theirs, never the tutor's.
// Server-only and DB-bound, so browser QA covers it (invariant 1); lib/ai/explain.ts shapes
// what comes back.

import AccountSnapshot from "@/database/models/account-snapshot.model";
import PaperTrade from "@/database/models/paper-trade.model";
import type {PaperAccountDoc} from "@/database/models/paper-account.model";
import type {LearnerAccountValue, LearnerFigure, LearnerValue} from "@/lib/ai/explain";
import type {GlossaryKey} from "@/lib/learn/glossary";
import {buildPriceMap, computePortfolio, readAccountsForUser, toAccountSummary} from "@/lib/trading/account";
import {countUnpriced, drawdownWindow, mergeLivePoint, winStatsFromCounts} from "@/lib/trading/analytics";
import {getEasternDateString} from "@/lib/utils";

// buildPriceMap is one Finnhub quote per unique symbol with no ceiling. A chat answer
// doesn't need every tail position priced to the cent, so price the largest holdings and
// report how many were left at cost. (getQuote caches 30s, so repeat calls in one
// conversation are close to free — this bounds the first one.)
export const CHAT_MAX_PRICED_SYMBOLS = 25;

// The largest holdings by cost across the given accounts, quoted; the rest fall back to cost
// basis in computePortfolio and are counted as unpriced.
export const priceLargestHoldings = (docs: readonly PaperAccountDoc[]) => {
    const ranked = docs
        .flatMap((d) => d.positions ?? [])
        .sort((a, b) => b.avgCost * b.quantity - a.avgCost * a.quantity)
        .map((p) => p.symbol);
    return buildPriceMap(Array.from(new Set(ranked)).slice(0, CHAT_MAX_PRICED_SYMBOLS));
};

type Reader = (userId: string, docs: PaperAccountDoc[]) => Promise<LearnerAccountValue[]>;
// Per account: every sell, the closed ones (a recorded realizedPnl — computeWinStats's rule),
// the winners among them and their realized total.
type SellTotals = {sells: number; closed: number; wins: number; realizedPnl: number};
type SnapshotRow = {accountId: string; date: string; totalValue: number};

const idOf = (doc: PaperAccountDoc): string => String(doc._id);
const nameOf = (doc: PaperAccountDoc): string => toAccountSummary(doc).name;

// One $group per account instead of the sell rows themselves: a long-lived account's
// thousands of sells come back as four numbers.
const sellTotalsOf = async (userId: string, docs: PaperAccountDoc[]) => {
    const rows = await PaperTrade.aggregate<SellTotals & {_id: string}>([
        {$match: {userId, accountId: {$in: docs.map(idOf)}, side: 'sell'}},
        {$group: {
            _id: '$accountId',
            sells: {$sum: 1},
            closed: {$sum: {$cond: [{$isNumber: '$realizedPnl'}, 1, 0]}},
            wins: {$sum: {$cond: [{$and: [{$isNumber: '$realizedPnl'}, {$gt: ['$realizedPnl', 0]}]}, 1, 0]}},
            realizedPnl: {$sum: '$realizedPnl'},
        }},
    ]);
    const byAccount = new Map(rows.map((row) => [String(row._id), row]));
    return (doc: PaperAccountDoc): SellTotals => byAccount.get(idOf(doc)) ?? {sells: 0, closed: 0, wins: 0, realizedPnl: 0};
};

const pricedOf = async (docs: PaperAccountDoc[]) => {
    const prices = await priceLargestHoldings(docs);
    return (doc: PaperAccountDoc) => computePortfolio(doc, prices);
};

const READERS = {
    'buying-power': async (_userId, docs) =>
        docs.map((d) => ({account: nameOf(d), figures: {cash: d.cash}})),

    // Absent totals mean nothing has been credited yet — null, not a zero.
    income: async (_userId, docs) =>
        docs.map((d) => ({
            account: nameOf(d),
            figures: {
                interestOnCash: d.incomeTotals?.interest ?? null,
                dividends: d.incomeTotals?.dividends ?? null,
                creditedThrough: d.incomeThrough ?? null,
            },
        })),

    'win-rate': async (userId, docs) => {
        const totals = await sellTotalsOf(userId, docs);
        return docs.map((d) => {
            const stats = winStatsFromCounts(totals(d));
            return {account: nameOf(d), figures: {winRatePct: stats.winRatePct, wins: stats.wins, losses: stats.losses}};
        });
    },

    'realized-pnl': async (userId, docs) => {
        const totals = await sellTotalsOf(userId, docs);
        return docs.map((d) => ({account: nameOf(d), figures: {realizedPnl: totals(d).realizedPnl, sells: totals(d).sells}}));
    },

    'total-return': async (_userId, docs) => {
        const valueOf = await pricedOf(docs);
        return docs.map((d) => {
            const p = valueOf(d);
            return {
                account: nameOf(d),
                figures: {
                    netWorth: p.totalValue,
                    startingBalance: p.startingBalance,
                    totalReturn: p.totalReturnAbs,
                    totalReturnPct: p.totalReturnPct,
                    unpricedHoldings: countUnpriced(p.positions),
                },
            };
        });
    },

    // The same window /portfolio draws: every daily snapshot plus today's live value.
    'max-drawdown': async (userId, docs) => {
        const [valueOf, snapshots] = await Promise.all([
            pricedOf(docs),
            AccountSnapshot.find({userId, accountId: {$in: docs.map(idOf)}})
                .select('accountId date totalValue')
                .sort({date: 1})
                .lean<SnapshotRow[]>(),
        ]);
        const today = getEasternDateString();
        return docs.map((d) => {
            const p = valueOf(d);
            const points = snapshots.filter((s) => s.accountId === idOf(d)).map((s) => ({date: s.date, value: s.totalValue}));
            const series = mergeLivePoint(points, {date: today, value: p.totalValue});
            const w = drawdownWindow(series);
            const figures: Record<string, LearnerFigure> = w
                ? {
                    maxDrawdownPct: w.pct,
                    peakDate: w.peakDate,
                    peakValue: w.peakValue,
                    troughDate: w.troughDate,
                    troughValue: w.troughValue,
                    recovered: w.recovered,
                    recoveryPctNeeded: w.recoveryPctNeeded,
                }
                : {maxDrawdownPct: null};
            return {account: nameOf(d), figures: {...figures, daysOfHistory: series.length, unpricedHoldings: countUnpriced(p.positions)}};
        });
    },
} satisfies Partial<Record<GlossaryKey, Reader>>;

// The learner's figures for one glossary key, one per paper account; null when the key has
// no reader or the read failed (the definition still answers), no accounts when they have none.
export const readLearnerValue = async (userId: string, key: string): Promise<LearnerValue | null> => {
    if (!Object.hasOwn(READERS, key)) return null;
    const reader: Reader = READERS[key as keyof typeof READERS];
    try {
        // readAccountsForUser, never getAccountsForUser: a question must not create an account.
        const docs = await readAccountsForUser(userId);
        if (docs.length === 0) return {accounts: []};
        return {accounts: await reader(userId, docs)};
    } catch (error) {
        console.error(`explainTerm: reading ${key} failed:`, error);
        return null;
    }
};
