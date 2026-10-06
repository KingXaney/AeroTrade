// The year of SPY the Tiingo stand-in serves (start-tiingo-stub.mjs) and qa-landing recomputes:
// deterministic, so both sides agree to the cent, and distinct from the series qa-landing seeds
// into the stored bars (a different start price), so a check can tell which source answered.
// The adjusted close is nine tenths of the close, as after a long-ago distribution: the surface is
// computed on it, the printed price is the close, and the two must not be confused.
export const STUB_PORT = 8787;
export const STUB_TOKEN = 'qa-tiingo-token';
export const SERIES_COUNT = 560;

const lcg = (seed) => () => {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    return seed / 4294967296;
};

// Weekdays ending the day before today (UTC): a row dated today could be dropped by the cutoff
// before Tiingo's publication hour, and the suite must not depend on the clock.
export const seriesDates = (count = SERIES_COUNT) => {
    const out = [];
    const d = new Date();
    d.setUTCHours(0, 0, 0, 0);
    d.setUTCDate(d.getUTCDate() - 1);
    while (out.length < count) {
        const day = d.getUTCDay();
        if (day !== 0 && day !== 6) out.unshift(d.toISOString().slice(0, 10));
        d.setUTCDate(d.getUTCDate() - 1);
    }
    return out;
};

export const tiingoRows = (count = SERIES_COUNT) => {
    const random = lcg(19470101);
    const gaussian = () => Math.sqrt(-2 * Math.log(1 - random())) * Math.cos(2 * Math.PI * random());
    let close = 300;
    return seriesDates(count).map((date, k) => {
        if (k > 0) close *= Math.exp(0.0003 + 0.012 * gaussian());
        const c = Math.round(close * 100) / 100;
        const adjust = (value) => Math.round(value * 0.9 * 10000) / 10000;
        return {
            date: `${date}T00:00:00.000Z`,
            close: c,
            high: Math.round((c + 1.5) * 100) / 100,
            low: Math.round((c - 1.5) * 100) / 100,
            open: Math.round((c - 0.5) * 100) / 100,
            volume: 50_000_000 + k,
            adjClose: adjust(c),
            adjHigh: adjust(c + 1.5),
            adjLow: adjust(c - 1.5),
            adjOpen: adjust(c - 0.5),
            adjVolume: 50_000_000 + k,
            divCash: 0,
            splitFactor: 1,
        };
    });
};
