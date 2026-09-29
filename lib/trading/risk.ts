// How much an account moves on an ordinary day. Pure; typed on what the /portfolio page
// already has (the %-since-inception series from buildPerfSeries), so it costs no read.
//
// The measure is the standard deviation of the daily log returns — the same quantity, with
// the same population convention, that annualizedVolPct (lib/strategies/metrics.ts) scales
// by √252 — stated in dollars at today's value instead of as a yearly percentage. About two
// days in three move less than it.

// Two daily changes are the fewest a spread can be measured from.
export const MIN_SWING_POINTS = 3;

export type DailySwing = {
    dollars: number;   // at today's value
    pct: number;       // as a % of the account
    days: number;      // daily changes it was measured over
};

export const dailySwingDollars = (series: readonly PerfPoint[], totalValue: number): DailySwing | null => {
    if (series.length < MIN_SWING_POINTS || !(totalValue > 0)) return null;
    // accountPct is a return on one base, so consecutive growth factors divide to the day's ratio.
    const returns: number[] = [];
    for (let i = 1; i < series.length; i += 1) {
        const before = 1 + series[i - 1].accountPct / 100;
        const after = 1 + series[i].accountPct / 100;
        if (before > 0 && after > 0) returns.push(Math.log(after / before));
    }
    if (returns.length < MIN_SWING_POINTS - 1) return null;
    const mean = returns.reduce((sum, r) => sum + r, 0) / returns.length;
    const variance = returns.reduce((sum, r) => sum + (r - mean) ** 2, 0) / returns.length;
    const sd = Math.sqrt(variance);
    return {dollars: sd * totalValue, pct: sd * 100, days: returns.length};
};
