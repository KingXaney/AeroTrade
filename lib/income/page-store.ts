// Read side of income for the pages: the cash APY (the Income panel and the order ticket), the
// running totals the analytics carry, and the Income panel's rows with their receipts. The
// nightly credit is store.ts; the accrual convention is accrual.ts. Server-only.

import {cache} from "react";
import AccountIncome from "@/database/models/account-income.model";
import {getEasternDateString} from "@/lib/dates";
import {getDividendPoints, getLatestRatePoint} from "@/lib/prices/store";
import {apyFromDiscount, groupIncomeActivity, usableRate, withReceipts, type IncomeView} from "@/lib/income/accrual";
import {getOwnedAccount} from "@/lib/trading/accounts";
import {getTradeLedger} from "@/lib/trading/ledger";
import {accountEpoch} from "@/lib/trading/epoch";
import type {AccountIncomeSummary} from '@/lib/income/types';

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
export const getIncomeSummary = async (account: {incomeTotals?: {interest?: number; dividends?: number}; incomeThrough?: string}): Promise<AccountIncomeSummary> => ({
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
        const inceptionAt = accountEpoch(account);
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
        const points = await getDividendPoints(fills.map((t) => t.symbol), {from: getEasternDateString(inceptionAt), to: account.incomeThrough});
        return withReceipts(groupIncomeActivity(rows), fills, points);
    } catch (error) {
        console.error('Error reading income activity:', error);
        return null;
    }
};
