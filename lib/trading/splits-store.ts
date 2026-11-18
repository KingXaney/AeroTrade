// Detecting stock splits and applying them to accounts. Server-only (NOT 'use server'); the
// rules are lib/trading/splits.ts, pure. The stock-splits job (lib/jobs/functions/splits.ts)
// runs these as its steps, the snapshot job applies whatever is outstanding before it values
// anything, and a fill of a held symbol checks first (settleSplitsBeforeFill): an order must
// never act on a holding that is still in old shares.
//
// There are no transactions, so each account is brought up to date by ONE guarded update: its
// position in today's shares, the split appended to its own list, splitRev bumped. An update
// that matches nothing (an order or an income credit landed first) is tried again, and an
// account that already lists the split is never touched twice.

import {connectToDatabase} from "@/database/mongoose";
import PaperAccount from "@/database/models/paper-account.model";
import PaperTrade from "@/database/models/paper-trade.model";
import StockSplit from "@/database/models/stock-split.model";
import {YAHOO_DELAY_MS} from "@/lib/prices/config";
import {isTradingDay, previousTradingDay, sessionCloseOf} from "@/lib/prices/market-hours";
import {ensureBars, getLatestBars} from "@/lib/prices/store";
import {fetchYahooSplits} from "@/lib/prices/yahoo";
import {addCalendarDays, getEasternDateString} from "@/lib/dates";
import {CLOSE_FALLBACK_DAYS} from "@/lib/trading/config";
import {accountEpoch} from "@/lib/trading/epoch";
import type {PendingFillLike} from "@/lib/trading/pending";
import {settlePendingFill} from "@/lib/trading/pending-fill";
import {
    cutFor,
    looksLikeSplit,
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

// Every symbol some account holds now.
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
    for (let i = 0; i < symbols.length; i += 1) {
        const symbol = symbols[i];
        if (i > 0) await delay(YAHOO_DELAY_MS);
        const splits = await fetchYahooSplits(symbol);
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

type LeanSplit = {symbol: string; exDate: string; numerator: number; denominator: number; at: Date; prevClose?: number; rebasedAt?: Date};

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

const lists = (account: LeanAccount, split: {symbol: string; exDate: string}): boolean =>
    toAppliedSplits(account.splits).some((have) => splitKey(have) === splitKey(split));

// One split, one account. Skipped, and said so, when the stored position is not what its own
// trades rebuild: books that do not add up are not rewritten from them. An account with no
// fill of the symbol from before the split has nothing to restate; the split is still noted on
// its list, so it is not looked at again tomorrow.
const applySplitToAccount = async (accountId: string, split: StockSplitEvent, today: string): Promise<AccountOutcome> => {
    let account = await PaperAccount.findById(accountId).lean<LeanAccount | null>();
    if (!account) return {status: 'nothing'};
    if (account.pendingFill) {
        await settlePendingFill(account);
        account = await PaperAccount.findById(accountId).lean<LeanAccount | null>();
        if (!account) return {status: 'nothing'};
    }
    if (lists(account, split)) return {status: 'nothing'};
    const applied = toAppliedSplits(account.splits);

    const symbol = split.symbol.toUpperCase();
    const rows = await PaperTrade.find({accountId, symbol, createdAt: {$gte: accountEpoch(account)}})
        .sort({createdAt: 1, _id: 1})
        .select('side quantity price company createdAt')
        .lean<LeanFill[]>();
    const fills = rows.map((row) => ({symbol, side: row.side, quantity: row.quantity, price: row.price, createdAt: new Date(row.createdAt).getTime()}));
    const cut = cutFor(split, fills);
    const entry = {symbol, exDate: split.exDate, numerator: split.numerator, denominator: split.denominator, before: cut};
    const stamp = {...entry, before: new Date(cut), appliedAt: new Date()};
    const unlisted = {$not: {$elemMatch: {symbol, exDate: split.exDate}}};

    if (!fills.some((fill) => fill.createdAt < cut)) {
        // Nothing to restate. Noted on the list (it changes no fill's reading: none is before
        // the cut), with no guard on cash: the position is not touched.
        await PaperAccount.updateOne({_id: account._id, splits: unlisted}, {$push: {splits: stamp}});
        return {status: 'nothing'};
    }

    const stored = (account.positions ?? []).find((position) => position.symbol.toUpperCase() === symbol);
    const rebuilt = positionFromFills(fills.map((fill) => restateFill(fill, applied)));
    const adds = rebuilt !== undefined && Math.abs((rebuilt?.quantity ?? 0) - (stored?.quantity ?? 0)) <= SHARES_TOLERANCE;
    const next = adds ? positionFromFills(fills.map((fill) => restateFill(fill, [...applied, entry]))) : undefined;
    if (next === undefined) {
        return {status: 'skipped', skip: {accountId, symbol, reason: 'position does not rebuild from its trades'}};
    }

    const others = (account.positions ?? []).filter((position) => position.symbol.toUpperCase() !== symbol);
    const company = stored?.company || rows.find((row) => row.company)?.company || symbol;
    const positions = next === null ? others : [...others, {symbol: stored?.symbol ?? symbol, company, quantity: next.quantity, avgCost: next.avgCost}];
    // Guarded on what was read: cash (a fill or a credit landed), splitRev (another split did),
    // the list itself, and no fill waiting for its row.
    const written = await PaperAccount.updateOne(
        {_id: account._id, cash: account.cash, splitRev: account.splitRev ?? null, pendingFill: {$exists: false}, splits: unlisted},
        {
            $set: {positions},
            $push: {splits: stamp},
            $inc: {splitRev: 1},
        },
    );
    if (written.matchedCount === 0) return {status: 'raced'};
    return {status: 'applied', application: {accountId, symbol, exDate: split.exDate, numerator: split.numerator, denominator: split.denominator, lateDays: sessionsLate(split.exDate, today)}};
};

// How long after its ex-date a split is still looked for among accounts that no longer hold
// the symbol (they sold it out before the split reached them).
const SOLD_OUT_LOOKBACK_DAYS = 10;

type Outstanding = {split: StockSplitEvent; rebased: boolean; accountIds: string[]};

// The stored splits already in effect that some account has not taken — each with the accounts
// to look at: those holding the symbol and, for a split of the last few days, those with a fill
// of it since the session before (an account that sold the holding out in old shares still has
// its other shares coming). Bounded by what is held and by those few days.
const outstanding = async (symbols?: readonly string[]): Promise<Outstanding[]> => {
    const now = Date.now();
    const splits = await StockSplit.find({at: {$lte: new Date(now)}, ...(symbols ? {symbol: {$in: symbols.map((s) => s.toUpperCase())}} : {})})
        .sort({at: 1})
        .lean<LeanSplit[]>();
    if (splits.length === 0) return [];
    const holders = await PaperAccount.find({'positions.symbol': {$in: [...new Set(splits.map((s) => s.symbol))]}})
        .select('positions.symbol splits inceptionAt createdAt')
        .lean<LeanAccount[]>();

    const work: Outstanding[] = [];
    for (const stored of splits) {
        const split = toEvent(stored);
        const symbol = split.symbol.toUpperCase();
        const ids = new Set(holders
            .filter((account) => (account.positions ?? []).some((position) => position.symbol.toUpperCase() === symbol))
            // An account opened after the ex-date's close has no old-basis fill to restate.
            .filter((account) => accountEpoch(account).getTime() <= sessionCloseOf(split.exDate))
            .filter((account) => !lists(account, split))
            .map((account) => String(account._id)));
        if (split.at >= now - SOLD_OUT_LOOKBACK_DAYS * 86_400_000) {
            const from = new Date(sessionCloseOf(previousTradingDay(split.exDate)));
            const traded: unknown[] = await PaperTrade.distinct('accountId', {symbol, createdAt: {$gte: from}});
            const soldOut = traded.filter((id): id is string => typeof id === 'string' && !ids.has(id));
            if (soldOut.length > 0) {
                const candidates = await PaperAccount.find({_id: {$in: soldOut}}).select('splits inceptionAt createdAt').lean<LeanAccount[]>();
                for (const account of candidates) {
                    if (accountEpoch(account).getTime() <= sessionCloseOf(split.exDate) && !lists(account, split)) ids.add(String(account._id));
                }
            }
        }
        if (ids.size > 0) work.push({split, rebased: stored.rebasedAt !== undefined, accountIds: [...ids]});
    }
    return work;
};

// The symbols whose price history must be rebuilt before their split is applied: a split
// restates every earlier close, and a stored close is what a page falls back on and what a fill
// is checked against. Once per split: the row is stamped when the rebuild lands.
export const symbolsToRebase = async (): Promise<string[]> => {
    await connectToDatabase();
    return [...new Set((await outstanding()).filter((work) => !work.rebased).map((work) => work.split.symbol))];
};

export const rebaseBarsFor = async (symbols: string[]): Promise<{updated: number; failed: string[]}> => {
    if (symbols.length === 0) return {updated: 0, failed: []};
    const result = await ensureBars(symbols, {limit: symbols.length, forceBackfill: true});
    const rebuilt = symbols.filter((symbol) => !result.failed.includes(symbol));
    if (rebuilt.length > 0) {
        await StockSplit.updateMany({symbol: {$in: rebuilt}, at: {$lte: new Date()}, rebasedAt: {$exists: false}}, {$set: {rebasedAt: new Date()}});
    }
    return {updated: result.updated, failed: result.failed};
};

const APPLY_ATTEMPTS = 3;

export type SplitsApplied = {applied: SplitApplication[]; skipped: SplitSkip[]; unsettled: {accountId: string; symbol: string}[]};

// Brings every account up to date with every split in effect, oldest split first so two splits
// of one symbol compound in order. A write that lost to another writer is tried again at once
// (the account is re-read each time); one that keeps losing is named, and the next run has it.
// `symbols` narrows it.
export const applyStoredSplits = async ({symbols}: {symbols?: readonly string[]} = {}): Promise<SplitsApplied> => {
    await connectToDatabase();
    const today = getEasternDateString();
    const done: SplitsApplied = {applied: [], skipped: [], unsettled: []};
    for (const {split, accountIds} of await outstanding(symbols)) {
        for (const accountId of accountIds) {
            try {
                let outcome = await applySplitToAccount(accountId, split, today);
                for (let attempt = 1; outcome.status === 'raced' && attempt < APPLY_ATTEMPTS; attempt += 1) {
                    outcome = await applySplitToAccount(accountId, split, today);
                }
                if (outcome.status === 'applied') done.applied.push(outcome.application);
                else if (outcome.status === 'skipped') done.skipped.push(outcome.skip);
                else if (outcome.status === 'raced') done.unsettled.push({accountId, symbol: split.symbol});
            } catch (error) {
                console.error(`Split ${splitKey(split)} could not be applied to account ${accountId}:`, error);
                done.skipped.push({accountId, symbol: split.symbol, reason: error instanceof Error ? error.message : String(error)});
            }
        }
    }
    return done;
};

// The snapshot job's step, before it values anything: Yahoo is asked about the holdings whose
// quote sits far from their last stored close, and every split outstanding — those just found,
// and any the morning's job left unapplied — is applied. Never throws: a run that cannot check
// goes on, and its accounts are re-read either way.
export const applySplitsBeforeSnapshot = async (suspects: readonly string[]): Promise<SplitsApplied> => {
    try {
        if (suspects.length > 0 && splitDetectionEnabled()) {
            const detection = await detectSplits(suspects);
            if (detection.found.length > 0) await rebaseBarsFor(detection.found);
        }
        return await applyStoredSplits();
    } catch (error) {
        console.error('The snapshot run could not check for splits:', error);
        return {applied: [], skipped: [], unsettled: []};
    }
};

// ---------------------------------------------------------------------------
// Before a fill
// ---------------------------------------------------------------------------

// A symbol Yahoo was asked about on a quote that looked like a split, and listed none for: not
// asked again for a while (a stock really can fall 20% in a day, and each fill of it that day
// would ask).
const CLEAR_FOR_MS = 15 * 60_000;
const checkedClear = new Map<string, number>();

export type SplitGuard =
    | 'clear'        // nothing to apply: the fill goes ahead
    | 'applied'      // a split was just applied to this account: the order's quantity was sized on the old shares
    | 'unchecked';   // the quote looks like a split and it could not be checked, or the account's write kept losing

// Called by executeOrder for a symbol the account HOLDS, with the price it is about to fill at.
// A split in effect that the account has not taken is applied first — one already stored, or
// one the price gives away (far from the last stored close) and Yahoo then confirms. The
// minutes between a split's 09:30 instant and the job that applies it are when a holding reads
// as ten shares at a tenth of the price; an order filled then would sell the wrong number of
// shares for good.
export const settleSplitsBeforeFill = async (
    account: {_id: unknown; inceptionAt?: Date; createdAt: Date; splits?: Parameters<typeof toAppliedSplits>[0]},
    symbol: string,
    price: number,
): Promise<SplitGuard> => {
    const sym = symbol.toUpperCase();
    const accountId = String(account._id);
    const verdictOf = (done: SplitsApplied): SplitGuard | null => {
        if (done.applied.some((item) => item.accountId === accountId)) return 'applied';
        if (done.unsettled.some((item) => item.accountId === accountId)) return 'unchecked';
        return null;
    };

    const stored = await StockSplit.find({symbol: sym, at: {$lte: new Date()}}).select('symbol exDate').lean<{symbol: string; exDate: string}[]>();
    const applied = toAppliedSplits(account.splits);
    const pending = stored.filter((split) => !applied.some((have) => splitKey(have) === splitKey(split))
        && accountEpoch(account).getTime() <= sessionCloseOf(split.exDate));
    if (pending.length > 0) {
        const verdict = verdictOf(await applyStoredSplits({symbols: [sym]}));
        if (verdict) return verdict;
    }

    const today = getEasternDateString();
    const lastClose = (await getLatestBars([sym], {since: addCalendarDays(today, -CLOSE_FALLBACK_DAYS), onOrBefore: today})).get(sym)?.close;
    if (!looksLikeSplit(price, lastClose) || !splitDetectionEnabled()) return 'clear';
    const cleared = checkedClear.get(sym);
    if (cleared !== undefined && Date.now() - cleared < CLEAR_FOR_MS) return 'clear';

    const detection = await detectSplits([sym]);
    if (detection.unanswered.length > 0) return 'unchecked';
    if (detection.found.length === 0) {
        checkedClear.set(sym, Date.now());
        return 'clear';
    }
    await rebaseBarsFor([sym]);
    return verdictOf(await applyStoredSplits({symbols: [sym]})) ?? 'clear';
};
