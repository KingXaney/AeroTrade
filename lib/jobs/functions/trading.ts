import {inngest} from "@/lib/jobs/client";
import {getQuote} from "@/lib/prices/finnhub";
import {recordJobRun} from "@/lib/jobs/job-runs";
import {JOBS, triggersOf} from "@/lib/jobs/registry";
import {getEasternDateString} from "@/lib/dates";
import {connectToDatabase} from "@/database/mongoose";
import PaperAccount from "@/database/models/paper-account.model";
import AccountSnapshot from "@/database/models/account-snapshot.model";
import BenchmarkSnapshot from "@/database/models/benchmark-snapshot.model";
import {buildPriceMap, computePortfolio} from "@/lib/trading/valuation";
import {type PriceInfo} from "@/lib/trading/analytics";
import {BENCHMARK_SYMBOL} from "@/lib/prices/config";

// Finnhub's free tier allows ~60 calls/min; quotes are fetched in chunks with a
// pause between them once the symbol universe is big enough to matter.
const QUOTE_CHUNK_SIZE = 25;
const QUOTE_THROTTLE_THRESHOLD = 50;
const QUOTE_THROTTLE_DELAY = '30s';

// Daily close snapshots: every strategy account's value + the SPY benchmark,
// keyed on the Eastern-time date. Runs after market close on weekdays; the
// {accountId, date} unique index makes re-runs (event replays, manual triggers)
// harmless upserts.
export const recordDailySnapshots = inngest.createFunction(
    { id: JOBS.snapshots.id, triggers: triggersOf(JOBS.snapshots) },
    async ({ step }) => {
        await step.run('snapshot-benchmark', async () => {
            const quote = await getQuote(BENCHMARK_SYMBOL);
            if (typeof quote.c !== 'number' || !(quote.c > 0)) {
                console.warn(`Benchmark snapshot skipped: no quote for ${BENCHMARK_SYMBOL}`);
                return {recorded: false};
            }
            await connectToDatabase();
            await BenchmarkSnapshot.updateOne(
                {symbol: BENCHMARK_SYMBOL, date: getEasternDateString()},
                {$set: {close: quote.c}},
                {upsert: true},
            );
            return {recorded: true};
        });

        const accounts = await step.run('load-accounts', async () => {
            await connectToDatabase();
            const docs = await PaperAccount.find({}).lean();
            return docs.map((a) => ({
                id: String(a._id),
                userId: a.userId,
                cash: a.cash,
                startingBalance: a.startingBalance,
                // Memoized so write-snapshots can detect a reset that landed mid-run
                // (reset always re-anchors inceptionAt).
                inceptionAt: new Date(a.inceptionAt || a.createdAt).getTime(),
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
        });
        if (accounts.length === 0) {
            return {success: true, message: 'No accounts to snapshot'};
        }

        // One quote per unique symbol across ALL accounts, chunked to respect rate limits.
        const uniqueSymbols = Array.from(new Set(
            accounts.flatMap((a) => a.positions.map((p: PaperPosition) => p.symbol.toUpperCase())),
        )).filter(Boolean);
        const chunks: string[][] = [];
        for (let i = 0; i < uniqueSymbols.length; i += QUOTE_CHUNK_SIZE) {
            chunks.push(uniqueSymbols.slice(i, i + QUOTE_CHUNK_SIZE));
        }
        const throttle = uniqueSymbols.length > QUOTE_THROTTLE_THRESHOLD;

        const priceEntries: Array<[string, PriceInfo]> = [];
        for (let i = 0; i < chunks.length; i++) {
            if (throttle && i > 0) {
                await step.sleep(`quote-throttle-${i}`, QUOTE_THROTTLE_DELAY);
            }
            const entries = await step.run(`fetch-prices-${i}`, async () =>
                Array.from((await buildPriceMap(chunks[i])).entries()));
            priceEntries.push(...entries);
        }

        const written = await step.run('write-snapshots', async () => {
            await connectToDatabase();
            const priceMap = new Map(priceEntries);
            const date = getEasternDateString();

            // Re-read inception times: an account reset between load-accounts and here
            // re-anchors inceptionAt and seeds a fresh day-0 snapshot that the memoized
            // (pre-reset) state must not overwrite.
            const fresh = await PaperAccount.find(
                {_id: {$in: accounts.map((a) => a.id)}},
                {inceptionAt: 1, createdAt: 1},
            ).lean();
            const freshInception = new Map(fresh.map((f) => [
                String(f._id),
                new Date(f.inceptionAt || f.createdAt).getTime(),
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
                const pricesOk = a.positions.every((p: PaperPosition) => {
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
        });

        const summary = `Snapshotted ${written} account(s) + ${BENCHMARK_SYMBOL}`;
        await step.run('record-job-run', async () => recordJobRun(JOBS.snapshots.id, summary));
        return {success: true, message: summary};
    },
)
