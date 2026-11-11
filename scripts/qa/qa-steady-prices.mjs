// Steady prices (lib/prices/quote-store.ts, the quote sheet) and the account switch
// (components/trading/accounts, POST /api/accounts/active): every page reads a symbol's price
// from one stored row, so swapping accounts changes no number and asks Finnhub nothing; a row is
// kept for the clock minute it was fetched in and the next, then refreshed behind the answer when
// it is recent; a refusal never moves a holding to an older price; a fill writes its price through. And the switch itself: one request
// that renders nothing, one page request, the row picked and the heading at the click, the
// account's panels busy until the page arrives, focus kept.
//
// The harness's Finnhub stand-in (start-finnhub-stub.mjs) is given prices that step up by one on
// every call for a symbol, so a figure that moved on screen proves a second call was made. The
// app runs with QUOTE_SESSION=open: the sheet's window is the clock minute at any hour.
// Run: npm run qa -- steady-prices   (the harness: README.md)
import {chromium} from 'playwright';
import {MongoClient} from 'mongodb';
import {createJiti} from 'jiti';
import {BASE, MONGO, REPO_ROOT, check, outDir, signUp, summary} from './lib.mjs';

const OUT = outDir('steady-prices');
const STUB = `http://localhost:${process.env.QA_FINNHUB_PORT ?? 8791}`;
const stub = async (path) => (await fetch(`${STUB}${path}`)).json();

// Symbols nobody else uses. QSPE is one the stand-in does not know: a holding Finnhub never prices.
const PRICES = {QSPA: 110, QSPB: 210, QSPC: 55, QSPD: 30, SPY: 600};
const QUOTED = Object.keys(PRICES);
const UNKNOWN = 'QSPE';
const ALL = [...QUOTED, UNKNOWN];

const browser = await chromium.launch({channel: 'chrome'});
const context = await browser.newContext({viewport: {width: 1440, height: 900}});
const page = await context.newPage();
const shot = (n, target = page) => target.screenshot({path: `${OUT}${n}.png`, fullPage: true});
const mongo = new MongoClient(MONGO);
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const money = (n) => n.toLocaleString('en-US', {style: 'currency', currency: 'USD'});

// The page as a reader sees it: the heading, the line under it, each comparison row's value
// and each holding's price.
const read = () => page.evaluate(() => {
    const text = (el) => (el?.textContent ?? '').replace(/\s+/g, ' ').trim();
    const rows = {};
    for (const row of document.querySelectorAll('[data-account-row]')) {
        const cells = [...row.children].map(text);
        rows[row.getAttribute('data-account-row')] = {name: cells[0].replace(/^\d+\s*/, ''), value: cells[1].replace(/^Value\s*/, ''), ret: cells[2].replace(/^Total Return\s*/, '')};
    }
    const holdings = {};
    for (const link of document.querySelectorAll('.account-region a[href^="/stocks/"]')) {
        const row = link.closest('.row-card');
        if (!row || row.children.length < 5) continue;
        holdings[text(link)] = text(row.children[3]).replace(/^Price\s*/, '');
    }
    return {
        heading: text(document.querySelector('[data-account-heading]')),
        headingId: document.querySelector('[data-account-heading]')?.getAttribute('data-account-heading') ?? null,
        basis: document.querySelector('[data-account-basis]') ? text(document.querySelector('[data-account-basis]')) : null,
        current: document.querySelector('[data-account-row][aria-current="true"]')?.getAttribute('data-account-row') ?? null,
        rows,
        holdings,
        closes: document.querySelectorAll('[data-price-close]').length,
    };
});

// Records what the switch shows from the click on: one line per change of the heading, the
// "Opening …" line, the busy panels, the selected row and the focus.
const startRecorder = () => page.evaluate(() => {
    const sample = () => JSON.stringify({
        heading: document.querySelector('[data-account-heading]')?.getAttribute('data-account-heading') ?? null,
        opening: !!document.querySelector('[data-account-opening]'),
        busy: document.querySelectorAll('.account-region[aria-busy="true"]').length,
        inert: document.querySelectorAll('.account-region[inert]').length,
        current: document.querySelector('[data-account-row][aria-current="true"]')?.getAttribute('data-account-row') ?? null,
        focus: document.activeElement?.getAttribute?.('data-account-row') ?? document.activeElement?.tagName ?? null,
    });
    window.__switchLog = [sample()];
    window.__switchObserver?.disconnect();
    window.__switchObserver = new MutationObserver(() => {
        const now = sample();
        if (window.__switchLog.at(-1) !== now) window.__switchLog.push(now);
    });
    window.__switchObserver.observe(document.body, {subtree: true, childList: true, attributes: true, characterData: true});
});
const recorded = async () => (await page.evaluate(() => window.__switchLog ?? [])).map((line) => JSON.parse(line));

// The requests one switch made: the cookie write, and the page requests that followed it.
const watchRequests = () => {
    // `pages`: requests for the page's server payload, prefetches aside. `renders`: those that
    // ask the server to render something — the router marks the segment "refetch"; a request
    // that marks none (the router asks for a route's tree before it navigates) renders nothing.
    const seen = {writes: 0, pages: 0, renders: 0, actions: 0};
    const listener = (request) => {
        const url = new URL(request.url());
        const headers = request.headers();
        if (url.pathname === '/api/accounts/active') seen.writes += 1;
        else if (request.method() === 'POST' && headers['next-action']) seen.actions += 1;
        else if (request.method() === 'GET' && url.searchParams.has('_rsc') && ['/portfolio', '/trade'].includes(url.pathname) && !headers['next-router-prefetch']) {
            seen.pages += 1;
            if (decodeURIComponent(headers['next-router-state-tree'] ?? '').includes('"refetch"')) seen.renders += 1;
        }
    };
    page.on('request', listener);
    return {seen, stop: () => page.off('request', listener)};
};

const quotesAsked = async () => (await stub('/__stats')).quotes;
const askedSince = (before, after) => Object.fromEntries(ALL.map((s) => [s, (after[s] ?? 0) - (before[s] ?? 0)]).filter(([, n]) => n !== 0));

// The app's own market clock (pure), for what the header line may say at this hour: the sheet
// runs "in session" here (QUOTE_SESSION=open), but the words follow the real NYSE session.
const jiti = createJiti(import.meta.url, {alias: {'@': REPO_ROOT.replace(/\/$/, '')}, fsCache: false});
const {lastSessionClose, marketStatus, previousTradingDay} = await jiti.import(`${REPO_ROOT}lib/prices/market-hours.ts`);
const etTime = (at) => `${new Intl.DateTimeFormat('en-US', {timeZone: 'America/New_York', hour: 'numeric', minute: '2-digit'}).format(at)} ET`;
const etDay = (at) => new Date(at).toLocaleDateString('en-CA', {timeZone: 'America/New_York'});
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const shortDay = (date) => `${MONTHS[Number(date.slice(5, 7)) - 1]} ${Number(date.slice(8, 10))}`;
// What the line says of holdings on a quote whose oldest was fetched at `oldestAt`: its time —
// or, with the market closed and the quote fetched after the bell, the last close (and nothing
// at all beside holdings at cost or at a stored close).
const quotedWords = (oldestAt, beside = false) => {
    const now = new Date();
    if (marketStatus(now).state !== 'open' && new Date(oldestAt).getTime() >= lastSessionClose(now)) return beside ? null : 'valued at last close';
    return `${beside ? 'others' : 'prices'} as of ${etTime(oldestAt)}`;
};
const line = (holdings, ...parts) => [`${holdings} holdings`, ...parts.filter(Boolean)].join(' · ');
const startedAt = new Date();
let userId = null;

let db = null;
try {
    await mongo.connect();
    db = mongo.db();
    const quotes = db.collection('pricequotes');
    const cleanSheet = async () => {
        await quotes.deleteMany({symbol: {$in: ALL}});
        await db.collection('ratelimits').deleteMany({key: /^finnhub:quotes:/});
    };
    await cleanSheet();
    await stub('/__reset');
    await stub(`/__prices?${QUOTED.map((s) => `${s}=${PRICES[s]}`).join('&')}&step=1`);
    await stub('/__mode?set=prices');

    const email = await signUp(page, 'Steady');
    const user = await db.collection('user').findOne({email});
    userId = String(user._id);
    const accounts = db.collection('paperaccounts');
    await page.goto(`${BASE}/portfolio`, {waitUntil: 'load'});   // the first render makes the first account
    const main = await accounts.findOne({userId});
    const position = (symbol, quantity, avgCost) => ({symbol, company: `${symbol} Corp`, quantity, avgCost});
    await accounts.updateOne({_id: main._id}, {$set: {cash: 90_000, positions: [position('QSPA', 10, 100), position('QSPB', 5, 200)]}});
    const second$ = await accounts.insertOne({userId, name: 'Second', cash: 95_000, startingBalance: 100_000, inceptionAt: new Date(), positions: [position('QSPB', 2, 200), position('QSPC', 20, 50)], createdAt: new Date(), updatedAt: new Date()});
    const third$ = await accounts.insertOne({userId, name: 'Third', cash: 99_000, startingBalance: 100_000, inceptionAt: new Date(), positions: [position('QSPD', 4, 25), position(UNKNOWN, 1, 400)], createdAt: new Date(), updatedAt: new Date()});
    const ids = {main: String(main._id), second: String(second$.insertedId), third: String(third$.insertedId)};
    const row = (id) => page.locator(`[data-account-row="${id}"]`);
    const settled = (id) => page.waitForFunction((want) => {
        const heading = document.querySelector('[data-account-heading]');
        return heading?.getAttribute('data-account-heading') === want && !document.querySelector('[data-account-opening]')
            && document.querySelectorAll('.account-region[aria-busy="true"]').length === 0
            && document.querySelector('[data-account-row][aria-current="true"]')?.getAttribute('data-account-row') === want;
    }, id, {timeout: 30000});

    // --- a first load asks each symbol once ---------------------------------------------------
    const beforeLoad = await quotesAsked();
    await page.goto(`${BASE}/portfolio`, {waitUntil: 'load'});
    await page.getByText('Holdings', {exact: true}).waitFor({timeout: 30000});
    const first = await read();
    const afterLoad = await quotesAsked();
    const loadAsked = askedSince(beforeLoad, afterLoad);
    check('a first load asks Finnhub for each held symbol once — the layout, the page and its second price map share one read',
        ['QSPA', 'QSPB', 'QSPC', 'QSPD', UNKNOWN].every((s) => loadAsked[s] === 1) && (loadAsked.SPY ?? 0) <= 1, JSON.stringify(loadAsked));
    check('the page shows the prices it was given', first.holdings.QSPA === money(PRICES.QSPA) && first.holdings.QSPB === money(PRICES.QSPB), JSON.stringify(first.holdings));
    const worth = {
        main: 90_000 + 10 * PRICES.QSPA + 5 * PRICES.QSPB,
        second: 95_000 + 2 * PRICES.QSPB + 20 * PRICES.QSPC,
        third: 99_000 + 4 * PRICES.QSPD + 400,     // the unknown symbol stands at cost
    };
    check('every account is valued from the same prices', first.rows[ids.main]?.value === money(worth.main)
        && first.rows[ids.second]?.value === money(worth.second) && first.rows[ids.third]?.value === money(worth.third), JSON.stringify(first.rows));
    const oldestOf = async (symbols) => Math.min(...(await quotes.find({symbol: {$in: symbols}}).toArray()).map((r) => new Date(r.fetchedAt).getTime()));
    check('the line under the name says what the prices are as of, never "live"',
        first.basis === line(2, quotedWords(await oldestOf(['QSPA', 'QSPB']))) && !/live/.test(first.basis ?? ''), first.basis ?? '');
    check('the active account\'s row is the current one', first.current === ids.main && first.headingId === ids.main);
    const sheet = await quotes.find({symbol: {$in: ALL}}).toArray();
    check('the sheet holds one row a symbol, and a symbol Finnhub does not know has a row with no price',
        sheet.length === ALL.length && sheet.find((r) => r.symbol === UNKNOWN)?.price === undefined && !!sheet.find((r) => r.symbol === UNKNOWN)?.refusedAt
        && sheet.find((r) => r.symbol === 'QSPA')?.price === PRICES.QSPA, sheet.map((r) => `${r.symbol}:${r.price ?? '—'}`).join(' '));
    await shot('01-first-load');

    // --- switching accounts changes no number and asks Finnhub nothing ---------------------------
    // One warm switch first: the dev server compiles the route on its first use.
    await row(ids.second).click();
    await settled(ids.second);
    await row(ids.main).click();
    await settled(ids.main);

    // On prices fetched a moment ago: a row is kept for its clock minute and the next, so the
    // six switches below cannot outlast it. (Rows made ten minutes old are fetched before the
    // page answers; that path has its own checks further down.)
    await quotes.updateMany({symbol: {$in: QUOTED}}, {$set: {fetchedAt: new Date(Date.now() - 10 * 60_000)}});
    await row(ids.second).click();
    await settled(ids.second);
    await row(ids.main).click();
    await settled(ids.main);
    const fetchedBefore = await quotes.find({symbol: {$in: QUOTED}}).toArray();
    const base = await read();
    const beforeSwitches = await quotesAsked();
    const order = [ids.second, ids.third, ids.main, ids.third, ids.second, ids.main];
    const seenRows = [];
    const perSwitch = [];
    let timeline = [];
    for (const [i, target] of order.entries()) {
        const requests = watchRequests();
        if (i === 0) await startRecorder();
        await row(target).click();
        await settled(target);
        await sleep(150);
        requests.stop();
        if (i === 0) timeline = await recorded();
        perSwitch.push(requests.seen);
        seenRows.push(await read());
    }
    const switchAsked = askedSince(beforeSwitches, await quotesAsked());
    const fetchedAfter = await quotes.find({symbol: {$in: QUOTED}}).toArray();
    check('six switches ask Finnhub for nothing, and the sheet\'s rows are the ones they started on',
        Object.keys(switchAsked).length === 0
        && fetchedBefore.every((before) => String(fetchedAfter.find((r) => r.symbol === before.symbol)?.fetchedAt) === String(before.fetchedAt)), JSON.stringify(switchAsked));
    check('no account\'s value or return changes across the switches',
        seenRows.every((seen) => Object.keys(base.rows).every((id) => seen.rows[id]?.value === base.rows[id].value && seen.rows[id]?.ret === base.rows[id].ret)),
        seenRows.map((seen) => Object.values(seen.rows).map((r) => r.value).join('/')).join(' | '));
    const mainViews = seenRows.filter((seen) => seen.headingId === ids.main);
    check('an account shown twice shows the same prices and the same line', mainViews.length === 2
        && mainViews.every((seen) => JSON.stringify(seen.holdings) === JSON.stringify(base.holdings) && seen.basis === base.basis),
        mainViews.map((seen) => `${seen.basis} ${JSON.stringify(seen.holdings)}`).join(' | '));
    check('each switch is one request that renders nothing and one page request — no server action',
        perSwitch.every((seen) => seen.writes === 1 && seen.pages === 1 && seen.actions === 0), JSON.stringify(perSwitch));

    // What the first of them showed, change by change.
    const atClick = timeline[1] ?? {};
    check('at the click the row picked is the current one and the heading names it, before the page arrives',
        atClick.current === ids.second && atClick.heading === ids.second && atClick.opening === true, JSON.stringify(timeline.slice(0, 3)));
    check('the old account\'s panels are busy and out of reach until the page arrives', timeline.some((t) => t.busy >= 2 && t.inert >= 2 && t.opening));
    const last = timeline.at(-1) ?? {};
    check('the page arrives once: nothing flips back to the old account on the way',
        last.heading === ids.second && last.current === ids.second && last.opening === false && last.busy === 0
        && timeline.slice(1).every((t) => t.heading === ids.second && t.current === ids.second), JSON.stringify(timeline));
    check('focus stays on the row that was clicked', timeline.slice(1).every((t) => t.focus === ids.second), timeline.map((t) => t.focus).join(' → '));
    await shot('02-after-switches');

    // --- the header's menu switches the same way, by keyboard --------------------------------
    const trigger = page.locator('[data-account-switcher]');
    await trigger.focus();
    await page.keyboard.press('Enter');
    const items = page.getByRole('menuitemradio');
    await items.first().waitFor({timeout: 5000});
    check('the menu lists the accounts as radio items, the one shown checked',
        await items.count() === 3 && await page.getByRole('menuitemradio', {checked: true}).count() === 1
        && /Main account/.test(await page.getByRole('menuitemradio', {checked: true}).innerText()));
    const menuRequests = watchRequests();
    await page.getByRole('menuitemradio', {name: /Third/}).click();
    await settled(ids.third);
    menuRequests.stop();
    const fromMenu = await read();
    check('a pick from the menu opens that account with one write and one page request',
        fromMenu.headingId === ids.third && menuRequests.seen.writes === 1 && menuRequests.seen.pages === 1, JSON.stringify(menuRequests.seen));
    check('the trigger names the account shown', /Third/.test(await trigger.innerText()));
    check('an account with a holding Finnhub does not price says so once, and what the others are as of',
        fromMenu.basis === line(2, '1 of 2 valued at cost', quotedWords(await oldestOf(['QSPD']), true)), fromMenu.basis ?? '');
    // By keyboard, on a comparison row: Enter on the focused row, and the focus is still there after.
    await row(ids.main).focus();
    await page.keyboard.press('Enter');
    await settled(ids.main);
    check('Enter on a focused row switches, and the focus stays on it',
        await page.evaluate(() => document.activeElement?.getAttribute('data-account-row')) === ids.main);

    // --- a price past its window but recent is served as it is, and refreshed behind the answer --
    // 130 s old is always out of the window (this clock minute and the one before) and well inside
    // what may be served while it is refreshed (five minutes).
    const backdate = async (ms, symbols = QUOTED) => {
        const at = new Date(Date.now() - ms);
        await quotes.updateMany({symbol: {$in: symbols}}, {$set: {fetchedAt: at}, $unset: {refusedAt: '', claimedUntil: '', claimedBy: ''}});
        return at;
    };
    const sheetPrices = async () => Object.fromEntries((await quotes.find({symbol: {$in: QUOTED}}).toArray()).map((r) => [r.symbol, r.price]));
    const pricesBefore = await sheetPrices();
    const shownBefore = await read();
    const staleAt = await backdate(130_000);
    const beforeRecent = await quotesAsked();
    await row(ids.second).click();
    await settled(ids.second);
    const served = await read();
    check('a page whose prices are two minutes old shows them as they are — it does not wait for Finnhub',
        Object.keys(shownBefore.rows).every((id) => served.rows[id]?.value === shownBefore.rows[id].value)
        && served.holdings.QSPB === money(pricesBefore.QSPB) && served.holdings.QSPC === money(pricesBefore.QSPC), JSON.stringify(served.holdings));
    check('…and says the time they are as of', served.basis === line(2, quotedWords(staleAt)), served.basis ?? '');
    let refreshed = {};
    for (let i = 0; i < 40; i += 1) {
        refreshed = askedSince(beforeRecent, await quotesAsked());
        if (QUOTED.filter((symbol) => symbol !== 'SPY').every((symbol) => refreshed[symbol] === 1) && (await sheetPrices()).QSPA !== pricesBefore.QSPA) break;
        await sleep(250);
    }
    const pricesAfter = await sheetPrices();
    check('…while each of its symbols is asked once, behind the answer',
        ['QSPA', 'QSPB', 'QSPC', 'QSPD'].every((symbol) => refreshed[symbol] === 1 && pricesAfter[symbol] === pricesBefore[symbol] + 1), `${JSON.stringify(refreshed)} ${JSON.stringify(pricesAfter)}`);
    const beforeNext = await quotesAsked();
    await row(ids.main).click();
    await settled(ids.main);
    const next = await read();
    check('the next page shows the new prices, with a later "as of", and asks nothing more',
        next.holdings.QSPA === money(pricesAfter.QSPA) && next.holdings.QSPB === money(pricesAfter.QSPB)
        && next.basis === line(2, quotedWords(await oldestOf(['QSPA', 'QSPB'])))
        && Object.keys(askedSince(beforeNext, await quotesAsked())).filter((symbol) => symbol !== UNKNOWN).length === 0,
        `${next.basis} ${JSON.stringify(next.holdings)}`);

    // --- a price too old to serve is refreshed before the page answers -------------------------
    await backdate(10 * 60_000);
    const beforeCold = await quotesAsked();
    await row(ids.second).click();
    await settled(ids.second);
    const cold = await read();
    const pricesCold = await sheetPrices();
    const coldAsked = askedSince(beforeCold, await quotesAsked());
    check('prices ten minutes old are fetched before the page answers: it arrives with the new ones',
        ['QSPA', 'QSPB', 'QSPC', 'QSPD'].every((symbol) => coldAsked[symbol] === 1 && pricesCold[symbol] === pricesAfter[symbol] + 1)
        && cold.holdings.QSPB === money(pricesCold.QSPB) && cold.holdings.QSPC === money(pricesCold.QSPC), `${JSON.stringify(coldAsked)} ${JSON.stringify(cold.holdings)}`);

    // --- a refusal changes no number and never moves a holding to an older price ----------------
    // A stored close from the session before the last one: whatever the hour, a quote fetched in
    // the last few minutes is the newer price, and one fetched six days ago the older.
    const barDay = previousTradingDay(etDay(lastSessionClose(new Date())));
    await db.collection('pricebars').insertOne({symbol: 'QSPB', date: barDay, close: 77, source: 'yahoo'});
    await stub('/__mode?set=refuse');
    const refusedAt = await backdate(10 * 60_000);
    const limitsBefore = await db.collection('limitevents').countDocuments({provider: 'finnhub'});
    const beforeRefusal = await stub('/__stats');
    await row(ids.main).click();
    await settled(ids.main);
    const refused = await read();
    const afterRefusal = await stub('/__stats');
    check('with Finnhub refusing, the page was asked for and Finnhub said no', afterRefusal.refused > beforeRefusal.refused, `${beforeRefusal.refused} → ${afterRefusal.refused}`);
    check('…no account\'s value changes', Object.keys(cold.rows).every((id) => refused.rows[id]?.value === cold.rows[id].value), JSON.stringify(refused.rows));
    check('…no holding moves to the stored close: a quote fetched after that close is the newer price',
        refused.closes === 0 && refused.holdings.QSPA === money(pricesCold.QSPA) && refused.holdings.QSPB === money(pricesCold.QSPB), JSON.stringify(refused.holdings));
    check('…and the line says how old the prices are', refused.basis === line(2, quotedWords(refusedAt)), refused.basis ?? '');
    // Five calls were refused; the page made two reads of the sheet (every account's holdings,
    // then the benchmark), so at most two refusals are filed — never one a symbol.
    const filed = (await db.collection('limitevents').countDocuments({provider: 'finnhub'})) - limitsBefore;
    check('the refusal is filed once a refresh, not once a symbol', filed >= 1 && filed <= 2 && afterRefusal.refused - beforeRefusal.refused >= 4, `${filed} filed for ${afterRefusal.refused - beforeRefusal.refused} refused calls`);
    const refusedRows = await quotes.find({symbol: {$in: ['QSPA', 'QSPB']}}).toArray();
    check('the sheet keeps the price and notes the refusal', refusedRows.every((r) => r.price === pricesCold[r.symbol] && r.refusedAt instanceof Date && !r.claimedUntil), JSON.stringify(refusedRows.map((r) => [r.symbol, r.price, !!r.refusedAt])));
    const beforeBackoff = await quotesAsked();
    await row(ids.second).click();
    await settled(ids.second);
    check('a refused symbol is left alone for a minute: the next page asks nothing',
        Object.keys(askedSince(beforeBackoff, await quotesAsked())).length === 0, JSON.stringify(askedSince(beforeBackoff, await quotesAsked())));

    // A quote from before that close, never refreshed since: now the stored close is the newer price.
    await quotes.updateOne({symbol: 'QSPB'}, {$set: {fetchedAt: new Date(Date.now() - 6.5 * 86_400_000)}});
    await row(ids.main).click();
    await settled(ids.main);
    const atClose = await read();
    check('a quote older than a stored close gives way to that close, dated once in the line and on the cell',
        atClose.closes === 1 && atClose.holdings.QSPB === money(77)
        && atClose.basis === line(2, `1 of 2 at the ${shortDay(barDay)} close`, quotedWords(refusedAt, true)), `${atClose.basis} ${JSON.stringify(atClose.holdings)}`);
    await shot('03-refused-and-close');
    await db.collection('pricebars').deleteMany({symbol: 'QSPB'});
    await stub('/__mode?set=prices');
    await backdate(10 * 60_000);

    // --- a deep link's ?account= goes with the switch, and the page does not jump -----------------
    await page.goto(`${BASE}/portfolio?account=${ids.third}`, {waitUntil: 'load'});
    await settled(ids.third);
    await row(ids.second).waitFor({state: 'visible'});
    await sleep(400);
    await page.evaluate(() => {
        window.scrollTo(0, 260);
        // What Next's router does when it scrolls for a navigation: it sets the document's
        // scrollTop or calls scrollIntoView. The browser's own scroll anchoring does neither.
        window.__routerScrolls = [];
        const own = Object.getOwnPropertyDescriptor(Element.prototype, 'scrollTop');
        Object.defineProperty(document.documentElement, 'scrollTop', {
            configurable: true,
            get() { return own.get.call(this); },
            set(value) { window.__routerScrolls.push(`scrollTop=${value}`); own.set.call(this, value); },
        });
        const into = Element.prototype.scrollIntoView;
        Element.prototype.scrollIntoView = function scrollIntoView(...args) { window.__routerScrolls.push('scrollIntoView'); return into.apply(this, args); };
    });
    const scrollBefore = await page.evaluate(() => window.scrollY);
    const linkRequests = watchRequests();
    await row(ids.second).dispatchEvent('click');
    await settled(ids.second);
    await sleep(600);
    linkRequests.stop();
    check('a switch on a ?account= address drops the parameter and opens the account picked',
        new URL(page.url()).search === '' && (await read()).headingId === ids.second, page.url());
    const scrollAfter = await page.evaluate(() => ({y: window.scrollY, router: window.__routerScrolls}));
    // Two requests for the page here: the router asks for the route's tree first, which renders nothing.
    check('…with one write and one request that renders the page, and the router does not scroll it',
        linkRequests.seen.writes === 1 && linkRequests.seen.renders === 1 && linkRequests.seen.pages <= 2 && linkRequests.seen.actions === 0
        && scrollBefore === 260 && scrollAfter.router.length === 0 && scrollAfter.y > 100,
        `${JSON.stringify(linkRequests.seen)} scroll ${scrollBefore} → ${scrollAfter.y} ${JSON.stringify(scrollAfter.router)}`);
    await page.reload({waitUntil: 'load'});
    await settled(ids.second);
    check('the choice is remembered: a reload opens the same account', (await read()).headingId === ids.second);

    // --- leaving the page mid-switch ------------------------------------------------------------
    // The write is held for a second; the reader clicks a row and at once goes to another page by
    // the rail — a client navigation, so the page's scripts, and with them the pending switch,
    // live on. Nothing may be left "opening", and no failure may be told for a switch that worked.
    await row(ids.main).waitFor({state: 'visible'});
    await page.route('**/api/accounts/active', async (route) => { await sleep(1000); await route.continue().catch(() => {}); });
    await row(ids.main).click();
    await page.locator('[data-account-opening]').waitFor({timeout: 5000});
    await page.locator('aside.rail a[data-rail="news"]').click();
    await page.waitForURL(/\/news/, {timeout: 30000});
    const leftAt = Date.now();
    await sleep(2500);
    check('a reader who leaves mid-switch is told of no failure', await page.getByText(/Could not reach the server|Could not switch accounts/).count() === 0);
    await page.unroute('**/api/accounts/active');
    await page.locator('aside.rail a[data-rail="portfolio"]').click();
    await page.waitForURL(/\/portfolio/, {timeout: 30000});
    await page.locator('[data-account-heading]').first().waitFor({state: 'visible', timeout: 30000});
    await sleep(400);
    const afterLeaving = await read();
    check('…and the page they come back to is not left "opening" an account, by a client navigation',
        await page.locator('[data-account-opening]').count() === 0 && await page.locator('.account-region[aria-busy="true"]').count() === 0
        && afterLeaving.current === afterLeaving.headingId && Date.now() - leftAt < 20_000,
        JSON.stringify({heading: afterLeaving.headingId, current: afterLeaving.current}));
    check('…the write they left behind still landed: the account they picked is the one shown', afterLeaving.headingId === ids.main, afterLeaving.heading);
    if (afterLeaving.headingId !== ids.second) {
        await row(ids.second).click();
        await settled(ids.second);
    }

    // --- a switch that fails says so and puts everything back --------------------------------------
    await page.route('**/api/accounts/active', (route) => route.fulfill({status: 500, contentType: 'application/json', body: JSON.stringify({success: false, message: 'Could not switch accounts'})}));
    await row(ids.main).click();
    await page.getByText('Could not switch accounts').first().waitFor({timeout: 10000});
    await settled(ids.second);
    check('a refused switch toasts and returns to the account shown', (await read()).headingId === ids.second && (await read()).current === ids.second);
    await page.unroute('**/api/accounts/active');
    const foreign = await context.request.post(`${BASE}/api/accounts/active`, {data: {accountId: ids.main}, headers: {'sec-fetch-site': 'cross-site', origin: 'https://elsewhere.example'}});
    const notOwned = await context.request.post(`${BASE}/api/accounts/active`, {data: {accountId: '000000000000000000000000'}, headers: {'sec-fetch-site': 'same-origin'}});
    check('the write refuses a cross-site request and an account that is not the caller\'s', foreign.status() === 403 && notOwned.status() === 404, `${foreign.status()} ${notOwned.status()}`);
    await page.reload({waitUntil: 'load'});
    await settled(ids.second);
    check('…and neither changed the active account', (await read()).headingId === ids.second);

    // --- a fill writes its price through --------------------------------------------------------
    await row(ids.main).click();
    await settled(ids.main);
    await page.goto(`${BASE}/trade?symbol=QSPA`, {waitUntil: 'domcontentloaded'});
    await page.locator('#order-symbol').waitFor({timeout: 30000});
    await page.locator('#order-shares').fill('1');
    await page.getByRole('button', {name: 'Buy QSPA'}).click();
    await page.getByText(/Bought 1 QSPA @ \$/).first().waitFor({timeout: 30000});
    const fill = await db.collection('papertrades').findOne({accountId: ids.main, symbol: 'QSPA'}, {sort: {createdAt: -1}});
    const sheetRow = await quotes.findOne({symbol: 'QSPA'});
    check('an order fills at a quote asked for at that moment, and the sheet takes that price',
        typeof fill?.price === 'number' && fill.price > pricesCold.QSPA && sheetRow?.price === fill.price, `fill ${fill?.price} sheet ${sheetRow?.price}`);
    await page.goto(`${BASE}/portfolio`, {waitUntil: 'load'});
    await settled(ids.main);
    check('…so the page that follows values the holding at the price that filled', (await read()).holdings.QSPA === money(fill.price), JSON.stringify((await read()).holdings));

    // --- the trade desk's switcher -----------------------------------------------------------------
    await page.goto(`${BASE}/trade`, {waitUntil: 'domcontentloaded'});
    const deskTrigger = page.locator('[data-account-switcher]');
    await deskTrigger.waitFor({timeout: 30000});
    await deskTrigger.click();
    const deskRequests = watchRequests();
    await page.getByRole('menuitemradio', {name: /Second/}).click();
    await page.waitForFunction((want) => document.querySelector('[data-account-switcher]')?.getAttribute('data-account-switcher') === want
        && document.querySelectorAll('.account-region[aria-busy="true"]').length === 0 && /QSPC/.test(document.querySelector('main')?.textContent ?? ''), ids.second, {timeout: 30000});
    deskRequests.stop();
    check('the trade desk switches with the same one write and one page request, and shows the account\'s positions',
        deskRequests.seen.writes === 1 && deskRequests.seen.pages === 1 && deskRequests.seen.actions === 0, JSON.stringify(deskRequests.seen));

    // --- a phone ---------------------------------------------------------------------------------
    await page.setViewportSize({width: 375, height: 812});
    await page.goto(`${BASE}/portfolio`, {waitUntil: 'load'});
    await settled(ids.second);
    await page.locator('[data-account-switcher]').waitFor({state: 'visible'});
    const phone = await page.evaluate(() => ({
        overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
        trigger: document.querySelector('[data-account-switcher]')?.getBoundingClientRect().height ?? 0,
    }));
    check('at 375 px nothing scrolls sideways and the switcher is a 44 px target', phone.overflow <= 0 && phone.trigger >= 44, JSON.stringify(phone));
    await row(ids.main).click();
    await settled(ids.main);
    check('a row switches the account on a phone too', (await read()).headingId === ids.main);
    await shot('04-phone');
    await page.setViewportSize({width: 1440, height: 900});

    // --- the pending state in each visual style ----------------------------------------------------
    // The write is held for a moment so the page can be photographed between the click and the arrival.
    for (const style of ['minimal', 'futuristic', 'liquid-glass', 'brutalist', 'soft']) {
        await context.addCookies([{name: 'aero-theme', value: `v1:nord:${style}:0`, domain: new URL(BASE).hostname, path: '/'}]);
        await page.goto(`${BASE}/portfolio`, {waitUntil: 'load'});
        const shown = (await read()).headingId;
        const target = shown === ids.main ? ids.second : ids.main;
        await row(target).waitFor({state: 'visible'});
        await sleep(1200);   // the panels' own entry animation, in the style's tempo, is over
        await page.route('**/api/accounts/active', async (route) => { await sleep(900); await route.continue().catch(() => {}); });
        await row(target).click();
        await page.locator('[data-account-opening]').waitFor({timeout: 5000});
        await sleep(350);
        const pending = await page.evaluate(() => {
            const region = document.querySelector('.account-region[data-pending]');
            const faded = region?.querySelector('.glass-panel > *');
            return {busy: document.querySelectorAll('.account-region[aria-busy="true"]').length, opacity: faded ? getComputedStyle(faded).opacity : null,
                panel: region?.querySelector('.glass-panel') ? getComputedStyle(region.querySelector('.glass-panel')).opacity : null};
        });
        check(`${style}: the account's panels fade their content, never themselves, while it is opened`,
            pending.busy >= 2 && Number(pending.opacity) < 0.6 && pending.panel === '1', JSON.stringify(pending));
        await page.screenshot({path: `${OUT}05-pending-${style}.png`});
        await settled(target);
        await page.unroute('**/api/accounts/active');
    }
    await context.addCookies([{name: 'aero-theme', value: 'v1:nord:minimal:1', domain: new URL(BASE).hostname, path: '/'}]);
    await page.goto(`${BASE}/portfolio`, {waitUntil: 'load'});
    const reduced = await page.evaluate(() => {
        const child = document.querySelector('.account-region .glass-panel > *');
        return child ? getComputedStyle(child).transitionDuration : null;
    });
    check('with reduced motion the fade is a cut', reduced === '0s' || reduced === '0ms', String(reduced));
    await context.clearCookies({name: 'aero-theme'});
} catch (error) {
    check('the suite ran to the end', false, String(error?.stack ?? error));
} finally {
    if (db) {
        // Nothing of this suite's is left for a later one: its sheet rows and stored close, the
        // refusals it had filed (the limits panel is read by qa-learn), and its accounts — their
        // symbols exist nowhere, and a job that tops up held symbols' bars would go looking for them.
        await db.collection('pricequotes').deleteMany({symbol: {$in: ALL}}).catch(() => {});
        await db.collection('pricebars').deleteMany({symbol: 'QSPB'}).catch(() => {});
        await db.collection('ratelimits').deleteMany({key: /^finnhub:quotes:/}).catch(() => {});
        await db.collection('limitevents').deleteMany({provider: 'finnhub', at: {$gte: startedAt}}).catch(() => {});
        if (userId) {
            const mine = await db.collection('paperaccounts').find({userId}).toArray().catch(() => []);
            const accountIds = mine.map((a) => String(a._id));
            await db.collection('papertrades').deleteMany({accountId: {$in: accountIds}}).catch(() => {});
            await db.collection('accountsnapshots').deleteMany({accountId: {$in: accountIds}}).catch(() => {});
            await db.collection('paperaccounts').deleteMany({userId}).catch(() => {});
        }
    }
    await stub('/__reset').catch(() => {});
    await mongo.close().catch(() => {});
    await browser.close().catch(() => {});
}
summary('steady-prices');
