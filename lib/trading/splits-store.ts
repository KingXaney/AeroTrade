// Detecting stock splits and applying them to accounts. Server-only (NOT 'use server'); the
// rules are lib/trading/splits.ts, pure. The stock-splits job (lib/jobs/functions/splits.ts)
// runs these as its steps, and the snapshot job calls checkSplitsFor before it values anything.
//
// There are no transactions, so each account is brought up to date by ONE guarded update: its
// position in today's shares, the split appended to its own list, splitRev bumped. An update
// that matches nothing (an order or an income credit landed first) changes nothing and the next
// run tries again; an account that already lists the split is never touched twice.

import {connectToDatabase} from "@/database/mongoose";
import PaperAccount from "@/database/models/paper-account.model";
import PaperTrade from "@/database/models/paper-trade.model";
import StockSplit from "@/database/models/stock-split.model";
import {YAHOO_DELAY_MS} from "@/lib/prices/config";
import {isTradingDay, sessionCloseOf} from "@/lib/prices/market-hours";
import {ensureBars} from "@/lib/prices/store";
import {fetchYahooSplits} from "@/lib/prices/yahoo";
import {addCalendarDays, getEasternDateString} from "@/lib/dates";
import {accountEpoch} from "@/lib/trading/epoch";
import type {PendingFillLike} from "@/lib/trading/pending";
import {settlePendingFill} from "@/lib/trading/pending-fill";
import {
    cutFor,
    positionFromFills,
    restateFill,
    splitInstant,
    splitKey,
    toAppliedSplits,
    type SplitApplication,
    type SplitSkip,
    type StockSplitEvent,
} from "@/lib/trading/splits";

const delay = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

// STOCK_SPLIT_DETECTION=off is the browser QA's: a suite seeds the split it wants applied, and
// no run asks Yahoo about the fixtures' holdings.
export const splitDetectionEnabled = (): boolean => process.env.STOCK_SPLIT_DETECTION !== 'off';

// Every symbol some account holds now. A split is looked for only while a symbol is held.
export const heldSymbols = async (): Promise<string[]> => {
    await connectToDatabase();
    const symbols: unknown[] = await PaperAccount.distinct('positions.symbol');
    return [...new Set(symbols.filter((s): s is string => typeof s === 'string' && s !== '').map((s) => s.toUpperCase()))].sort();
};

type Detection = {checked: number; unanswered: string[]; found: string[]};

// Asks Yahoo for each symbol's splits and stores the ones not yet known. `found` names the
// symbols with a NEW split. A symbol Yahoo did not answer for is unanswered: not checked,
// which is not the same as having no split.
export const detectSplits = async (symbols: readonly string[]): Promise<Detection> => {
    await connectToDatabase();
    const outcome: Detection = {checked: 0, unanswered: [], found: []};
    for (const symbol of symbols) {
        const splits = await fetchYahooSplits(symbol);
        await delay(YAHOO_DELAY_MS);
        if (splits === null) {
            outcome.unanswered.push(symbol);
            continue;
        }
        outcome.checked += 1;
        for (const split of splits) {
            const stored = await StockSplit.updateOne(
                {symbol, exDate: split.exDate},
                {$setOnInsert: {
                    symbol,
                    exDate: split.exDate,
                    numerator: split.numerator,
                    denominator: split.denominator,
                    at: new Date(splitInstant(split.exDate)),
                    ...(split.prevClose !== undefined ? {prevClose: split.prevClose} : {}),
                    source: 'yahoo',
                    detectedAt: new Date(),
                }},
                {upsert: true},
            );
            if (stored.upsertedCount > 0 && !outcome.found.includes(symbol)) outcome.found.push(symbol);
        }
    }
    return outcome;
};

type LeanSplit = {symbol: string; exDate: string; numerator: number; denominator: number; at: Date; prevClose?: number};

const toEvent = (split: LeanSplit): StockSplitEvent => ({
    symbol: split.symbol,
    exDate: split.exDate,
    numerator: split.numerator,
    denominator: split.denominator,
    at: new Date(split.at).getTime(),
    ...(typeof split.prevClose === 'number' ? {prevClose: split.prevClose} : {}),
});

type LeanAccount = {
    _id: unknown;
    userId: string;
    cash: number;
    inceptionAt?: Date;
    createdAt: Date;
    positions?: {symbol: string; company?: string; quantity: number; avgCost: number}[];
    pendingFill?: PendingFillLike;
    splits?: Parameters<typeof toAppliedSplits>[0];
    splitRev?: number;
};

type LeanFill = {side: 'buy' | 'sell'; quantity: number; price: number; company?: string; createdAt: Date};

const SHARES_TOLERANCE = 1e-6;

// Trading sessions from the ex-date up to today: how late a split reached an account.
const sessionsLate = (exDate: string, today: string): number => {
    let count = 0;
    for (let day = exDate; day < today; day = addCalendarDays(day, 1)) if (isTradingDay(day)) count += 1;
    return count;
};

type AccountOutcome =
    | {status: 'applied'; application: SplitApplication}
    | {status: 'skipped'; skip: SplitSkip}
    | {status: 'nothing' | 'raced'};

// One split, one account. Nothing to do when the account already lists it or has no fill of the
// symbol from before it. Skipped, and said so, when the stored position is not what its own
// trades rebuild: books that do not add up are not rewritten from them.
const applySplitToAccount = async (accountId: string, split: StockSplitEvent, today: string): Promise<AccountOutcome> => {
    let account = await PaperAccount.findById(accountId).lean<LeanAccount | null>();
    if (!account) return {status: 'nothing'};
    if (account.pendingFill) {
        await settlePendingFill(account);
        account = await PaperAccount.findById(accountId).lean<LeanAccount | null>();
        if (!account) return {status: 'nothing'};
    }
    const applied = toAppliedSplits(account.splits);
    if (applied.some((have) => splitKey(have) === splitKey(split))) return {status: 'nothing'};

    const symbol = split.symbol.toUpperCase();
    const rows = await PaperTrade.find({accountId, symbol, createdAt: {$gte: accountEpoch(account)}})
        .sort({createdAt: 1, _id: 1})
        .select('side quantity price company createdAt')
        .lean<LeanFill[]>();
    const fills = rows.map((row) => ({symbol, side: row.side, quantity: row.quantity, price: row.price, createdAt: new Date(row.createdAt).getTime()}));
    const cut = cutFor(split, fills);
    if (!fills.some((fill) => fill.createdAt < cut)) return {status: 'nothing'};

    const stored = (account.positions ?? []).find((position) => position.symbol.toUpperCase() === symbol);
    const rebuilt = positionFromFills(fills.map((fill) => restateFill(fill, applied)));
    const adds = rebuilt !== undefined && Math.abs((rebuilt?.quantity ?? 0) - (stored?.quantity ?? 0)) <= SHARES_TOLERANCE;
    const entry = {symbol, exDate: split.exDate, numerator: split.numerator, denominator: split.denominator, before: cut};
    const next = adds ? positionFromFills(fills.map((fill) => restateFill(fill, [...applied, entry]))) : undefined;
    if (next === undefined) {
        return {status: 'skipped', skip: {accountId, symbol, reason: 'position does not rebuild from its trades'}};
    }

    const others = (account.positions ?? []).filter((position) => position.symbol.toUpperCase() !== symbol);
    const company = stored?.company || rows.find((row) => row.company)?.company || symbol;
    const positions = next === null ? others : [...others, {symbol: stored?.symbol ?? symbol, company, quantity: next.quantity, avgCost: next.avgCost}];
    // Guarded on what was read: cash (a fill or a credit landed), splitRev (another split did),
    // and no fill waiting for its row.
    const written = await PaperAccount.updateOne(
        {_id: account._id, cash: account.cash, splitRev: account.splitRev ?? null, pendingFill: {$exists: false}},
        {
            $set: {positions},
            $push: {splits: {...entry, before: new Date(cut), appliedAt: new Date()}},
            $inc: {splitRev: 1},
        },
    );
    if (written.matchedCount === 0) return {status: 'raced'};
    return {status: 'applied', application: {accountId, symbol, exDate: split.exDate, numerator: split.numerator, denominator: split.denominator, lateDays: sessionsLate(split.exDate, today)}};
};

// The stored splits already in effect that some account holding the symbol has not applied —
// each with the accounts to look at. Bounded by what is held: one accounts read per run.
const outstanding = async (symbols?: readonly string[]): Promise<{split: StockSplitEvent; accountIds: string[]}[]> => {
    const splits = await StockSplit.find({at: {$lte: new Date()}, ...(symbols ? {symbol: {$in: symbols.map((s) => s.toUpperCase())}} : {})})
        .sort({at: 1})
        .lean<LeanSplit[]>();
    if (splits.length === 0) return [];
    const holders = await PaperAccount.find({'positions.symbol': {$in: [...new Set(splits.map((s) => s.symbol))]}})
        .select('positions.symbol splits inceptionAt createdAt')
        .lean<LeanAccount[]>();
    return splits.map((stored) => {
        const split = toEvent(stored);
        const accountIds = holders
            .filter((account) => (account.positions ?? []).some((position) => position.symbol.toUpperCase() === split.symbol.toUpperCase()))
            // An account opened after the ex-date's close has no old-basis fill to restate.
            .filter((account) => accountEpoch(account).getTime() <= sessionCloseOf(split.exDate))
            .filter((account) => !toAppliedSplits(account.splits).some((have) => splitKey(have) === splitKey(split)))
            .map((account) => String(account._id));
        return {split, accountIds};
    }).filter((work) => work.accountIds.length > 0);
};

// The symbols whose price history must be rebuilt before their split is applied: a split
// restates every earlier close, and a stored close is what a page falls back on.
export const symbolsWithOutstandingSplits = async (): Promise<string[]> => {
    await connectToDatabase();
    return [...new Set((await outstanding()).map((work) => work.split.symbol))];
};

export const rebaseBarsFor = async (symbols: string[]): Promise<{updated: number; failed: string[]}> => {
    const result = await ensureBars(symbols, {limit: symbols.length, forceBackfill: true});
    return {updated: result.updated, failed: result.failed};
};

// Brings every holding account up to date with every split in effect, oldest split first so two
// splits of one symbol compound in order. `symbols` narrows it (the snapshot job's own check).
export const applyStoredSplits = async ({symbols}: {symbols?: readonly string[]} = {}): Promise<{applied: SplitApplication[]; skipped: SplitSkip[]}> => {
    await connectToDatabase();
    const today = getEasternDateString();
    const applied: SplitApplication[] = [];
    const skipped: SplitSkip[] = [];
    for (const {split, accountIds} of await outstanding(symbols)) {
        for (const accountId of accountIds) {
            try {
                const outcome = await applySplitToAccount(accountId, split, today);
                if (outcome.status === 'applied') applied.push(outcome.application);
                else if (outcome.status === 'skipped') skipped.push(outcome.skip);
            } catch (error) {
                console.error(`Split ${splitKey(split)} could not be applied to account ${accountId}:`, error);
                skipped.push({accountId, symbol: split.symbol, reason: error instanceof Error ? error.message : String(error)});
            }
        }
    }
    return {applied, skipped};
};

// The snapshot job's own check, for the holdings whose quote sits far from their last stored
// close: ask Yahoo about just those, and apply what it lists. Never throws — a snapshot run
// that cannot check goes on as it would have.
export const checkSplitsFor = async (symbols: readonly string[]): Promise<{applied: SplitApplication[]; skipped: SplitSkip[]}> => {
    try {
        if (symbols.length === 0) return {applied: [], skipped: []};
        if (splitDetectionEnabled()) {
            const detection = await detectSplits(symbols);
            if (detection.found.length > 0) await rebaseBarsFor(detection.found);
        }
        return await applyStoredSplits({symbols});
    } catch (error) {
        console.error('The snapshot run could not check for splits:', error);
        return {applied: [], skipped: []};
    }
};
