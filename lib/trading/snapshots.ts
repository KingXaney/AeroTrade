// The daily close snapshots (NOT a 'use server' module): every paper account's value and the
// SPY benchmark, keyed on the Eastern-time date. The daily-account-snapshots job
// (lib/jobs/functions/trading.ts) runs these as its steps; the {accountId, date} unique index
// makes a re-run (event replay, manual trigger) a harmless upsert.

import {connectToDatabase} from "@/database/mongoose";
import PaperAccount from "@/database/models/paper-account.model";
import AccountSnapshot from "@/database/models/account-snapshot.model";
import BenchmarkSnapshot from "@/database/models/benchmark-snapshot.model";
import {getFreshQuote, getGoneSymbols} from "@/lib/prices/quote-store";
import {BENCHMARK_SYMBOL} from "@/lib/prices/config";
import {getLatestBars} from "@/lib/prices/store";
import {addCalendarDays} from "@/lib/dates";
import {CLOSE_FALLBACK_DAYS, LAST_CLOSE_LOOKBACK_DAYS} from "@/lib/trading/config";
import {buildFreshPriceMap, computePortfolio} from "@/lib/trading/valuation";
import {type PriceInfo} from "@/lib/trading/analytics";
import {accountEpoch} from "@/lib/trading/epoch";
import {splitSuspects, type SnapshotSkip, type SnapshotWrite} from "@/lib/trading/snapshot-run";
import type {PaperPosition} from '@/lib/trading/types';

// One account as the job memoizes it between steps (plain JSON).
type SnapshotAccount = {
    id: string;
    userId: string;
    cash: number;
    startingBalance: number;
    inceptionAt: number;
    incomeThrough: string | null;
    positions: {symbol: string; company: string; quantity: number; avgCost: number}[];
};

// `date` is the job's ET day (lib/jobs/steps.eventDay), the same on every replay. The answer is
// kept, never just logged: the job's stamp says whether the benchmark was recorded. A late pass
// asks only when the day has no row yet ('kept' otherwise).
export const snapshotBenchmark = async (date: string, {onlyIfMissing = false}: {onlyIfMissing?: boolean} = {}): Promise<{state: 'recorded' | 'kept' | 'missing'}> => {
    await connectToDatabase();
    if (onlyIfMissing && await BenchmarkSnapshot.exists({symbol: BENCHMARK_SYMBOL, date})) return {state: 'kept'};
    const quote = await getFreshQuote(BENCHMARK_SYMBOL);
    if (typeof quote.c !== 'number' || !(quote.c > 0)) {
        console.warn(`Benchmark snapshot skipped: no quote for ${BENCHMARK_SYMBOL}`);
        return {state: 'missing'};
    }
    await BenchmarkSnapshot.updateOne(
        {symbol: BENCHMARK_SYMBOL, date},
        {$set: {close: quote.c}},
        {upsert: true},
    );
    return {state: 'recorded'};
};

// Every account — or, for the late pass, only those the day's first pass left without a close
// (`missingFor`: no row for that date that the job itself wrote).
// `accountIds` narrows a run to the named accounts (the browser QA's, so one suite's run never
// values another's fixtures).
export const loadSnapshotAccounts = async ({missingFor, accountIds}: {missingFor?: string; accountIds?: readonly string[] | null} = {}): Promise<SnapshotAccount[]> => {
    await connectToDatabase();
    const closed: unknown[] = missingFor ? await AccountSnapshot.distinct('accountId', {date: missingFor, closedAt: {$exists: true}}) : [];
    const docs = await PaperAccount.find({
        ...(accountIds?.length ? {_id: {$in: accountIds.filter((id) => !closed.includes(id))}} : closed.length > 0 ? {_id: {$nin: closed}} : {}),
    }).lean();
    return docs.map((a) => ({
        id: String(a._id),
        userId: a.userId,
        cash: a.cash,
        startingBalance: a.startingBalance,
        // Memoized so write-snapshots can detect a reset that landed mid-run
        // (reset always re-anchors inceptionAt).
        inceptionAt: accountEpoch(a).getTime(),
        // Read with `cash` from the same document, so the snapshot records exactly
        // which income its cash contains (lib/income/store.ts tops it up).
        incomeThrough: a.incomeThrough ?? null,
        positions: (a.positions || []).map((p: PaperPosition) => ({
            symbol: p.symbol,
            company: p.company,
            quantity: p.quantity,
            avgCost: p.avgCost,
        })),
    }));
};

// One quote per unique symbol across ALL accounts.
export const snapshotSymbols = (accounts: readonly SnapshotAccount[]): string[] =>
    Array.from(new Set(
        accounts.flatMap((a) => a.positions.map((p) => p.symbol.toUpperCase())),
    )).filter(Boolean);

export const quoteEntries = async (symbols: string[]): Promise<Array<[string, PriceInfo]>> =>
    Array.from((await buildFreshPriceMap(symbols)).entries());

// The holdings whose quote sits far from their last stored close: what a split looks like to a
// position not yet adjusted for it (lib/trading/snapshot-run.splitSuspects). The job has Yahoo
// asked about just these before it values anything.
export const findSplitSuspects = async (priceEntries: Array<[string, PriceInfo]>, date: string): Promise<string[]> => {
    const priced = priceEntries.filter(([, info]) => typeof info.price === 'number').map(([symbol]) => symbol);
    if (priced.length === 0) return [];
    try {
        const closes = await getLatestBars(priced, {since: addCalendarDays(date, -CLOSE_FALLBACK_DAYS), onOrBefore: date});
        return splitSuspects(new Map(priceEntries), closes);
    } catch (error) {
        console.error('Stored closes could not be read to check for splits:', error);
        return [];
    }
};

// The last stored close of each held symbol that had no quote this run AND is gone (no price
// in the last few sessions, lib/prices/gone.ts) — what its holdings are valued at, so one
// delisted stock does not stop an account's history for good. A symbol without a quote that is
// not gone is an outage and gets no entry: its accounts wait for the next pass.
export const goneCloses = async (accounts: readonly SnapshotAccount[], priceEntries: Array<[string, PriceInfo]>, date: string): Promise<Array<[string, {date: string; close: number}]>> => {
    const priced = new Map(priceEntries);
    const unquoted = snapshotSymbols(accounts).filter((symbol) => typeof priced.get(symbol)?.price !== 'number');
    if (unquoted.length === 0) return [];
    try {
        const gone = await getGoneSymbols(unquoted);
        if (gone.length === 0) return [];
        const closes = await getLatestBars(gone, {since: addCalendarDays(date, -LAST_CLOSE_LOOKBACK_DAYS), onOrBefore: date});
        return Array.from(closes.entries()).filter(([, bar]) => Number.isFinite(bar.close) && bar.close > 0);
    } catch (error) {
        console.error('Gone holdings could not be looked up; their accounts wait:', error);
        return [];
    }
};

export const writeSnapshots = async (
    accounts: readonly SnapshotAccount[],
    priceEntries: Array<[string, PriceInfo]>,
    date: string,
    goneEntries: Array<[string, {date: string; close: number}]> = [],
): Promise<SnapshotWrite> => {
    await connectToDatabase();
    const priceMap = new Map(priceEntries);
    const goneMap = new Map(goneEntries);

    // Re-read inception times: an account reset between load-accounts and here
    // re-anchors inceptionAt and seeds a fresh day-0 snapshot that the memoized
    // (pre-reset) state must not overwrite.
    const fresh = await PaperAccount.find(
        {_id: {$in: accounts.map((a) => a.id)}},
        {inceptionAt: 1, createdAt: 1},
    ).lean();
    const freshInception = new Map(fresh.map((f) => [
        String(f._id),
        accountEpoch(f).getTime(),
    ]));

    let written = 0;
    const atClose: SnapshotSkip[] = [];
    const skipped: SnapshotSkip[] = [];
    for (const a of accounts) {
        const inception = freshInception.get(a.id);
        if (inception === undefined || inception > a.inceptionAt) {
            console.warn(`Snapshot skipped for account ${a.id}: deleted or reset mid-run`);
            skipped.push({accountId: a.id, symbols: []});
            continue;
        }
        // A snapshot is a permanent historical record — never persist a valuation built on a
        // missing quote. A gap in the series is harmless; a corrupt point fakes drawdowns
        // forever. So an account with an unquoted holding waits (the late pass, then tomorrow),
        // and the stamp names the symbol — unless the symbol is gone, when waiting would never
        // end: that holding is valued at its last stored close and the row says so.
        const unquoted = a.positions
            .map((p) => p.symbol.toUpperCase())
            .filter((symbol) => {
                const info = priceMap.get(symbol);
                return !(typeof info?.price === 'number' && info.price > 0);
            });
        const waiting = unquoted.filter((symbol) => !goneMap.has(symbol));
        if (waiting.length > 0) {
            console.warn(`Snapshot skipped for account ${a.id}: no quote for ${waiting.join(', ')}`);
            skipped.push({accountId: a.id, symbols: waiting});
            continue;
        }
        const valued = unquoted.length === 0 ? priceMap : new Map(priceMap);
        for (const symbol of unquoted) {
            const bar = goneMap.get(symbol);
            if (bar) valued.set(symbol, {price: bar.close, closeDate: bar.date});
        }
        const summary = computePortfolio(
            {cash: a.cash, startingBalance: a.startingBalance, positions: a.positions},
            valued,
        );
        await AccountSnapshot.updateOne(
            {accountId: a.id, date},
            {
                $set: {
                    userId: a.userId,
                    totalValue: summary.totalValue,
                    cash: summary.cash,
                    holdingsValue: summary.holdingsValue,
                    startingBalance: summary.startingBalance,
                    epoch: a.inceptionAt,
                    closedAt: new Date(),
                    ...(a.incomeThrough ? {incomeThrough: a.incomeThrough} : {}),
                    ...(unquoted.length > 0 ? {atClose: unquoted} : {}),
                },
                $unset: {
                    ...(a.incomeThrough ? {} : {incomeThrough: 1}),
                    ...(unquoted.length > 0 ? {} : {atClose: 1}),
                },
            },
            {upsert: true},
        );
        written++;
        if (unquoted.length > 0) atClose.push({accountId: a.id, symbols: unquoted});
    }
    return {written, atClose, skipped};
};
