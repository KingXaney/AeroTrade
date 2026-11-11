// The quote sheet: one stored row per symbol (database/models/price-quote.model.ts) that every
// page values holdings from, and the one place Finnhub is asked for a quote. Two reads:
//
//   getSheetQuotes / getSheetQuote — what a page SHOWS. Answered from the rows; a row is fetched
//   again at most once a window by anyone, and a page with recent prices never waits for it.
//   getFreshQuote — what a fill, the snapshot job or a plan ACTS on. Asks Finnhub now, uncached,
//   and writes the answer into the sheet; a miss stays a miss.
//
// The rules (the window, what is due, what may be served) are lib/prices/quotes.ts, pure.
// Server-only (NOT 'use server').

import {randomUUID} from "node:crypto";
import {cache} from "react";
import {after} from "next/server";
import {connectToDatabase} from "@/database/mongoose";
import PriceQuote from "@/database/models/price-quote.model";
import {reportLimit} from "@/lib/limits/report";
import {bumpCounter, peekRateLimit} from "@/lib/rate-limit";
import {
    QUOTE_ACTING_CEILING,
    QUOTE_ACTING_WAIT_MS,
    QUOTE_ASKED_CEILING,
    QUOTE_BURST,
    QUOTE_BURST_SPACING_MS,
    QUOTE_CLAIM_MS,
    QUOTE_PAGE_CEILING,
    QUOTE_WINDOW_MS,
} from "@/lib/prices/config";
import {fetchQuote, finnhubConfigured, type QuoteAnswer} from "@/lib/prices/finnhub";
import {lastSessionClose, marketStatus} from "@/lib/prices/market-hours";
import {
    askedPrice,
    createPacer,
    fitsTheMinute,
    grantedOfMinute,
    normalizeSymbols,
    planRead,
    readQuoteAnswer,
    refreshOrder,
    servable,
    windowStart,
    type QuoteRow,
    type QuoteSession,
    type QuoteWait,
    type SheetQuote,
} from "@/lib/prices/quotes";
import type {QuoteData} from "@/lib/prices/types";

type StoredRow = {symbol: string; price?: number; changePercent?: number; fetchedAt?: Date; refusedAt?: Date; claimedUntil?: Date};
type Priced = {price: number; changePercent?: number};
// One symbol's part of a refresh: when Finnhub was asked, and the price it gave (null: none).
type Outcome = {symbol: string; askedAt: number; quote: Priced | null};

const isDuplicateKey = (error: unknown): boolean => {
    if (typeof error !== 'object' || error === null) return false;
    const {code, writeErrors} = error as {code?: number; writeErrors?: {code?: number; err?: {code?: number}}[]};
    if (Array.isArray(writeErrors) && writeErrors.length > 0) return writeErrors.every((e) => (e.code ?? e.err?.code) === 11000);
    return code === 11000;
};

const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

// One row a symbol is the unique index's doing, and a claim's insert relies on it, so the first
// write of a process waits for the index (a no-op where it exists). The store builds it itself,
// once the connection is open, and forgets a failure so the next write tries again: Mongoose's
// own Model.init() runs when the model is compiled, rejects for good if the connection was still
// opening then (bufferCommands is off), and would take every later write down with it. Never
// throws — without the index a symbol may briefly have two rows, which readRows tolerates.
let indexing: Promise<void> | undefined;
const indexed = (): Promise<void> => (indexing ??= PriceQuote.createIndexes().then(
    () => undefined,
    (error: unknown) => {
        indexing = undefined;
        console.error('The quote sheet\'s indexes could not be built:', error);
    },
));

// The session the window is read against. QUOTE_SESSION=open is the browser QA's alone: it
// treats every instant as in session, so a run at night walks the per-minute path.
const sessionAt = (now: number): QuoteSession => {
    const at = new Date(now);
    return {open: process.env.QUOTE_SESSION === 'open' || marketStatus(at).state === 'open', lastClose: lastSessionClose(at)};
};

const toRow = (doc: StoredRow): QuoteRow => ({
    symbol: doc.symbol,
    ...(typeof doc.price === 'number' ? {price: doc.price} : {}),
    ...(typeof doc.changePercent === 'number' ? {changePercent: doc.changePercent} : {}),
    ...(doc.fetchedAt ? {fetchedAt: new Date(doc.fetchedAt).getTime()} : {}),
    ...(doc.refusedAt ? {refusedAt: new Date(doc.refusedAt).getTime()} : {}),
    ...(doc.claimedUntil ? {claimedUntil: new Date(doc.claimedUntil).getTime()} : {}),
});

const readRows = async (symbols: readonly string[]): Promise<Map<string, QuoteRow>> => {
    const docs = await PriceQuote.find(
        {symbol: {$in: symbols}},
        {_id: 0, symbol: 1, price: 1, changePercent: 1, fetchedAt: 1, refusedAt: 1, claimedUntil: 1},
    ).lean<StoredRow[]>();
    // One row a symbol; should two ever exist (see indexed), the newer price is the row.
    const rows = new Map<string, QuoteRow>();
    for (const doc of docs) {
        const row = toRow(doc);
        const seen = rows.get(row.symbol);
        if (!seen || (row.fetchedAt ?? 0) >= (seen.fetchedAt ?? 0)) rows.set(row.symbol, row);
    }
    return rows;
};

const unset = (field: string) => ({$or: [{[field]: {$exists: false}}, {[field]: null}]});

// Takes the rows a refresh is about to fetch, so no other request fetches them: a row that is
// still unclaimed and still not current is ours (one conditional update for all of them), and a
// symbol with no row yet is ours when our insert lands — a duplicate key means another request
// made it first. Returns the symbols won.
const claim = async (symbols: readonly string[], rows: ReadonlyMap<string, QuoteRow>, now: number, session: QuoteSession, token: string): Promise<string[]> => {
    const at = new Date(now);
    const hold = {claimedUntil: new Date(now + QUOTE_CLAIM_MS), claimedBy: token, updatedAt: at};
    const known = symbols.filter((symbol) => rows.has(symbol));
    const unseen = symbols.filter((symbol) => !rows.has(symbol));
    const ops: Parameters<typeof PriceQuote.bulkWrite>[0] = [];
    if (known.length > 0) {
        ops.push({updateMany: {
            filter: {
                symbol: {$in: known},
                $and: [
                    {$or: [...unset('claimedUntil').$or, {claimedUntil: {$lte: at}}]},
                    {$or: [...unset('fetchedAt').$or, {fetchedAt: {$lt: new Date(windowStart(now, session))}}]},
                ],
            },
            update: {$set: hold},
        }});
    }
    for (const symbol of unseen) ops.push({updateOne: {filter: {symbol}, update: {$setOnInsert: {symbol, ...hold}}, upsert: true}});
    try {
        if (unseen.length > 0) await indexed();
        await PriceQuote.bulkWrite(ops, {ordered: false});
    } catch (error) {
        if (!isDuplicateKey(error)) throw error;
    }
    const won = await PriceQuote.find({symbol: {$in: symbols}, claimedBy: token}, {_id: 0, symbol: 1}).lean<{symbol: string}[]>();
    return won.map((row) => row.symbol);
};

// The quote calls of each clock minute, counted in the database so every instance spends one
// budget (lib/prices/config: QUOTE_PAGE_CEILING, QUOTE_ASKED_CEILING). `calls` may be negative:
// what a refresh counted and then did not ask is handed back. Counting must never fail a read.
const minuteKey = (now: number): string => `finnhub:quotes:${Math.floor(now / QUOTE_WINDOW_MS)}`;
const countQuotes = async (calls: number, now: number): Promise<number | null> => {
    try {
        return await bumpCounter(minuteKey(now), calls, 3 * QUOTE_WINDOW_MS);
    } catch (error) {
        console.error('The quote budget could not be counted:', error);
        return null;
    }
};

// How many of `want` calls a page or an asked read may make now: what the last sixty seconds
// leave under its ceiling — this minute's count with ours in it, and the part of the minute
// before that is still inside them (lib/prices/quotes.grantedOfMinute). With the counter down,
// all of them: a database hiccup must not blank a page's prices.
const previousMinute = (now: number): Promise<number> =>
    peekRateLimit(minuteKey(now - QUOTE_WINDOW_MS)).then((row) => row?.count ?? 0, () => 0);
const takeBudget = async (want: number, ceiling: number, now: number): Promise<number> => {
    const [countAfter, previous] = await Promise.all([countQuotes(want, now), previousMinute(now)]);
    return countAfter === null ? want : grantedOfMinute({want, countAfter, previous, now, ceiling});
};

// Every quote call this instance makes starts through one pacer — a page's refresh, a second
// reader's on the same page, a fill — so together they stay under the plan's calls a second
// (QUOTE_BURST in any QUOTE_BURST_SPACING_MS). `askedAt` is the moment the call starts.
const pacer = createPacer(QUOTE_BURST, QUOTE_BURST_SPACING_MS);
const pacedQuote = async (symbol: string, skip: () => boolean = () => false): Promise<{askedAt: number; answer: QuoteAnswer | null}> => {
    const start = pacer.next(Date.now());
    const wait = start - Date.now();
    if (wait > 0) await sleep(wait);
    const askedAt = Date.now();
    return {askedAt, answer: skip() ? null : await fetchQuote(symbol)};
};

// Asks Finnhub for the symbols. A refusal (a 429 past the minute, a bad key) is filed once and
// ends the refresh: the calls not yet started are not sent, and read as no price.
const ask = async (symbols: readonly string[]): Promise<Outcome[]> => {
    let stopped = false;
    let warned = false;
    return Promise.all(symbols.map(async (symbol): Promise<Outcome> => {
        const {askedAt, answer} = await pacedQuote(symbol, () => stopped);
        if (answer?.kind === 'refused' && !stopped) {
            stopped = true;
            await reportLimit('finnhub', {status: answer.status, message: answer.detail});
        }
        if (answer?.kind === 'failed' && !warned) {
            warned = true;
            console.warn(`A quote refresh could not reach Finnhub (${symbols.length} asked):`, answer.error);
        }
        return {symbol, askedAt, quote: answer?.kind === 'answer' ? readQuoteAnswer(answer.body) : null};
    }));
};

const older = (askedAt: number) => ({$or: [...unset('fetchedAt').$or, {fetchedAt: {$lt: new Date(askedAt)}}]});

const priceUpdate = (quote: Priced, askedAt: number, now: Date) => ({
    $set: {
        price: quote.price,
        fetchedAt: new Date(askedAt),
        updatedAt: now,
        ...(typeof quote.changePercent === 'number' ? {changePercent: quote.changePercent} : {}),
    },
    $unset: {refusedAt: '', ...(typeof quote.changePercent === 'number' ? {} : {changePercent: ''})},
});

// Writes a refresh in one round trip: a price only over an older one (an answer that arrives
// late never replaces a newer), no price as a refusal that leaves the stored price alone, and
// the claim let go.
const writeOutcomes = async (outcomes: readonly Outcome[], token: string): Promise<void> => {
    const now = new Date();
    const ops: Parameters<typeof PriceQuote.bulkWrite>[0] = outcomes.map(({symbol, askedAt, quote}) => (quote
        ? {updateOne: {filter: {symbol, ...older(askedAt)}, update: priceUpdate(quote, askedAt, now)}}
        : {updateOne: {filter: {symbol}, update: {$set: {refusedAt: new Date(askedAt), updatedAt: now}}}}));
    ops.push({updateMany: {filter: {claimedBy: token}, update: {$unset: {claimedUntil: '', claimedBy: ''}}}});
    await PriceQuote.bulkWrite(ops, {ordered: false});
};

// One refresh of the symbols a read found due: what the minute's budget allows of them, oldest
// first, is claimed, asked and written. The budget comes first, so a symbol it leaves out is
// never claimed — one with a row waits a back-off like any other miss, and one never seen gets
// no row at all (a typed string costs a row only when Finnhub is actually asked about it). Only
// the calls made stay counted. Returns what was asked.
const refresh = async (due: readonly string[], rows: ReadonlyMap<string, QuoteRow>, now: number, session: QuoteSession, ceiling: number): Promise<Outcome[]> => {
    const ordered = refreshOrder(due, rows);
    const countedAt = Date.now();
    const allowed = await takeBudget(ordered.length, ceiling, countedAt);
    const token = randomUUID();
    const won = new Set(allowed > 0 ? await claim(ordered.slice(0, allowed), rows, now, session, token) : []);
    if (won.size < ordered.length) await countQuotes(won.size - ordered.length, countedAt);

    const outcomes = await ask(ordered.filter((symbol) => won.has(symbol)));
    const leftOut: Outcome[] = ordered.slice(allowed).filter((symbol) => rows.has(symbol)).map((symbol) => ({symbol, askedAt: countedAt, quote: null}));
    if (won.size > 0 || leftOut.length > 0) await writeOutcomes([...outcomes, ...leftOut], token);
    return outcomes;
};

// Work that must not hold the response: after() where there is a request to follow, else run
// loose (a script, a test).
const behind = (work: () => Promise<unknown>): void => {
    const run = () => work().catch((error) => console.error('A quote refresh behind a response failed:', error));
    try {
        after(run);
    } catch {
        void run();
    }
};

// One read of the sheet for symbols nobody in this render has asked about yet: the rows, and
// the refresh the plan calls for — before the answer when it must wait, behind it otherwise.
const readSheet = async (symbols: readonly string[], wait: QuoteWait): Promise<Map<string, QuoteRow>> => {
    try {
        await connectToDatabase();
        const now = Date.now();
        const session = sessionAt(now);
        const rows = await readRows(symbols);
        const plan = planRead(symbols, rows, now, session, wait);
        if (plan.due.length === 0) return rows;

        const ceiling = wait === 'current' ? QUOTE_ASKED_CEILING : QUOTE_PAGE_CEILING;
        const run = (): Promise<Outcome[]> => refresh(plan.due, rows, now, session, ceiling);
        if (!plan.wait) {
            behind(run);
            return rows;
        }
        // A refresh that fails — the claim, the counter, the write — costs the new prices,
        // never the ones already read: the page shows those, as it would have a minute ago.
        const outcomes = await run().catch((error): Outcome[] => {
            console.error('A quote refresh failed; the stored prices stand:', error);
            return [];
        });
        const merged = new Map(rows);
        for (const {symbol, askedAt, quote} of outcomes) {
            const row = merged.get(symbol) ?? {symbol};
            merged.set(symbol, quote
                ? {symbol, price: quote.price, ...(typeof quote.changePercent === 'number' ? {changePercent: quote.changePercent} : {}), fetchedAt: askedAt}
                : {...row, refusedAt: askedAt});
        }
        return merged;
    } catch (error) {
        // The sheet is a database read on every page: when it fails the page still renders,
        // on stored closes or at cost, as it does when Finnhub answers nothing.
        console.error('The quote sheet could not be read:', error);
        return new Map();
    }
};

// One answer per symbol per server render: the layout, the page and a page's second price map
// ask in turn, and a refresh that lands between them must not split their prices. Outside a
// render (a job, a route handler) React hands back a new map each call, so nothing is kept.
const renderMemo = cache(() => new Map<string, Promise<QuoteRow | undefined>>());

// The sheet's price for each symbol that has one (a symbol with no usable price is absent).
// `wait`: 'recent' (default, a page) or 'current' (one asked symbol) — lib/prices/quotes.ts.
export const getSheetQuotes = async (symbols: readonly string[], {wait = 'recent'}: {wait?: QuoteWait} = {}): Promise<Map<string, SheetQuote>> => {
    const wanted = normalizeSymbols(symbols);
    const quotes = new Map<string, SheetQuote>();
    // Without a key nothing can be asked and nothing was ever stored: the same empty answer the
    // keyless client gave, with no database read.
    if (wanted.length === 0 || !finnhubConfigured()) return quotes;

    const memo = renderMemo();
    const unasked = wanted.filter((symbol) => !memo.has(symbol));
    if (unasked.length > 0) {
        const read = readSheet(unasked, wait);
        for (const symbol of unasked) memo.set(symbol, read.then((rows) => rows.get(symbol)));
    }
    const now = Date.now();
    const session = sessionAt(now);
    await Promise.all(wanted.map(async (symbol) => {
        const row = await memo.get(symbol);
        // A page shows the stored price under its own time; one asked symbol is answered only
        // with this window's price, or one recent enough to pass for it.
        const quote = wait === 'current' ? askedPrice(row, now, session) : servable(row, now);
        if (quote) quotes.set(symbol, quote);
    }));
    return quotes;
};

export const getSheetQuote = async (symbol: string, options: {wait?: QuoteWait} = {}): Promise<SheetQuote | null> => {
    const [wanted] = normalizeSymbols([symbol]);
    return wanted ? (await getSheetQuotes([wanted], options)).get(wanted) ?? null : null;
};

// The quotes a fill, the snapshot job or a plan ACTS on: asked of Finnhub at this moment, never
// read from the sheet. Finnhub's own body comes back for each symbol ({} on any miss, as the
// callers expect: a fill refuses, a snapshot skips the account, a plan leaves the symbol out).
// The calls are counted against the minute before they are asked — one count for the lot, which
// never refuses them, so a page that comes after takes less — and the prices are written into
// the sheet in one write, so the pages then show what was acted on.
export const getFreshQuotes = async (symbols: readonly string[]): Promise<Map<string, QuoteData>> => {
    const wanted = normalizeSymbols(symbols);
    const bodies = new Map<string, QuoteData>(wanted.map((symbol) => [symbol, {}]));
    if (wanted.length === 0 || !finnhubConfigured()) return bodies;

    // Counted before they are asked. A batch that the last sixty seconds have no room for
    // waits a minute first, once — a page's refresh that came just before it has then left the
    // window, and the batch is not refused for it; one quote (a fill) never waits.
    const countedAt = Date.now();
    const [countAfter, previous] = await Promise.all([countQuotes(wanted.length, countedAt), wanted.length > 1 ? previousMinute(countedAt) : 0]);
    if (wanted.length > 1 && countAfter !== null
        && !fitsTheMinute({want: wanted.length, countAfter, previous, now: countedAt, ceiling: QUOTE_ACTING_CEILING})) {
        await sleep(QUOTE_ACTING_WAIT_MS);
    }
    let filed = false;
    const priced: Outcome[] = [];
    await Promise.all(wanted.map(async (symbol) => {
        const {askedAt, answer} = await pacedQuote(symbol);
        if (answer?.kind === 'refused' && !filed) {
            filed = true;
            await reportLimit('finnhub', {status: answer.status, message: answer.detail});
        }
        if (answer?.kind === 'failed') console.error(`Error fetching quote for ${symbol}:`, answer.error);
        if (answer?.kind !== 'answer') return;
        bodies.set(symbol, answer.body);
        const quote = readQuoteAnswer(answer.body);
        if (quote) priced.push({symbol, askedAt, quote});
    }));
    await writeThrough(priced);
    return bodies;
};

// One fresh quote: what executeOrder fills at.
export const getFreshQuote = async (symbol: string): Promise<QuoteData> => {
    const [wanted] = normalizeSymbols([symbol]);
    return wanted ? (await getFreshQuotes([wanted])).get(wanted) ?? {} : {};
};

// Fresh prices into the sheet: over an older price or for a symbol never seen, never over a
// newer one (the insert that a newer row refuses is a duplicate key, which is the answer). Never
// throws: the caller is filling an order.
const writeThrough = async (priced: readonly Outcome[]): Promise<void> => {
    if (priced.length === 0) return;
    try {
        await connectToDatabase();
        await indexed();
        const now = new Date();
        await PriceQuote.bulkWrite(priced.flatMap(({symbol, askedAt, quote}) => (quote
            ? [{updateOne: {filter: {symbol, ...older(askedAt)}, update: priceUpdate(quote, askedAt, now), upsert: true}}]
            : [])), {ordered: false});
    } catch (error) {
        if (!isDuplicateKey(error)) console.error('Fresh quotes could not be written to the sheet:', error);
    }
};
