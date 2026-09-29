// How much an account moves on an ordinary day. Pure; typed on what the /portfolio page
// already has (the %-since-inception series from buildPerfSeries), so it costs no read.
//
// The measure is the standard deviation of the daily log returns — the same quantity, with
// the same population convention, that annualizedVolPct (lib/strategies/metrics.ts) scales
// by √252 — stated in dollars at today's value instead of as a yearly percentage. About two
// days in three move less than it.

import {isTradingDay} from "@/lib/prices/market-hours";

// Two daily changes are the fewest a spread can be measured from.
export const MIN_SWING_POINTS = 3;

export type DailySwing = {
    dollars: number;   // at today's value
    pct: number;       // as a % of the account
    days: number;      // daily changes it was measured over
};

// Measured on closes only: `snapshotThrough` is the last stored daily snapshot (null before
// the first). The series the page draws ends with today's live value, which is a close only
// once today's snapshot exists — on a weekend, or a weekday before the 16:10 snapshot, it
// repeats the last close (or half a day) and would add a near-zero "move". A snapshot the
// weekday cron wrote on a market holiday repeats the day before the same way, so only NYSE
// trading days count.
export const dailySwingDollars = (series: readonly PerfPoint[], totalValue: number, snapshotThrough: string | null): DailySwing | null => {
    if (snapshotThrough === null || !(totalValue > 0)) return null;
    const closes = series.filter((point) => point.date <= snapshotThrough && isTradingDay(point.date));
    if (closes.length < MIN_SWING_POINTS) return null;
    // accountPct is a return on one base, so consecutive growth factors divide to the day's ratio.
    const returns: number[] = [];
    for (let i = 1; i < closes.length; i += 1) {
        const before = 1 + closes[i - 1].accountPct / 100;
        const after = 1 + closes[i].accountPct / 100;
        if (before > 0 && after > 0) returns.push(Math.log(after / before));
    }
    if (returns.length < MIN_SWING_POINTS - 1) return null;
    const mean = returns.reduce((sum, r) => sum + r, 0) / returns.length;
    const variance = returns.reduce((sum, r) => sum + (r - mean) ** 2, 0) / returns.length;
    const sd = Math.sqrt(variance);
    return {dollars: sd * totalValue, pct: sd * 100, days: returns.length};
};
