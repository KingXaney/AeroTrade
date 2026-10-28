// The trading agent world (/agent-world) end to end, keyless: the harness's stand-ins play the
// Python service (start-agent-world-stub.mjs on :8789, replaying the service's own exported event
// stream) and Paperclip (start-paperclip-stub.mjs on :8790). The routes' gates first (unsigned,
// stale, oversized and replayed posts), then the owner starts a session from the empty floor and
// watches it run live — the desk's stages lighting in order, the reports arriving, the ratings —
// approves the planned order (it fails on "live price": the harness has no quotes, as qa-culture
// asserts) and sees the decision on the Paperclip issue; then a declined session, a preview, a
// refused one, the replay with motion and without, a reader who is not the owner sent Home, the company and
// data views, the legend, the voice, a phone.
// Run: npm run qa -- agent-world   (the harness: README.md)
import {chromium} from 'playwright';
import {MongoClient} from 'mongodb';
import {createHmac} from 'node:crypto';
import {BASE, HOME_URL, INNGEST, MONGO, PASSWORD, check, note, outDir, signUp, summary} from './lib.mjs';

const OUT = outDir('agent-world');
const OWNER_EMAIL = 'qa-lab-owner@example.com';
const SERVICE = `http://localhost:${process.env.QA_AGENT_WORLD_PORT ?? 8789}`;
const PAPERCLIP = `http://localhost:${process.env.QA_PAPERCLIP_PORT ?? 8790}`;
const SECRET = 'qa-agent-world-secret';
const JOB = 'agent-world-weekly';
const ENV = 'development';
const OWNER_ID = 'system:agent-world';
const ACCOUNT = 'Trading agent world (development)';
const PRICES = {AAPL: 200, MSFT: 400};

const stub = (path) => fetch(`${SERVICE}${path}`).then((r) => r.json());
const company = (path) => fetch(`${PAPERCLIP}${path}`).then((r) => r.json());
const etDay = (msAgo = 0) => new Date(Date.now() - msAgo).toLocaleDateString('en-CA', {timeZone: 'America/New_York'});
const signed = (body, skewMs = 0) => {
    const ts = Math.floor((Date.now() + skewMs) / 1000);
    return {'Content-Type': 'application/json', 'X-Agent-World-Timestamp': String(ts), 'X-Agent-World-Signature': createHmac('sha256', SECRET).update(`${ts}.${body}`).digest('hex')};
};
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const pollUntil = async (predicate, timeoutMs, everyMs = 1000) => {
    const end = Date.now() + timeoutMs;
    for (;;) {
        const value = await predicate();
        if (value) return value;
        if (Date.now() > end) return null;
        await sleep(everyMs);
    }
};

const browser = await chromium.launch({channel: 'chrome'});
const page = await browser.newPage({viewport: {width: 1440, height: 900}});
const shot = (n) => page.screenshot({path: `${OUT}${n}.png`, fullPage: true});
const mongo = new MongoClient(MONGO);
const DESCRIPTIVE = /\b(should|recommend|best|optimal)\b/i;

const cleanup = async (db) => {
    const account = await db.collection('paperaccounts').findOne({userId: OWNER_ID, name: ACCOUNT});
    if (account) {
        await db.collection('papertrades').deleteMany({accountId: String(account._id)});
        await db.collection('accountsnapshots').deleteMany({accountId: String(account._id)});
        await db.collection('paperaccounts').deleteOne({_id: account._id});
    }
    await db.collection('agentworldsessions').deleteMany({env: ENV});
    await db.collection('agentworldruns').deleteMany({env: ENV});
    await db.collection('jobruns').deleteMany({jobId: JOB});
    await db.collection('limitevents').deleteMany({jobId: JOB});
    await db.collection('pricebars').deleteMany({symbol: {$in: Object.keys(PRICES)}, source: 'qa-agent-world'});
};

const floor = () => page.evaluate(() => {
    const el = document.querySelector('[data-aw-floor]');
    return {
        mode: el?.getAttribute('data-aw-mode') ?? null,
        status: el?.getAttribute('data-aw-status') ?? null,
        seq: Number(el?.getAttribute('data-aw-seq') ?? 0),
        symbol: el?.getAttribute('data-aw-symbol') ?? null,
        session: el?.getAttribute('data-aw-session') ?? null,
        working: document.querySelectorAll('.aw-working').length,
        stages: Object.fromEntries([...document.querySelectorAll('[data-aw-stage]')].map((s) => [s.getAttribute('data-aw-stage'), s.getAttribute('data-status')])),
    };
});

const signIn = async (target, email) => {
    await target.goto(`${BASE}/sign-in`, {waitUntil: 'load'});
    await target.fill('#email', email);
    await target.fill('#password', PASSWORD);
    await target.click('button[type="submit"]');
    await target.waitForURL(HOME_URL, {timeout: 60000});
};

const legendLastAndClosed = () => page.evaluate(() => {
    const legend = document.getElementById('agent-world-legend');
    return Boolean(legend) && legend.nextElementSibling === null && legend.querySelector('details')?.open === false;
});

try {
    await mongo.connect();
    const db = mongo.db();
    await cleanup(db);
    await stub('/__reset');
    await company('/__reset').catch(() => null);

    // --- the routes' gates ---
    const events = `${BASE}/api/agent-world/events`;
    check('the live route answers 401 to a reader not signed in', (await fetch(`${BASE}/api/agent-world/live`)).status === 401);
    const sample = JSON.stringify({sessionId: 'aw-qa-gates', events: [{seq: 1, at: new Date().toISOString(), type: 'run.started', sessionId: 'aw-qa-gates', symbol: 'AAPL', index: 0, total: 1}]});
    check('the events route answers 401 to an unsigned post', (await fetch(events, {method: 'POST', headers: {'Content-Type': 'application/json'}, body: sample})).status === 401);
    const forged = signed(sample);
    forged['X-Agent-World-Signature'] = '0'.repeat(64);
    check('… 401 to a forged signature', (await fetch(events, {method: 'POST', headers: forged, body: sample})).status === 401);
    check('… 401 to a signature ten minutes old', (await fetch(events, {method: 'POST', headers: signed(sample, -10 * 60_000), body: sample})).status === 401);
    const huge = 'x'.repeat(300 * 1024);
    check('… 413 to a body over its cap', (await fetch(events, {method: 'POST', headers: signed(huge), body: huge})).status === 413);
    check('… 400 to a signed body that is no batch', (await fetch(events, {method: 'POST', headers: signed('{"x":1}'), body: '{"x":1}'})).status === 400);
    check('… 404 to a batch for a session it never opened', (await fetch(events, {method: 'POST', headers: signed(sample), body: sample})).status === 404);
    const heartbeat = `${BASE}/api/agent-world/paperclip/heartbeat`;
    check('the Execution desk\'s heartbeat refuses a wake without the shared header', (await fetch(heartbeat, {method: 'POST', body: '{}'})).status === 401);
    check('… and answers one with it', (await fetch(heartbeat, {method: 'POST', headers: {'X-Agent-World-Heartbeat': 'qa-agent-world-heartbeat', 'Content-Type': 'application/json'}, body: JSON.stringify({agentId: 'x', runId: 'r', context: {wakeReason: 'assignment'}})})).status === 200);
    check('the Paperclip relay refuses an unsigned post', (await fetch(`${BASE}/api/agent-world/sessions`, {method: 'POST', headers: {'Content-Type': 'application/json'}, body: '{"source":"paperclip"}'})).status === 401);

    // A batch applied twice changes nothing the second time.
    await db.collection('agentworldsessions').insertOne({env: ENV, sessionId: 'aw-qa-gates', kind: 'manual', weekKey: 'w', tradeDate: etDay(), status: 'running', approval: 'owner', source: 'owner', accountId: 'none', symbols: ['AAPL'], seq: 0, version: 1, runs: [{symbol: 'AAPL', status: 'pending', rating: null, review: false, costCents: 0}], cost: {totalCents: 0, tokensIn: 0, tokensOut: 0, llmCalls: 0, toolCalls: 0}, limits: [], engineVersion: '1', createdAt: new Date(0), updatedAt: new Date(0)});
    const twice = JSON.stringify({sessionId: 'aw-qa-gates', events: [
        {seq: 1, at: new Date().toISOString(), type: 'run.started', sessionId: 'aw-qa-gates', symbol: 'AAPL', index: 0, total: 1},
        {seq: 2, at: new Date().toISOString(), type: 'debate.turn', sessionId: 'aw-qa-gates', symbol: 'AAPL', side: 'bull', round: 1, text: 'The case for.'},
        {seq: 3, at: new Date().toISOString(), type: 'cost.tick', sessionId: 'aw-qa-gates', symbol: 'AAPL', role: 'bull', model: 'q', inputTokens: 10, outputTokens: 5, costCents: 0.5, llmCalls: 1},
    ]});
    const first = await (await fetch(events, {method: 'POST', headers: signed(twice), body: twice})).json();
    const second = await (await fetch(events, {method: 'POST', headers: signed(twice), body: twice})).json();
    const gateRun = await db.collection('agentworldruns').findOne({env: ENV, sessionId: 'aw-qa-gates', symbol: 'AAPL'});
    const gateHead = await db.collection('agentworldsessions').findOne({env: ENV, sessionId: 'aw-qa-gates'});
    check('a batch applied twice is applied once: one turn, one cost, the head at its seq',
        first.applied === 3 && second.applied === 0 && second.stale === 3 && gateRun?.debate?.length === 1 && gateRun?.cost?.totalCents === 0.5 && gateHead?.seq === 3 && gateHead?.cost?.totalCents === 0.5,
        JSON.stringify({first, second, debate: gateRun?.debate?.length, cost: gateRun?.cost, seq: gateHead?.seq}));
    await db.collection('agentworldsessions').deleteMany({env: ENV, sessionId: 'aw-qa-gates'});
    await db.collection('agentworldruns').deleteMany({env: ENV, sessionId: 'aw-qa-gates'});

    // --- the owner, the empty floor ---
    if (await db.collection('user').findOne({email: OWNER_EMAIL})) await signIn(page, OWNER_EMAIL);
    else await signUp(page, 'Lab owner', {email: OWNER_EMAIL, stay: true});
    await page.goto(`${BASE}/agent-world`, {waitUntil: 'load'});
    await page.locator('[data-aw-floor]').waitFor({timeout: 30000});
    check('the empty floor offers the owner Run now and a preview',
        await page.locator('[data-aw-empty]').count() === 1 && await page.locator('[data-aw-run-now]').count() === 1 && await page.locator('[data-aw-preview]').count() === 1);
    const tabs = await page.locator('[role="tab"][data-tab]').evaluateAll((els) => els.map((el) => el.getAttribute('data-tab') + (el.getAttribute('aria-selected') === 'true' ? '*' : '')));
    check('three views, the floor current', tabs.join(',') === 'floor*,company,data', tabs.join(','));
    const sectionTabs = await page.locator('[data-section-tabs="brain"] a').evaluateAll((els) => els.map((el) => el.getAttribute('href') + (el.getAttribute('aria-current') === 'page' ? '*' : '')));
    check('the Brain section shows the three brains as tabs, this one current', sectionTabs.join(',') === '/brain,/culture,/agent-world*', sectionTabs.join(','));
    check('the rail still has seven icons', await page.locator('aside.rail nav a').count() === 7);
    check('the legend is the page\'s last panel, collapsed', await legendLastAndClosed());
    await shot('01-empty');

    // Today's closes for the planning (the harness has no live quotes; fills will say so).
    await db.collection('pricebars').insertMany(Object.entries(PRICES).map(([symbol, close]) => ({symbol, date: etDay(), close, open: close, high: close, low: close, source: 'qa-agent-world', dividend: 0})));

    const inngestUp = await fetch(`${INNGEST}/`).then((r) => r.ok).catch(() => false);
    if (!inngestUp) {
        note('Inngest dev server is down: the session checks are skipped', INNGEST);
    } else {
        // --- a session, live ---
        await stub('/__state?slow=1');
        await page.locator('[data-aw-run-now]').click();
        const live = await pollUntil(async () => (await floor()).mode === 'live', 60_000, 500);
        check('Run now opens a live session on the floor within a minute', Boolean(live), JSON.stringify(await floor()));
        const snapshots = [];
        const settled = await pollUntil(async () => {
            const now = await floor();
            snapshots.push(now);
            return now.status === 'awaiting-approval' ? now : null;
        }, 150_000, 500);
        await shot('02-live');
        const aapl = snapshots.filter((s) => s.symbol === 'AAPL');
        check('the floor updated as the desk ran: its seq rose while it was live', new Set(snapshots.filter((s) => s.mode === 'live').map((s) => s.seq)).size >= 3, snapshots.map((s) => s.seq).join(','));
        check('a working role\'s dot was seen breathing', snapshots.some((s) => s.working > 0));
        check('the stages lit in order: the analysts done while the portfolio manager still waited',
            aapl.some((s) => s.stages.market === 'done' && s.stages.news === 'done' && s.stages['portfolio-manager'] === 'waiting'),
            JSON.stringify(aapl.map((s) => [s.stages.market, s.stages['portfolio-manager']])));
        check('the session waits for a decision once the desk is done', Boolean(settled), JSON.stringify(snapshots.at(-1)));
        const followed = await pollUntil(async () => await page.locator('[data-aw-session][data-status="awaiting-approval"]').count() === 1, 15_000, 500);
        check('the sessions list follows the session to its decision, with no reload', Boolean(followed),
            JSON.stringify(await page.locator('[data-aw-session]').evaluateAll((els) => els.map((el) => el.getAttribute('data-status')))));
        await stub('/__state?slow=0');

        // The texts: a report, the debate, the decision.
        await page.locator('[data-aw-lane="AAPL"]').click();
        await page.locator('[data-aw-pick="market"][data-has="true"]').click();
        check('the market analyst\'s report reads in the pane', (await page.locator('[data-aw-report="market"]').innerText()).length > 80);
        await page.locator('[data-aw-pick="bull"][data-has="true"]').click();
        check('the bull researcher\'s turn reads in the pane', await page.locator('[data-aw-report="bull"] [data-aw-turn="bull"]').count() >= 1);
        check('the caveat sits over the texts once', await page.locator('[data-aw-caveat]').count() === 1 && (await page.locator('[data-aw-caveat]').innerText()).includes('not advice to a reader'));
        check('every stage of AAPL\'s run is done', await page.locator('[data-aw-stage][data-status="done"]').count() === 12);
        check('the providers behind the fetches show on the tiles', await page.locator('[data-aw-vendor-badge]').count() >= 1);
        check('AAPL is rated Buy and MSFT REVIEW, in neutral badges',
            await page.locator('[data-aw-rating-row="AAPL"] [data-aw-rating="Buy"]').count() === 1 && await page.locator('[data-aw-rating-row="MSFT"] [data-aw-rating="REVIEW"]').count() === 1
            && await page.locator('[data-aw-decision] .text-positive, [data-aw-decision] .text-negative').count() === 0);
        const order = await page.locator('[data-aw-order="AAPL"]').innerText().catch(() => '');
        check('one order: a fifth of the $100,000 account in AAPL, 100 whole shares at its $200 close', /100/.test(order) && /20%/.test(order) && await page.locator('[data-aw-order]').count() === 1, order);
        check('the owner is asked to decide, with the lapse deadline beside the buttons',
            await page.locator('[data-aw-approval-state="pending"] [data-aw-approve]').count() === 1 && /lapses/.test(await page.locator('[data-aw-lapse]').innerText()));
        const session = await db.collection('agentworldsessions').findOne({env: ENV}, {sort: {createdAt: -1}});
        check('the session row: a manual session of two symbols with its issue on the company', session?.kind === 'manual' && session.symbols.join(',') === 'AAPL,MSFT' && Boolean(session.paperclip?.issueId), JSON.stringify(session?.paperclip));
        const awaiting = await db.collection('jobruns').findOne({jobId: JOB});
        check('the job\'s stamp says the session awaits the owner', /awaiting the owner \(lapses /.test(awaiting?.lastMessage ?? ''), awaiting?.lastMessage);
        const limit = await db.collection('limitevents').findOne({provider: 'openbb-yfinance'});
        check('the service\'s rate refusal from OpenBB is on the limits tracker under this job', limit?.jobId === JOB && limit?.kind === 'rate', JSON.stringify(limit));
        await shot('03-decided');

        // --- approve ---
        await page.locator('[data-aw-approve]').click();
        const completed = await pollUntil(async () => (await floor()).status === 'completed', 90_000, 1000);
        check('Approve completes the session: the job fills at once for a manual run', Boolean(completed), JSON.stringify(await floor()));
        const fill = await page.locator('[data-aw-fill="AAPL"]').innerText().catch(() => '');
        check('the fill is refused for want of a live price, and says so', await page.locator('[data-aw-fill="AAPL"][data-ok="false"]').count() === 1 && /live price/.test(fill), fill);
        check('the decision names the owner', (await page.locator('[data-aw-approval-state="approved"]').innerText()).includes(OWNER_EMAIL));
        const stamped = await pollUntil(async () => {
            const row = await db.collection('jobruns').findOne({jobId: JOB});
            return /approved by the owner; 0\/1 order\(s\) filled; 1 failed/.test(row?.lastMessage ?? '') ? row : null;
        }, 30_000);
        check('the stamp: approved by the owner, the order refused', Boolean(stamped), stamped?.lastMessage);
        const issue = await pollUntil(async () => {
            const stateNow = await company('/__state');
            return (stateNow.issues ?? []).find((i) => i.id === session?.paperclip?.issueId && i.status === 'done') ?? null;
        }, 20_000);
        check('the Paperclip issue closed on the Execution desk\'s decision, which names the owner',
            Boolean(issue) && JSON.stringify(issue).includes(OWNER_EMAIL), JSON.stringify(issue)?.slice(0, 400));
        const costEvents = (await company('/__state')).costEvents ?? [];
        check('each role reported its cost to its own agent on the company', costEvents.length >= 10, String(costEvents.length));
        // The service's part, as a running Paperclip takes it: a run of the Head trader on the issue
        // (no checkout), each decision commented under it, every call taken.
        const said = (issue?.comments ?? []).filter((c) => c.authorType === 'agent').map((c) => c.body ?? '').join('\n');
        check('the Head trader commented each rating on the issue under a run of its own, checking nothing out',
            /AAPL: the portfolio manager's rating is Buy/.test(said) && (issue?.comments ?? []).every((c) => c.authorType !== 'agent' || Boolean(c.createdByRunId)) && !issue?.checkoutRunId, said.slice(0, 300));
        const serviceSide = await stub('/__state');
        check('every call the service made on the company was taken', (serviceSide.paperclip ?? []).length > 0 && serviceSide.paperclip.every((c) => c.status >= 200 && c.status < 300),
            JSON.stringify((serviceSide.paperclip ?? []).filter((c) => c.status < 200 || c.status >= 300)));
        check('the service\'s own runs woke it, and it relayed none of them', (serviceSide.wakes ?? []).length >= 1 && serviceSide.wakes.every((w) => w.source !== 'routine.dispatch'), JSON.stringify(serviceSide.wakes));
        check('the record shows the account and SPY with no sign colour, in that order',
            (await page.locator('[data-comparison-strip] [data-comparison]').evaluateAll((els) => els.map((el) => el.getAttribute('data-comparison')))).join(',') === 'desk,spy'
            && await page.locator('#agent-world-record .text-positive, #agent-world-record .text-negative').count() === 0);
        check('the sessions list carries it', await page.locator('[data-aw-session][data-status="completed"]').count() >= 1);
        await shot('04-executed');

        // --- the replay, with motion and without ---
        await page.locator('[data-aw-replay]').click();
        const replaying = await pollUntil(async () => (await floor()).mode === 'replay', 5000, 200);
        check('Replay plays the stored session back', Boolean(replaying));
        const backToIdle = await pollUntil(async () => (await floor()).mode === 'idle', 30_000, 500);
        check('… and hands the floor back at its end', Boolean(backToIdle));
        await page.emulateMedia({reducedMotion: 'reduce'});
        await page.locator('[data-aw-replay]').click();
        await sleep(600);
        check('with motion reduced the replay shows the end at once', (await floor()).mode === 'idle' && await page.locator('[data-aw-stage][data-status="done"]').count() >= 1);
        await page.emulateMedia({reducedMotion: null});

        // --- decline a second session ---
        await page.locator('[data-aw-run-now]').click();
        const second = await pollUntil(async () => (await floor()).status === 'awaiting-approval', 120_000, 1000);
        check('a second session waits for its decision', Boolean(second));
        await page.locator('[data-aw-decline]').click();
        const declined = await pollUntil(async () => (await floor()).status === 'declined', 30_000, 1000);
        check('Decline closes it with nothing traded', Boolean(declined) && await db.collection('papertrades').countDocuments({source: 'agent-world'}) === 0);

        // --- a preview ---
        const issuesBefore = ((await company('/__state')).issues ?? []).length;
        await page.locator('[data-aw-preview]').click();
        const preview = await pollUntil(async () => {
            const row = await db.collection('agentworldsessions').findOne({env: ENV, kind: 'preview'});
            return row?.status === 'completed' ? row : null;
        }, 120_000);
        check('a preview runs the desk and plans its orders, asking for no decision and trading nothing',
            Boolean(preview) && (preview.orders ?? []).length === 1 && (preview.fills ?? []).length === 0 && preview.decision === null, JSON.stringify(preview?.orders));
        check('… and opens no issue on the company', ((await company('/__state')).issues ?? []).length === issuesBefore);
        const previewStamp = await db.collection('jobruns').findOne({jobId: JOB});
        check('the stamp says planned, none sent', /preview: .*1 order\(s\) planned, none sent/.test(previewStamp?.lastMessage ?? ''), previewStamp?.lastMessage);

        // --- a service that refuses ---
        await stub('/__state?fail=1');
        await page.reload({waitUntil: 'load'});
        await page.locator('[data-aw-run-now]').click();
        const refused = await pollUntil(async () => {
            const row = await db.collection('jobruns').findOne({jobId: JOB});
            return /the service refused the run \(HTTP 503/.test(row?.lastMessage ?? '') ? row : null;
        }, 60_000);
        check('a service that refuses the run fails the session and says so', Boolean(refused), refused?.lastMessage);
        await stub('/__state?fail=0');
        await page.reload({waitUntil: 'load'});
        await page.locator('[data-aw-floor]').waitFor({timeout: 30000});
        check('the floor states the stop', (await floor()).status === 'failed' && await page.locator('[data-aw-service-stopped]').count() === 1);
        check('the service was never asked without a valid signature', (await stub('/__state')).authFailures === 0);
    }

    // --- the company and the data ---
    await page.goto(`${BASE}/agent-world?view=company`, {waitUntil: 'load'});
    await page.locator('#agent-world-company').waitFor({timeout: 30000});
    check('the company view draws the org chart from Paperclip, every agent with a budget bar',
        await page.locator('[data-aw-org] [data-aw-agent]').count() === 14 && await page.locator('[data-aw-budget]').count() === 14);
    check('… a link to the board, and the session\'s issue with its stage', await page.locator('[data-aw-board]').count() >= 1 && (inngestUp ? await page.locator('[data-aw-issue]').count() === 1 : true));
    check('the legend is still last and collapsed', await legendLastAndClosed());
    await shot('05-company');
    await company('/__mode?down=1');
    await page.reload({waitUntil: 'load'});
    check('with Paperclip down the view says so and the page still stands', await page.locator('[data-aw-unreachable]').count() === 1 && await page.locator('#agent-world-legend').count() === 1);
    await company('/__mode?down=0');

    await page.goto(`${BASE}/agent-world?view=data`, {waitUntil: 'load'});
    await page.locator('#agent-world-vendors').waitFor({timeout: 30000});
    check('the data view maps all twelve of the analysts\' tools to their providers', await page.locator('[data-aw-vendors] tr[data-category]').count() === 12);
    check('… shows the service\'s health from its own answer', await page.locator('[data-aw-health="ok"]').count() === 1 && await page.locator('[data-aw-key]').count() >= 1);
    const fetchState = async () => {
        const db = mongo.db();
        const sessions = await db.collection('agentworldsessions').find({env: ENV}).sort({createdAt: -1}).project({sessionId: 1, status: 1, runs: 1}).toArray();
        const runs = await db.collection('agentworldruns').find({env: ENV}).project({sessionId: 1, symbol: 1, toolResults: 1}).toArray();
        return JSON.stringify({sessions: sessions.map((row) => [row.sessionId, row.status, (row.runs ?? []).length]), runs: runs.map((row) => [row.sessionId, row.symbol, (row.toolResults ?? []).length])});
    };
    check('… the fetches of the newest session that ran a symbol, by provider', !inngestUp || await page.locator('[data-aw-fetches] [data-aw-vendor]').count() >= 1, await fetchState());
    check('… the job\'s stamp and the limits rows of the services this desk calls', await page.locator('[data-aw-jobs] > *').count() >= 1 && await page.locator('#limits').count() === 1);
    await shot('06-data');

    // --- the voice, every view ---
    for (const view of ['', '?view=company', '?view=data']) {
        await page.goto(`${BASE}/agent-world${view}`, {waitUntil: 'load'});
        await page.locator('#agent-world-legend').waitFor({timeout: 30000});
        const text = await page.locator('main').innerText();
        check(`the ${view || 'floor'} view describes and never advises`, !DESCRIPTIVE.test(text), text.match(DESCRIPTIVE)?.[0]);
    }
    await page.locator('#agent-world-legend summary').click();
    const legend = await page.locator('#agent-world-legend').innerText();
    check('the legend states the rating table and the lapse from config', legend.includes('Buy 20%') && legend.includes('15:30 ET'));

    // --- a phone ---
    await page.setViewportSize({width: 375, height: 812});
    for (const view of ['', '?view=company', '?view=data']) {
        await page.goto(`${BASE}/agent-world${view}`, {waitUntil: 'load'});
        await page.locator('#agent-world-legend').waitFor({timeout: 30000});
        const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
        check(`no sideways scroll at 375 px on the ${view || 'floor'} view`, overflow <= 1, String(overflow));
    }
    await shot('07-phone');

    // --- a reader who is not the owner never reaches the trading agent world (lib/lab/owner.ts) ---
    const other = await browser.newPage({viewport: {width: 1440, height: 900}});
    await signUp(other, 'Agent world other');
    await other.goto(`${BASE}/agent-world`, {waitUntil: 'load'});
    await other.waitForURL(HOME_URL, {timeout: 15000}).catch(() => {});
    check('another reader is sent Home, with no Brain icon to come back by',
        HOME_URL.test(other.url()) && await other.locator('aside.rail a[href="/brain"]').count() === 0, other.url());
    await other.close();

    // --- the company's "Weekly session" routine starts one through the service ---
    if (inngestUp) {
        const db = mongo.db();
        const before = await db.collection('agentworldsessions').countDocuments({env: ENV});
        const routine = '33333333-3333-4333-8333-000000000001'; // the stand-in's seeded routine
        const ran = await fetch(`${PAPERCLIP}/api/routines/${routine}/run`, {method: 'POST', headers: {'Content-Type': 'application/json', Authorization: 'Bearer qa-head-trader-key'}, body: JSON.stringify({source: 'api', idempotencyKey: `qa-routine-${Date.now()}`})}).then((r) => r.json());
        const closed = await pollUntil(async () => ((await company('/__state')).issues ?? []).find((i) => i.id === ran?.linkedIssueId && i.status === 'done') ?? null, 20_000);
        check('a routine run wakes the service, which closes the routine\'s issue saying AeroTrade took it',
            Boolean(closed) && (closed.comments ?? []).some((c) => /Handed to AeroTrade/.test(c.body ?? '')), JSON.stringify(closed?.comments ?? ran)?.slice(0, 300));
        const relayed = await pollUntil(async () => {
            const rows = await db.collection('agentworldsessions').find({env: ENV}).sort({createdAt: -1}).limit(1).toArray();
            return (await db.collection('agentworldsessions').countDocuments({env: ENV})) > before && rows[0]?.paperclip?.issueId ? rows[0] : null;
        }, 45_000);
        check('… and AeroTrade runs a manual session for it, on an issue of its own',
            relayed?.kind === 'manual' && relayed.paperclip.issueId !== ran?.linkedIssueId, JSON.stringify(relayed?.paperclip));
    }
} catch (error) {
    check('qa-agent-world threw', false, String(error?.stack ?? error));
} finally {
    await cleanup(mongo.db()).catch(() => null);
    await mongo.close().catch(() => null);
    await browser.close();
}

summary('agent-world');
