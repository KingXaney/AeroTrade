// Indicator maths for the strategy rules. Pure; inputs ascending (oldest first);
// every function returns null when its window is not covered and never lets a NaN
// escape. Windows are fixed so a value can never depend on how much older history
// happens to be available — the same bars give the same number live and simulated.

import type {Bar} from "@/lib/prices/signals";
import {RSI_LOOKBACK} from "@/lib/strategies/config";

const TRADING_DAYS_PER_YEAR = 252;

const finite = (value: number | undefined | null): value is number =>
    typeof value === 'number' && Number.isFinite(value);

export const closesOf = (bars: readonly Bar[], field: 'close' | 'adjClose' = 'close'): number[] =>
    bars.map((bar) => (field === 'adjClose' && finite(bar.adjClose) ? bar.adjClose : bar.close));

// Simple moving average of the last n values (includes the current bar).
export const sma = (values: readonly number[], n: number): number | null => {
    if (n < 1 || values.length < n) return null;
    let sum = 0;
    for (let i = values.length - n; i < values.length; i += 1) sum += values[i];
    return sum / n;
};

// Wilder RSI over exactly the last `lookback` changes: seeded with the simple mean of
// the first `period` gains/losses, then smoothed. Both-zero (flat) reads 50, no losses 100.
export const wilderRsi = (values: readonly number[], period: number, lookback = RSI_LOOKBACK): number | null => {
    if (period < 1 || lookback < period || values.length < lookback + 1) return null;
    const window = values.slice(-(lookback + 1));
    let avgGain = 0;
    let avgLoss = 0;
    for (let i = 1; i <= period; i += 1) {
        const diff = window[i] - window[i - 1];
        if (diff > 0) avgGain += diff;
        else avgLoss -= diff;
    }
    avgGain /= period;
    avgLoss /= period;
    for (let i = period + 1; i < window.length; i += 1) {
        const diff = window[i] - window[i - 1];
        avgGain = (avgGain * (period - 1) + Math.max(diff, 0)) / period;
        avgLoss = (avgLoss * (period - 1) + Math.max(-diff, 0)) / period;
    }
    if (avgLoss === 0) return avgGain === 0 ? 50 : 100;
    return 100 - 100 / (1 + avgGain / avgLoss);
};

// Return from `from` bars ago to the latest bar; needs from + 1 values.
export const trailingReturn = (values: readonly number[], from: number): number | null =>
    laggedReturn(values, from, 0);

// Return from `from` bars ago to `to` bars ago (12-1 momentum = laggedReturn(v, 252, 21)).
export const laggedReturn = (values: readonly number[], from: number, to: number): number | null => {
    if (from <= to || to < 0 || values.length < from + 1) return null;
    const start = values[values.length - 1 - from];
    const end = values[values.length - 1 - to];
    if (!(start > 0) || !finite(end)) return null;
    return end / start - 1;
};

// Annualised realised volatility: population stdev of the last n log returns × √252
// (the navigator's vol63 convention). Needs n + 1 values.
export const realizedVol = (values: readonly number[], n: number): number | null => {
    if (n < 2 || values.length < n + 1) return null;
    const recent = values.slice(-(n + 1));
    const logReturns: number[] = [];
    for (let i = 1; i < recent.length; i += 1) {
        if (!(recent[i] > 0) || !(recent[i - 1] > 0)) return null;
        logReturns.push(Math.log(recent[i] / recent[i - 1]));
    }
    const mean = logReturns.reduce((sum, r) => sum + r, 0) / logReturns.length;
    const variance = logReturns.reduce((sum, r) => sum + (r - mean) ** 2, 0) / logReturns.length;
    return Math.sqrt(variance) * Math.sqrt(TRADING_DAYS_PER_YEAR);
};

// Highest high / lowest low over the n bars BEFORE the current one (a breakout
// compares today's close with the channel that existed before today). Null if any
// bar in the window lacks the field.
const rollingExtreme = (bars: readonly Bar[], n: number, field: 'high' | 'low'): number | null => {
    if (n < 1 || bars.length < n + 1) return null;
    let extreme: number | null = null;
    for (let i = bars.length - 1 - n; i < bars.length - 1; i += 1) {
        const value = bars[i][field];
        if (!finite(value)) return null;
        extreme = extreme === null
            ? value
            : (field === 'high' ? Math.max(extreme, value) : Math.min(extreme, value));
    }
    return extreme;
};

export const rollingHigh = (bars: readonly Bar[], n: number): number | null => rollingExtreme(bars, n, 'high');
export const rollingLow = (bars: readonly Bar[], n: number): number | null => rollingExtreme(bars, n, 'low');

// Stable rank by a numeric key; the ONLY tie-break anywhere is symbol A→Z.
export const rank = <T extends {symbol: string}>(
    items: readonly T[],
    key: (item: T) => number,
    direction: 'asc' | 'desc',
): T[] =>
    [...items].sort((a, b) => {
        const diff = direction === 'asc' ? key(a) - key(b) : key(b) - key(a);
        return diff !== 0 ? diff : a.symbol.localeCompare(b.symbol);
    });
