// SPY as a total-return benchmark, from stored daily bars. Plain server module.
//
// Replaces the price-only BenchmarkSnapshot as what every "vs SPY" reads (the snapshots keep
// being written). Accounts now earn interest and dividends; comparing them with SPY's price
// alone would flatter every account by SPY's ~1.3% a year yield.

import BenchmarkSnapshot from "@/database/models/benchmark-snapshot.model";
import {BENCHMARK_SYMBOL} from "@/lib/constants";
import {addCalendarDays} from "@/lib/prices/calendar-days";
import {getBarsForSymbols} from "@/lib/prices/store";
import {totalReturnIndex, type IndexPoint} from "@/lib/prices/total-return";

export type BenchmarkIndex = {points: IndexPoint[]; lastClose: number | null};

// Bars from a little before `from`, so a dividend with its ex-date just before the window —
// paid inside it — is still reinvested where an account holding SPY would receive it.
const LEAD_DAYS = 14;

export const getBenchmarkIndex = async (from: string): Promise<BenchmarkIndex> => {
    const bars = (await getBarsForSymbols([BENCHMARK_SYMBOL], {from: addCalendarDays(from, -LEAD_DAYS)})).get(BENCHMARK_SYMBOL) ?? [];
    if (bars.length > 0) return {points: totalReturnIndex(bars), lastClose: bars[bars.length - 1].close};

    // Cold start only (a fresh database before any job has stored SPY bars): the old
    // price-only snapshots beat an empty chart, and the next bar fetch replaces them.
    const snapshots = await BenchmarkSnapshot.find({symbol: BENCHMARK_SYMBOL, date: {$gte: from}}).sort({date: 1}).lean<{date: string; close: number}[]>();
    return {
        points: snapshots.map((s) => ({date: s.date, value: s.close})),
        lastClose: snapshots.length > 0 ? snapshots[snapshots.length - 1].close : null,
    };
};
