import {inngest} from "@/lib/jobs/client";
import {recordJobRun} from "@/lib/jobs/job-runs";
import {JOBS, triggersOf} from "@/lib/jobs/registry";
import {chunk, eventDay} from "@/lib/jobs/steps";
import {BENCHMARK_SYMBOL} from "@/lib/prices/config";
import {type PriceInfo} from "@/lib/trading/analytics";
import {loadSnapshotAccounts, quoteEntries, snapshotBenchmark, snapshotSymbols, writeSnapshots} from "@/lib/trading/snapshots";

// Finnhub's free tier allows ~60 calls/min; quotes are fetched in chunks with a
// pause between them once the symbol universe is big enough to matter.
const QUOTE_CHUNK_SIZE = 25;
const QUOTE_THROTTLE_THRESHOLD = 50;
const QUOTE_THROTTLE_DELAY = '30s';

// Daily close snapshots: every account's value + the SPY benchmark, after the weekday close
// (lib/trading/snapshots.ts).
export const recordDailySnapshots = inngest.createFunction(
    { id: JOBS.snapshots.id, triggers: triggersOf(JOBS.snapshots) },
    async ({ step, event }) => {
        const today = eventDay(event.ts);
        await step.run('snapshot-benchmark', async () => snapshotBenchmark(today));

        const accounts = await step.run('load-accounts', loadSnapshotAccounts);
        if (accounts.length === 0) {
            return {success: true, message: 'No accounts to snapshot'};
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

        const written = await step.run('write-snapshots', async () => writeSnapshots(accounts, priceEntries, today));

        const summary = `Snapshotted ${written} account(s) + ${BENCHMARK_SYMBOL}`;
        await step.run('record-job-run', async () => recordJobRun(JOBS.snapshots.id, summary));
        return {success: true, message: summary};
    },
)
