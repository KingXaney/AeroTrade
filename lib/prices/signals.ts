// Momentum / volatility / trend signals from daily closes. Pure math — the
// caller owns data loading and ordering (barsAsc must be oldest-first).

export type Bar = {date: string; close: number};

export type Signals = {
    r63: number | null;
    r126: number | null;
    r252: number | null;
    vol63: number | null;
    ma200dist: number | null;
};

const R63_WINDOW = 63;
const R126_WINDOW = 126;
const R252_WINDOW = 252;
const VOL_WINDOW = 63;
const MA_WINDOW = 200;
const TRADING_DAYS_PER_YEAR = 252;

const trailingReturn = (closes: number[], days: number): number | null => {
    // A trailing return over N days needs N+1 closes (both endpoints).
    if (closes.length < days + 1) {
        return null;
    }
    return closes[closes.length - 1] / closes[closes.length - 1 - days] - 1;
};

const annualizedVol = (closes: number[]): number | null => {
    // VOL_WINDOW log returns need VOL_WINDOW+1 closes.
    if (closes.length < VOL_WINDOW + 1) {
        return null;
    }
    const recent = closes.slice(-(VOL_WINDOW + 1));
    const logReturns: number[] = [];
    for (let i = 1; i < recent.length; i += 1) {
        logReturns.push(Math.log(recent[i] / recent[i - 1]));
    }
    const mean = logReturns.reduce((sum, r) => sum + r, 0) / logReturns.length;
    // Population stdev — the window is the full universe we care about, and it
    // keeps a constant series at exactly zero.
    const variance = logReturns.reduce((sum, r) => sum + (r - mean) ** 2, 0) / logReturns.length;
    return Math.sqrt(variance) * Math.sqrt(TRADING_DAYS_PER_YEAR);
};

const maDistance = (closes: number[]): number | null => {
    if (closes.length < MA_WINDOW) {
        return null;
    }
    const window = closes.slice(-MA_WINDOW);
    const sma = window.reduce((sum, c) => sum + c, 0) / MA_WINDOW;
    return closes[closes.length - 1] / sma - 1;
};

export const computeSignals = (barsAsc: Bar[]): Signals => {
    const closes = barsAsc.map((bar) => bar.close);
    return {
        r63: trailingReturn(closes, R63_WINDOW),
        r126: trailingReturn(closes, R126_WINDOW),
        r252: trailingReturn(closes, R252_WINDOW),
        vol63: annualizedVol(closes),
        ma200dist: maDistance(closes),
    };
};
