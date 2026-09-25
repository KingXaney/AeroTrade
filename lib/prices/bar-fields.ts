// The one place a bar's optional fields are named, in both directions. Pure so a round trip
// is unit-tested: a field missing from either list is silently dropped — on write, or on the
// way back into the simulator — which is exactly how a new field goes missing.

import type {PriceBarSource} from "@/database/models/price-bar.model";
import type {Bar} from "@/lib/prices/signals";

// Only the fields the provider actually supplied are written, so a Stooq
// fallback never blanks the OHLC a previous Yahoo pass stored.
export const toSetFields = (bar: Bar, source: PriceBarSource): Record<string, number | string> => {
    const fields: Record<string, number | string> = {close: bar.close, source};
    if (bar.open !== undefined) fields.open = bar.open;
    if (bar.high !== undefined) fields.high = bar.high;
    if (bar.low !== undefined) fields.low = bar.low;
    if (bar.volume !== undefined) fields.volume = bar.volume;
    if (bar.adjClose !== undefined) fields.adjClose = bar.adjClose;
    // Absent means "this payload could not tell" (its first bar, or a missing adjclose), so
    // it must not blank a value an earlier payload inferred.
    if (bar.dividend !== undefined) fields.dividend = bar.dividend;
    return fields;
};

export type LeanPriceBar = {
    symbol: string;
    date: string;
    close: number;
    open?: number | null;
    high?: number | null;
    low?: number | null;
    volume?: number | null;
    adjClose?: number | null;
    dividend?: number | null;
};

export const BAR_PROJECTION = {_id: 0, symbol: 1, date: 1, close: 1, open: 1, high: 1, low: 1, volume: 1, adjClose: 1, dividend: 1} as const;

export const toBar = (doc: LeanPriceBar): Bar => {
    const bar: Bar = {date: doc.date, close: doc.close};
    if (typeof doc.open === "number") bar.open = doc.open;
    if (typeof doc.high === "number") bar.high = doc.high;
    if (typeof doc.low === "number") bar.low = doc.low;
    if (typeof doc.volume === "number") bar.volume = doc.volume;
    if (typeof doc.adjClose === "number") bar.adjClose = doc.adjClose;
    if (typeof doc.dividend === "number") bar.dividend = doc.dividend;
    return bar;
};
