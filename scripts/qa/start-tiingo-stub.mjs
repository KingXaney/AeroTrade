// A stand-in for Tiingo's end-of-day endpoint, for the harness only (run.sh starts it on :8787 and
// hands the app TIINGO_TOKEN=qa-tiingo-token and TIINGO_API_URL pointing here). It starts "down":
// a request for prices has its connection cut, as an outage would, so the app's fetch throws and
// nothing is cached. qa-landing switches it on (GET /__mode?set=up), after which it serves the
// series in tiingo-series.mjs — only with the token in the Authorization header, only for SPY —
// and keeps a count the suite reads at /__stats.
import http from 'node:http';
import {STUB_PORT, STUB_TOKEN, tiingoRows} from './tiingo-series.mjs';

let mode = 'down';
const stats = {requests: 0, served: 0, lastAuthorization: null, lastUrl: null};
const rows = tiingoRows();

const json = (res, status, body) => {
    res.writeHead(status, {'Content-Type': 'application/json'});
    res.end(JSON.stringify(body));
};

const server = http.createServer((req, res) => {
    const url = new URL(req.url ?? '/', `http://localhost:${STUB_PORT}`);
    if (url.pathname === '/__mode') {
        const set = url.searchParams.get('set');
        if (set === 'up' || set === 'down') mode = set;
        return json(res, 200, {mode});
    }
    if (url.pathname === '/__stats') return json(res, 200, {...stats, mode});

    stats.requests += 1;
    stats.lastAuthorization = req.headers.authorization ?? null;
    stats.lastUrl = url.pathname + url.search;
    if (mode === 'down') {
        req.socket.destroy();
        return;
    }
    if (req.headers.authorization !== `Token ${STUB_TOKEN}`) return json(res, 401, {detail: 'Invalid token.'});
    const match = /^\/tiingo\/daily\/([^/]+)\/prices$/.exec(url.pathname);
    if (!match) return json(res, 404, {detail: 'Not found.'});
    if (match[1] !== 'spy') return json(res, 404, {detail: 'Not found.'});
    const from = url.searchParams.get('startDate') ?? '0000-00-00';
    const to = url.searchParams.get('endDate') ?? '9999-99-99';
    stats.served += 1;
    return json(res, 200, rows.filter((row) => row.date.slice(0, 10) >= from && row.date.slice(0, 10) <= to));
});

server.listen(STUB_PORT, () => console.log(`READY http://localhost:${STUB_PORT}`));
server.on('error', (error) => {
    console.error('FAILED', error);
    process.exit(1);
});
