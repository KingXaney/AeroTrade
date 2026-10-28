// The office (/agent-world/office): the trading agent world's session as a 3D floor, on a tab of its
// own. Against the same stand-ins as qa-agent-world (the service on :8789 replaying the service's own
// exported events, slowed down; Paperclip on :8790): the owner opens the office from the floor in a
// new tab with no shell, watches a session run seat by seat (the fetches and their refusals on the
// shelves, the turns as bubbles, the ratings, the desks), opens a seat's file by keyboard, moves the
// camera, approves from the Execution desk's file (the confetti, the stamp, the ticket returned for
// want of a live price), replays the session, and the office holds with motion reduced, as a floor
// plan, in brutalist, on a phone, in its words, and a reader who is not the owner sent Home.
// Run: npm run qa -- agent-office   (the harness: README.md)
import {chromium} from 'playwright';
import {MongoClient} from 'mongodb';
import {BASE, HOME_URL, INNGEST, MONGO, PASSWORD, check, note, outDir, signUp, summary} from './lib.mjs';

const OUT = outDir('agent-office');
const OWNER_EMAIL = 'qa-lab-owner@example.com';
const SERVICE = `http://localhost:${process.env.QA_AGENT_WORLD_PORT ?? 8789}`;
const JOB = 'agent-world-weekly';
const ENV = 'development';
const OWNER_ID = 'system:agent-world';
const ACCOUNT = 'Trading agent world (development)';
const PRICES = {AAPL: 200, MSFT: 400};
const WORKERS = ['head-trader', 'market', 'sentiment', 'news', 'fundamentals', 'bull', 'bear', 'research-manager', 'trader',
    'risk-aggressive', 'risk-conservative', 'risk-neutral', 'portfolio-manager', 'execution-desk'];
const ROLES = WORKERS.slice(1, -1);
const DESCRIPTIVE = /\b(should|recommend|best|optimal)\b/i;
const TICKER_LINE = /^\d{1,2}:\d{2}(:\d{2})? (AM|PM) ET · .+\.$/;
const FETCH_TASK = /^(Reading .+ through .+\.|.+ answered \d{3}; trying .+\.|.+ gave no answer; trying .+\.)$/;

const stub = (path) => fetch(`${SERVICE}${path}`).then((r) => r.json());
const etDay = () => new Date().toLocaleDateString('en-CA', {timeZone: 'America/New_York'});
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
const context = await browser.newContext({viewport: {width: 1440, height: 900}});
const page = await context.newPage();
const mongo = new MongoClient(MONGO);
let tab = page;
const shot = (n) => tab.screenshot({path: `${OUT}${n}.png`});

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

// Everything the office says about itself, read off its data attributes.
const office = (target = tab) => target.evaluate(() => {
    const app = document.querySelector('[data-office-app]');
    const stage = document.querySelector('[data-office-stage]');
    const number = (el) => Number(((el?.innerText ?? '').match(/(\d[\d,]*)\s*$/)?.[1] ?? '0').replace(/,/g, ''));
    return {
        mode: app?.getAttribute('data-office-mode') ?? null,
        status: app?.getAttribute('data-office-status') ?? null,
        engine: stage?.getAttribute('data-office-engine') ?? null,
        state: stage?.getAttribute('data-office-state') ?? null,
        focus: stage?.getAttribute('data-office-focus') ?? null,
        follow: stage?.getAttribute('data-office-follow') ?? null,
        preset: stage?.getAttribute('data-office-preset') ?? null,
        lamp: stage?.getAttribute('data-office-lamp') ?? null,
        motion: stage?.getAttribute('data-office-motion') ?? null,
        drawn: Number(stage?.getAttribute('data-office-drawn') ?? 0),
        calls: Number(stage?.getAttribute('data-office-calls') ?? 0),
        workers: Object.fromEntries([...document.querySelectorAll('[data-office-roster] [data-office-worker]')]
            .map((b) => [b.getAttribute('data-office-worker'), {status: b.getAttribute('data-status'), task: b.getAttribute('data-task')}])),
        order: [...document.querySelectorAll('[data-office-roster] [data-office-worker]')].map((b) => b.getAttribute('data-office-worker')),
        shelves: Object.fromEntries([...document.querySelectorAll('[data-office-shelf]')]
            .map((s) => [s.getAttribute('data-office-shelf'), {hot: s.getAttribute('data-hot') === 'true', refused: s.getAttribute('data-refused') === 'true', tag: s.querySelector('[data-office-tag]')?.textContent ?? null}])),
        bubbles: [...document.querySelectorAll('[data-office-bubble]')].filter((b) => b.style.visibility === 'visible').map((b) => b.getAttribute('data-office-bubble')),
        ticker: [...document.querySelectorAll('[data-office-ticker] li')].map((li) => li.innerText.replace(/\s+/g, ' ').trim()),
        stats: {calls: number(document.querySelector('[data-office-stat="calls"]')), fetches: number(document.querySelector('[data-office-stat="fetches"]'))},
    };
});

const signIn = async (target, email) => {
    await target.goto(`${BASE}/sign-in`, {waitUntil: 'load'});
    await target.fill('#email', email);
    await target.fill('#password', PASSWORD);
    await target.click('button[type="submit"]');
    await target.waitForURL(HOME_URL, {timeout: 60000});
};
const ready = (target = tab) => target.locator('[data-office-stage][data-office-state="ready"], [data-office-stage][data-office-engine="2d"]').waitFor({timeout: 60000});
// The office plays a finished session back once when it opens on one; the checks that read a still
// office stop it first.
const stopReplay = async (target = tab) => {
    await sleep(800);
    if (await target.locator('[data-office-replay-stop]').count() > 0) await target.locator('[data-office-replay-stop]').click();
    await sleep(200);
};
// The office's own animations still moving: a loop not stopped, or a one-shot whose duration the
// style or the motion setting did not zero.
const animated = (target = tab) => target.evaluate(() => [...document.querySelectorAll('[class*="ao-"]')]
    .filter((el) => [...el.classList].some((c) => c.startsWith('ao-')))
    .filter((el) => {
        const style = getComputedStyle(el);
        return style.animationName !== 'none' && style.animationDuration.split(',').some((d) => parseFloat(d) > 0);
    })
    .map((el) => [...el.classList].find((c) => c.startsWith('ao-'))));

try {
    await mongo.connect();
    const db = mongo.db();
    await cleanup(db);
    await stub('/__reset');

    // --- from the floor to the office, in a tab of its own ---
    if (await db.collection('user').findOne({email: OWNER_EMAIL})) await signIn(page, OWNER_EMAIL);
    else await signUp(page, 'Lab owner', {email: OWNER_EMAIL, stay: true});
    await page.goto(`${BASE}/agent-world`, {waitUntil: 'load'});
    await page.locator('[data-aw-floor]').waitFor({timeout: 30000});
    const link = page.locator('[data-aw-office]');
    check('the floor links to the office, opening a new tab',
        await link.count() === 1 && await link.getAttribute('target') === '_blank' && /noopener/.test(await link.getAttribute('rel') ?? '') && await link.getAttribute('href') === '/agent-world/office');
    const [opened] = await Promise.all([context.waitForEvent('page'), link.click()]);
    tab = opened;
    await tab.waitForLoadState('load');
    await ready();
    check('the new tab is the office', new URL(tab.url()).pathname === '/agent-world/office', tab.url());
    check('it has none of the app\'s shell: no rail, no header, no chat',
        await tab.locator('aside.rail').count() === 0 && await tab.locator('.header-wrapper').count() === 0 && await tab.locator('[aria-label="Open Aero-AI Assistant"]').count() === 0);
    check('the floor is drawn in 3D on a canvas', (await office()).engine === '3d' && await tab.locator('[data-office-stage] canvas').count() === 1);
    check('its top bar links back to the floor', await tab.locator('a[data-office-back]').getAttribute('href') === '/agent-world');
    const empty = await office();
    check('fourteen seats on the roster, in the order a run reaches them', empty.order.join(',') === WORKERS.join(','), empty.order.join(','));
    check('… each with a nameplate on the floor that is a button', await tab.locator('button[data-office-plate]').count() === 14);
    check('an office with no session is idle, every seat between sessions', Object.values(empty.workers).every((w) => w.status === 'idle'), JSON.stringify(empty.workers['market']));
    check('the empty office offers the owner Run now', await tab.locator('[data-office-empty]').count() === 1 && await tab.locator('[data-aw-run-now]').count() >= 1);
    check('the caveat once, the legend last in its column and collapsed', await tab.locator('[data-office-caveat]').count() === 1 && await tab.evaluate(() => {
        const legend = document.getElementById('agent-world-office-legend');
        return Boolean(legend) && legend.nextElementSibling === null && legend.querySelector('details')?.open === false;
    }));
    const drawn = await pollUntil(async () => {
        const now = await office();
        return now.drawn > 0 ? now : null;
    }, 15_000, 250);
    const soundBefore = await tab.locator('[data-office-sound]').getAttribute('data-office-sound');
    await tab.locator('[data-office-roster] [data-office-worker="head-trader"]').focus();
    await tab.keyboard.press('m');
    await sleep(200);
    const soundOn = await tab.locator('[data-office-sound]').getAttribute('data-office-sound');
    const stored = await tab.evaluate(() => window.localStorage.getItem('aero-office:sound'));
    await tab.locator('[data-office-sound]').click();
    await sleep(200);
    check('sound is off until turned on; M turns it on, kept in this browser, and the switch turns it off',
        soundBefore === 'off' && soundOn === 'on' && stored === 'on' && await tab.locator('[data-office-sound]').getAttribute('data-office-sound') === 'off',
        `${soundBefore} ${soundOn} ${stored}`);
    check('the scene drew its first frame and keeps to its draw budget', Boolean(drawn) && drawn.calls > 0 && drawn.calls <= 300, String(drawn?.calls));
    await shot('01-empty');

    const inngestUp = await fetch(`${INNGEST}/`).then((r) => r.ok).catch(() => false);
    if (!inngestUp) {
        note('Inngest dev server is down: the session checks are skipped', INNGEST);
    } else {
        // Today's closes for the planning (the harness has no live quotes; the fill will say so).
        await db.collection('pricebars').insertMany(Object.entries(PRICES).map(([symbol, close]) => ({symbol, date: etDay(), close, open: close, high: close, low: close, source: 'qa-agent-world', dividend: 0})));

        // --- a session, watched live from the office ---
        await stub('/__state?slow=1');
        await tab.locator('[data-aw-run-now]').first().click();
        await tab.mouse.move(30, 700);
        const live = await pollUntil(async () => (await office()).mode === 'live', 60_000, 500);
        check('Run now in the office opens a live session within a minute', Boolean(live), JSON.stringify(await office()));
        const snapshots = [];
        const settled = await pollUntil(async () => {
            const now = await office();
            snapshots.push(now);
            return now.status === 'awaiting-approval' ? now : null;
        }, 180_000, 400);
        await shot('02-live');
        const seen = (id, status) => snapshots.some((s) => s.workers[id]?.status === status);
        const firstAt = (id, status) => snapshots.findIndex((s) => s.workers[id]?.status === status);
        check('the session reached the owner\'s decision', Boolean(settled), JSON.stringify(snapshots.at(-1)?.workers['execution-desk']));
        const fetchers = ['market', 'news', 'fundamentals'].filter((id) => snapshots.some((s) => s.workers[id]?.status === 'fetching' && FETCH_TASK.test(s.workers[id].task ?? '')));
        check('the analysts were seen fetching, each saying what it read and through whom', fetchers.length === 3,
            JSON.stringify(snapshots.map((s) => s.workers.market?.task).filter(Boolean).slice(0, 6)));
        check('the sentiment analyst never fetches', !seen('sentiment', 'fetching'));
        check('OpenBB\'s shelf was seen refusing and yfinance\'s answering',
            snapshots.some((s) => s.shelves.openbb?.refused) && snapshots.some((s) => s.shelves.yfinance?.hot), JSON.stringify(snapshots.at(-1)?.shelves));
        check('… the refused shelf wearing its latest refusal as a tag', snapshots.some((s) => Boolean(s.shelves.openbb?.tag)), JSON.stringify([...new Set(snapshots.map((s) => s.shelves.openbb?.tag))]));
        check('… and the ticker saying the fetch went to yfinance after OpenBB answered 429',
            snapshots.some((s) => s.ticker.some((line) => /read .+ through yfinance after OpenBB answered 429\.$/.test(line))),
            JSON.stringify([...new Set(snapshots.flatMap((s) => s.ticker))].filter((line) => /OpenBB/.test(line)).slice(0, 4)));
        check('the analysts filed, then were done', ['market', 'news', 'fundamentals', 'sentiment'].every((id) => seen(id, 'filed') && seen(id, 'done')));
        check('the bull and the bear talked, the bull first', seen('bull', 'talking') && seen('bear', 'talking') && firstAt('bull', 'talking') <= firstAt('bear', 'talking'),
            `${firstAt('bull', 'talking')} ${firstAt('bear', 'talking')}`);
        check('the risk desk talked', ['risk-aggressive', 'risk-conservative'].every((id) => seen(id, 'talking')));
        await tab.locator('[data-office-lane="AAPL"]').click();
        await sleep(400);
        check('picking AAPL\'s lane shows its run: the portfolio manager rated it', /^Rated AAPL Buy\.$/.test((await office()).workers['portfolio-manager']?.task ?? ''), (await office()).workers['portfolio-manager']?.task);
        await tab.locator('[data-office-follow-lane]').click();
        await sleep(300);
        check('a bubble was seen over a seat that spoke', snapshots.some((s) => s.bubbles.length > 0));
        // The stand-in stamps each batch's events across the interval it then waits out, so the last
        // ones (the service done) can be a few seconds ahead of the clock when they land.
        const last = await pollUntil(async () => {
            const now = await office();
            return now.workers['head-trader']?.status === 'done' ? now : null;
        }, 15_000, 500) ?? await office();
        check('the Execution desk waits for the owner, its lamp lit and its chip asking',
            last?.workers['execution-desk']?.status === 'waiting' && last.workers['execution-desk'].task === 'Waiting for the owner.' && last.lamp === 'awaiting'
            && await tab.locator('[data-office-lamp-chip="awaiting"]').count() === 1, JSON.stringify(last?.workers['execution-desk']));
        check('the Head trader handed the issue in', last?.workers['head-trader']?.status === 'done' && /^Handed issue /.test(last.workers['head-trader'].task ?? ''), last?.workers['head-trader']?.task);
        check('the ticker lists the newest events, each with its ET time', (last?.ticker.length ?? 0) >= 6 && last.ticker.length <= 12 && last.ticker.every((line) => TICKER_LINE.test(line)),
            JSON.stringify(last?.ticker.slice(0, 3)));
        check('the wall counted model calls and data fetches', (last?.stats.calls ?? 0) > 0 && (last?.stats.fetches ?? 0) > 0, JSON.stringify(last?.stats));
        check('AAPL\'s Buy and MSFT\'s REVIEW are pinned in neutral badges',
            await tab.locator('[data-office-card="AAPL"][data-rating="Buy"]').count() === 1 && await tab.locator('[data-office-card="MSFT"][data-rating="REVIEW"]').count() === 1);
        check('the camera followed the run to at least three seats', new Set(snapshots.map((s) => s.focus).filter(Boolean)).size >= 3, [...new Set(snapshots.map((s) => s.focus))].join(','));
        check('the scene drew as the session moved', (last?.drawn ?? 0) > (snapshots[0]?.drawn ?? 0) && Math.max(...snapshots.map((s) => s.calls)) <= 300, `${snapshots[0]?.drawn} → ${last?.drawn}`);
        await stub('/__state?slow=0');

        // --- a seat's file, by keyboard ---
        await tab.locator('[data-office-roster] [data-office-worker="market"]').focus();
        await tab.keyboard.press('Enter');
        const file = tab.locator('[data-office-dossier="market"]');
        await file.waitFor({timeout: 10000});
        const fileText = await file.innerText();
        const calls = Number(await file.locator('[data-office-session-figures] dd').first().innerText());
        check('Enter on a seat opens its file: what it does, this session\'s calls', fileText.includes('Reads the price bars and technical indicators') && calls > 0, String(calls));
        check('… its latest text under the caveat', (await file.locator('[data-office-latest]').innerText()).length > 80 && await file.locator('[data-office-caveat-file]').count() === 1);
        check('… its career and its budget on the company', await file.locator('[data-office-career]').count() === 1 && /of \$2\.00 spent this month/.test(await file.locator('[data-office-budget]').innerText()),
            await file.locator('[data-office-budget]').innerText());
        check('… and the terms it uses, collapsed, with no chat link', await file.locator('[data-what-these-mean]').count() === 1 && await file.locator('[data-ask]').count() === 0
            && await file.locator('[data-what-these-mean]').evaluate((el) => el.tagName !== 'DETAILS' || !el.open));
        check('the floor stays live behind the file', (await office()).mode === 'live');
        await tab.keyboard.press('Escape');
        await sleep(400);
        check('Escape closes it and hands the focus back to the seat', await tab.locator('[data-office-dossier]').count() === 0
            && await tab.evaluate(() => document.activeElement?.getAttribute('data-office-worker')) === 'market');

        // --- the camera ---
        await tab.keyboard.press('3');
        await sleep(900);
        const toTable = await office();
        check('a number key moves the camera to its preset and stops following', toTable.preset === 'table' && toTable.follow === 'false', `${toTable.preset} ${toTable.follow}`);
        await tab.keyboard.press('f');
        await sleep(300);
        check('F follows the run again', (await office()).follow === 'true');
        const box = await tab.locator('[data-office-stage] canvas').boundingBox();
        await tab.mouse.move(box.x + box.width / 2, box.y + box.height * 0.88);
        await tab.mouse.down();
        await tab.mouse.move(box.x + box.width / 2 + 120, box.y + box.height * 0.88 - 20, {steps: 8});
        await tab.mouse.up();
        await sleep(300);
        check('a drag on the floor takes the camera back from following', (await office()).follow === 'false');

        // --- approve from the office ---
        await tab.selectOption('[data-office-presets]', 'execution');
        await sleep(1200);
        await tab.locator('[data-office-lamp-chip="awaiting"]').click();
        const desk = tab.locator('[data-office-dossier="execution-desk"]');
        await desk.waitFor({timeout: 10000});
        check('the lamp\'s chip opens the Execution desk\'s file with the decision', await desk.locator('[data-office-decision] [data-aw-approve]').count() === 1);
        await desk.locator('[data-aw-approve]').click();
        const confetti = await pollUntil(async () => await tab.locator('[data-office-confetti]').count() > 0, 8000, 150);
        check('the owner\'s Approve sets off the confetti', Boolean(confetti));
        const completed = await pollUntil(async () => (await office()).status === 'completed', 90_000, 1000);
        check('the session completes: the job fills at once for a manual run', Boolean(completed), JSON.stringify((await office()).status));
        await tab.keyboard.press('Escape');
        await sleep(800);
        const done = await office();
        check('the stamp came down on Approved', done.lamp === 'approved' && await tab.locator('[data-office-stamp="approved"]').count() === 1);
        check('the AAPL ticket came back for want of a live price', await tab.locator('[data-office-ticket="AAPL"][data-ok="false"]').count() === 1
            && done.workers['execution-desk']?.task === '0 of 1 ticket filled.', done.workers['execution-desk']?.task);
        check('… and the ticker says it was not filled', done.ticker.some((line) => /The order for AAPL was not filled/.test(line)), JSON.stringify(done.ticker.slice(0, 3)));
        check('the issue on the front desk\'s board is done', await tab.locator('[data-office-issue-chip="approved"]').count() === 1);
        await shot('03-approved');

        // --- the replay ---
        await tab.locator('[data-office-replay]').click();
        const replaying = await pollUntil(async () => {
            const now = await office();
            return now.mode === 'replay' ? now : null;
        }, 5000, 150);
        check('Replay plays the stored session back', Boolean(replaying));
        const early = [];
        for (let i = 0; i < 12; i += 1) {
            early.push(await office());
            await sleep(300);
        }
        check('… from its start: seats waiting, the portfolio manager not yet done, the lamp off',
            early.some((s) => Object.values(s.workers).some((w) => w.status === 'waiting')) && early.every((s) => s.workers['portfolio-manager']?.status !== 'done' && s.lamp === 'off'),
            JSON.stringify(early.map((s) => [s.workers['portfolio-manager']?.status, s.lamp])));
        await sleep(8_000);
        const midway = await office();
        check('… the ticker growing as it plays', midway.mode === 'replay' && midway.ticker.length >= (replaying?.ticker.length ?? 0), `${replaying?.ticker.length} → ${midway.ticker.length}`);
        await shot('04-replay');
        const backToIdle = await pollUntil(async () => (await office()).mode === 'idle', 75_000, 1000);
        check('… and hands the office back at its end', Boolean(backToIdle));
        const ended = await office();
        check('at the end of the replay every role is done', ROLES.every((id) => ended.workers[id]?.status === 'done'), JSON.stringify(ROLES.map((id) => ended.workers[id]?.status)));
        await tab.locator('[data-office-replay]').click();
        await pollUntil(async () => (await office()).mode === 'replay', 5000, 150);
        await tab.locator('[data-office-replay-stop]').click();
        await sleep(300);
        check('Stop ends a replay at once', (await office()).mode === 'idle');

        // --- motion reduced ---
        await tab.emulateMedia({reducedMotion: 'reduce'});
        await tab.reload({waitUntil: 'load'});
        await ready();
        await sleep(1500);
        const still = await office();
        check('with motion reduced the office opens on the end, with no replay', still.mode === 'idle' && still.motion === 'reduced' && ROLES.every((id) => still.workers[id]?.status === 'done'));
        check('… nothing of its own loops', (await animated()).length === 0, (await animated()).join(','));
        const drawnBefore = (await office()).drawn;
        await sleep(2500);
        check('… and the scene sleeps when nothing moves', (await office()).drawn === drawnBefore, `${drawnBefore} → ${(await office()).drawn}`);
        await tab.locator('[data-office-replay]').click();
        await sleep(600);
        check('… Replay shows the end at once', (await office()).mode === 'idle');
        await tab.emulateMedia({reducedMotion: null});
    }

    // --- the floor plan ---
    await tab.goto(`${BASE}/agent-world/office?engine=2d`, {waitUntil: 'load'});
    await ready();
    await stopReplay();
    const flat = await office();
    const mapped = await tab.evaluate(() => Object.fromEntries([...document.querySelectorAll('[data-office-map-worker]')].map((b) => [b.getAttribute('data-office-map-worker'), b.getAttribute('data-status')])));
    check('?engine=2d draws the floor plan, no canvas', flat.engine === '2d' && await tab.locator('svg[data-office-map]').count() === 1 && await tab.locator('[data-office-stage] canvas').count() === 0);
    check('… its fourteen seats saying what the roster says', Object.keys(mapped).length === 14 && WORKERS.every((id) => mapped[id] === flat.workers[id]?.status), JSON.stringify(mapped));
    await shot('05-plan');

    // --- brutalist ---
    await context.addCookies([{name: 'aero-theme', value: 'v1:nord:brutalist:0', domain: new URL(BASE).hostname, path: '/'}]);
    await tab.goto(`${BASE}/agent-world/office`, {waitUntil: 'load'});
    await ready();
    await stopReplay();
    await sleep(800);
    check('in brutalist the office renders and its loops are stopped', (await office()).state === 'ready' && (await animated()).length === 0, (await animated()).join(','));
    await shot('06-brutalist');
    await context.clearCookies({name: 'aero-theme'});

    // --- the words ---
    await tab.goto(`${BASE}/agent-world/office`, {waitUntil: 'load'});
    await ready();
    await stopReplay();
    await tab.locator('#agent-world-office-legend summary').click();
    const legend = await tab.locator('#agent-world-office-legend').innerText();
    check('the legend states the replay\'s pace and the poll from config', legend.includes('60 seconds') && legend.includes('every 3 seconds'), legend.slice(0, 200));
    let words = await tab.locator('[data-office-app]').innerText();
    for (const id of ['market', 'execution-desk']) {
        await tab.locator(`[data-office-roster] [data-office-worker="${id}"]`).click();
        await tab.locator(`[data-office-dossier="${id}"]`).waitFor({timeout: 10000});
        words += `\n${await tab.locator(`[data-office-dossier="${id}"]`).innerText()}`;
        await tab.keyboard.press('Escape');
        await sleep(300);
    }
    check('the office describes and never advises', !DESCRIPTIVE.test(words), words.match(DESCRIPTIVE)?.[0]);

    // --- a phone ---
    await tab.setViewportSize({width: 375, height: 812});
    await tab.reload({waitUntil: 'load'});
    await ready();
    const overflow = await tab.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    check('no sideways scroll at 375 px', overflow <= 1, String(overflow));
    check('… every seat still on the roster', await tab.locator('[data-office-roster] [data-office-worker]').count() === 14);
    await shot('07-phone');

    // --- a reader who is not the owner never reaches the office (lib/lab/owner.ts) ---
    const otherContext = await browser.newContext({viewport: {width: 1440, height: 900}});
    const other = await otherContext.newPage();
    await signUp(other, 'Office other');
    await other.goto(`${BASE}/agent-world/office`, {waitUntil: 'load'});
    await other.waitForURL(HOME_URL, {timeout: 15000}).catch(() => {});
    const poll = await other.request.get(`${BASE}/api/agent-world/live`);
    check('another reader is sent Home, and the floor\'s live poll answers them 401',
        HOME_URL.test(other.url()) && poll.status() === 401, `${other.url()} ${poll.status()}`);
    await otherContext.close();
} catch (error) {
    check('qa-agent-office threw', false, String(error?.stack ?? error));
} finally {
    await cleanup(mongo.db()).catch(() => null);
    await mongo.close().catch(() => null);
    await browser.close();
}

summary('agent-office');
