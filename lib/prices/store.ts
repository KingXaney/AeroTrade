// DB side of price history: Stooq backfill/top-up into PriceBar + bar reads for
// signal computation. Plain server module (used by the weekly Inngest job).

import {connectToDatabase} from "@/database/mongoose";
import PriceBar from "@/database/models/price-bar.model";
import {decideFetchWindow, fetchStooqDaily} from "@/lib/prices/stooq";
import {type Bar} from "@/lib/prices/signals";
import {MAX_TRACKED_SYMBOLS, STOOQ_DELAY_MS} from "@/lib/prices/config";
import {delay, getEasternDateString} from "@/lib/utils";

// Sequential + politely spaced; per-symbol failure isolation — a dead symbol
// degrades its own signals to null, never the run.
export const ensureBars = async (symbols: string[]): Promise<{updated: number; failed: string[]}> => {
    await connectToDatabase();
    const unique = Array.from(new Set(symbols.map((s) => s.toUpperCase()))).filter(Boolean).slice(0, MAX_TRACKED_SYMBOLS);
    const today = getEasternDateString();
    let updated = 0;
    const failed: string[] = [];

    for (const symbol of unique) {
        try {
            const latest = await PriceBar.findOne({symbol}).sort({date: -1}).lean();
            const window = decideFetchWindow(latest?.date ?? null, today);
            const bars = await fetchStooqDaily(symbol, window.fromDate, window.toDate);
            if (bars.length === 0) {
                failed.push(symbol);
                continue;
            }
            await PriceBar.bulkWrite(bars.map((bar) => ({
                updateOne: {
                    filter: {symbol, date: bar.date},
                    update: {$set: {close: bar.close, ...(bar.volume !== undefined ? {volume: bar.volume} : {})}},
                    upsert: true,
                },
            })), {ordered: false});
            updated++;
        } catch (error) {
            console.error(`Price bars failed for ${symbol}:`, error);
            failed.push(symbol);
        }
        await delay(STOOQ_DELAY_MS);
    }
    return {updated, failed};
};

// Ascending bars per symbol, ready for computeSignals.
export const getBarsForSymbols = async (symbols: string[]): Promise<Map<string, Bar[]>> => {
    await connectToDatabase();
    const unique = Array.from(new Set(symbols.map((s) => s.toUpperCase()))).filter(Boolean);
    const map = new Map<string, Bar[]>();
    if (unique.length === 0) return map;

    const docs = await PriceBar.find({symbol: {$in: unique}}).sort({date: 1}).lean();
    for (const doc of docs) {
        const list = map.get(doc.symbol) ?? [];
        list.push({date: doc.date, close: doc.close});
        map.set(doc.symbol, list);
    }
    return map;
};
