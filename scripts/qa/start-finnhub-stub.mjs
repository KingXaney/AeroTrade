// A stand-in for Finnhub, for the harness only (run.sh starts it on :8791 and hands the app
// FINNHUB_API_KEY=qa-finnhub-key and FINNHUB_API_URL pointing here), so the quote sheet
// (lib/prices/quote-store.ts) runs end to end without a key or the network.
//
// It starts in mode "empty": every path answers 200 with its empty shape — a quote is {}, which
// is what the app read when it had no key — so every suite written for "no quote" holds.
// qa-steady-prices drives it through GET control endpoints:
//   /__mode?set=empty|prices|refuse   empty: as above. prices: /quote answers from the table.
//                                     refuse: /quote answers 429, as the free plan does past its minute.
//   /__prices?AAPL=150&MSFT=300&step=0.5   replaces the table; with a step, each call for a symbol
//                                     answers `step` higher than the one before, so a price that
//                                     moved on screen proves a second call.
//   /__stats                          calls per path and per quoted symbol, the last token seen.
//   /__reset                          mode empty, no table, counts at zero.
import http from 'node:http';

const PORT = Number(process.env.QA_FINNHUB_PORT ?? 8791);

const fresh = () => ({requests: 0, paths: {}, quotes: {}, refused: 0, lastToken: null});
let mode = 'empty';
let table = new Map();
let step = 0;
let stats = fresh();

const json = (res, status, body) => {
    res.writeHead(status, {'Content-Type': 'application/json'});
    res.end(JSON.stringify(body));
};

// What each Finnhub path answers when it has nothing to say.
const EMPTY = {
    '/quote': {},
    '/stock/profile2': {},
    '/stock/metric': {},
    '/search': {count: 0, result: []},
    '/company-news': [],
    '/news': [],
    '/calendar/earnings': {earningsCalendar: []},
};

// Finnhub's answer for a symbol it does not know.
const UNKNOWN = {c: 0, d: null, dp: null, h: 0, l: 0, o: 0, pc: 0, t: 0};

const quote = (symbol) => {
    const base = table.get(symbol);
    if (base === undefined) return UNKNOWN;
    const asked = (stats.quotes[symbol] ?? 1) - 1;    // calls before this one
    const c = Math.round((base + step * asked) * 100) / 100;
    return {c, d: 0.5, dp: 0.5, h: c, l: c, o: c, pc: c, t: Math.floor(Date.now() / 1000)};
};

const server = http.createServer((req, res) => {
    const url = new URL(req.url ?? '/', `http://localhost:${PORT}`);
    if (url.pathname === '/__mode') {
        const set = url.searchParams.get('set');
        if (set === 'empty' || set === 'prices' || set === 'refuse') mode = set;
        return json(res, 200, {mode});
    }
    if (url.pathname === '/__prices') {
        table = new Map();
        step = 0;
        for (const [key, value] of url.searchParams) {
            const n = Number(value);
            if (!Number.isFinite(n)) continue;
            if (key === 'step') step = n;
            else table.set(key.toUpperCase(), n);
        }
        return json(res, 200, {mode, step, symbols: [...table.keys()]});
    }
    if (url.pathname === '/__stats') return json(res, 200, {...stats, mode, step, symbols: [...table.keys()]});
    if (url.pathname === '/__reset') {
        mode = 'empty';
        table = new Map();
        step = 0;
        stats = fresh();
        return json(res, 200, {mode});
    }

    stats.requests += 1;
    stats.paths[url.pathname] = (stats.paths[url.pathname] ?? 0) + 1;
    stats.lastToken = url.searchParams.get('token');
    if (url.pathname === '/quote') {
        const symbol = (url.searchParams.get('symbol') ?? '').toUpperCase();
        stats.quotes[symbol] = (stats.quotes[symbol] ?? 0) + 1;
        if (mode === 'refuse') {
            stats.refused += 1;
            return json(res, 429, {error: 'API limit reached. Please try again later. Remaining Limit: 0'});
        }
        return json(res, 200, mode === 'prices' ? quote(symbol) : EMPTY['/quote']);
    }
    return json(res, 200, EMPTY[url.pathname] ?? {});
});

server.listen(PORT, () => console.log(`READY http://localhost:${PORT}`));
server.on('error', (error) => {
    console.error('FAILED', error);
    process.exit(1);
});
