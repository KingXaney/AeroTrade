// The daily close snapshots (NOT a 'use server' module): every paper account's value and the
// SPY benchmark, keyed on the Eastern-time date. The daily-account-snapshots job
// (lib/jobs/functions/trading.ts) runs these as its steps; the {accountId, date} unique index
// makes a re-run (event replay, manual trigger) a harmless upsert.

import {connectToDatabase} from "@/database/mongoose";
import PaperAccount from "@/database/models/paper-account.model";
import AccountSnapshot from "@/database/models/account-snapshot.model";
import BenchmarkSnapshot from "@/database/models/benchmark-snapshot.model";
import {getQuote} from "@/lib/prices/finnhub";
import {BENCHMARK_SYMBOL} from "@/lib/prices/config";
import {buildPriceMap, computePortfolio} from "@/lib/trading/valuation";
import {type PriceInfo} from "@/lib/trading/analytics";
import {accountEpoch} from "@/lib/trading/epoch";

// One account as the job memoizes it between steps (plain JSON).
export type SnapshotAccount = {
    id: string;
    userId: string;
    cash: number;
    startingBalance: number;
    inceptionAt: number;
    incomeThrough: string | null;
    positions: {symbol: string; company: string; quantity: number; avgCost: number}[];
};

// `date` is the job's ET day (lib/jobs/steps.eventDay), the same on every replay.
export const snapshotBenchmark = async (date: string): Promise<{recorded: boolean}> => {
    const quote = await getQuote(BENCHMARK_SYMBOL);
    if (typeof quote.c !== 'number' || !(quote.c > 0)) {
        console.warn(`Benchmark snapshot skipped: no quote for ${BENCHMARK_SYMBOL}`);
        return {recorded: false};
    }
    await connectToDatabase();
    await BenchmarkSnapshot.updateOne(
        {symbol: BENCHMARK_SYMBOL, date},
        {$set: {close: quote.c}},
        {upsert: true},
    );
    return {recorded: true};
};

export const loadSnapshotAccounts = async (): Promise<SnapshotAccount[]> => {
    await connectToDatabase();
    const docs = await PaperAccount.find({}).lean();
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
    Array.from((await buildPriceMap(symbols)).entries());

export const writeSnapshots = async (accounts: readonly SnapshotAccount[], priceEntries: Array<[string, PriceInfo]>, date: string): Promise<number> => {
    await connectToDatabase();
    const priceMap = new Map(priceEntries);

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

    let count = 0;
    for (const a of accounts) {
        const inception = freshInception.get(a.id);
        if (inception === undefined || inception > a.inceptionAt) {
            console.warn(`Snapshot skipped for account ${a.id}: deleted or reset mid-run`);
            continue;
        }
        // A snapshot is a permanent historical record — never persist a valuation
        // built on missing quotes (Finnhub outage / delisted symbol). A gap in the
        // series is harmless; a corrupt point fakes drawdowns forever.
        const pricesOk = a.positions.every((p) => {
            const info = priceMap.get(p.symbol.toUpperCase());
            return typeof info?.price === 'number' && info.price > 0;
        });
        if (!pricesOk) {
            console.warn(`Snapshot skipped for account ${a.id}: missing quotes`);
            continue;
        }
        const summary = computePortfolio(
            {cash: a.cash, startingBalance: a.startingBalance, positions: a.positions},
            priceMap,
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
                    ...(a.incomeThrough ? {incomeThrough: a.incomeThrough} : {}),
                },
                ...(a.incomeThrough ? {} : {$unset: {incomeThrough: 1}}),
            },
            {upsert: true},
        );
        count++;
    }
    return count;
};
