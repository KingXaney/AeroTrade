// The Navigator's signal check, read (research log R1, docs/research/log.md): the recorded weeks
// of the last year (database/models/navigator-signal-week), the bars of every name any of them
// could buy from the first of those weeks, measured by the pure lib/navigator/signal-check.
// Owner-only: read by /brain?view=navigator alone, once per request.

import {cache} from "react";
import {connectToDatabase} from "@/database/mongoose";
import NavigatorSignalWeek from "@/database/models/navigator-signal-week.model";
import {getBarsForSymbols} from "@/lib/prices/store";
import {measureNavigatorSignals, navigatorSignalTable, type SignalWeek} from "@/lib/navigator/signal-check";
import type {IcTable} from "@/lib/research/ic";

// A year of weeks: enough for the 13-week column and a read that stays small on a page.
export const SIGNAL_CHECK_WEEKS = 52;

export type NavigatorSignalView = {since: string | null; weeks: number; table: IcTable | null};

export const getNavigatorSignalCheck = cache(async (): Promise<NavigatorSignalView> => {
    try {
        await connectToDatabase();
        const docs = (await NavigatorSignalWeek.find({}, {_id: 0, weekKey: 1, date: 1, symbols: 1})
            .sort({date: -1}).limit(SIGNAL_CHECK_WEEKS).lean<SignalWeek[]>()).reverse();
        if (docs.length === 0) return {since: null, weeks: 0, table: null};
        const symbols = [...new Set(docs.flatMap((doc) => doc.symbols.filter((s) => s.eligible).map((s) => s.symbol)))];
        const bars = docs.length > 1 ? await getBarsForSymbols(symbols, {from: docs[0].date}) : new Map();
        return {since: docs[0].date, weeks: docs.length, table: navigatorSignalTable(measureNavigatorSignals({weeks: docs, bars}))};
    } catch (error) {
        console.error('Error reading the Navigator signal check:', error);
        return {since: null, weeks: 0, table: null};
    }
});
