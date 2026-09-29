// PR 5 (Trade desk + brain): trade deep links, tables that label themselves below md,
// the order ticket's presets and advisory checks, chart-follows-ticker (and the
// dashboard widget that must NOT navigate), the trade `source` chip + CSV columns (a note that
// looks like a formula exports as text), the order note's 200-character limit, and
// brain rows that drill into evidence with valid markup.
// Run against the harness in README.md (in-memory Mongo on :27117 + `npm run dev`; no
// Finnhub key, so prices are unknown and the ticket's price-based paths stay open).
import {chromium} from 'playwright';
import {MongoClient} from 'mongodb';
import {mkdirSync} from 'node:fs';

const BASE = 'http://localhost:3000';
const MONGO = 'mongodb://127.0.0.1:27117/aerotrade';
const OUT = new URL('./output/trade-desk/', import.meta.url).pathname;
mkdirSync(OUT, {recursive: true});

let failures = 0;
const check = (name, ok, detail = '') => {
    if (!ok) failures++;
    console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? `  — ${detail}` : ''}`);
};

const browser = await chromium.launch({channel: 'chrome'});
const page = await browser.newPage({viewport: {width: 1440, height: 900}});
const shot = (n) => page.screenshot({path: `${OUT}${n}.png`, fullPage: true});
const settleToasts = async () => { await page.mouse.move(5, 700); await page.waitForTimeout(600); };
const mongo = new MongoClient(MONGO);

// No quote provider in this harness, so the ticket never has a price to size a buy with. For
// the cash-interest checks, answer the page's getQuote server action with a fixed last price:
// only an action whose real answer is the empty quote `{}` is rewritten, so search, placeOrder
// and every other action pass through, and the server's own quote (placeOrder) is untouched.
const STUB_PRICE = 150;
let quotesStubbed = 0;
const onTicketPages = (url) => url.pathname === '/trade' || url.pathname === '/';
const quoteStub = async (route) => {
    const request = route.request();
    // getQuote(symbol) posts its one argument: ["AAPL"].
    if (request.method() !== 'POST' || !request.headers()['next-action'] || !/^\["[A-Z.]+"\]$/.test(request.postData() ?? '')) return route.fallback();
    const response = await route.fetch();
    const body = await response.text();
    const row = /"a":"\$@([0-9a-f]+)"/.exec(body)?.[1];
    const stubbed = row ? body.replace(new RegExp(`^${row}:\\{\\}$`, 'm'), `${row}:{"c":${STUB_PRICE}}`) : body;
    if (stubbed !== body) quotesStubbed++;
    return route.fulfill({response, body: stubbed});
};
// The ^IRX row this suite seeds, removed again so later suites see the database they expect.
let seededRate = null;

try {
    await mongo.connect();
    const db = mongo.db('aerotrade');

    const email = `qatrade${Date.now()}@example.com`;
    await page.goto(`${BASE}/sign-up`, {waitUntil: 'load'});
    await page.fill('#fullName', 'QA Trade');
    await page.fill('#email', email);
    await page.fill('#password', 'Passw0rd!Passw0rd!');
    await page.click('button[type="submit"]');
    await page.waitForURL(new RegExp(`^${BASE}/(\\?.*)?$`), {timeout: 90000});
    const user = await db.collection('user').findOne({email});
    const userId = String(user._id);
    const accounts = db.collection('paperaccounts');
    const main = await accounts.findOne({userId});   // lazily created by the first render
    check('a paper account exists for the user', !!main);
    // The account began a minute ago, so the fills seeded below (a few seconds old) fall inside
    // its current epoch: every trade read starts at inceptionAt.
    const mainInception = new Date(Date.now() - 60_000);
    await accounts.updateOne({_id: main._id}, {$set: {inceptionAt: mainInception, cash: 97_000, positions: [
        {symbol: 'AAPL', company: 'Apple Inc', quantity: 10, avgCost: 150},
        {symbol: 'MSFT', company: 'Microsoft', quantity: 5, avgCost: 300},
    ]}});
    await accounts.insertOne({userId, name: 'Value', cash: 100_000, startingBalance: 100_000, inceptionAt: new Date(), positions: [], createdAt: new Date(), updatedAt: new Date()});
    const mainId = String(main._id);
    const trade = (over) => ({userId, accountId: mainId, symbol: 'AAPL', company: 'Apple Inc', side: 'buy', quantity: 5, price: 150, total: 750, createdAt: new Date(), ...over});
    await db.collection('papertrades').insertMany([
        trade({createdAt: new Date(Date.now() - 3000)}),                                 // pre-field row: no source, no chip
        trade({createdAt: new Date(Date.now() - 2000), source: 'user'}),
        trade({createdAt: new Date(Date.now() - 1000), source: 'ai-suggestion'}),
        // A learner's note a spreadsheet would read as a formula: the export must neutralise it.
        trade({createdAt: new Date(Date.now() - 500), side: 'sell', quantity: 2, price: 160, total: 320, realizedPnl: 20, source: 'user', reason: '=1+1'}),
        // A row from before the account's inception: what a reset that re-anchored inceptionAt
        // but crashed before deleting the old epoch's trades leaves behind. No trade read shows it
        // — a losing sell, so a read that counted it would halve the win rate (100% → 50%).
        trade({createdAt: new Date(mainInception.getTime() - 60_000), symbol: 'ZZOLD', company: 'Old Epoch Co', side: 'sell', quantity: 1, price: 100, total: 100, realizedPnl: -500, source: 'user'}),
    ]);
    await db.collection('watchlists').insertOne({userId, symbol: 'AAPL', company: 'Apple Inc', addedAt: new Date()});
    await db.collection('brainentities').updateOne({key: 'NVDA'}, {$set: {
        key: 'NVDA', type: 'ticker', displayName: 'NVIDIA', weightFast: 6, sentimentSumFast: 2, weightSlow: 14, sentimentSumSlow: 5,
        decayedTo: new Date().toISOString().slice(0, 10), lastSeenAt: new Date(), verified: true,
        thesisSince: new Date(Date.now() - 21 * 86_400_000), peakSlowWeight: 14, links: [],
    }}, {upsert: true});

    // --- deep links + source chip -------------------------------------------------------
    await page.goto(`${BASE}/portfolio`, {waitUntil: 'load'});
    await page.getByText('Holdings', {exact: true}).waitFor({timeout: 30000});
    check('holdings rows offer a Trade link to the prefilled ticket', await page.locator('a[href="/trade?symbol=AAPL"]').count() >= 1);
    check('trade history symbols link to the stock page', await page.locator('a[href="/stocks/AAPL"]').count() >= 2);
    check('an AI-placed trade carries a chip; user and legacy rows do not', await page.getByText('AI suggestion', {exact: true}).count() === 1);
    check('a trade from before the account\'s inception is not in its trade log', await page.locator('a[href="/stocks/ZZOLD"]').count() === 0);
    check('strategy comparison renders both accounts', await page.getByRole('button', {name: /Value/}).count() >= 1);
    // The table's win rate is this epoch's, like the tile's: one winning sell, the old losing one unread.
    // A comparison row is the one button carrying its cells' own labels (the header's account
    // switcher is also named "Main Strategy").
    const mainRow = page.locator('button', {hasText: 'Main Strategy'}).filter({hasText: 'Max Drawdown'}).first();
    const mainWinRate = (await mainRow.locator(':scope > div').nth(3).innerText()).trim();
    check('the comparison table counts only this epoch\'s sells', mainWinRate === '100%', mainWinRate);
    // The sell dialog's realized-result line reads '—' without a quote.
    await page.getByRole('button', {name: /^Sell$/}).first().click();
    const sellEst = page.locator('[data-testid="sell-est-pnl"]');
    await sellEst.waitFor({timeout: 15000}).catch(() => {});
    check('the sell dialog shows an unknown realized result without a quote', await sellEst.count() === 1 && /—/.test(await sellEst.innerText()));
    await page.keyboard.press('Escape');
    await page.waitForTimeout(300);
    await shot('01-portfolio');

    await page.setViewportSize({width: 390, height: 844});
    await page.goto(`${BASE}/portfolio`, {waitUntil: 'load'});
    await page.getByText('Holdings', {exact: true}).waitFor({timeout: 30000});
    check('at 390px every holdings cell names itself', await page.getByText('Avg Cost', {exact: true}).filter({visible: true}).count() >= 2);
    check('at 390px the comparison table still shows Win Rate and Max Drawdown',
        await page.getByText('Win Rate', {exact: true}).filter({visible: true}).count() >= 2 && await page.getByText('Max Drawdown', {exact: true}).filter({visible: true}).count() >= 2);
    await shot('02-portfolio-390');
    await page.setViewportSize({width: 1440, height: 900});

    const csv = await (await page.request.get(`${BASE}/api/accounts/${mainId}/export`)).text();
    const [header, ...rows] = csv.trim().split('\n');
    // Every string cell is quoted (a ';'-separated locale must not split a note); numbers stay bare.
    check('CSV export has source then reason columns, quoted', header.endsWith(',"source","reason"'), header);
    check('CSV rows carry the source, blank when unknown', rows.some((r) => r.endsWith(',"ai-suggestion",""')) && rows.some((r) => r.endsWith(',"","",""')), rows.map((r) => r.split(',').slice(-2).join(',')).join('|'));
    check('a note starting with = exports as quoted text, not a formula', rows.some((r) => r.endsWith(`,"user","'=1+1"`)), rows.map((r) => r.split(',').slice(-2).join(',')).join('|'));
    check('numbers stay bare and strings are quoted', rows.some((r) => /^"[^"]+","AAPL","Apple Inc","sell",2,160,320,20,"user",/.test(r)), rows.join(' | '));
    check('the export is this epoch\'s: no row from before the account\'s inception', rows.length === 4 && !rows.some((r) => r.includes('ZZOLD')), rows.map((r) => r.split(',')[1]).join('|'));

    // --- watchlist + stock page affordances --------------------------------------------
    await page.goto(`${BASE}/watchlist`, {waitUntil: 'load'});
    await page.locator('a[aria-label="Trade AAPL"]').first().waitFor({timeout: 30000});
    check('watchlist rows offer a Trade action', true);
    await page.setViewportSize({width: 390, height: 844});
    await page.reload({waitUntil: 'load'});
    await page.locator('a[aria-label="Trade AAPL"]').first().waitFor({timeout: 30000});
    check('at 390px watchlist cells name themselves', await page.getByText('Market Cap', {exact: true}).filter({visible: true}).count() >= 1);
    await page.setViewportSize({width: 1440, height: 900});
    // Without a Finnhub key the stock page has no profile and renders the app's own
    // not-found (pre-existing behaviour), so this check only runs when a key is set.
    await page.goto(`${BASE}/stocks/AAPL`, {waitUntil: 'domcontentloaded'});
    await Promise.race([
        page.locator('a[href="/trade?symbol=AAPL"]').first().waitFor({timeout: 30000}),
        page.getByText("We couldn't find that page").waitFor({timeout: 30000}),
    ]);
    if (await page.getByText("We couldn't find that page").count() > 0) {
        console.log('SKIP  the stock page has an explicit Trade button  — no quote provider in this harness');
    } else {
        check('the stock page has an explicit Trade button', /Trade/.test(await page.locator('a[href="/trade?symbol=AAPL"]').first().innerText()));
    }

    // --- the order ticket ---------------------------------------------------------------
    await page.goto(`${BASE}/trade?symbol=AAPL`, {waitUntil: 'domcontentloaded'});
    const symbolInput = page.locator('#order-symbol');
    await symbolInput.waitFor({timeout: 30000});
    check('deep link prefills the ticket', (await symbolInput.inputValue()) === 'AAPL');
    // exact: the page header's "live prices" would otherwise match a substring search
    check('the ticket says Last Price, not Live Price', await page.getByText('Last Price', {exact: true}).count() === 1 && await page.getByText('Live Price', {exact: true}).count() === 0);
    const ticket = page.locator('form').first();
    check('Buy side shows buying power', /Buying Power \$97,000\.00/.test(await ticket.innerText()));
    check('an unknown price never disables Submit', !(await page.getByRole('button', {name: 'Buy AAPL'}).isDisabled()));
    check('with no quote the buy side states no consequence', await page.locator('[data-testid="order-effect"]').count() === 0);
    // The learner's "why": the field holds at most 200 characters however much is pasted.
    const noteField = page.locator('#order-note');
    check('the ticket asks why, optionally', await noteField.count() === 1 && /why/i.test(await page.locator('label[for="order-note"]').innerText()));
    await noteField.fill('x'.repeat(250));
    check('a 250-character note is clipped to 200', (await noteField.inputValue()).length === 200, String((await noteField.inputValue()).length));
    check('the counter shows the limit reached', /200\/200/.test(await ticket.innerText()));
    await noteField.fill('');

    await page.getByRole('button', {name: 'sell', exact: true}).click();
    check('Sell side says how many shares are owned', /You own 10 shares of AAPL/.test(await ticket.innerText()));
    check('Sell side offers presets', await ticket.getByRole('button', {name: 'Max'}).count() === 1);
    await ticket.getByRole('button', {name: 'Max'}).click();
    check('Max fills the whole position', (await page.locator('#order-shares').inputValue()) === '10');
    await page.locator('#order-shares').fill('11');
    check('an over-sell is explained and blocked',
        await page.getByRole('alert').filter({hasText: 'You only own 10 shares'}).count() === 1 && await page.getByRole('button', {name: 'Sell AAPL'}).isDisabled());
    await page.locator('#order-shares').fill('5');
    check('a sell within the position is allowed', !(await page.getByRole('button', {name: 'Sell AAPL'}).isDisabled()));
    check('the sell side states the shares left', /5 of 10 shares · 5 left/.test(await page.locator('[data-testid="order-effect"]').innerText()));
    // The queue line appears only while the NYSE session is closed (Mon–Fri 9:30–16:00 ET; holidays are rare enough to ignore here).
    const et = new Date(new Date().toLocaleString('en-US', {timeZone: 'America/New_York'}));
    const etMinutes = et.getHours() * 60 + et.getMinutes();
    const closed = et.getDay() === 0 || et.getDay() === 6 || etMinutes < 570 || etMinutes >= 960;
    const queue = page.locator('[data-testid="order-queue"]');
    check('the ticket says when a real broker would fill, only while closed',
        closed ? (await queue.count() === 1 && /queue this to/.test(await queue.innerText())) : await queue.count() === 0, `closed=${closed}`);
    await shot('03-ticket-sell');

    // Enter in the shares field submits; with no quote provider the server refuses, which
    // proves the form path without changing any data.
    const tradesBefore = await db.collection('papertrades').countDocuments({accountId: mainId});
    await page.locator('#order-shares').press('Enter');
    await page.getByText(/Couldn.t fetch a live price/).waitFor({timeout: 30000});
    check('Enter in the shares field submits the order', true);
    check('…and the server stayed the authority (nothing traded)', (await db.collection('papertrades').countDocuments({accountId: mainId})) === tradesBefore);
    await settleToasts();

    // A server action's arguments arrive unchecked: a side other than buy/sell is refused first,
    // before the quote and before any write (it used to run the sell branch).
    let tampered = 0;
    const tamperSide = async (route) => {
        const body = route.request().postData() ?? '';
        if (route.request().method() !== 'POST' || !route.request().headers()['next-action'] || !body.includes('"side":"sell"')) return route.fallback();
        tampered++;
        return route.continue({postData: body.split('"side":"sell"').join('"side":"short"')});
    };
    await page.route(onTicketPages, tamperSide);
    const cashBefore = (await db.collection('paperaccounts').findOne({_id: main._id})).cash;
    await page.locator('#order-shares').press('Enter');
    const refused = await page.getByText('Choose buy or sell').waitFor({timeout: 30000}).then(() => true, () => false);
    check('an order whose side is neither buy nor sell is refused first', tampered > 0 && refused, `tampered=${tampered}`);
    check('…and nothing moved', (await db.collection('papertrades').countDocuments({accountId: mainId})) === tradesBefore
        && (await db.collection('paperaccounts').findOne({_id: main._id})).cash === cashBefore);
    await page.unroute(onTicketPages, tamperSide);
    await settleToasts();

    // Enter in the symbol field commits the symbol (chart + URL), never the order.
    await symbolInput.fill('MSFT');
    await symbolInput.press('Enter');
    await page.waitForURL(/\/trade\?symbol=MSFT/, {timeout: 15000});
    check('a committed symbol mirrors into the URL', /symbol=MSFT/.test(page.url()), page.url());
    check('the ticket follows the committed symbol', /You own 5 shares of MSFT/.test(await ticket.innerText()));
    check('committing a symbol placed no order', (await db.collection('papertrades').countDocuments({accountId: mainId})) === tradesBefore);
    await shot('04-ticket-msft');

    // A Trade link clicked while already on the desk is a soft navigation: the page
    // instance survives, so the ticket has to adopt the new symbol from its props.
    await page.goto(`${BASE}/trade?symbol=AAPL`, {waitUntil: 'domcontentloaded'});
    await symbolInput.waitFor({timeout: 30000});
    await page.locator('a[aria-label="Trade MSFT"]').first().click();
    await page.waitForURL(/\/trade\?symbol=MSFT/, {timeout: 15000});
    await page.waitForTimeout(500);
    check('a same-route Trade link re-targets the ticket', (await symbolInput.inputValue()) === 'MSFT', await symbolInput.inputValue());

    // --- what the cash left would earn: "earning ≈$x/month at y% APY" ---------------------
    // Priced at $150 by the stub: 10 AAPL leave $95,500 of the $100,000 account in cash.
    await page.route(onTicketPages, quoteStub);
    const pricebars = db.collection('pricebars');
    const buyLine = async () => {
        await page.goto(`${BASE}/trade?symbol=AAPL`, {waitUntil: 'domcontentloaded'});
        await symbolInput.waitFor({timeout: 30000});
        await page.locator('#order-shares').fill('10');
        const line = page.locator('[data-testid="order-effect"]');
        await line.waitFor({timeout: 30000}).catch(() => {});
        return await line.count() === 1 ? line.innerText() : '';
    };
    // How many times the ticket's one definitions disclosure defines APY.
    const apyDefinitions = async () => {
        const terms = page.locator('form').first().locator('[data-what-these-mean]');
        await terms.locator('summary').click();
        return terms.locator('dt', {hasText: /^APY/}).count();
    };
    if (await pricebars.countDocuments({symbol: '^IRX'}) === 0) {
        const line = await buyLine();
        check('the quote stub prices the ticket', quotesStubbed > 0 && /cash left \$95,500/.test(line), `stubbed=${quotesStubbed} line=${line}`);
        check('with no T-bill rate stored the buy line says nothing about interest (never 0%)', line !== '' && !/APY|earning|0\.00%/.test(line), line);
        check('…and the ticket defines no APY', await apyDefinitions() === 0);
        const date = new Date().toLocaleDateString('en-CA', {timeZone: 'America/New_York'});
        seededRate = {symbol: '^IRX', date};
        await pricebars.updateOne(seededRate, {$set: {...seededRate, close: 4.07, open: 4.07, high: 4.07, low: 4.07, source: 'yahoo'}}, {upsert: true});
    } else {
        console.log('SKIP  the no-rate buy line  — an earlier suite already stored ^IRX');
    }
    // The expected clause, computed here from the latest ^IRX close the page will read:
    // bond-equivalent yield − the 0.25% spread, then 30 days of daily compounding.
    const rate = await pricebars.findOne({symbol: '^IRX'}, {sort: {date: -1}});
    const discount = rate.close / 100;
    const apy = Math.max(0, (365 * discount) / (360 - 91 * discount) - 0.0025);
    const perMonth = 95_500 * ((1 + apy) ** (30 / 365) - 1);
    const shown = perMonth < 10 ? `$${perMonth.toFixed(2)}` : `$${perMonth.toLocaleString('en-US', {maximumFractionDigits: 0})}`;
    const clause = `earning ≈${shown}/month at ${(apy * 100).toFixed(2)}% APY`;
    const priced = await buyLine();
    check('a buy states what the cash left would earn in 30 days at the cash APY', /cash left \$95,500 \(\d+%\) · /.test(priced) && priced.endsWith(clause), `${priced} | expected …${clause}`);
    check('…and the ticket defines APY once', await apyDefinitions() === 1);
    await page.getByRole('button', {name: 'sell', exact: true}).click();
    check('a sell carries no interest clause', !/APY|earning/.test(await page.locator('[data-testid="order-effect"]').innerText()));
    check('…and the sell ticket defines no APY', await apyDefinitions() === 0);
    await shot('04b-ticket-apy');
    // A rate the income job would not credit at (older than a week: usableRate) is not quoted.
    if (seededRate) {
        const stale = new Date(Date.now() - 8 * 86_400_000).toLocaleDateString('en-CA', {timeZone: 'America/New_York'});
        await pricebars.updateOne(seededRate, {$set: {date: stale}});
        const staleLine = await buyLine();
        check('a T-bill rate older than a week is not quoted on the ticket', staleLine !== '' && !/APY|earning/.test(staleLine), staleLine);
        await pricebars.updateOne({symbol: '^IRX', date: stale}, {$set: {date: seededRate.date}});
    } else {
        console.log('SKIP  the stale-rate buy line  — an earlier suite already stored ^IRX');
    }

    // --- the learner's "why" leaves the ticket with the order -----------------------------
    // Type a note, press Buy, and read placeOrder's own POST. The harness has no quote provider,
    // so the server refuses the fill and nothing is stored: what is under test is that the ticket
    // sends the note at all (the server's sanitising has its own unit test).
    const note = 'QA note - bought on the pullback';
    let placeOrderBody = null;
    const capturePlaceOrder = async (route) => {
        const body = route.request().postData() ?? '';
        if (route.request().method() === 'POST' && route.request().headers()['next-action'] && body.includes('"accountId"')) placeOrderBody = body;
        return route.fallback();
    };
    await page.route(onTicketPages, capturePlaceOrder);
    await page.goto(`${BASE}/trade?symbol=AAPL`, {waitUntil: 'domcontentloaded'});
    await symbolInput.waitFor({timeout: 30000});
    await page.locator('#order-shares').fill('1');
    await noteField.fill(note);
    const tradesBeforeNote = await db.collection('papertrades').countDocuments({accountId: mainId});
    await page.getByRole('button', {name: 'Buy AAPL'}).click();
    await page.getByText(/Couldn.t fetch a live price/).waitFor({timeout: 30000}).catch(() => {});
    check('Buy sends the typed note with the order', placeOrderBody !== null && placeOrderBody.includes(`"note":"${note}"`) && placeOrderBody.includes('"side":"buy"'),
        placeOrderBody ?? 'no placeOrder POST');
    check('…and the server stayed the authority (nothing traded)', (await db.collection('papertrades').countDocuments({accountId: mainId})) === tradesBeforeNote);
    await page.unroute(onTicketPages, capturePlaceOrder);
    await settleToasts();

    // --- the dashboard quick-trade widget must not navigate -----------------------------
    await page.goto(`${BASE}/settings`, {waitUntil: 'load'});
    await page.getByLabel('Add Quick Trade').click();
    await page.getByLabel('Add Recent Trades').click();
    await page.waitForTimeout(1200);   // debounced autosave
    await page.goto(`${BASE}/`, {waitUntil: 'domcontentloaded'});
    const widget = page.locator('[data-widget-id="quick-trade"]');
    await widget.waitFor({timeout: 30000});
    // The widget's own bounded read (the newest eight of the current epoch), not the ledger.
    const recent = page.locator('[data-widget-id="recent-trades"]');
    await recent.waitFor({timeout: 30000});
    check('the recent-trades widget lists this epoch\'s fills and not the old epoch\'s',
        /AAPL/.test(await recent.innerText()) && !/ZZOLD/.test(await recent.innerText()), (await recent.innerText()).replace(/\s+/g, ' ').slice(0, 160));
    await widget.locator('#order-symbol').fill('TSLA');
    await widget.locator('#order-symbol').press('Enter');
    await page.waitForTimeout(1500);
    check('the dashboard widget never navigates to /trade', new URL(page.url()).pathname === '/', page.url());
    check('the dashboard ticket keeps the queue line and definitions off', await widget.locator('[data-testid="order-queue"]').count() === 0 && await widget.locator('[data-what-these-mean]').count() === 0);
    check('the compact ticket has no note field', await widget.locator('#order-note').count() === 0);
    // Still priced by the stub, with ^IRX stored: the 360px line keeps its first two facts only.
    const compactLine = widget.locator('[data-testid="order-effect"]');
    await compactLine.waitFor({timeout: 15000}).catch(() => {});
    const compactText = await compactLine.count() === 1 ? await compactLine.innerText() : '';
    // The interest clause goes with the cash left, and the widget is given no APY at all, so only
    // the first half can fail here; trade-copy.test.ts owns the compact line's interest rule.
    check('the compact ticket states no cash left', compactText !== '' && !/cash left/.test(compactText), compactText || 'no line');
    await page.unroute(onTicketPages, quoteStub);

    // --- brain drill-downs --------------------------------------------------------------
    await page.goto(`${BASE}/brain`, {waitUntil: 'domcontentloaded'});
    await page.getByText('Active Theses').waitFor({timeout: 30000});
    check('a thesis row links to its evidence', await page.locator('a[href="/brain?entity=NVDA#evidence"]').count() >= 1);
    check('a ticker thesis links to the stock page and the ticket',
        await page.locator('a[href="/stocks/NVDA"]').count() >= 1 && await page.locator('a[href="/trade?symbol=NVDA"]').count() >= 1);
    check('no button is nested inside a link on /brain', await page.locator('a button').count() === 0);
    await page.goto(`${BASE}/brain?entity=NVDA#evidence`, {waitUntil: 'domcontentloaded'});
    await page.locator('#evidence').waitFor({timeout: 30000});
    check('the evidence section is an anchor target', true);
    check('the evidence header offers stock page + Trade for a ticker', /Stock page/.test(await page.locator('#evidence').innerText()) && await page.locator('#evidence a[href="/trade?symbol=NVDA"]').count() === 1);
    await shot('05-brain');
} catch (err) {
    failures++;
    console.log(`FAIL  threw: ${err.message}`);
    await shot('99-error').catch(() => {});
} finally {
    if (seededRate) await mongo.db('aerotrade').collection('pricebars').deleteOne(seededRate).catch(() => {});
    await mongo.close().catch(() => {});
    await browser.close();
}

console.log(failures === 0 ? '\nAll trade-desk checks passed.' : `\n${failures} check(s) failed.`);
process.exit(failures === 0 ? 0 : 1);
