// A stand-in for the trading agent world's service (services/agent-world), for the harness only:
// run.sh starts it on :8789 and hands the app AGENT_WORLD_SERVICE_URL pointing here with the shared
// secret qa-agent-world-secret. It answers GET /health as the service does, checks POST /runs'
// signature exactly as the service does, and then plays the service's own exported event stream
// (scripts/qa/fixtures/agent-world-events.json, written by services/agent-world/scripts/
// export_fixture.py) back to the run's callback URL: renumbered, re-timed to now and compressed to a
// few seconds, mapped onto the symbols asked for, signed and posted in batches of ten. When the run
// names a Paperclip issue and PAPERCLIP_URL is set, it then does the service's part on the company
// (lib/agent-world/company.ts does the app's) as services/agent-world/agent_world/paperclip.py does
// it: asks Paperclip for a run of the Head trader on the issue (no checkout), reports each role's
// cost with that role's key and no run, comments the decisions and marks the issue done under that
// run. POST /paperclip/heartbeat answers Paperclip's wakes as the service does: a routine run
// (context.source 'routine.dispatch') is relayed to the app's /api/agent-world/sessions, signed,
// and its issue closed under the wake's own run; every other wake is answered and ignored.
//
// qa-agent-world drives it: GET /__state?fail=1|0 makes /runs answer 503, ?slow=1|0 stretches a run
// to about a minute; /__state reads what was asked and delivered; /__reset empties it.
import http from 'node:http';
import {createHmac, timingSafeEqual} from 'node:crypto';
import {readFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';

export const AGENT_WORLD_STUB_PORT = Number(process.env.AGENT_WORLD_STUB_PORT ?? 8789);
const SECRET = process.env.AGENT_WORLD_STUB_SECRET ?? 'qa-agent-world-secret';
const PAPERCLIP_URL = (process.env.PAPERCLIP_URL ?? '').replace(/\/+$/, '');
const COMPANY_ID = process.env.PAPERCLIP_COMPANY_ID ?? '';
const HEAD_TRADER_KEY = process.env.PAPERCLIP_HEAD_TRADER_KEY ?? 'qa-head-trader-key';
const HEARTBEAT_SECRET = process.env.AGENT_WORLD_STUB_HEARTBEAT_SECRET ?? 'qa-agent-world-heartbeat';
const AEROTRADE_URL = (process.env.AEROTRADE_URL ?? 'http://localhost:3000').replace(/\/+$/, '');
// The reason the service's own runs carry: the execution_ prefix keeps Paperclip from checking the
// backlog issue out to that short run.
const RUN_REASON = 'execution_agent_world_session';
const FIXTURE = JSON.parse(readFileSync(fileURLToPath(new URL('./fixtures/agent-world-events.json', import.meta.url)), 'utf8'));
const BATCH = 10;

let state;
const reset = () => {
    state = {fail: false, slow: false, runs: [], deliveries: [], authFailures: 0, busy: null, paperclip: [], wakes: []};
};
reset();

const sign = (ts, body) => createHmac('sha256', SECRET).update(`${ts}.${body}`).digest('hex');
const same = (a, b) => {
    const x = Buffer.from(a ?? '', 'utf8');
    const y = Buffer.from(b ?? '', 'utf8');
    return x.length === y.length && timingSafeEqual(x, y);
};
const json = (res, status, body) => {
    res.writeHead(status, {'Content-Type': 'application/json'});
    res.end(JSON.stringify(body));
};
const readText = (req) => new Promise((resolve) => {
    let raw = '';
    req.on('data', (chunk) => { raw += chunk; });
    req.on('end', () => resolve(raw));
});
const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// The fixture's events for this run: only the symbols asked for (the fixture's first symbol stands
// for the first asked, and so on), renumbered from 1, the session's own id and settings written in,
// and the fixture's twenty minutes squeezed into `spanMs` from now.
const eventsFor = (run, spanMs) => {
    const map = new Map(FIXTURE.symbols.map((symbol, index) => [symbol, run.symbols[index]]).filter(([, to]) => to));
    const kept = FIXTURE.events.filter((event) => event.symbol === undefined || event.symbol === null || map.has(event.symbol));
    const times = kept.map((event) => Date.parse(event.at));
    const first = Math.min(...times);
    const span = Math.max(1, Math.max(...times) - first);
    const now = Date.now();
    return kept.map((event, index) => {
        const out = {...event, seq: index + 1, sessionId: run.sessionId, at: new Date(now + ((Date.parse(event.at) - first) / span) * spanMs).toISOString()};
        if (out.symbol) out.symbol = map.get(out.symbol);
        if (out.type === 'session.started') Object.assign(out, {symbols: run.symbols.slice(0, map.size), tradeDate: run.tradeDate, approval: run.approval, dryRun: run.dryRun});
        if (out.type === 'session.completed') out.runs = out.runs.filter((r) => map.has(r.symbol)).map((r) => ({...r, symbol: map.get(r.symbol)}));
        if (out.type === 'run.started') out.total = map.size;
        return out;
    });
};

const post = async (url, events, sessionId) => {
    const body = JSON.stringify({sessionId, events});
    const ts = Math.floor(Date.now() / 1000);
    for (let attempt = 0; attempt < 5; attempt++) {
        try {
            const response = await fetch(url, {method: 'POST', headers: {'Content-Type': 'application/json', 'X-Agent-World-Timestamp': String(ts), 'X-Agent-World-Signature': sign(ts, body)}, body});
            state.deliveries.push({sessionId, status: response.status, events: events.length, first: events[0]?.seq});
            if (response.status < 500) return response.status;
        } catch (error) {
            state.deliveries.push({sessionId, status: 0, error: String(error)});
        }
        await wait(500 * 2 ** attempt);
    }
    return 0;
};

// The service's own part on the Paperclip company, through the Paperclip stub's real-shaped API.
const paperclip = async (path, init = {}, key = HEAD_TRADER_KEY) => {
    try {
        const response = await fetch(`${PAPERCLIP_URL}${path}`, {...init, headers: {'Content-Type': 'application/json', Authorization: `Bearer ${key}`, ...(init.headers ?? {})}});
        state.paperclip.push({path, status: response.status});
        return response.ok ? response.json().catch(() => null) : null;
    } catch {
        state.paperclip.push({path, status: 0});
        return null;
    }
};

const companyPart = async (run, events) => {
    const issueId = run.paperclip?.issueId;
    const ids = run.paperclip?.agentIds ?? {};
    if (!PAPERCLIP_URL || !COMPANY_ID) return;
    // A run of the Head trader on the issue, which every comment and update names (Paperclip refuses
    // an agent's write without one); the run's own wake comes back to /paperclip/heartbeat, ignored.
    let runId = null;
    if (issueId && !run.dryRun && ids['head-trader']) {
        const invoked = await paperclip(`/api/agents/${ids['head-trader']}/heartbeat/invoke`, {method: 'POST', body: JSON.stringify({reason: RUN_REASON, payload: {issueId}})});
        runId = typeof invoked?.id === 'string' ? invoked.id : run.paperclip?.runId ?? null;
    }
    const costs = new Map();
    for (const event of events) {
        if (event.type !== 'cost.tick' || !ids[event.role]) continue;
        const key = `${event.symbol}:${event.role}`;
        const held = costs.get(key) ?? {role: event.role, symbol: event.symbol, model: event.model, inputTokens: 0, outputTokens: 0, costCents: 0};
        held.inputTokens += event.inputTokens;
        held.outputTokens += event.outputTokens;
        held.costCents += event.costCents;
        costs.set(key, held);
    }
    for (const cost of costs.values()) {
        await paperclip(`/api/companies/${COMPANY_ID}/cost-events`, {method: 'POST', body: JSON.stringify({
            agentId: ids[cost.role], provider: 'google', model: cost.model, inputTokens: cost.inputTokens, outputTokens: cost.outputTokens,
            costCents: Number(cost.costCents.toFixed(4)), occurredAt: new Date().toISOString(), idempotencyKey: `${run.sessionId}:${cost.symbol}:${cost.role}:1`, ...(issueId ? {issueId} : {}),
        })}, `qa-role-${cost.role}`);
    }
    if (!issueId || run.dryRun || !runId) return;
    const named = {'X-Paperclip-Run-Id': runId};
    for (const event of events.filter((e) => e.type === 'run.completed')) {
        await paperclip(`/api/issues/${issueId}/comments`, {method: 'POST', headers: named, body: JSON.stringify({body: `${event.symbol}: the portfolio manager's rating is ${event.rating}.`})});
    }
    await paperclip(`/api/issues/${issueId}`, {method: 'PATCH', headers: named, body: JSON.stringify({status: 'done', comment: 'The desk is done; the ratings are on the issue.'})});
};

// Paperclip's wake of the Head trader, as the service's /paperclip/heartbeat answers it.
const heartbeat = async (req, res) => {
    if (!same(String(req.headers['x-agent-world-heartbeat'] ?? ''), HEARTBEAT_SECRET)) return json(res, 401, {error: 'unauthorized'});
    let beat;
    try {
        beat = JSON.parse(await readText(req));
    } catch {
        return json(res, 200, {forwarded: false});
    }
    const context = beat?.context ?? {};
    state.wakes.push({wakeReason: context.wakeReason ?? null, source: context.source ?? null, issueId: context.issueId ?? null, runId: beat?.runId ?? null});
    if (context.source !== 'routine.dispatch') return json(res, 200, {forwarded: false, ignored: true});
    const issueId = context.issueId ?? context.taskId ?? null;
    const body = JSON.stringify({source: 'paperclip', paperclipRunId: beat.runId ?? null, taskId: issueId, wakeReason: context.wakeReason ?? null, agentId: beat.agentId ?? null});
    const ts = Math.floor(Date.now() / 1000);
    let forwarded = false;
    let why = 'AeroTrade could not be reached';
    try {
        const response = await fetch(`${AEROTRADE_URL}/api/agent-world/sessions`, {method: 'POST', headers: {'Content-Type': 'application/json', 'X-Agent-World-Timestamp': String(ts), 'X-Agent-World-Signature': sign(ts, body)}, body});
        forwarded = response.ok;
        if (!forwarded) why = `HTTP ${response.status}`;
    } catch {
        // AeroTrade down: said on the routine's issue below.
    }
    let closed = null;
    if (issueId && beat.runId) {
        const comment = forwarded ? 'Handed to AeroTrade, which runs a manual session and records it on an issue of its own.' : `AeroTrade did not take this session (${why}); nothing ran.`;
        closed = (await paperclip(`/api/issues/${issueId}`, {method: 'PATCH', headers: {'X-Paperclip-Run-Id': beat.runId}, body: JSON.stringify({status: 'done', comment})})) !== null;
    }
    return json(res, 200, {forwarded, closed});
};

const play = async (run) => {
    const events = eventsFor(run, state.slow ? 60_000 : 9_000);
    const gap = (state.slow ? 60_000 : 9_000) / Math.max(1, Math.ceil(events.length / BATCH));
    run.status = 'running';
    for (let i = 0; i < events.length; i += BATCH) {
        if (i > 0) await wait(gap);
        const status = await post(run.callbackUrl, events.slice(i, i + BATCH), run.sessionId);
        if (status === 404 || status === 401) break;
    }
    await companyPart(run, events);
    run.status = 'completed';
    state.busy = null;
};

const server = http.createServer(async (req, res) => {
    const url = new URL(req.url ?? '/', `http://localhost:${AGENT_WORLD_STUB_PORT}`);
    if (url.pathname === '/__state') {
        for (const knob of ['fail', 'slow']) {
            const value = url.searchParams.get(knob);
            if (value === '1' || value === '0') state[knob] = value === '1';
        }
        return json(res, 200, {fail: state.fail, slow: state.slow, busy: state.busy, authFailures: state.authFailures, runs: state.runs, deliveries: state.deliveries, paperclip: state.paperclip, wakes: state.wakes});
    }
    if (url.pathname === '/__reset') {
        reset();
        return json(res, 200, {ok: true});
    }
    if (req.method === 'GET' && url.pathname === '/health') {
        return json(res, 200, {
            ok: true,
            service: {version: '0.1.0-qa', uptimeS: Math.round(process.uptime())},
            versions: {python: '3.13.0', tradingagents: '0.7.1', 'openbb-core': '2.0.1', 'openbb-yfinance': '2.0.0', 'openbb-sec': '2.0.0', 'openbb-fred': '2.0.0'},
            providers: {yfinance: true, sec: true, fred: true},
            keys: {google: true, anthropic: false, fred: false, secEdgarUserAgent: true, paperclip: Boolean(PAPERCLIP_URL), roleKeys: 12},
            vendors: {get_stock_data: ['openbb', 'yfinance'], get_news: ['openbb', 'yfinance']},
            models: {provider: 'google', quick: 'gemini-2.5-flash-lite', deep: 'gemini-2.5-flash'},
            worker: {busy: state.busy !== null, sessionId: state.busy},
            paperclip: {configured: Boolean(PAPERCLIP_URL), reachable: Boolean(PAPERCLIP_URL)},
        });
    }
    if (req.method === 'POST' && url.pathname === '/paperclip/heartbeat') return heartbeat(req, res);
    if (req.method === 'POST' && url.pathname === '/runs') {
        const text = await readText(req);
        const ts = String(req.headers['x-agent-world-timestamp'] ?? '');
        const signature = String(req.headers['x-agent-world-signature'] ?? '');
        if (!/^\d{9,11}$/.test(ts) || Math.abs(Date.now() - Number(ts) * 1000) > 300_000 || !same(sign(ts, text), signature)) {
            state.authFailures += 1;
            return json(res, 401, {error: 'signature'});
        }
        if (state.fail) return json(res, 503, {error: 'the stub was told to fail'});
        let run;
        try {
            run = JSON.parse(text);
        } catch {
            return json(res, 400, {error: 'invalid'});
        }
        const known = state.runs.find((r) => r.sessionId === run.sessionId);
        if (known) return json(res, 200, {sessionId: known.sessionId, status: known.status});
        if (state.busy) return json(res, 409, {error: 'busy', sessionId: state.busy});
        const record = {...run, status: 'queued', at: new Date().toISOString()};
        state.runs.push(record);
        state.busy = run.sessionId;
        void play(record);
        return json(res, 202, {sessionId: run.sessionId, status: 'queued'});
    }
    const match = /^\/runs\/([A-Za-z0-9-]+)$/.exec(url.pathname);
    if (req.method === 'GET' && match) {
        const run = state.runs.find((r) => r.sessionId === match[1]);
        return run ? json(res, 200, {sessionId: run.sessionId, status: run.status}) : json(res, 404, {error: 'unknown'});
    }
    return json(res, 404, {error: 'not found'});
});

server.listen(AGENT_WORLD_STUB_PORT, () => console.log(`READY http://localhost:${AGENT_WORLD_STUB_PORT}`));
