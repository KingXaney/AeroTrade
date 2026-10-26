// A stand-in for Alpaca's trading API, for the harness only (run.sh starts it on :8788 and hands
// the app ALPACA_API_KEY_ID=qa-alpaca-key, ALPACA_API_SECRET_KEY=qa-alpaca-secret and
// ALPACA_BASE_URL pointing here; paper mode reads the override, live never does). It keeps one
// paper account in memory: the keys checked on every request, a market order filled at once at the
// price table, a reused client_order_id refused with 422 as Alpaca refuses it, a short sale or an
// order past the cash refused 403. BRK.B is not fractionable, ADDYY not tradable, MYSTERY unknown.
// qa-broker drives it: GET /__state?open=1|0 opens or closes the market, /__reset empties it,
// /__stats reads the orders and positions.
import http from 'node:http';

export const ALPACA_STUB_PORT = 8788;
const KEY = 'qa-alpaca-key';
const SECRET = 'qa-alpaca-secret';
const PRICES = {NVDA: 200, XLK: 100, 'BRK.B': 500, ADDYY: 120, SPY: 600, AAPL: 150, MSFT: 300};
const NOT_FRACTIONABLE = new Set(['BRK.B']);
const NOT_TRADABLE = new Set(['ADDYY']);
const UNKNOWN = new Set(['MYSTERY']);
const priceOf = (symbol) => PRICES[symbol] ?? 50;

let state;
const reset = () => {
    state = {open: false, cash: 100_000, positions: new Map(), orders: [], requests: 0};
};
reset();

const json = (res, status, body) => {
    res.writeHead(status, {'Content-Type': 'application/json'});
    res.end(JSON.stringify(body));
};

const positionsView = () => [...state.positions.entries()].filter(([, p]) => p.qty > 1e-9).map(([symbol, p]) => ({
    symbol, qty: String(p.qty), market_value: (p.qty * priceOf(symbol)).toFixed(2), current_price: String(priceOf(symbol)), avg_entry_price: p.avg.toFixed(2),
}));
const equity = () => state.cash + [...state.positions.entries()].reduce((sum, [symbol, p]) => sum + p.qty * priceOf(symbol), 0);

const readBody = (req) => new Promise((resolve) => {
    let raw = '';
    req.on('data', (chunk) => { raw += chunk; });
    req.on('end', () => {
        try { resolve(JSON.parse(raw || '{}')); } catch { resolve(null); }
    });
});

const server = http.createServer(async (req, res) => {
    const url = new URL(req.url ?? '/', `http://localhost:${ALPACA_STUB_PORT}`);
    if (url.pathname === '/__state') {
        const open = url.searchParams.get('open');
        if (open === '1' || open === '0') state.open = open === '1';
        return json(res, 200, {open: state.open});
    }
    if (url.pathname === '/__reset') {
        reset();
        return json(res, 200, {ok: true});
    }
    if (url.pathname === '/__stats') return json(res, 200, {requests: state.requests, orders: state.orders, positions: positionsView(), cash: state.cash});

    state.requests += 1;
    if (req.headers['apca-api-key-id'] !== KEY || req.headers['apca-api-secret-key'] !== SECRET) return json(res, 401, {code: 40110000, message: 'request is not authorized'});

    if (req.method === 'GET' && url.pathname === '/v2/account') {
        return json(res, 200, {account_number: 'PA3QAQA9F2A', status: 'ACTIVE', currency: 'USD', equity: equity().toFixed(2), cash: state.cash.toFixed(2), buying_power: (state.cash * 2).toFixed(2), trading_blocked: false});
    }
    if (req.method === 'GET' && url.pathname === '/v2/positions') return json(res, 200, positionsView());
    if (req.method === 'GET' && url.pathname === '/v2/clock') {
        return json(res, 200, {timestamp: new Date().toISOString(), is_open: state.open, next_open: '2026-10-27T13:30:00Z', next_close: '2026-10-26T20:00:00Z'});
    }
    const asset = /^\/v2\/assets\/(.+)$/.exec(url.pathname);
    if (req.method === 'GET' && asset) {
        const symbol = decodeURIComponent(asset[1]);
        if (UNKNOWN.has(symbol)) return json(res, 404, {code: 40410000, message: 'asset not found'});
        return json(res, 200, {symbol, status: 'active', tradable: !NOT_TRADABLE.has(symbol), fractionable: !NOT_FRACTIONABLE.has(symbol)});
    }
    if (req.method === 'GET' && url.pathname === '/v2/orders') {
        const limit = Number(url.searchParams.get('limit') ?? 50);
        return json(res, 200, [...state.orders].reverse().slice(0, limit));
    }
    if (req.method === 'POST' && url.pathname === '/v2/orders') {
        const body = await readBody(req);
        if (!body || !body.symbol || !['buy', 'sell'].includes(body.side) || body.type !== 'market' || body.time_in_force !== 'day') return json(res, 422, {code: 42210000, message: 'invalid order'});
        if (state.orders.some((o) => o.client_order_id === body.client_order_id)) return json(res, 422, {code: 42210000, message: 'client_order_id must be unique'});
        const price = priceOf(body.symbol);
        const qty = body.notional !== undefined ? Number(body.notional) / price : Number(body.qty);
        if (!(qty > 0)) return json(res, 422, {code: 42210000, message: 'qty must be > 0'});
        if (body.notional !== undefined && NOT_FRACTIONABLE.has(body.symbol)) return json(res, 422, {code: 42210000, message: 'fractional orders are not supported for this asset'});
        const held = state.positions.get(body.symbol) ?? {qty: 0, avg: 0};
        if (body.side === 'sell' && qty > held.qty + 1e-9) return json(res, 403, {code: 40310000, message: 'insufficient qty available for order'});
        if (body.side === 'buy' && qty * price > state.cash + 1e-6) return json(res, 403, {code: 40310000, message: 'insufficient buying power'});
        if (body.side === 'buy') {
            state.positions.set(body.symbol, {qty: held.qty + qty, avg: (held.qty * held.avg + qty * price) / (held.qty + qty)});
            state.cash -= qty * price;
        } else {
            state.positions.set(body.symbol, {qty: held.qty - qty, avg: held.avg});
            state.cash += qty * price;
        }
        const order = {
            id: `stub-${state.orders.length + 1}`, client_order_id: body.client_order_id, symbol: body.symbol, side: body.side, type: 'market', time_in_force: 'day',
            status: 'filled', qty: body.qty ?? null, notional: body.notional ?? null, filled_qty: String(qty), filled_avg_price: String(price), submitted_at: new Date().toISOString(),
        };
        state.orders.push(order);
        return json(res, 200, order);
    }
    return json(res, 404, {code: 40410000, message: 'not found'});
});

server.listen(ALPACA_STUB_PORT, () => console.log(`READY http://localhost:${ALPACA_STUB_PORT}`));
server.on('error', (error) => {
    console.error('FAILED', error);
    process.exit(1);
});
