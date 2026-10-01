// The income job's database side: plan which price history to fetch, then credit each
// account its interest and dividends. Plain server module — NOT 'use server' — because every
// function here takes an account id from a job, never from a request.
//
// There are no transactions (and the QA database could not run them), so every sequence is
// idempotent on its own terms:
//   (a) rows are upserted with $setOnInsert — a retry keeps the amount first computed;
//   (b) one guarded update credits the STORED rows and moves the watermark — at most once;
//   (c) snapshots are topped up, each guarded by its own watermark — at most once each.
// A crash between any two steps replays to the same end state.

import {connectToDatabase} from "@/database/mongoose";
import PaperAccount from "@/database/models/paper-account.model";
import PaperTrade from "@/database/models/paper-trade.model";
import AccountSnapshot from "@/database/models/account-snapshot.model";
import AccountIncome from "@/database/models/account-income.model";
import {DIVIDEND_PAY_LAG_DAYS, RATE_SYMBOL, BENCHMARK_SYMBOL} from "@/lib/prices/config";
import {addCalendarDays, getEasternDateString} from "@/lib/dates";
import {ensureBars, getDividendPoints, getRatePoints, getSeriesMeta} from "@/lib/prices/store";
import type {CoverageRange} from "@/lib/prices/coverage";
import {
    SYMBOL_RELEASE_DAYS,
    createIncomeClock,
    dividendsByExDate,
    holdingSpans,
    makeRateLookup,
    readyThrough,
    reconcile,
    replayIncome,
    type IncomeRow,
    type IncomeTrade,
    type RateLookup,
} from "@/lib/income/accrual";
import type {DividendPoint} from "@/lib/prices/types";
import {accountEpoch} from "@/lib/trading/epoch";

type LeanAccount = {
    _id: unknown;
    userId: string;
    cash: number;
    startingBalance: number;
    inceptionAt?: Date;
    createdAt: Date;
    positions?: {symbol: string; quantity: number}[];
    incomeThrough?: string;
};

type LeanTrade = {symbol: string; side: 'buy' | 'sell'; quantity: number; total: number; createdAt: Date};
type LeanRow = {date: string; kind: 'interest' | 'dividend'; amount: number};


const toIncomeTrade = (trade: LeanTrade): IncomeTrade => ({
    date: getEasternDateString(new Date(trade.createdAt)),
    symbol: trade.symbol.toUpperCase(),
    side: trade.side,
    quantity: trade.quantity,
    total: trade.total,
});

// ---------------------------------------------------------------------------
// Planning: which symbols need a deep refetch before their dividends can be trusted
// ---------------------------------------------------------------------------

type IncomePlan = {accountIds: string[]; backfill: string[]; topup: string[]};

export const planIncomeRun = async ({accountIds}: {accountIds?: string[] | null} = {}): Promise<IncomePlan> => {
    await connectToDatabase();
    const accounts = await PaperAccount.find(accountIds?.length ? {_id: {$in: accountIds}} : {})
        .select('_id inceptionAt createdAt positions incomeThrough')
        .lean<LeanAccount[]>();
    const ids = accounts.map((a) => String(a._id));
    const traded = await PaperTrade.aggregate<{_id: {accountId: string; symbol: string}}>([
        {$match: {accountId: {$in: ids}}},
        {$group: {_id: {accountId: '$accountId', symbol: '$symbol'}}},
    ]);
    const tradedBy = new Map<string, string[]>();
    for (const row of traded) tradedBy.set(row._id.accountId, [...(tradedBy.get(row._id.accountId) ?? []), row._id.symbol.toUpperCase()]);

    // The earliest ex-date each symbol's dividends are needed from: an account's inception
    // for a back-credit, otherwise just behind its watermark (by the pay lag).
    const neededFrom = new Map<string, string>();
    const need = (symbol: string, from: string) => {
        const current = neededFrom.get(symbol);
        if (current === undefined || from < current) neededFrom.set(symbol, from);
    };
    for (const account of accounts) {
        const inception = getEasternDateString(accountEpoch(account));
        const from = account.incomeThrough ? addCalendarDays(account.incomeThrough, 1 - DIVIDEND_PAY_LAG_DAYS) : inception;
        const symbols = new Set([...(tradedBy.get(String(account._id)) ?? []), ...(account.positions ?? []).map((p) => p.symbol.toUpperCase())]);
        for (const symbol of symbols) need(symbol, from);
        // The total-return benchmark reads SPY's dividends from each account's inception.
        need(BENCHMARK_SYMBOL, inception);
    }

    const metas = await getSeriesMeta([...neededFrom.keys()]);
    const backfill: string[] = [];
    const topup: string[] = [RATE_SYMBOL];
    for (const [symbol, from] of neededFrom) {
        const covered = metas.get(symbol)?.dividendsFrom;
        (covered === undefined || covered > from ? backfill : topup).push(symbol);
    }
    return {accountIds: ids, backfill, topup};
};

// ---------------------------------------------------------------------------
// Inputs shared by a batch of accounts
// ---------------------------------------------------------------------------

type IncomeInputs = {
    rateOn: RateLookup;
    dividends: Map<string, DividendPoint[]>;
    coverage: (symbol: string) => CoverageRange | null;
    released: Set<string>;
};

const loadIncomeInputs = async (symbols: string[], end: string): Promise<IncomeInputs> => {
    const unique = [...new Set(symbols.map((s) => s.toUpperCase()))];
    const [rates, dividends, metas] = await Promise.all([getRatePoints(), getDividendPoints(unique), getSeriesMeta(unique)]);
    const releaseBefore = addCalendarDays(end, -SYMBOL_RELEASE_DAYS);
    const ranges = new Map<string, CoverageRange>();
    const released = new Set<string>();
    for (const [symbol, meta] of metas) {
        if (meta.dividendsFrom && meta.dividendsThrough) ranges.set(symbol, {from: meta.dividendsFrom, through: meta.dividendsThrough});
        if (meta.failingSince && meta.failingSince <= releaseBefore) released.add(symbol);
    }
    return {
        rateOn: makeRateLookup(rates),
        dividends: dividendsByExDate(dividends),
        coverage: (symbol) => ranges.get(symbol) ?? null,
        released,
    };
};

// ---------------------------------------------------------------------------
// Crediting one account
// ---------------------------------------------------------------------------

export type CreditOutcome = {
    accountId: string;
    status: 'credited' | 'current' | 'waiting' | 'skipped' | 'raced' | 'error';
    rows?: number;
    amount?: number;
    through?: string;
    reason?: string;
    snapshotsShifted?: number;
};

// Only the fields a row actually has: an undefined spread into an update can be stored as null.
const ledgerFields = (row: IncomeRow): Record<string, string | number> => {
    const fields: Record<string, string | number> = {kind: row.kind, date: row.date, symbol: row.symbol, amount: row.amount};
    if (row.apy !== undefined) fields.apy = row.apy;
    if (row.exDate !== undefined) fields.exDate = row.exDate;
    if (row.perShare !== undefined) fields.perShare = row.perShare;
    if (row.quantity !== undefined) fields.quantity = row.quantity;
    return fields;
};

const sumBy = (rows: readonly LeanRow[]) => {
    const byDate = new Map<string, number>();
    let interest = 0;
    let dividends = 0;
    for (const row of rows) {
        byDate.set(row.date, (byDate.get(row.date) ?? 0) + row.amount);
        if (row.kind === 'interest') interest += row.amount;
        else dividends += row.amount;
    }
    return {byDate, interest, dividends, total: interest + dividends};
};

export const creditAccountIncome = async (accountId: string, {end, inputs}: {end: string; inputs: IncomeInputs}): Promise<CreditOutcome> => {
    const account = await PaperAccount.findById(accountId).lean<LeanAccount | null>();
    if (!account) return {accountId, status: 'raced', reason: 'account gone'};

    const inceptionAt = accountEpoch(account);
    const epoch = new Date(inceptionAt).getTime();
    const inceptionDate = getEasternDateString(new Date(inceptionAt));
    const watermark = account.incomeThrough ?? null;

    // Filtered by timestamp, not ET date: leftovers of a reset that crashed mid-cascade are
    // older than the new inceptionAt even when they share its calendar day.
    const trades = (await PaperTrade.find({accountId, createdAt: {$gte: inceptionAt}}).sort({createdAt: 1}).lean<LeanTrade[]>()).map(toIncomeTrade);
    const stored = await AccountIncome.find({accountId, epoch}).lean<LeanRow[]>();
    const credited = sumBy(stored.filter((row) => watermark !== null && row.date <= watermark));

    const check = reconcile({
        startingBalance: account.startingBalance,
        cash: account.cash,
        positions: account.positions ?? [],
        trades,
        creditedTotal: credited.total,
    });
    if (!check.ok) return {accountId, status: 'skipped', reason: check.reason};

    const start = watermark ? addCalendarDays(watermark, 1) : inceptionDate;
    let through = watermark;
    let outcome: CreditOutcome = {accountId, status: 'current'};

    if (start <= end) {
        const ready = readyThrough({start, end, rateOn: inputs.rateOn, spans: holdingSpans(trades), coverage: inputs.coverage, released: inputs.released});
        if (ready === null) {
            outcome = {accountId, status: 'waiting', reason: `data not ready from ${start}`};
        } else {
            // Replayed from inception so every entitlement and every day's cash is rebuilt
            // exactly; days already paid move cash by what was stored, not by a recomputation.
            const storedByDate = sumBy(stored).byDate;
            const {rows} = replayIncome({
                from: inceptionDate,
                to: ready,
                startCash: account.startingBalance,
                startHoldings: new Map(),
                trades,
                clock: createIncomeClock({rateOn: inputs.rateOn, dividends: inputs.dividends}),
                credited: (date) => storedByDate.get(date) ?? (watermark !== null && date <= watermark ? 0 : undefined),
            });
            const fresh: IncomeRow[] = rows.filter((row) => row.date >= start && row.date <= ready);

            // (a) Rows first. A row that already exists keeps its first amount.
            if (fresh.length > 0) {
                await AccountIncome.bulkWrite(fresh.map((row) => ({
                    updateOne: {
                        filter: {accountId, epoch, kind: row.kind, date: row.date, symbol: row.symbol},
                        update: {$setOnInsert: {...ledgerFields(row), accountId, userId: account.userId, epoch, createdAt: new Date()}},
                        upsert: true,
                    },
                })), {ordered: false});
            }

            // (b) Credit what is STORED for the window, once. The guard on the watermark makes a
            // retry or an overlapping run a no-op; the guard on inceptionAt stops a reset
            // landing mid-run from receiving the old account's income.
            const windowRows = await AccountIncome.find({accountId, epoch, date: {$gte: start, $lte: ready}}).lean<LeanRow[]>();
            const due = sumBy(windowRows);
            const moved = await PaperAccount.updateOne(
                {
                    _id: account._id,
                    inceptionAt: account.inceptionAt ?? {$exists: false},
                    incomeThrough: watermark ?? {$exists: false},
                },
                {
                    $inc: {cash: due.total, 'incomeTotals.interest': due.interest, 'incomeTotals.dividends': due.dividends},
                    $set: {incomeThrough: ready},
                },
            );
            if (moved.matchedCount === 0) return {accountId, status: 'raced', reason: 'reset or credited concurrently'};
            through = ready;
            outcome = {accountId, status: 'credited', rows: windowRows.length, amount: due.total, through: ready};
        }
    }

    // (c) Every run, not only after a credit: this is also how a snapshot written before a
    // late or missed night catches up with the income it should contain.
    if (through !== null) outcome.snapshotsShifted = await catchUpSnapshots(accountId, epoch, through);
    return outcome;
};

// A snapshot on day s should contain every row dated before s. Each records which rows it
// already contains (`incomeThrough`), so topping it up is exact and happens once.
const catchUpSnapshots = async (accountId: string, epoch: number, through: string): Promise<number> => {
    // Still the same account? A reset since the credit means this history is not ours to edit.
    const current = await PaperAccount.findById(accountId).select('inceptionAt createdAt').lean<{inceptionAt?: Date; createdAt: Date} | null>();
    if (!current || accountEpoch(current).getTime() !== epoch) return 0;

    const rows = await AccountIncome.find({accountId, epoch, date: {$lte: through}}).sort({date: 1}).lean<LeanRow[]>();
    const dates: string[] = [];
    const cumulative: number[] = [];
    for (const row of rows) {
        if (dates[dates.length - 1] === row.date) cumulative[cumulative.length - 1] += row.amount;
        else {
            dates.push(row.date);
            cumulative.push((cumulative[cumulative.length - 1] ?? 0) + row.amount);
        }
    }
    // Σ rows dated on or before `date`.
    const sumThrough = (date: string | null): number => {
        if (date === null) return 0;
        let lo = 0;
        let hi = dates.length - 1;
        let total = 0;
        while (lo <= hi) {
            const mid = (lo + hi) >> 1;
            if (dates[mid] <= date) {
                total = cumulative[mid];
                lo = mid + 1;
            } else {
                hi = mid - 1;
            }
        }
        return total;
    };

    const snapshots = await AccountSnapshot.find({
        accountId,
        $or: [{incomeThrough: {$exists: false}}, {incomeThrough: {$lt: through}}],
    }).lean<{_id: unknown; date: string; epoch?: number; incomeThrough?: string}[]>();

    let shifted = 0;
    for (const snapshot of snapshots) {
        if (snapshot.epoch !== undefined && snapshot.epoch !== epoch) continue;
        const target = [addCalendarDays(snapshot.date, -1), through].sort()[0];
        const has = snapshot.incomeThrough ?? null;
        if (has !== null && has >= target) continue;
        const add = sumThrough(target) - sumThrough(has);
        const updated = await AccountSnapshot.updateOne(
            {_id: snapshot._id, incomeThrough: has ?? {$exists: false}},
            {$inc: {cash: add, totalValue: add}, $set: {incomeThrough: target, epoch}},
        );
        if (updated.modifiedCount > 0 && add !== 0) shifted += 1;
    }
    return shifted;
};

// One step's worth of accounts, each isolated so one bad account cannot block the rest.
export const creditAccounts = async (accountIds: string[], {end}: {end: string}): Promise<CreditOutcome[]> => {
    await connectToDatabase();
    const accounts = await PaperAccount.find({_id: {$in: accountIds}}).select('_id positions').lean<LeanAccount[]>();
    const traded = await PaperTrade.distinct('symbol', {accountId: {$in: accountIds}});
    const symbols = [...traded, ...accounts.flatMap((a) => (a.positions ?? []).map((p) => p.symbol))];
    const inputs = await loadIncomeInputs(symbols, end);

    const outcomes: CreditOutcome[] = [];
    for (const accountId of accountIds) {
        try {
            outcomes.push(await creditAccountIncome(accountId, {end, inputs}));
        } catch (error) {
            console.error(`Income credit failed for account ${accountId}:`, error);
            outcomes.push({accountId, status: 'error', reason: error instanceof Error ? error.message : String(error)});
        }
    }
    return outcomes;
};

// The nightly credit's price passes (lib/jobs/functions/income.ts), one step per chunk: a deep
// backfill for the symbols planIncomeRun found without dividend coverage, a routine top-up
// for the rest.
export const backfillIncomeBars = async (symbols: string[]): Promise<{updated: number; failed: string[]}> => {
    const r = await ensureBars(symbols, {limit: symbols.length, forceBackfill: true});
    return {updated: r.updated, failed: r.failed};
};

export const topUpIncomeBars = async (symbols: string[]): Promise<{updated: number; fresh: number; failed: string[]}> => {
    const r = await ensureBars(symbols, {limit: symbols.length});
    return {updated: r.updated, fresh: r.fresh, failed: r.failed};
};

// Accounts never credited replay from inception — heavy, so the job credits them in small
// batches; the rest are routine.
export const splitByWatermark = async (accountIds: string[]): Promise<{backCredit: string[]; routine: string[]}> => {
    await connectToDatabase();
    const docs = await PaperAccount.find({_id: {$in: accountIds}}).select('_id incomeThrough').lean<{_id: unknown; incomeThrough?: string}[]>();
    return {
        backCredit: docs.filter((d) => !d.incomeThrough).map((d) => String(d._id)),
        routine: docs.filter((d) => d.incomeThrough).map((d) => String(d._id)),
    };
};
