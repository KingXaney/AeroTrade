// The quant strategies (lib/strategies; /strategies, /stocks/[symbol]): the nav carries it, the leaderboard and detail pages render
// honestly with nothing seeded (the job never runs in this harness), then with a seeded
// system state they rank by the seeded live return, label unpriced holdings, show the
// explainer / signal board / trade reasons / simulated record, and follow persists. The
// what-if lab reads a seeded grid (golden cross: two knobs; 60/40: a slider), switches it
// without a request or a write, and says "computed overnight" where no grid is stored yet; the
// nightly job's own store (saveVariants, variantStamps, saveBacktest), loaded from the app's
// TypeScript through jiti, writes a grid only beside the build it was computed for, finds nothing
// due the next night, and re-queues it after a rebuild. The stock page shows each rule's newest run.
// A strategy's live fills download as CSV (this epoch only, signed-in users, known slugs only).
// Run: npm run qa -- strategies   (the harness: README.md)
import {chromium} from 'playwright';
import {MongoClient, ObjectId} from 'mongodb';
// A TypeScript loader (declared in scripts/qa/package.json), so the checks below
// can call the job's store functions as the job does, through Mongoose, on this harness database.
import {createJiti} from 'jiti';
import {BASE, MONGO, REPO_ROOT, check, outDir, signUp, summary} from './lib.mjs';

const OUT = outDir('strategies');

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
    const db = mongo.db();
    const email = await signUp(page, 'Strategies');
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
    check('the rail carries Strategies', await page.locator('aside.rail nav a[data-rail="strategies"][href="/strategies"]').count() === 1);
    // The bar (logo, search, account menu) must fit at 1024px, the narrowest width with the rail.
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
        const search = header.querySelector('button.search-text');
        if (!right || !search) return {ok: false, detail: 'no search/right group'};
        const r = right.getBoundingClientRect();
        const n = search.getBoundingClientRect();
        return {ok: n.right <= r.left && r.right <= window.innerWidth && header.scrollWidth <= window.innerWidth + 1, detail: `search right ${Math.round(n.right)}, controls left ${Math.round(r.left)}, header scroll ${header.scrollWidth}`};
    });
    check('header fits at 1024px', overflow.ok, overflow.detail);
    check('…with the strategies section lit on the rail',
        await narrow.locator('aside.rail nav a[aria-current="page"]').getAttribute('data-rail') === 'strategies');
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

    // --- the stock page in plain words, before any run ------------------------------------
    // No Finnhub key here. A symbol a strategy watches renders anyway: its key numbers say
    // honestly that the feed sent none, and "What the rules see" counts the four large-cap
    // rules without inventing a row. A symbol no strategy watches still 404s keyless.
    await page.goto(`${BASE}/stocks/NVDA`, {waitUntil: 'domcontentloaded'});
    await page.locator('#key-numbers').waitFor({timeout: 30000});
    check('keyless /stocks/NVDA renders the key numbers\' honest empty state',
        /No key numbers came back for NVDA/.test(await page.locator('#key-numbers').innerText())
        && await page.locator('#key-numbers [data-key-number], #key-numbers [data-what-these-mean]').count() === 0);
    const emptyRules = await page.locator('#rules-see').innerText();
    check('…and "What the rules see" names four watching rules and no row',
        /on the signal board of 4 rule-based strategies/.test(emptyRules) && /No stored board has a row for NVDA yet/.test(emptyRules)
        && await page.locator('#rules-see [data-rules-see-row], #rules-see [data-what-these-mean]').count() === 0, emptyRules.replace(/\s+/g, ' ').slice(0, 200));
    await page.goto(`${BASE}/stocks/ZZZ`, {waitUntil: 'domcontentloaded'});
    await page.getByText('Not found').first().waitFor({timeout: 30000}).catch(() => {});
    check('/stocks/ZZZ, in no strategy\'s universe, has no "What the rules see"', await page.locator('#rules-see').count() === 0);

    // --- seed a system state the way the job would leave it ---------------------------
    const today = isoDaysAgo(0);
    // The what-if lab's precomputed grid as the nightly job stores it: an ARRAY beside the
    // backtest, stamped with the backtest's version and build (variantsFor = its computedAt), on
    // the stored backtest's dates (30 points decimate to themselves). Golden cross has two knobs, 60/40 one (a slider); every other
    // rule has none stored yet, so its lab shows the "computed overnight" state.
    const WHATIF = {
        'golden-cross': [['fast', 20, 7.7], ['fast', 100, 14.4], ['slow', 100, 3.3], ['slow', 250, 9.9]],
        'sixty-forty': [['spyWeight', 0.4, 6.1], ['spyWeight', 0.5, 8.2], ['spyWeight', 0.7, 12.5], ['spyWeight', 0.8, 13.9]],
    };
    const builtAt = new Date();
    const variantsFor = (slug, points) => (WHATIF[slug] ? {
        variantsVersion: '1.1',
        variantsFor: builtAt,
        variants: WHATIF[slug].map(([knob, value, ret]) => ({
            id: `${knob}=${value}`, knob, value, from: points[0].date, to: points[points.length - 1].date,
            stats: {totalReturnPct: ret, cagrPct: ret / 3, annualizedVolPct: 11, maxDrawdownPct: 3, winRatePct: null, wins: 0, losses: 0, tradeCount: 4, benchmarkReturnPct: 10.0, excessReturnPct: ret - 10},
            closeFills: 0, skippedDays: 0,
            points: points.map((p, k) => ({date: p.date, value: 100_000 * (1 + (k / (points.length - 1)) * (ret / 100))})),
        })),
    } : {});
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
            computedAt: builtAt,
            ...variantsFor(slug, points),
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

    // --- the live trade log's CSV export ------------------------------------------------
    // A fill from before the account's inception: what a reset that re-anchored inceptionAt but
    // crashed before deleting the old epoch's trades leaves behind. Removed again right after.
    const goldenAccountId = seeded.find((x) => x.slug === 'golden-cross').accountId;
    const oldEpochFill = await db.collection('papertrades').insertOne({
        userId: OWNER, accountId: goldenAccountId, symbol: 'ZZOLD', company: 'Old Epoch Co', side: 'sell', quantity: 1, price: 100,
        total: 100, realizedPnl: -5, source: 'strategy', reason: 'exit: old epoch', createdAt: new Date(inception.getTime() - 24 * 60 * 60 * 1000),
    });
    const exportLink = page.locator('#strategy-trades a[data-testid="strategy-export"]');
    check('the live trade log offers its CSV export',
        await exportLink.count() === 1 && (await exportLink.getAttribute('href')) === '/api/strategies/golden-cross/export'
        && (await exportLink.getAttribute('download')) !== null && /Export CSV/.test(await exportLink.innerText()));
    const exported = await page.request.get(`${BASE}/api/strategies/golden-cross/export`);
    const disposition = exported.headers()['content-disposition'] ?? '';
    check('…a CSV named for the strategy and the day',
        exported.status() === 200 && /^text\/csv/.test(exported.headers()['content-type'] ?? '') && disposition.includes(`filename="golden-cross-trades-${today}.csv"`),
        `${exported.status()} ${disposition}`);
    const [csvHeader, ...csvRows] = (await exported.text()).trim().split('\n');
    check('…in the account export\'s columns', csvHeader === '"date","symbol","company","side","quantity","price","total","realized_pnl","source","reason"', csvHeader);
    check('…with the seeded fill, numbers bare and strings quoted',
        csvRows.length === 1 && /^"\d{4}-\d\d-\d\dT[^"]+Z","SPY","SPDR S&P 500","buy",40,500,20000,"","strategy","enter: seeded fill for golden-cross"$/.test(csvRows[0]),
        csvRows.join(' | '));
    check('…and no row from before the account\'s inception', !csvRows.some((r) => r.includes('ZZOLD')));
    await db.collection('papertrades').deleteOne({_id: oldEpochFill.insertedId});
    const unknownExport = await page.request.get(`${BASE}/api/strategies/no-such-rule/export`);
    check('an unknown strategy has no export', unknownExport.status() === 404, String(unknownExport.status()));
    const signedOut = await browser.newContext();
    const signedOutExport = await signedOut.request.get(`${BASE}/api/strategies/golden-cross/export`);
    check('a signed-out request is refused', signedOutExport.status() === 401 && !/SPY/.test(await signedOutExport.text()), String(signedOutExport.status()));
    await signedOut.close();
    // "Read this board" leads the board's one disclosure: the top row, read by the rule's narrator.
    const boardTerms = page.locator('#board-terms');
    check('the board\'s disclosure is titled by its top row', (await boardTerms.locator('summary').innerText()).includes('Read this board — XLK'));
    await boardTerms.locator('summary').click();
    const heldReading = await boardTerms.locator('[data-board-row-reading]').innerText();
    check('…and reads a held sector in its own averages', /already owns XLK/.test(heldReading) && /\$205\.10/.test(heldReading) && /Trend on reads yes/.test(heldReading),
        heldReading.replace(/\s+/g, ' ').slice(0, 200));
    await boardTerms.locator('summary').click();
    await page.locator('#perf-simulated').click();
    const sim = await page.locator('#strategy-performance').innerText();
    check('simulated tab is labelled and shows the seeded stats', /backtest, not live/i.test(sim) && /\+11\.60%/.test(sim) && /\+9\.10%/.test(sim));
    check('simulated trade log is present and labelled', /hypothetical/i.test(await page.locator('#strategy-simulated-trades').innerText()));
    // The seeded live reasons are not rule strings, so they get no empty disclosure; the
    // seeded simulated fill is one, and decodes by the rule that wrote it.
    check('an order whose reason the decoder does not know gets no disclosure',
        await page.locator('#latest-decision details[data-decoded]').count() === 0);
    await page.locator('#strategy-simulated-trades > details > summary').click();
    const simDecoded = page.locator('#simulated-trades details[data-decoded]');
    check('the simulated fill carries one "What the rule saw"', await simDecoded.count() === 1);
    await simDecoded.locator('summary').click();
    check('…reading its reason in plain words', /99% of the account into SPY, with a 1% cash floor/.test(await simDecoded.innerText()));
    await page.locator('#strategy-simulated-trades > details > summary').click();

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

    // --- what-if lab: the nightly grid beside the stored backtest --------------------------
    // Everything arrives with the page: switching settings sends no request and writes nothing.
    const lab = page.locator('#whatif-lab');
    const labStats = page.locator('#whatif-stats');
    const whatIfDiff = page.locator('#whatif-diff');
    const storedDoc = async () => JSON.stringify(await db.collection('strategybacktests').findOne({strategyId: 'golden-cross'}));
    const docBefore = await storedDoc();
    const tradesBefore = await db.collection('papertrades').countDocuments({});
    // Every document, fetch or XHR request — a server action, a router push's RSC fetch, a GET of
    // variant points — not only POSTs; the dev server's own endpoints and static chunks are not the page's.
    const posts = [];
    const onRequest = (req) => {
        if (!['document', 'fetch', 'xhr', 'eventsource'].includes(req.resourceType())) return;
        if (/\/(_next|__nextjs)[^/]*\//.test(new URL(req.url()).pathname)) return;
        posts.push(`${req.method()} ${req.url()}`);
    };
    page.on('request', onRequest);
    const simulatedBefore = await page.locator('#simulated-stats').innerText();
    await lab.scrollIntoViewIfNeeded();
    check('the what-if lab renders on a rule with knobs', await lab.count() === 1 && /what-if lab/i.test(await page.locator('#whatif-lab-heading').innerText()));
    check('…three positions per knob, the catalog value among them and pressed',
        (await lab.locator('[data-knob="fast"]').evaluateAll((els) => els.map((e) => e.getAttribute('data-value')))).join(',') === '20,50,100'
        && (await lab.locator('[data-knob="slow"]').evaluateAll((els) => els.map((e) => e.getAttribute('data-value')))).join(',') === '100,200,250'
        && await lab.locator('[data-knob="fast"][data-value="50"][aria-pressed="true"]').count() === 1
        && /50 \(catalog\)/.test(await lab.locator('[data-knob="fast"][data-value="50"]').innerText()));
    check('…starting at the catalog setting: the stored backtest\'s own numbers',
        (await whatIfDiff.innerText()) === 'Catalog setting' && /\+11\.60%/.test(await labStats.innerText())
        && await lab.locator('path[data-line="stored"]').count() === 1 && await lab.locator('path[data-line="whatif"]').count() === 0);
    await lab.locator('[data-knob="fast"][data-value="20"]').click();
    await page.waitForFunction(() => document.querySelector('#whatif-diff')?.getAttribute('data-variant') === 'fast=20');
    const fast20 = await labStats.innerText();
    check('a position switches the diff line and the what-if tiles',
        (await whatIfDiff.innerText()) === 'Fast average (days): 50 → 20' && /\+7\.70%/.test(fast20) && /-2\.30%/.test(fast20) && !/\+11\.60%/.test(fast20), fast20.replace(/\s+/g, ' ').slice(0, 120));
    // Checked while the setting is selected — the one state where a delta, a colour for "ahead"
    // or a leak into the stored backtest's own tiles could render.
    const colourCount = (selector) => page.locator(`${selector} .text-positive, ${selector} .text-negative`).count();
    check('…in tiles that carry no sign colour, while the stored backtest\'s own tiles keep theirs',
        await colourCount('#whatif-stats') === 0 && await colourCount('#simulated-stats') > 0);
    check('…and #simulated-stats is unchanged while a setting is selected, with no delta or ranking beside it',
        (await page.locator('#simulated-stats').innerText()) === simulatedBefore
        && await labStats.locator('.grid > div').count() === await page.locator('#simulated-stats .grid > div').count()
        && !/delta|difference|rank|better|best/i.test(await lab.innerText()));
    check('…and the chart draws the what-if beside the stored backtest',
        await lab.locator('path[data-line="whatif"]').count() === 1 && await lab.locator('path[data-line="stored"]').count() === 1
        && (await lab.locator('[data-line="whatif"] [data-line-value]').innerText()) === '$107,700.00'
        && /What-if/.test(await lab.locator('[data-testid="dollar-chart"]').innerText())
        && /Stored backtest \(catalog setting\)/.test(await lab.locator('[data-testid="dollar-chart"]').innerText()));
    await lab.locator('[data-knob="slow"][data-value="250"]').click();
    await page.waitForFunction(() => document.querySelector('#whatif-diff')?.getAttribute('data-variant') === 'slow=250');
    check('one setting moves at a time: the other knob returns to its catalog value',
        (await whatIfDiff.innerText()) === 'Slow average (days): 200 → 250' && /\+9\.90%/.test(await labStats.innerText())
        && await lab.locator('[data-knob="fast"][data-value="50"][aria-pressed="true"]').count() === 1
        && await lab.locator('[aria-pressed="true"]').count() === 2);
    check('…still without a sign colour, and #simulated-stats still unchanged',
        await colourCount('#whatif-stats') === 0 && (await page.locator('#simulated-stats').innerText()) === simulatedBefore);
    await lab.locator('[data-knob="slow"][data-value="200"]').click();
    await page.waitForFunction(() => document.querySelector('#whatif-diff')?.getAttribute('data-variant') === 'catalog');
    check('…and the catalog position is the stored backtest again', /\+11\.60%/.test(await labStats.innerText()) && await lab.locator('path[data-line="whatif"]').count() === 0);
    check('#simulated-stats is unchanged by the lab', (await page.locator('#simulated-stats').innerText()) === simulatedBefore);
    check('the what-if tiles are the simulated tiles, with no delta column or ranking',
        await labStats.locator('.grid > div').count() === await page.locator('#simulated-stats .grid > div').count()
        && !/delta|difference|rank|better|best/i.test(await lab.innerText()));
    check('the caveat is stated once', ((await page.locator('body').innerText()).match(/same three years, in hindsight/gi) ?? []).length === 1);
    check('the lab has one "What these mean", and "Ask in chat" only inside it',
        await lab.locator('[data-what-these-mean]').count() === 1 && await page.locator('#whatif-lab-panel [data-what-these-mean]').count() === 0
        && await lab.locator('[data-ask]').count() === await lab.locator('[data-what-these-mean] [data-ask]').count());
    check('no variant trades are shown', await lab.locator('table, [data-trade], details[data-decoded]').count() === 0);
    page.off('request', onRequest);
    check('switching settings sends no request at all to the server', posts.length === 0, posts.join(', '));
    check('…and persists nothing', (await storedDoc()) === docBefore && (await db.collection('papertrades').countDocuments({})) === tradesBefore);
    await shot('03b-whatif');

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
    // This board was seeded under golden-cross columns: RSI-2's narrator finds none of its
    // numbers and says so, rather than printing blanks.
    const rsiBoardTerms = page.locator('#board-terms');
    check('a board without the rule\'s numbers is still read from its top row', (await rsiBoardTerms.locator('summary').innerText()).includes('Read this board — SYM00'));
    await rsiBoardTerms.locator('summary').click();
    const fallbackReading = await rsiBoardTerms.locator('[data-board-row-reading]').innerText();
    check('…honestly, by its verdict alone', /does not have every number this rule reads for SYM00/.test(fallbackReading)
        && /verdict for SYM00 is held/.test(fallbackReading) && !/undefined|NaN|null/.test(fallbackReading), fallbackReading.replace(/\s+/g, ' ').slice(0, 200));

    // --- the what-if lab before its grid exists, on a one-knob rule, and on a rule with none --
    // RSI-2's backtest was seeded without variants: the lab says when they come, and nothing else.
    const pending = page.locator('#whatif-lab [data-testid="whatif-pending"]');
    check('a rule whose grid is not computed yet says so honestly', await pending.count() === 1 && /computed overnight/i.test(await pending.innerText())
        && await page.locator('#whatif-stats, #whatif-lab [data-testid="dollar-chart"], #whatif-lab button, #whatif-slider').count() === 0);
    await page.goto(`${BASE}/strategies/sixty-forty`, {waitUntil: 'load'});
    const slider = page.locator('#whatif-slider');
    await slider.waitFor({timeout: 30000});
    check('a one-knob rule gets a five-position slider, set on the catalog value',
        await slider.getAttribute('max') === '4' && await slider.inputValue() === '2'
        && (await page.locator('#whatif-controls [data-position]').allInnerTexts()).join(',') === '40%,50%,60% (catalog),70%,80%'
        && await page.locator('#whatif-lab button[data-knob]').count() === 0);
    await slider.fill('4');
    await page.waitForFunction(() => document.querySelector('#whatif-diff')?.getAttribute('data-variant') === 'spyWeight=0.8');
    check('…and moving it switches the diff line and the tiles',
        (await page.locator('#whatif-diff').innerText()) === 'SPY weight: 60% → 80%' && /\+13\.90%/.test(await page.locator('#whatif-stats').innerText()));
    await slider.fill('0');
    await page.waitForFunction(() => document.querySelector('#whatif-diff')?.getAttribute('data-variant') === 'spyWeight=0.4');
    check('…to either end', (await page.locator('#whatif-diff').innerText()) === 'SPY weight: 60% → 40%' && /\+6\.10%/.test(await page.locator('#whatif-stats').innerText()));
    await shot('06-whatif-slider');
    await page.goto(`${BASE}/strategies/buy-and-hold-spy`, {waitUntil: 'load'});
    await page.locator('#strategy-performance').waitFor({timeout: 30000});
    check('buy and hold has no knob, so no lab', await page.locator('#whatif-lab').count() === 0);

    // --- the what-if write path: the job's own store, through Mongoose on this database ----------
    // Donchian's backtest was seeded at build `builtAt` with no grid. The job computes a grid beside
    // the build variantStamps reported and saves it with saveVariants, whose filter must refuse an
    // earlier build or another version; the next night variantsDue finds nothing to do, and a
    // rebuilt backtest (saveBacktest) makes the grid due again and hides the old one on the page.
    const ROOT = REPO_ROOT;
    // Always the harness database the checks read, never a MONGODB_URI left in the shell.
    process.env.MONGODB_URI = MONGO;
    process.env.BETTER_AUTH_SECRET ??= 'local-qa-secret-at-least-32-characters-long';
    process.env.BETTER_AUTH_URL ??= BASE;
    const jiti = createJiti(import.meta.url, {alias: {'@': ROOT.replace(/\/$/, '')}, fsCache: false});
    const store = await jiti.import(`${ROOT}lib/strategies/store.ts`);
    const {variantsDue} = await jiti.import(`${ROOT}lib/strategies/job-helpers.ts`);
    const {gridFor} = await jiti.import(`${ROOT}lib/strategies/whatif.ts`);
    const {strategyBySlug} = await jiti.import(`${ROOT}lib/strategies/catalog.ts`);
    const GRID_SLUG = 'donchian-breakout';
    const gridIds = gridFor(strategyBySlug(GRID_SLUG)).map((v) => v.id);
    const backtestDoc = () => db.collection('strategybacktests').findOne({strategyId: GRID_SLUG});
    const seededBacktest = await backtestDoc();
    const build = seededBacktest.computedAt.getTime();
    const grid = gridFor(strategyBySlug(GRID_SLUG)).map((v, k) => ({
        id: v.id, knob: v.knob, value: v.value, from: seededBacktest.from, to: seededBacktest.to,
        stats: {...seededBacktest.stats, totalReturnPct: 5 + k}, closeFills: 0, skippedDays: 0,
        points: seededBacktest.points.map((p, i) => ({date: p.date, value: p.value * (1 + (k + 1) * i / 10_000)})),
    }));
    let stamp = (await store.variantStamps())[GRID_SLUG];
    check('variantStamps reads the stored build, and no grid for it yet: due tonight',
        stamp?.version === '1.1' && stamp.computedAt === build && stamp.variantsFor === null && stamp.variantIds === null
        && variantsDue(stamp, '1.1', gridIds) === true, JSON.stringify(stamp));
    check('saveVariants refuses a grid computed beside an earlier build of the same version',
        await store.saveVariants(GRID_SLUG, '1.1', build - 86_400_000, grid) === false && (await backtestDoc()).variants === undefined);
    check('…and one computed for another version', await store.saveVariants(GRID_SLUG, '1.0', build, grid) === false && (await backtestDoc()).variants === undefined);
    check('…and attaches one to the build it was computed beside', await store.saveVariants(GRID_SLUG, '1.1', build, grid) === true);
    const withGrid = await backtestDoc();
    check('…as an array stamped with that version and build, the backtest itself untouched',
        (withGrid.variants ?? []).map((v) => v.id).join(',') === gridIds.join(',') && withGrid.variantsVersion === '1.1'
        && withGrid.variantsFor?.getTime() === build && withGrid.computedAt.getTime() === build
        && JSON.stringify(withGrid.points) === JSON.stringify(seededBacktest.points) && JSON.stringify(withGrid.stats) === JSON.stringify(seededBacktest.stats),
        JSON.stringify({ids: (withGrid.variants ?? []).map((v) => v.id), version: withGrid.variantsVersion, for: withGrid.variantsFor}));
    stamp = (await store.variantStamps())[GRID_SLUG];
    check('the next night nothing is due: the stored grid is this build\'s, with the grid\'s ids',
        variantsDue(stamp, '1.1', gridIds) === false && stamp.variantsFor === build && stamp.variantIds.join(',') === gridIds.join(',')
        && variantsDue(stamp, '1.1', gridIds, true) === true, JSON.stringify(stamp));
    await page.goto(`${BASE}/strategies/${GRID_SLUG}`, {waitUntil: 'load'});
    const gridLab = page.locator('#whatif-lab');
    await gridLab.waitFor({timeout: 30000});
    check('the strategy page draws the grid the store wrote', await gridLab.locator('[data-testid="whatif-pending"]').count() === 0
        && (await gridLab.locator('[data-knob="entryChannel"]').evaluateAll((els) => els.map((e) => e.getAttribute('data-value')))).join(',') === '20,55,100');
    await gridLab.locator('[data-knob="entryChannel"][data-value="100"]').click();
    await page.waitForFunction(() => document.querySelector('#whatif-diff')?.getAttribute('data-variant') === 'entryChannel=100');
    check('…each setting with the numbers stored for it', /\+6\.00%/.test(await page.locator('#whatif-stats').innerText()));
    // A resimulate rebuilds the backtest on the same version: a new build, so the old grid is not its.
    {
        const {from, to, fillRule, closeFills, skippedDays, points, benchmark, trades, stats} = seededBacktest;
        await store.saveBacktest(GRID_SLUG, '1.1', {from, to, fillRule, closeFills, skippedDays, points, benchmark, trades, stats});
    }
    stamp = (await store.variantStamps())[GRID_SLUG];
    check('a backtest rebuilt on the same version makes its grid due again',
        stamp.computedAt > build && stamp.variantsFor === build && variantsDue(stamp, '1.1', gridIds) === true, JSON.stringify(stamp));
    await page.goto(`${BASE}/strategies/${GRID_SLUG}`, {waitUntil: 'load'});
    await gridLab.waitFor({timeout: 30000});
    check('…and the page hides the old grid until then', await gridLab.locator('[data-testid="whatif-pending"]').count() === 1
        && await page.locator('#whatif-stats').count() === 0);

    // --- the stock page: what the rules see, from seeded boards ---------------------------------
    // RSI-2's board gains an NVDA row in its own columns and 12-1 momentum's a held one on the
    // same close: each row keeps its numbers and verdict, the shared close and run dates are
    // stated once, and the two large-cap rules with no NVDA row are named once.
    await db.collection('strategyruns').updateOne({strategyId: 'rsi2-mean-reversion', date: today},
        {$push: {board: {symbol: 'NVDA', state: 'enter', values: {close: 181.25, rsi2: 4.2, sma5: 186.4, sma200: 150.3, aboveSma200: true}}}});
    await db.collection('strategyruns').updateOne({strategyId: 'momentum-12-1', date: today},
        {$push: {board: {symbol: 'NVDA', state: 'held', values: {close: 181.25, momentum: 0.842, rank: 2}}}});
    // An older RSI-2 run with another NVDA row: the page must read each rule's newest run, not its first.
    const olderRun = await db.collection('strategyruns').insertOne({
        strategyId: 'rsi2-mean-reversion', date: isoDaysAgo(3), asOf: isoDaysAgo(4), mode: 'live', status: 'done', staleCount: 0, universeSize: 40,
        rebalanceTriggered: false, orders: [], skippedOrders: [], dataIssues: [], equity: 100_000, summary: 'older run', createdAt: new Date(),
        board: [{symbol: 'NVDA', state: 'exit', values: {close: 150.5, rsi2: 91.1, sma5: 149.2, sma200: 140.7, aboveSma200: true}}],
    });
    await page.goto(`${BASE}/stocks/NVDA`, {waitUntil: 'domcontentloaded'});
    const rulesSee = page.locator('#rules-see');
    await rulesSee.locator('[data-rules-see-row]').first().waitFor({timeout: 30000});
    const rsiRow = rulesSee.locator('[data-rules-see-row="rsi2-mean-reversion"]');
    const rsiText = await rsiRow.innerText();
    check('a seeded RSI-2 run lists NVDA under "What the rules see" with its verdict and values',
        /RSI-2 Mean Reversion/.test(rsiText) && /^enter$/i.test((await rsiRow.locator('[data-rules-see-verdict]').innerText()).trim())
        && /RSI\(2\)\s*4\.2/i.test(rsiText) && /\$186\.40/.test(rsiText) && /\$150\.30/.test(rsiText) && /yes/.test(rsiText),
        rsiText.replace(/\s+/g, ' '));
    check('…from its newest run, not the older one stored beside it',
        !/91\.1|\$149\.20|\$140\.70|150\.5/.test(rsiText) && !/^exit$/i.test((await rsiRow.locator('[data-rules-see-verdict]').innerText()).trim()));
    check('…linking to the strategy', await rsiRow.locator('a[href="/strategies/rsi2-mean-reversion"]').count() === 1);
    const momentumRow = rulesSee.locator('[data-rules-see-row="momentum-12-1"]');
    const momentumText = await momentumRow.innerText();
    check('…beside 12-1 momentum\'s held row',
        /^held$/i.test((await momentumRow.locator('[data-rules-see-verdict]').innerText()).trim()) && /\+84\.2%/.test(momentumText) && /#2/.test(momentumText),
        momentumText.replace(/\s+/g, ' '));
    const rulesText = await rulesSee.innerText();
    check('the shared close and run dates are stated once for the panel, not per row',
        (rulesText.match(/\$181\.25/g) ?? []).length === 1 && !/181\.25/.test(rsiText + momentumText)
        && (rulesText.match(/decided for/g) ?? []).length === 1 && rulesText.includes(`As of the ${isoDaysAgo(1)} close · decided for ${today}`),
        rulesText.replace(/\s+/g, ' ').slice(0, 300));
    check('the large-cap rules with no NVDA row are named once',
        rulesText.includes('No stored board row for NVDA from Donchian 55/20 Breakout or Low Volatility Top 10.')
        && await rulesSee.locator('[data-rules-see-row]').count() === 2);
    const rowsReading = rulesSee.locator('[data-what-these-mean]');
    check('the panel has one disclosure, led by reading its rows',
        await rowsReading.count() === 1 && (await rowsReading.locator('summary').innerText()).includes('Read these rows — NVDA'));
    await rowsReading.locator('summary').click();
    const readingText = await rowsReading.innerText();
    check('…which reads each row by its own rule, then defines the columns shown',
        /2-day RSI reads 4\.2, under the entry level of 10/.test(readingText) && /so the verdict is enter/.test(readingText)
        && /That ranks #2, where #1 is the strongest\./.test(readingText) && /RSI\(2\)/.test(readingText) && /Last close/i.test(readingText),
        readingText.replace(/\s+/g, ' ').slice(0, 300));
    check('"Ask in chat" appears only inside that disclosure',
        await rulesSee.locator('[data-ask]').count() > 0 && await rulesSee.locator('[data-ask]').count() === await rowsReading.locator('[data-ask]').count());
    check('the page still states no key numbers keyless', await page.locator('#key-numbers [data-key-number]').count() === 0);
    await db.collection('strategyruns').deleteOne({_id: olderRun.insertedId});
    await shot('07-stock-rules-see');
    await page.goto(`${BASE}/stocks/SPY`, {waitUntil: 'domcontentloaded'});
    await page.locator('#rules-see').waitFor({timeout: 30000});
    const spyRules = await page.locator('#rules-see').innerText();
    check('/stocks/SPY counts the three rules that hold or weigh SPY',
        /on the signal board of 3 rule-based strategies/.test(spyRules) && /No stored board has a row for SPY yet/.test(spyRules),
        spyRules.replace(/\s+/g, ' ').slice(0, 200));

} catch (err) {
    check(`threw: ${err.message}`, false);
    await shot('99-error').catch(() => {});
} finally {
    await mongo.close().catch(() => {});
    await browser.close();
}

summary('strategies');
