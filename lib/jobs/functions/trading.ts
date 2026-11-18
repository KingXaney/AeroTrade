import {inngest} from "@/lib/jobs/client";
import {recordJobRun} from "@/lib/jobs/job-runs";
import {JOBS, triggersOf} from "@/lib/jobs/registry";
import {chunk, eventDay} from "@/lib/jobs/steps";
import {BENCHMARK_SYMBOL} from "@/lib/prices/config";
import {type PriceInfo} from "@/lib/trading/analytics";
import {describeSnapshotRun, isLatePass} from "@/lib/trading/snapshot-run";
import {findSplitSuspects, goneCloses, loadSnapshotAccounts, quoteEntries, snapshotBenchmark, snapshotSymbols, writeSnapshots} from "@/lib/trading/snapshots";
import type {SplitApplication} from "@/lib/trading/splits";
import {checkSplitsFor} from "@/lib/trading/splits-store";

// Finnhub's free tier allows ~60 calls/min; quotes are fetched in chunks with a
// pause between them once the symbol universe is big enough to matter.
const QUOTE_CHUNK_SIZE = 25;
const QUOTE_THROTTLE_THRESHOLD = 50;
const QUOTE_THROTTLE_DELAY = '30s';

// Daily close snapshots: every account's value + the SPY benchmark, after the weekday close
// (lib/trading/snapshots.ts). Two passes: 16:10 ET values every account, and 16:40 only those
// the first left without a close — an account waits when a holding has no quote, because a
// snapshot is permanent and one built on a missing price would fake a drawdown for good.
//
// Before anything is valued, a holding whose quote sits far from its last stored close is
// checked for a split (it is what an unadjusted position looks like after one), and a holding
// whose symbol has stopped quoting altogether is valued at its last stored close instead of
// holding its account back for ever (lib/prices/gone.ts).
//
// The stamp says what was written and names what was not (lib/trading/snapshot-run.ts): a run
// that skipped accounts or the benchmark never reads as a healthy one. `full: true` on the
// event makes a late manual run value every account again.
export const recordDailySnapshots = inngest.createFunction(
    { id: JOBS.snapshots.id, triggers: triggersOf(JOBS.snapshots) },
    async ({ step, event }) => {
        const today = eventDay(event.ts);
        const late = (event.data as {full?: unknown} | undefined)?.full !== true && isLatePass(event.ts);
        const benchmark = await step.run('snapshot-benchmark', async () => snapshotBenchmark(today, {onlyIfMissing: late}));
        const scope = late ? {missingFor: today} : {};

        let accounts = await step.run('load-accounts', async () => loadSnapshotAccounts(scope));
        if (accounts.length === 0) {
            const idle = describeSnapshotRun({accounts: 0, written: 0, atClose: [], skipped: [], late, benchmark: {symbol: BENCHMARK_SYMBOL, state: benchmark.state}, splits: []});
            // A late pass with nothing left keeps the first pass's stamp, which says more.
            if (!late || benchmark.state !== 'kept') await step.run('record-job-run', async () => recordJobRun(JOBS.snapshots.id, idle));
            return {success: true, message: idle};
        }

        const uniqueSymbols = snapshotSymbols(accounts);
        const chunks = chunk(uniqueSymbols, QUOTE_CHUNK_SIZE);
        const throttle = uniqueSymbols.length > QUOTE_THROTTLE_THRESHOLD;

        const priceEntries: Array<[string, PriceInfo]> = [];
        for (let i = 0; i < chunks.length; i++) {
            if (throttle && i > 0) {
                await step.sleep(`quote-throttle-${i}`, QUOTE_THROTTLE_DELAY);
            }
            const entries = await step.run(`fetch-prices-${i}`, async () => quoteEntries(chunks[i]));
            priceEntries.push(...entries);
        }

        let splits: SplitApplication[] = [];
        const suspects = await step.run('split-suspects', async () => findSplitSuspects(priceEntries, today));
        if (suspects.length > 0) {
            splits = (await step.run('check-splits', async () => checkSplitsFor(suspects))).applied;
            // A split changed positions: value what the accounts hold now.
            if (splits.length > 0) accounts = await step.run('reload-accounts', async () => loadSnapshotAccounts(scope));
        }

        const gone = await step.run('gone-closes', async () => goneCloses(accounts, priceEntries, today));
        const written = await step.run('write-snapshots', async () => writeSnapshots(accounts, priceEntries, today, gone));

        const summary = describeSnapshotRun({
            accounts: accounts.length,
            ...written,
            late,
            benchmark: {symbol: BENCHMARK_SYMBOL, state: benchmark.state},
            splits,
        });
        await step.run('record-job-run', async () => recordJobRun(JOBS.snapshots.id, summary));
        return {success: true, message: summary};
    },
)
