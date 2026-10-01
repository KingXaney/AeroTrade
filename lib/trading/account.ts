// Server-only paper-trading helpers (NOT a 'use server' module — these are plain
// async functions used by server components and by the server actions in
// lib/actions/trading.actions.ts, accounts.actions.ts and friends.actions.ts).
// Keeping the non-serializable bits (Mongoose docs, price Maps) out of the
// 'use server' boundary.

import {cache} from "react";
import {Types} from "mongoose";
import {connectToDatabase} from "@/database/mongoose";
import PaperAccount, {type PaperAccountDoc} from "@/database/models/paper-account.model";
import PaperTrade from "@/database/models/paper-trade.model";
import AccountSnapshot from "@/database/models/account-snapshot.model";
import {BENCHMARK_SYMBOL, MAX_STARTING_BALANCE, MIN_STARTING_BALANCE, PAPER_STARTING_BALANCE} from "@/lib/constants";
import {getEasternDateString} from "@/lib/utils";
import {getBenchmarkIndex} from "@/lib/prices/benchmark-store";
import {getDividendPoints, getLatestRatePoint} from "@/lib/prices/store";
import AccountIncome from "@/database/models/account-income.model";
import {apyFromDiscount, groupIncomeActivity, usableRate, withReceipts, type IncomeView} from "@/lib/trading/income";
import {appendLive} from "@/lib/prices/total-return";
import {getQuote} from "@/lib/actions/finnhub.actions";
import {
    benchmarkReturnBetween,
    buildPerfSeries,
    computeMaxDrawdown,
    computeRealizedPnl,
    computeWinStats,
    drawdownWindow,
    enrichPosition,
    mergeLivePoint,
    type PriceInfo,
} from "@/lib/trading/analytics";

export type {PriceInfo};

// Minimal plain shape used to compute a portfolio (works for Mongoose docs after
// mapping, lean docs, or a synthesized default account).
export type AccountLike = {cash: number; startingBalance: number; positions: PaperPosition[]};

export const DEFAULT_ACCOUNT_NAME = 'Main Strategy';

// Whole dollars within bounds; undefined means the standard default; null = invalid.
// The starting balance is fixed at creation — editing it mid-flight would corrupt
// every return/benchmark calculation, so changes go through create or reset.
export const resolveStartingBalance = (value?: number): number | null => {
    if (value === undefined) return PAPER_STARTING_BALANCE;
    if (!Number.isFinite(value)) return null;
    const whole = Math.floor(value);
    if (whole < MIN_STARTING_BALANCE || whole > MAX_STARTING_BALANCE) return null;
    return whole;
};

// Pre-migration accounts may lack name/inceptionAt in the DB — fall back gracefully.
export const toAccountSummary = (account: PaperAccountDoc): PaperAccountSummary => ({
    id: String(account._id),
    name: account.name || DEFAULT_ACCOUNT_NAME,
    inceptionAt: new Date(account.inceptionAt || account.createdAt).getTime(),
    createdAt: new Date(account.createdAt).getTime(),
    ...(account.incomeTotals ? {income: {interest: account.incomeTotals.interest ?? 0, dividends: account.incomeTotals.dividends ?? 0}} : {}),
});

const toPlainPositions = (account: {positions: PaperPosition[]}): PaperPosition[] =>
    account.positions.map((p) => ({
        symbol: p.symbol,
        company: p.company || p.symbol,
        quantity: p.quantity,
        avgCost: p.avgCost,
    }));

// All strategy accounts for a user, oldest first. Creates "Main Strategy" on first use
// (preserves the original lazy-create behavior).
export const getAccountsForUser = async (userId: string): Promise<PaperAccountDoc[]> => {
    await connectToDatabase();
    const existing = await PaperAccount.find({userId}).sort({createdAt: 1});
    if (existing.length === 1) {
        // Lazy backfill for pre-migration trades (no accountId): a single-account user's
        // legacy trades all belong to that account. Self-extinguishing — after the first
        // updateMany the exists() probe never matches again.
        const hasLegacy = await PaperTrade.exists({userId, accountId: {$exists: false}});
        if (hasLegacy) {
            await PaperTrade.updateMany(
                {userId, accountId: {$exists: false}},
                {$set: {accountId: String(existing[0]._id)}},
            );
        }
    }
    if (existing.length > 0) return existing;

    const created = await PaperAccount.create({
        userId,
        name: DEFAULT_ACCOUNT_NAME,
        cash: PAPER_STARTING_BALANCE,
        startingBalance: PAPER_STARTING_BALANCE,
        inceptionAt: new Date(),
        positions: [],
    });
    return [created];
};

// Read-only sibling of getAccountsForUser: no lazy create, no legacy backfill.
//
// Use this wherever a *question* is being answered rather than an action taken. The chat
// assistant is the motivating case — "how am I doing?" must not conjure a paper account
// with a $100k starting balance for someone who has never traded, and must not race the
// real creation path. getHeldSymbolsByUserId already reads this way.
export const readAccountsForUser = async (userId: string): Promise<PaperAccountDoc[]> => {
    await connectToDatabase();
    return PaperAccount.find({userId}).sort({createdAt: 1});
};

// Ownership gate: every account-scoped read or write resolves the account through this.
export const getOwnedAccount = async (userId: string, accountId: string): Promise<PaperAccountDoc | null> => {
    if (!Types.ObjectId.isValid(accountId)) return null;
    await connectToDatabase();
    return PaperAccount.findOne({_id: accountId, userId});
};

// The account the UI operates on: the preferred one (cookie / ?account= param) when
// owned, else the user's first account.
export const resolveActiveAccount = async (userId: string, preferredId?: string | null): Promise<PaperAccountDoc> => {
    const accounts = await getAccountsForUser(userId);
    if (preferredId) {
        const match = accounts.find((a) => String(a._id) === preferredId);
        if (match) return match;
    }
    return accounts[0];
};

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

// Full portfolio for one account (prices fetched fresh). Without an accountId this
// falls back to the user's first/active account.
export const getPortfolio = async (userId: string, accountId?: string): Promise<PortfolioSummary> => {
    const account = (accountId ? await getOwnedAccount(userId, accountId) : null)
        ?? await resolveActiveAccount(userId);
    const positions = toPlainPositions(account);
    const priceMap = await buildPriceMap(positions.map((p) => p.symbol));
    return computePortfolio({cash: account.cash, startingBalance: account.startingBalance, positions}, priceMap);
};

// Every account priced from ONE shared quote map (same trick as the friends leaderboard).
// cache() dedupes within one server render (layout + dashboard widgets); it is a
// pass-through outside React, so Inngest callers are unaffected.
export const getPortfoliosForUser = cache(async (userId: string): Promise<AccountWithPortfolio[]> => {
    const accounts = await getAccountsForUser(userId);
    const allSymbols = accounts.flatMap((a) => a.positions.map((p) => p.symbol));
    const priceMap = await buildPriceMap(allSymbols);
    return accounts.map((a) => ({
        account: toAccountSummary(a),
        summary: computePortfolio(
            {cash: a.cash, startingBalance: a.startingBalance, positions: toPlainPositions(a)},
            priceMap,
        ),
    }));
});

// Pure: collapse all of a user's strategy accounts into one summary (sidebar/dashboard).
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

type LeanTrade = {
    _id: unknown; symbol: string; company?: string; side: 'buy' | 'sell'; quantity: number; price: number; total: number;
    realizedPnl?: number; source?: string; reason?: string; accountId?: string; createdAt: Date;
};

const toTradeRecord = (t: LeanTrade, accountName?: string): PaperTradeRecord => ({
    id: String(t._id),
    symbol: t.symbol,
    company: t.company || t.symbol,
    side: t.side,
    quantity: t.quantity,
    price: t.price,
    total: t.total,
    realizedPnl: t.realizedPnl,
    ...(t.source ? {source: t.source as TradeSource} : {}),
    ...(t.reason ? {reason: t.reason} : {}),
    ...(accountName ? {accountName} : {}),
    createdAt: new Date(t.createdAt).getTime(),
});

// Where an account's current epoch starts, for every per-account trade read. A reset
// re-anchors inceptionAt and then deletes the old epoch's trades; one that crashed between the
// two leaves rows behind that must not feed a receipt, a lot note or a count, so reads start at
// inceptionAt, as creditAccountIncome's do. Accounts from before inceptionAt existed have none
// and keep their migrated history. Undefined when the account is not this user's — nothing of
// theirs to read. cache() shares it between a render's ledger and history reads.
const tradeEpoch = cache(async (userId: string, accountId: string): Promise<{since: Date | null} | undefined> => {
    if (!Types.ObjectId.isValid(accountId)) return undefined;
    await connectToDatabase();
    const account = await PaperAccount.findOne({_id: accountId, userId}).select('inceptionAt').lean<{inceptionAt?: Date} | null>();
    return account ? {since: account.inceptionAt ?? null} : undefined;
});

// The one PaperTrade filter for an account's current epoch. Exported for readers that already
// hold the account (the CSV export, the chat's learner figures) — they apply the same rule
// without reading the account again.
export const epochTrades = (userId: string, accountId: string, since: Date | null | undefined) =>
    ({userId, accountId, ...(since ? {createdAt: {$gte: since}} : {})});

// The same rule over several accounts at once: each account's trades from its own inceptionAt.
// No accounts match nothing (MongoDB rejects an empty $or).
export const epochTradesOf = (userId: string, accounts: readonly {_id: unknown; inceptionAt?: Date | null}[]) =>
    (accounts.length === 0
        ? {userId, accountId: {$in: [] as string[]}}
        : {$or: accounts.map((a) => epochTrades(userId, String(a._id), a.inceptionAt))});

// One account's whole trade ledger for its current epoch, oldest first — the one PaperTrade
// read a page makes for an account: analytics (trade count, realized P&L, win rate), the trade
// log's tail, fill receipts and the buy notes all derive from it. cache() dedupes it within a
// render. Unbounded on purpose (analytics sums every trade, as the income job reads the whole
// epoch), and walked on the {accountId, createdAt, _id} index, so it never sorts in memory.
// A failed read THROWS: an empty ledger would read as "0 trades", $0 realized and "No trades
// yet". getAccountAnalytics and getIncomeActivity catch it and hide their sections; a page that
// calls it directly catches it and hides what it draws from it.
export const getTradeLedger = cache(async (userId: string, accountId: string): Promise<PaperTradeRecord[]> => {
    const epoch = await tradeEpoch(userId, accountId);
    if (!epoch) return [];
    const trades = await PaperTrade.find(epochTrades(userId, accountId, epoch.since)).sort({createdAt: 1, _id: 1}).lean<LeanTrade[]>();
    return trades.map((t) => toTradeRecord(t));
});

// The trade log's page size, for getTradeHistory and for pages that slice their ledger.
export const TRADE_HISTORY_LIMIT = 50;

// The newest `limit` fills of the current epoch, newest first, in a bounded read of their own
// (the same index, walked backwards, `limit` rows) — for callers that do not hold the ledger:
// the chat tool, the recent-trades widget, a strategy page. /portfolio and /trade already read
// the ledger and slice it instead.
export const getTradeHistory = async (userId: string, accountId: string, limit = TRADE_HISTORY_LIMIT): Promise<PaperTradeRecord[]> => {
    try {
        const epoch = await tradeEpoch(userId, accountId);
        if (!epoch) return [];
        const trades = await PaperTrade.find(epochTrades(userId, accountId, epoch.since))
            .sort({createdAt: -1, _id: -1})
            .limit(limit)
            .lean<LeanTrade[]>();
        return trades.map((t) => toTradeRecord(t));
    } catch (error) {
        console.error('Error fetching trade history:', error);
        return [];
    }
};

// Newest fills across every strategy account, each tagged with its account's name —
// the /history page's trade feed. Read-only (no lazy account creation). The list and its count
// are each account's current epoch (epochTradesOf), as every per-account read is: a reset that
// crashed before deleting the old epoch's fills must not bring them back here either.
// Null when the read fails, so the page can say so instead of showing an empty ledger.
export const getRecentTradesForUser = async (userId: string, limit = 50): Promise<{trades: PaperTradeRecord[]; total: number} | null> => {
    try {
        await connectToDatabase();
        const accounts = await PaperAccount.find({userId}).select('name inceptionAt').lean<{_id: unknown; name?: string; inceptionAt?: Date}[]>();
        const epoch = epochTradesOf(userId, accounts);
        const [trades, total] = await Promise.all([
            PaperTrade.find(epoch).sort({createdAt: -1, _id: -1}).limit(limit).lean<LeanTrade[]>(),
            PaperTrade.countDocuments(epoch),
        ]);
        const names = new Map(accounts.map((a) => [String(a._id), a.name || DEFAULT_ACCOUNT_NAME]));
        return {trades: trades.map((t) => toTradeRecord(t, t.accountId ? names.get(t.accountId) : undefined)), total};
    } catch (error) {
        console.error('Error fetching recent trades:', error);
        return null;
    }
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

// Write today's baseline snapshot for a fresh (created or just-reset) account so the
// performance chart has a day-0 point immediately instead of waiting for the cron.
export const seedDayZeroSnapshot = async (account: PaperAccountDoc): Promise<void> => {
    await AccountSnapshot.updateOne(
        {accountId: String(account._id), date: getEasternDateString()},
        {
            $set: {
                userId: account.userId,
                totalValue: account.startingBalance,
                cash: account.startingBalance,
                holdingsValue: 0,
                startingBalance: account.startingBalance,
            },
        },
        {upsert: true},
    );
};

// The APY idle cash earns at the latest stored T-bill rate; null until a rate is stored, and
// null again once that rate is stale by the income job's own rule (usableRate) — never a zero
// for missing data, never a rate the job would not credit at. One read per render, shared by
// the Income panel's figure (every account in view) and the /trade ticket's "earning ≈$x/month"
// clause, so the two agree.
export const getCashApy = cache(async (): Promise<number | null> => {
    const rate = usableRate(await getLatestRatePoint().catch((error) => {
        console.error('Error reading the T-bill rate:', error);
        return null;
    }), getEasternDateString());
    return rate ? apyFromDiscount(rate.discountPct) : null;
});

// Running totals live on the account (kept in step with cash by the income job), so this is
// one small read for the rate, not a scan of the ledger.
const getIncomeSummary = async (account: {incomeTotals?: {interest?: number; dividends?: number}; incomeThrough?: string}): Promise<AccountIncomeSummary> => ({
    interest: account.incomeTotals?.interest ?? 0,
    dividends: account.incomeTotals?.dividends ?? 0,
    apy: await getCashApy(),
    through: account.incomeThrough ?? null,
});

// The Income panel's rows: this account's current epoch only (a reset starts a new one), and
// only dates already credited — a row a crashed run left behind is not income yet. Each row
// comes with its receipt, read from the render's one ledger read (getTradeLedger) and the
// narrow dividend read for the symbols it traded, bounded to [inception, incomeThrough]. No
// rate series and no price metas: every interest receipt rebuilds from its own rows.
export const getIncomeActivity = async (userId: string, accountId: string): Promise<IncomeView | null> => {
    try {
        const account = await getOwnedAccount(userId, accountId);
        if (!account) return null;
        if (!account.incomeThrough) return {interestByMonth: [], dividends: [], missed: []};
        const inceptionAt = new Date(account.inceptionAt || account.createdAt);
        const epoch = inceptionAt.getTime();
        const key = String(account._id);
        const [rows, ledger] = await Promise.all([
            AccountIncome.find(
                {accountId: key, epoch, date: {$lte: account.incomeThrough}},
                {_id: 0, kind: 1, date: 1, symbol: 1, amount: 1, apy: 1, exDate: 1, perShare: 1, quantity: 1},
            ).lean<Parameters<typeof groupIncomeActivity>[0][number][]>(),
            getTradeLedger(userId, key),
        ]);
        // The trades the income job replays: this epoch's, by timestamp (creditAccountIncome). The
        // ledger already starts at inceptionAt; an account without one starts at createdAt here.
        const fills = ledger.filter((t) => t.createdAt >= epoch);
        const points = await getDividendPoints(fills.map((t) => t.symbol), getEasternDateString(inceptionAt), account.incomeThrough);
        return withReceipts(groupIncomeActivity(rows), fills, points);
    } catch (error) {
        console.error('Error reading income activity:', error);
        return null;
    }
};

// Everything the /portfolio analytics section needs for one account: current
// summary, %-return series vs the SPY benchmark, drawdown and trade stats.
// The math lives in analytics.ts (pure); this assembles its inputs.
export const getAccountAnalytics = async (userId: string, accountId: string): Promise<AccountAnalytics | null> => {
    try {
        const account = await getOwnedAccount(userId, accountId);
        if (!account) return null;

        const summaryInfo = toAccountSummary(account);
        const inceptionDate = getEasternDateString(new Date(summaryInfo.inceptionAt));
        const key = String(account._id);

        const [snapshots, benchmark, trades] = await Promise.all([
            AccountSnapshot.find({accountId: key}).sort({date: 1}).lean(),
            getBenchmarkIndex(inceptionDate),
            getTradeLedger(userId, key),
        ]);

        const positions = toPlainPositions(account);
        // SPY rides along in the same quote map: the benchmark needs today's point too.
        const priceMap = await buildPriceMap([...positions.map((p) => p.symbol), BENCHMARK_SYMBOL]);
        const summary = computePortfolio(
            {cash: account.cash, startingBalance: account.startingBalance, positions},
            priceMap,
        );

        const snapshotPoints: SnapshotPoint[] = snapshots.map((s) => ({date: s.date, value: s.totalValue}));
        const today = getEasternDateString();
        // SPY total return, with today's point from the live quote so the chart's last point
        // compares like with like instead of today's account against yesterday's SPY.
        const benchmarkPoints: SnapshotPoint[] = appendLive(benchmark.points, benchmark.lastClose, priceMap.get(BENCHMARK_SYMBOL)?.price, today);
        const livePoint: SnapshotPoint = {date: today, value: summary.totalValue};

        const tradeStats = trades.map((t) => ({side: t.side as string, realizedPnl: t.realizedPnl}));
        const winStats = computeWinStats(tradeStats);
        // One window, dated, over the same points the chart draws: the tile's number, its hint
        // and the chart's shaded band all describe the same stretch.
        const series = buildPerfSeries(snapshotPoints, benchmarkPoints, livePoint);
        const drawdown = drawdownWindow(mergeLivePoint(snapshotPoints, livePoint));

        return {
            account: summaryInfo,
            summary,
            income: await getIncomeSummary(account),
            series,
            snapshotThrough: snapshotPoints.at(-1)?.date ?? null,
            maxDrawdownPct: drawdown?.pct ?? null,
            drawdown,
            benchmarkOverDrawdownPct: drawdown && drawdown.pct > 0
                ? benchmarkReturnBetween(series, drawdown.peakDate, drawdown.troughDate)
                : null,
            winRatePct: winStats.winRatePct,
            wins: winStats.wins,
            losses: winStats.losses,
            realizedPnl: computeRealizedPnl(tradeStats),
            tradeCount: trades.length,
        };
    } catch (error) {
        console.error('Error computing account analytics:', error);
        return null;
    }
};

export type ComparisonStats = {winRatePct: number | null; maxDrawdownPct: number | null; tradeCount: number};

// Win rate + max drawdown (and the fill count behind the win rate) for every account of a
// user in bulk queries (feeds the strategy comparison table without N per-account round trips).
// liveValues (accountId -> current total value) folds today's live valuation
// into each drawdown series the same way getAccountAnalytics does. Trades are each
// account's current epoch (epochTradesOf), so the table's win rate is the tile's.
export const getComparisonStats = async (
    userId: string,
    liveValues?: Record<string, number>,
): Promise<Record<string, ComparisonStats>> => {
    try {
        await connectToDatabase();
        const epochTradesForUser = async () => {
            const accounts = await PaperAccount.find({userId}).select('inceptionAt').lean<{_id: unknown; inceptionAt?: Date}[]>();
            return PaperTrade.find(epochTradesOf(userId, accounts))
                .select('accountId side realizedPnl')
                .lean<{accountId?: string; side: string; realizedPnl?: number}[]>();
        };
        const [trades, snapshots] = await Promise.all([
            epochTradesForUser(),
            AccountSnapshot.find({userId}).sort({date: 1}).lean(),
        ]);

        const tradesByAccount = new Map<string, {side: string; realizedPnl?: number}[]>();
        for (const t of trades) {
            if (!t.accountId) continue;
            const list = tradesByAccount.get(t.accountId) ?? [];
            list.push({side: t.side, realizedPnl: t.realizedPnl});
            tradesByAccount.set(t.accountId, list);
        }
        const snapshotsByAccount = new Map<string, SnapshotPoint[]>();
        for (const s of snapshots) {
            const list = snapshotsByAccount.get(s.accountId) ?? [];
            list.push({date: s.date, value: s.totalValue});
            snapshotsByAccount.set(s.accountId, list);
        }

        const today = getEasternDateString();
        const ids = new Set([...tradesByAccount.keys(), ...snapshotsByAccount.keys(), ...Object.keys(liveValues ?? {})]);
        const result: Record<string, ComparisonStats> = {};
        for (const id of ids) {
            const live = liveValues?.[id];
            const points = mergeLivePoint(
                snapshotsByAccount.get(id) ?? [],
                typeof live === 'number' ? {date: today, value: live} : undefined,
            );
            const accountTrades = tradesByAccount.get(id) ?? [];
            result[id] = {
                winRatePct: computeWinStats(accountTrades).winRatePct,
                maxDrawdownPct: computeMaxDrawdown(points),
                tradeCount: accountTrades.length,
            };
        }
        return result;
    } catch (error) {
        console.error('Error computing comparison stats:', error);
        return {};
    }
};

// Distinct symbols held across ALL of a user's accounts (news digest personalization).
export const getHeldSymbolsByUserId = async (userId: string): Promise<string[]> => {
    try {
        await connectToDatabase();
        const accounts = await PaperAccount.find({userId}).lean();
        return Array.from(new Set(
            accounts.flatMap((a) => (a.positions || []).map((p: PaperPosition) => p.symbol.toUpperCase())),
        ));
    } catch (error) {
        console.error('Error fetching held symbols:', error);
        return [];
    }
};
