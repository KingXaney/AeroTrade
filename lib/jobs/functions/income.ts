import {inngest} from "@/lib/jobs/client";
import {recordJobRun} from "@/lib/jobs/job-runs";
import {JOBS, triggersOf} from "@/lib/jobs/registry";
import {creditAccounts, planIncomeRun, type CreditOutcome} from "@/lib/income/store";
import {describeIncomeRun} from "@/lib/income/accrual";
import {addCalendarDays, getEasternDateString} from "@/lib/dates";
import {ensureBars} from "@/lib/prices/store";
import {connectToDatabase} from "@/database/mongoose";
import PaperAccount from "@/database/models/paper-account.model";
import {chunk} from "@/lib/jobs/steps";
import {PRICE_CHUNK_SIZE} from "@/lib/prices/config";

// Interest on idle cash and dividends on holdings, for every paper account — users', the AI
// Navigator's and the quant strategies'. Runs at 00:05 ET every day (interest accrues on
// weekends too) and credits everything dated through yesterday, so every weekday's strategy
// decision, Navigator run and 16:10 snapshot already contains it. An account with no
// watermark is replayed from inception: the first run IS the retroactive back-credit.
// The rules live in lib/income/accrual.ts; the database side in lib/income/store.ts.
const INCOME_SYMBOL_CHUNK = 8;           // 5y Yahoo fetches with polite spacing per 60 s step
const INCOME_BACK_CREDIT_BATCH = 2;      // a replay from inception writes many rows and snapshots
const INCOME_ROUTINE_BATCH = 25;

export const creditDailyIncome = inngest.createFunction(
    {
        id: JOBS.income.id,
        concurrency: [{limit: 1}],
        triggers: triggersOf(JOBS.income),
    },
    async ({event, step}) => {
        // Anchored to the event, not the wall clock, so a retry an hour later credits the same day.
        const today = getEasternDateString(new Date(event.ts ?? Date.now()));
        const end = addCalendarDays(today, -1);
        const data = (event.data ?? {}) as {accountIds?: unknown};
        // A scoped run (QA) touches only the named accounts, never another suite's fixtures.
        const scope = Array.isArray(data.accountIds) ? data.accountIds.map(String) : null;

        const plan = await step.run('plan-income', async () => planIncomeRun({accountIds: scope}));

        const backfills = chunk(plan.backfill, INCOME_SYMBOL_CHUNK);
        for (let i = 0; i < backfills.length; i += 1) {
            await step.run(`income-backfill-${i}`, async () => {
                const r = await ensureBars(backfills[i], {limit: backfills[i].length, forceBackfill: true});
                return {updated: r.updated, failed: r.failed};
            });
        }
        const topups = chunk(plan.topup, PRICE_CHUNK_SIZE);
        for (let i = 0; i < topups.length; i += 1) {
            await step.run(`income-topup-${i}`, async () => {
                const r = await ensureBars(topups[i], {limit: topups[i].length});
                return {updated: r.updated, fresh: r.fresh, failed: r.failed};
            });
        }

        // Accounts never credited replay from inception — heavy, so two per step.
        const credit = await step.run('split-accounts', async () => {
            await connectToDatabase();
            const docs = await PaperAccount.find({_id: {$in: plan.accountIds}}).select('_id incomeThrough').lean<{_id: unknown; incomeThrough?: string}[]>();
            return {
                backCredit: docs.filter((d) => !d.incomeThrough).map((d) => String(d._id)),
                routine: docs.filter((d) => d.incomeThrough).map((d) => String(d._id)),
            };
        });
        const batches = [
            ...chunk(credit.backCredit, INCOME_BACK_CREDIT_BATCH),
            ...chunk(credit.routine, INCOME_ROUTINE_BATCH),
        ];
        const outcomes: CreditOutcome[] = [];
        for (let i = 0; i < batches.length; i += 1) {
            outcomes.push(...await step.run(`credit-accounts-${i}`, async () => creditAccounts(batches[i], {end})));
        }

        const summary = describeIncomeRun(outcomes, end);
        await step.run('record-job-run', async () => recordJobRun(JOBS.income.id, summary));
        return {success: true, message: summary};
    },
)
