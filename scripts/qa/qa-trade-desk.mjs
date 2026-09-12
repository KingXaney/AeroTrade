// PR 5 (Trade desk + brain): trade deep links, tables that label themselves below md,
// the order ticket's presets and advisory checks, chart-follows-ticker (and the
// dashboard widget that must NOT navigate), the trade `source` chip + CSV column, and
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

try {
    await mongo.connect();
    const db = mongo.db('aerotrade');

    const email = `qatrade${Date.now()}@example.com`;
    await page.goto(`${BASE}/sign-up`, {waitUntil: 'load'});
    await page.fill('#fullName', 'QA Trade');
    await page.fill('#email', email);
    await page.fill('#password', 'Passw0rd!Passw0rd!');
    await page.click('button[type="submit"]');
    await page.waitForURL(/\/topics/, {timeout: 90000});
    const user = await db.collection('user').findOne({email});
    const userId = String(user._id);
    const accounts = db.collection('paperaccounts');
    const main = await accounts.findOne({userId});   // lazily created by the first render
    check('a paper account exists for the user', !!main);
    await accounts.updateOne({_id: main._id}, {$set: {cash: 97_000, positions: [
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
    check('strategy comparison renders both accounts', await page.getByRole('button', {name: /Value/}).count() >= 1);
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
    check('CSV export has a source column', header.endsWith(',source'), header);
    check('CSV rows carry the source, blank when unknown', rows.some((r) => r.endsWith(',ai-suggestion')) && rows.some((r) => r.endsWith(',')), rows.map((r) => r.split(',').pop()).join('|'));

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
    await shot('03-ticket-sell');

    // Enter in the shares field submits; with no quote provider the server refuses, which
    // proves the form path without changing any data.
    const tradesBefore = await db.collection('papertrades').countDocuments({accountId: mainId});
    await page.locator('#order-shares').press('Enter');
    await page.getByText(/Couldn.t fetch a live price/).waitFor({timeout: 30000});
    check('Enter in the shares field submits the order', true);
    check('…and the server stayed the authority (nothing traded)', (await db.collection('papertrades').countDocuments({accountId: mainId})) === tradesBefore);
    await settleToasts();

    // Enter in the symbol field commits the symbol (chart + URL), never the order.
    await symbolInput.fill('MSFT');
    await symbolInput.press('Enter');
    await page.waitForURL(/\/trade\?symbol=MSFT/, {timeout: 15000});
    check('a committed symbol mirrors into the URL', /symbol=MSFT/.test(page.url()), page.url());
    check('the ticket follows the committed symbol', /You own 5 shares of MSFT/.test(await ticket.innerText()));
    check('committing a symbol placed no order', (await db.collection('papertrades').countDocuments({accountId: mainId})) === tradesBefore);
    await shot('04-ticket-msft');

    // --- the dashboard quick-trade widget must not navigate -----------------------------
    await page.goto(`${BASE}/settings`, {waitUntil: 'load'});
    await page.getByLabel('Add Quick Trade').click();
    await page.waitForTimeout(1200);   // debounced autosave
    await page.goto(`${BASE}/`, {waitUntil: 'domcontentloaded'});
    const widget = page.locator('[data-widget-id="quick-trade"]');
    await widget.waitFor({timeout: 30000});
    await widget.locator('#order-symbol').fill('TSLA');
    await widget.locator('#order-symbol').press('Enter');
    await page.waitForTimeout(1500);
    check('the dashboard widget never navigates to /trade', new URL(page.url()).pathname === '/', page.url());

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
    await mongo.close().catch(() => {});
    await browser.close();
}

console.log(failures === 0 ? '\nAll trade-desk checks passed.' : `\n${failures} check(s) failed.`);
process.exit(failures === 0 ? 0 : 1);
