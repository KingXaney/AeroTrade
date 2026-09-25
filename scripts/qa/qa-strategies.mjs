// The quant-strategies tab: the nav carries it, the leaderboard and detail pages render
// honestly with nothing seeded (the job never runs in this harness), then with a seeded
// system state they rank by the seeded live return, label unpriced holdings, show the
// explainer / signal board / trade reasons / simulated record, and follow persists.
// Run against the harness in README.md (in-memory Mongo on :27117 + `npm run dev`).
import {chromium} from 'playwright';
import {MongoClient, ObjectId} from 'mongodb';
import {mkdirSync} from 'node:fs';

const BASE = 'http://localhost:3000';
const MONGO = 'mongodb://127.0.0.1:27117/aerotrade';
const OUT = new URL('./output/strategies/', import.meta.url).pathname;
mkdirSync(OUT, {recursive: true});

const OWNER = 'system:strategies';
// Mirrors lib/strategies/catalog.ts (slug → account name); the page reads the catalog itself.
const CATALOG = [
    ['buy-and-hold-spy', 'Buy & Hold SPY'],
    ['sixty-forty', '60/40 Quarterly'],
    ['golden-cross', 'Golden Cross Sectors'],
    ['dual-momentum', 'Dual Momentum (GEM)'],
    ['momentum-12-1', '12-1 Momentum Top 8'],
    ['rsi2-mean-reversion', 'RSI-2 Mean Reversion'],
    ['donchian-breakout', 'Donchian 55/20 Breakout'],
    ['low-volatility', 'Low Volatility Top 10'],
];

let failures = 0;
const check = (name, ok, detail = '') => {
    if (!ok) failures++;
    console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? `  — ${detail}` : ''}`);
};

const browser = await chromium.launch({channel: 'chrome'});
const page = await browser.newPage({viewport: {width: 1440, height: 900}});
const shot = (n) => page.screenshot({path: `${OUT}${n}.png`, fullPage: true});
const settleToasts = async () => {
    await page.mouse.move(5, 700);
    await page.locator('[data-sonner-toast]').first().waitFor({state: 'detached', timeout: 10000}).catch(() => {});
};
const mongo = new MongoClient(MONGO);
// Dates the app keys on are Eastern-time calendar dates, never UTC.
const isoDaysAgo = (n) => new Date(Date.now() - n * 24 * 60 * 60 * 1000).toLocaleDateString('en-CA', {timeZone: 'America/New_York'});

try {
    await mongo.connect();
    const db = mongo.db('aerotrade');
    const email = `qastrat${Date.now()}@example.com`;
    await page.goto(`${BASE}/sign-up`, {waitUntil: 'load'});
    await page.fill('#fullName', 'QA Strategies');
    await page.fill('#email', email);
    await page.fill('#password', 'Passw0rd!Passw0rd!');
    await page.click('button[type="submit"]');
    await page.waitForURL(new RegExp(`^${BASE}/(\\?.*)?$`), {timeout: 90000});
    const userDoc = await db.collection('user').findOne({email});
    const userId = String(userDoc?._id ?? userDoc?.id ?? '');
    check('signed up', userId.length > 0);
    const prefsDoc = () => db.collection('userpreferences').findOne({userId});

    // Rerunnable: the harness DB survives between runs, so clear the system-owned state first.
    const accountIds = (await db.collection('paperaccounts').find({userId: OWNER}).project({_id: 1}).toArray()).map((a) => String(a._id));
    await db.collection('paperaccounts').deleteMany({userId: OWNER});
    await db.collection('papertrades').deleteMany({userId: OWNER});
    await db.collection('accountsnapshots').deleteMany({$or: [{userId: OWNER}, {accountId: {$in: accountIds}}]});
    for (const name of ['strategystates', 'strategyruns', 'strategybacktests']) await db.collection(name).deleteMany({});
    await db.collection('jobruns').deleteMany({jobId: 'strategies-daily'});

    // --- navigation ------------------------------------------------------------------
    const headerHrefs = await page.$$eval('header nav ul li a', (as) => as.map((a) => a.getAttribute('href')));
    check('header nav carries /strategies after /brain',
        headerHrefs.join(',') === '/topics,/,/brain,/strategies,/portfolio,/trade,/markets,/news', headerHrefs.join(','));
    // Eight items must still fit a 1024px bar without pushing the account controls off it.
    // The narrow page must carry the session (or it lands on /sign-in): copy the cookies
    // into a fresh context, since a page made by browser.newPage() cannot spawn siblings.
    const narrowContext = await browser.newContext({viewport: {width: 1024, height: 768}});
    await narrowContext.addCookies(await page.context().cookies());
    const narrow = await narrowContext.newPage();
    await narrow.goto(`${BASE}/strategies`, {waitUntil: 'load'});
    const overflow = await narrow.evaluate(() => {
        const header = document.querySelector('header');
        if (!header) return {ok: false, detail: 'no header'};
        const right = header.querySelector('.header-wrapper > div:last-child');
        const nav = header.querySelector('nav');
        if (!right || !nav) return {ok: false, detail: 'no nav/right group'};
        const r = right.getBoundingClientRect();
        const n = nav.getBoundingClientRect();
        return {ok: n.right <= r.left && r.right <= window.innerWidth && header.scrollWidth <= window.innerWidth + 1, detail: `nav right ${Math.round(n.right)}, controls left ${Math.round(r.left)}, header scroll ${header.scrollWidth}`};
    });
    check('header fits at 1024px with eight items', overflow.ok, overflow.detail);
    await narrow.screenshot({path: `${OUT}00-header-1024.png`});
    await narrowContext.close();

    // --- nothing seeded: honest empty state ------------------------------------------
    await page.goto(`${BASE}/strategies`, {waitUntil: 'load'});
    await page.locator('[data-testid="strategy-leaderboard"]').waitFor({timeout: 30000});
    check('/strategies renders its heading', await page.getByRole('heading', {name: 'Quant Strategies', level: 1}).count() === 1);
    check('status strip says it has not run yet', /has not run yet/i.test(await page.locator('#strategies-status').innerText()));
    const emptyRows = await page.locator('[data-testid="strategy-leaderboard"] [data-strategy]').count();
    check('catalog rows render before any run', emptyRows === 8, String(emptyRows));
    check('no strategy is ranked yet', (await page.locator('[data-testid="strategy-leaderboard"]').innerText()).includes('not started'));
    await shot('01-empty');

    await page.goto(`${BASE}/strategies/golden-cross`, {waitUntil: 'load'});
    await page.locator('#strategy-explainer').waitFor({timeout: 30000});
    const explainer = await page.locator('#strategy-explainer').innerText();
    // Headings are uppercased by CSS, so innerText comparisons are case-insensitive.
    check('detail explains the rule before it has run', /how it works/i.test(explainer) && /50/.test(explainer) && /200/.test(explainer));
    check('detail is honest about not having started', /not started/i.test(await page.locator('#strategy-meta').innerText()));
    await page.goto(`${BASE}/strategies/no-such-rule`, {waitUntil: 'load'});
    await page.getByText('Not found').first().waitFor({timeout: 30000}).catch(() => {});
    check('unknown slug renders the in-app 404', await page.getByText('Not found').count() > 0 && await page.locator('header').count() > 0);

    // --- seed a system state the way the job would leave it ---------------------------
    const today = isoDaysAgo(0);
    // 13 days: long enough that 12 snapshots clear MIN_SPARK_POINTS (10) so the live
    // sparkline column is reachable, still inside the 30-day "young record" note.
    const launch = isoDaysAgo(13);
    const inception = new Date(Date.now() - 13 * 24 * 60 * 60 * 1000);
    const snapshotFor = (accountId, d, cash, holdingsValue) => ({
        accountId, userId: OWNER, date: isoDaysAgo(d), totalValue: 100_000 + (13 - d) * 100,
        cash, holdingsValue, startingBalance: 100_000,
    });
    const seeded = [];
    for (let i = 0; i < CATALOG.length; i += 1) {
        const [slug, name] = CATALOG[i];
        const accountId = new ObjectId();
        // Distinct live returns: 100k → 100k + (i − 3) × 1 500, so rank 1 is the last slug.
        const holdingsValue = 20_000;
        const cash = 100_000 - holdingsValue + (i - 3) * 1500;
        await db.collection('paperaccounts').insertOne({
            _id: accountId, userId: OWNER, name, cash, startingBalance: 100_000, inceptionAt: inception,
            positions: [{symbol: 'SPY', company: 'SPDR S&P 500', quantity: 40, avgCost: 500}],
            createdAt: inception, updatedAt: new Date(),
        });
        await db.collection('strategystates').insertOne({
            strategyId: slug, accountId: String(accountId), status: 'active', version: '1.1', launchDate: launch,
            lastRunDate: today, lastTradeDate: today, lastRebalanceDate: today, createdAt: inception, updatedAt: new Date(),
        });
        await db.collection('papertrades').insertOne({
            userId: OWNER, accountId: String(accountId), symbol: 'SPY', company: 'SPDR S&P 500', side: 'buy', quantity: 40,
            price: 500, total: 20_000, source: 'strategy', reason: `enter: seeded fill for ${slug}`, createdAt: new Date(),
        });
        // Only five to begin with: the sparkline gate is asserted below, then the rest
        // are inserted so the column appears. A half-drawn column is the bug being tested.
        for (let d = 5; d >= 1; d -= 1) {
            await db.collection('accountsnapshots').insertOne(snapshotFor(String(accountId), d, cash, holdingsValue));
        }
        // RSI-2 ranks forty names: the page that ran to 4,764px. Seeding its real board
        // size is what makes the row cap and the page-height guard below mean anything.
        const board = slug === 'rsi2-mean-reversion'
            ? Array.from({length: 40}, (_, k) => ({
                symbol: `SYM${String(k).padStart(2, '0')}`, state: k < 3 ? 'held' : 'watch',
                values: {close: 100 + k, sma50: 205.1, sma200: 198.2, spread: 0.0348, trendOn: true},
            }))
            : [{symbol: 'XLK', state: 'held', values: {close: 210.5, sma50: 205.1, sma200: 198.2, spread: 0.0348, trendOn: true}}];
        await db.collection('strategyruns').insertOne({
            strategyId: slug, date: today, asOf: isoDaysAgo(1), mode: 'live', status: 'done', staleCount: 0, universeSize: 11,
            rebalanceTriggered: true,
            board,
            orders: [{symbol: 'SPY', side: 'buy', quantity: 40, kind: 'enter', reason: `enter: seeded fill for ${slug}`, executed: true, price: 500}],
            skippedOrders: [], dataIssues: [], equity: 100_000, summary: '1/1 order(s) filled', createdAt: new Date(),
        });
        const points = Array.from({length: 30}, (_, k) => ({date: isoDaysAgo(60 - k), value: 100_000 * (1 + k * 0.004)}));
        await db.collection('strategybacktests').insertOne({
            strategyId: slug, version: '1.1', from: points[0].date, to: points[points.length - 1].date, fillRule: 'next-open',
            closeFills: 0, skippedDays: 0, points, benchmark: points.map((p) => ({date: p.date, value: 500 + (p.value - 100_000) / 400})),
            trades: [{date: points[1].date, symbol: 'SPY', side: 'buy', quantity: 190, price: 500, total: 95_000, reason: 'initial deployment: buy and hold SPY', fill: 'open'}],
            stats: {totalReturnPct: 11.6, cagrPct: 9.1, annualizedVolPct: 12.3, maxDrawdownPct: 2.5, winRatePct: null, wins: 0, losses: 0, tradeCount: 1, benchmarkReturnPct: 10.0, excessReturnPct: 1.6},
            computedAt: new Date(),
        });
        seeded.push({slug, name, accountId: String(accountId)});
    }
    for (let d = 13; d >= 1; d -= 1) {
        await db.collection('benchmarksnapshots').updateOne({symbol: 'SPY', date: isoDaysAgo(d)}, {$set: {close: 500 + (13 - d)}}, {upsert: true});
    }
    await db.collection('jobruns').updateOne({jobId: 'strategies-daily'}, {$set: {lastRunAt: new Date(), lastMessage: '8/8 strategies ran (seeded)'}}, {upsert: true});

    // --- the sparkline column is all-or-nothing ----------------------------------------
    // Five snapshots is four segments — an artifact, not a curve. The column must draw
    // nothing at all rather than a ragged half, which is the defect being designed out.
    await page.goto(`${BASE}/strategies`, {waitUntil: 'load'});
    await page.locator('[data-testid="strategy-leaderboard"]').waitFor({timeout: 30000});
    check('live sparklines are withheld while the record is too short',
        await page.locator('svg[data-spark="live"]').count() === 0);
    for (const {accountId} of seeded) {
        const acct = await db.collection('paperaccounts').findOne({_id: new ObjectId(accountId)});
        for (let d = 12; d >= 6; d -= 1) {
            await db.collection('accountsnapshots').insertOne(snapshotFor(accountId, d, acct.cash, 20_000));
        }
    }

    // --- leaderboard with a live record -----------------------------------------------
    await page.goto(`${BASE}/strategies`, {waitUntil: 'load'});
    await page.locator('[data-testid="strategy-leaderboard"]').waitFor({timeout: 30000});
    check('live sparklines draw for all eight once the record is long enough',
        await page.locator('svg[data-spark="live"]').count() === 8);
    const order = await page.$$eval('[data-testid="strategy-leaderboard"] [data-strategy]', (as) => as.map((a) => a.getAttribute('data-strategy')));
    check('eight strategies ranked by seeded live return', order.join(',') === [...CATALOG].reverse().map(([s]) => s).join(','), order.join(','));
    check('follow stars are not nested inside the row links', await page.locator('[data-testid="strategy-leaderboard"] a button').count() === 0);
    check('each row links to its detail page', await page.locator('[data-testid="strategy-leaderboard"] [data-strategy] a[href^="/strategies/"]').count() === 8);
    const board = await page.locator('[data-testid="strategy-leaderboard"]').innerText();
    // No Finnhub key in the harness: the SPY holding is valued at cost and the row says so.
    check('unpriced holdings are labelled on the ranking', /unpriced/.test(board));
    check('simulated column shows the seeded backtest', /\+11\.6%/.test(board));
    check('status strip shows the live-since date', (await page.locator('#strategies-status').innerText()).includes(launch));
    check('young-record note is shown', /under 30 days old/.test(await page.locator('main, body').first().innerText()));

    // Columns that carried nothing on every row are gone. Scoped to the ranking: the
    // detail page's analytics tiles legitimately still say "Max Drawdown".
    check('columns with no information are gone from the ranking',
        !/win rate|last action|max drawdown/i.test(board));
    check('simulated sparklines draw for all eight',
        await page.locator('[data-strategy] svg[data-spark="simulated"]').count() === 8);
    check('a sparkline names the basis it is drawn on',
        /simulated/i.test(await page.locator('svg[data-spark="simulated"]').first().getAttribute('aria-label') ?? ''));
    // Direct regression guard: the simulated cell used to render two stacked values and
    // clip the second ("-26.8" cut off mid-glyph).
    const clipped = await page.$$eval('[data-cell="simulated"]', (els) => els.filter((e) => e.scrollWidth > e.clientWidth + 1).length);
    check('the simulated cell does not clip its value', clipped === 0, `${clipped} clipped`);
    // Rows are hairline-separated list items, not cards inside a card. Computed style,
    // not a class name, so the check survives a refactor.
    const rounded = await page.$$eval('[data-strategy]', (els) => els.filter((e) => getComputedStyle(e).borderRadius !== '0px').length);
    check('ranking rows are not nested cards', rounded === 0, `${rounded} rounded rows`);
    const indexText = await page.locator('body').innerText();
    check('the disclaimer appears once on the ranking', (indexText.match(/not financial advice/gi) ?? []).length === 1);
    await shot('02-leaderboard');

    // --- detail page ---------------------------------------------------------------------
    await page.goto(`${BASE}/strategies/golden-cross`, {waitUntil: 'load'});
    await page.locator('#signal-board').waitFor({timeout: 30000});
    check('detail shows live since', (await page.locator('#strategy-meta').innerText()).includes(`live since ${launch}`));
    const signals = await page.locator('#signal-board').innerText();
    check('signal board renders the seeded row with its columns', /XLK/.test(signals) && /held/i.test(signals) && /205\.10|\$205\.10/.test(signals));
    const holdings = await page.locator('#strategy-holdings').innerText();
    check('holdings show the seeded SPY position', /SPY/.test(holdings));
    // The caveat is stated once, on the headline tiles it actually qualifies — not again
    // under the holdings table, which already prints "—" in the price cell.
    const pageText = await page.locator('body').innerText();
    check('the at-cost caveat is stated once, not on every panel',
        (pageText.match(/valued at cost/gi) ?? []).length === 1,
        String((pageText.match(/valued at cost/gi) ?? []).length));
    const decision = await page.locator('#strategy-decision').innerText();
    check('latest decision shows the filled order and its reason', /filled/.test(decision) && /seeded fill for golden-cross/.test(decision));
    const log = await page.locator('#strategy-trades').innerText();
    check('trade log carries the Strategy chip and the reason line', /strategy/i.test(log) && /seeded fill for golden-cross/.test(log));
    await page.locator('#perf-simulated').click();
    const sim = await page.locator('#strategy-performance').innerText();
    check('simulated tab is labelled and shows the seeded stats', /backtest, not live/i.test(sim) && /\+11\.60%/.test(sim) && /\+9\.10%/.test(sim));
    check('simulated trade log is present and labelled', /hypothetical/i.test(await page.locator('#strategy-simulated-trades').innerText()));

    // The editorial requirement, asserted: once a strategy has numbers, the chart is near
    // the top of the page instead of below ~800px of static explanation.
    const perfBox = await page.locator('#strategy-performance').boundingBox();
    check('numbers come before prose', perfBox !== null && perfBox.y < 900, `chart at y=${Math.round(perfBox?.y ?? -1)}`);
    const explainerEl = page.locator('#strategy-explainer');
    check('the explainer is a native disclosure',
        (await explainerEl.evaluate((el) => el.querySelector('details')?.tagName)) === 'DETAILS');
    check('the explainer is closed once there are numbers to read',
        !/cash floor/i.test(await explainerEl.innerText()));
    await explainerEl.locator('summary').click();
    check('the explainer opens on click with its copy intact',
        /cash floor/i.test(await explainerEl.innerText()) && /why it might work/i.test(await explainerEl.innerText()));
    const detailText = await page.locator('body').innerText();
    check('the disclaimer appears once on a detail page', (detailText.match(/not financial advice/gi) ?? []).length === 1);
    await shot('03-detail');


    // --- follow persists and drives the widget ------------------------------------------
    await page.locator('#strategy-follow').click();
    await page.getByText('Following — pinned on your dashboard widget').waitFor({timeout: 30000});
    await settleToasts();
    check('follow stored the slug', ((await prefsDoc())?.followedStrategies ?? []).includes('golden-cross'));
    await db.collection('userpreferences').updateOne({userId}, {$set: {dashboardLayout: {version: 1, widgets: [{id: 'quant-strategies', span: 6}]}}});
    await page.goto(`${BASE}/`, {waitUntil: 'load'});
    // While streaming, React keeps the resolved content in a hidden template next to the
    // fallback for a moment, so two matches can exist: wait for the visible one.
    await page.locator('[data-testid="quant-strategies-widget"]:visible').first().waitFor({timeout: 30000});
    const widgetOrder = await page.$$eval('[data-testid="quant-strategies-widget"]:visible a[data-strategy]', (as) => as.map((a) => a.getAttribute('data-strategy')));
    check('widget lists the followed strategy first', widgetOrder[0] === 'golden-cross' && widgetOrder.length === 5, widgetOrder.join(','));
    await shot('04-widget');

    await page.goto(`${BASE}/strategies/golden-cross`, {waitUntil: 'load'});
    await page.locator('#strategy-follow').waitFor({timeout: 30000});
    await page.locator('#strategy-follow').click();
    await page.getByText('Unfollowed').waitFor({timeout: 30000});
    await settleToasts();
    check('unfollowing the last strategy unsets the field', (await prefsDoc())?.followedStrategies === undefined);

    // --- the page that ran to five screens -----------------------------------------------
    await page.goto(`${BASE}/strategies/rsi2-mean-reversion`, {waitUntil: 'load'});
    await page.locator('#signal-board').waitFor({timeout: 30000});
    const visibleRows = await page.locator('#signal-board [data-signal-row]:visible').count();
    check('the signal board caps its visible rows', visibleRows <= 12, String(visibleRows));
    check('the rest of the board is behind a disclosure',
        await page.locator('#signal-board details').count() === 1);
    const height = await page.evaluate(() => document.body.scrollHeight);
    check('the detail page is not a scroll marathon', height < 2800, `${height}px`);
    await shot('05-rsi2');

} catch (err) {
    failures++;
    console.log(`FAIL  threw: ${err.message}`);
    await shot('99-error').catch(() => {});
} finally {
    await mongo.close().catch(() => {});
    await browser.close();
}

console.log(failures === 0 ? '\nAll strategies checks passed.' : `\n${failures} check(s) failed.`);
process.exit(failures === 0 ? 0 : 1);
