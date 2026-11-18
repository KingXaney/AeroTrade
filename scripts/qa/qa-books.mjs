// The books stay whole (docs/specs/2026-11-17-books-integrity.md): a fill survives the loss of
// its second write; a stock split is applied to the holding and the ledger is restated in today's
// shares, an order never acts on a holding still in old shares, and an account that sold out
// before the split reached it is repaired; a holding whose symbol has stopped quoting is valued at
// its last stored close and can be closed at it; the snapshot job says what it wrote and skipped.
//
// The harness runs with STOCK_SPLIT_DETECTION=off, so nothing asks Yahoo: the suite seeds the
// splits it wants applied (the detection itself is unit-tested against Yahoo's payload shape).
// The Finnhub stand-in prices the suite's own symbols.
// Run: npm run qa -- books   (the harness: README.md)
import {chromium} from 'playwright';
import {MongoClient, ObjectId} from 'mongodb';
import {createJiti} from 'jiti';
import {BASE, INNGEST, MONGO, REPO_ROOT, check, note, outDir, signUp, summary} from './lib.mjs';

const OUT = outDir('books');
const STUB = `http://localhost:${process.env.QA_FINNHUB_PORT ?? 8791}`;
const stub = async (path) => (await fetch(`${STUB}${path}`)).json();

// Symbols of this suite alone. Splits: QBKS 10-for-1, QBKF 3-for-2 (leaves 7.5), QBKR 1-for-10
// (leaves half a share), QBKP 10-for-1 (met by an order before the job), QBKL 10-for-1 (sold
// out before it was applied). QBKG has stopped quoting; QBKO has no quote today (an outage);
// QBKA is bought through the ticket.
const PRICES = {QBKS: 121, QBKF: 20.5, QBKR: 21, QBKP: 121, QBKL: 121, QBKA: 50, SPY: 600};
const SYMBOLS = ['QBKS', 'QBKF', 'QBKR', 'QBKP', 'QBKL', 'QBKG', 'QBKO', 'QBKA'];
const JOBS = ['stock-splits', 'daily-account-snapshots'];

const browser = await chromium.launch({channel: 'chrome'});
const page = await browser.newPage({viewport: {width: 1440, height: 900}});
const shot = (n) => page.screenshot({path: `${OUT}${n}.png`, fullPage: true});
const mongo = new MongoClient(MONGO);
const inngestUp = await fetch(`${INNGEST}/`).then(() => true).catch(() => false);
console.log(inngestUp ? `Inngest dev server on ${INNGEST} — running the real jobs` : 'No Inngest dev server — job checks skipped');
const until = async (fn, ms) => { const end = Date.now() + ms; let v = await fn(); while (!v && Date.now() < end) { await page.waitForTimeout(1000); v = await fn(); } return v; };
const fire = (name, data = {}) => fetch(`${INNGEST}/e/qa`, {method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify({name, data})});

// The app's own calendar (a pure module).
const jiti = createJiti(import.meta.url, {alias: {'@': REPO_ROOT.replace(/\/$/, '')}, fsCache: false});
const {easternToInstant, previousTradingDay, isTradingDay} = await jiti.import(`${REPO_ROOT}lib/prices/market-hours.ts`);
const etDate = (d = new Date()) => new Intl.DateTimeFormat('en-CA', {timeZone: 'America/New_York'}).format(d);
const addDays = (date, n) => { const [y, m, d] = date.split('-').map(Number); return new Date(Date.UTC(y, m - 1, d + n)).toISOString().slice(0, 10); };
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const short = (date) => `${MONTHS[Number(date.slice(5, 7)) - 1]} ${Number(date.slice(8, 10))}`;

const TODAY = etDate();
// The splits took effect at the open of the last session that has started; the buys are older.
const openOf = (date) => easternToInstant(date, 9, 30);
const EX = isTradingDay(TODAY) && Date.now() >= openOf(TODAY) + 10 * 60_000 ? TODAY : previousTradingDay(TODAY);
const BOUGHT = new Date(openOf(previousTradingDay(previousTradingDay(previousTradingDay(EX)))) + 60 * 60_000);
const GONE_BAR = previousTradingDay(addDays(TODAY, -9));
const INCEPTION = new Date(BOUGHT.getTime() - 24 * 60 * 60_000);

let db = null;
let userId = null;
// Shared rows this suite may create and must take away again, if they were not there before.
let hadSpyQuote = true;
let benchmarkBefore = [];
try {
    await mongo.connect();
    db = mongo.db();
    const accounts = db.collection('paperaccounts');
    const trades = db.collection('papertrades');
    hadSpyQuote = (await db.collection('pricequotes').countDocuments({symbol: 'SPY'})) > 0;
    benchmarkBefore = (await db.collection('benchmarksnapshots').find({symbol: 'SPY'}).project({date: 1}).toArray()).map((row) => row.date);
    await db.collection('pricequotes').deleteMany({symbol: {$in: SYMBOLS}});
    await db.collection('stocksplits').deleteMany({symbol: {$in: SYMBOLS}});
    await db.collection('pricebars').deleteMany({symbol: {$in: SYMBOLS}});
    await db.collection('ratelimits').deleteMany({key: /^finnhub:quotes:/});
    await stub('/__reset');
    await stub(`/__prices?${Object.entries(PRICES).map(([s, p]) => `${s}=${p}`).join('&')}`);
    await stub('/__mode?set=prices');

    // --- accounts with history from before the splits ----------------------------------------
    const email = await signUp(page, 'Books');
    await page.goto(`${BASE}/portfolio`, {waitUntil: 'load'});   // lazily creates "Main account"
    const user = await db.collection('user').findOne({email});
    userId = String(user?._id ?? user?.id);
    const main = await until(() => accounts.findOne({userId}), 30000);
    const mainId = String(main._id);
    check('signed up with a paper account', !!main);

    const fill = (accountId, symbol, side, quantity, price, createdAt = BOUGHT) => ({
        userId, accountId, symbol, company: `${symbol} Inc`, side, quantity, price, total: quantity * price, source: 'user', createdAt,
    });
    const position = (symbol, quantity, avgCost) => ({symbol, company: `${symbol} Inc`, quantity, avgCost});
    // 10 QBKS at $1,200, 5 QBKF at $30, 5 QBKR at $2, 10 QBKP at $1,200, 10 QBKG at $5.
    const spent = 12_000 + 150 + 10 + 12_000 + 50;
    await trades.insertMany([
        fill(mainId, 'QBKS', 'buy', 10, 1200), fill(mainId, 'QBKF', 'buy', 5, 30), fill(mainId, 'QBKR', 'buy', 5, 2),
        fill(mainId, 'QBKP', 'buy', 10, 1200), fill(mainId, 'QBKG', 'buy', 10, 5),
    ]);
    await accounts.updateOne({_id: main._id}, {$set: {
        cash: 100_000 - spent, startingBalance: 100_000, inceptionAt: INCEPTION,
        positions: [position('QBKS', 10, 1200), position('QBKF', 5, 30), position('QBKR', 5, 2), position('QBKP', 10, 1200), position('QBKG', 10, 5)],
    }});
    await db.collection('accountsnapshots').deleteMany({accountId: mainId});
    // A second account on a symbol with no quote today that is NOT gone: an outage. Created after
    // the main account, which stays the one /portfolio opens on.
    const outage = await accounts.insertOne({
        userId, name: 'Outage', cash: 100_000 - 100, startingBalance: 100_000, inceptionAt: INCEPTION,
        positions: [position('QBKO', 4, 25)], createdAt: new Date(), updatedAt: new Date(),
    });
    const outageId = String(outage.insertedId);
    await trades.insertOne(fill(outageId, 'QBKO', 'buy', 4, 25));
    // A third that bought 10 QBKL at $1,200 and sold "all 10" at $120 three minutes after the
    // split took effect, before anything had applied it: nothing is held, and 90 shares are owed.
    const late = await accounts.insertOne({
        userId, name: 'Sold early', cash: 100_000 - 12_000 + 1_200, startingBalance: 100_000, inceptionAt: INCEPTION,
        positions: [], createdAt: new Date(), updatedAt: new Date(),
    });
    const lateId = String(late.insertedId);
    await trades.insertMany([
        fill(lateId, 'QBKL', 'buy', 10, 1200),
        {...fill(lateId, 'QBKL', 'sell', 10, 120, new Date(openOf(EX) + 3 * 60_000)), realizedPnl: -10_800},
    ]);

    // The quote sheet: QBKG last had a price ten days ago (gone); QBKO an hour ago (an outage).
    const tenDaysAgo = new Date(Date.now() - 10 * 24 * 60 * 60_000);
    const goneRow = {symbol: 'QBKG', price: 5.1, fetchedAt: tenDaysAgo, updatedAt: new Date()};
    await db.collection('pricequotes').insertMany([
        goneRow,
        {symbol: 'QBKO', price: 25, fetchedAt: new Date(Date.now() - 60 * 60_000), updatedAt: new Date()},
    ]);
    await db.collection('pricebars').insertOne({symbol: 'QBKG', date: GONE_BAR, close: 4.2, open: 4.2, high: 4.2, low: 4.2, source: 'yahoo'});
    const split = (symbol, numerator, denominator, prevClose) =>
        ({symbol, exDate: EX, numerator, denominator, at: new Date(openOf(EX)), prevClose, source: 'yahoo', detectedAt: new Date()});
    await db.collection('stocksplits').insertMany([
        split('QBKS', 10, 1, 120), split('QBKF', 3, 2, 20), split('QBKR', 1, 10, 20), split('QBKP', 10, 1, 120), split('QBKL', 10, 1, 120),
    ]);

    const account = (id) => accounts.findOne({_id: new ObjectId(id)});
    const held = async (accountId, symbol) => (await account(accountId))?.positions?.find((p) => p.symbol === symbol) ?? null;
    const logText = async () => (await page.locator('main').innerText()).replace(/\s+/g, ' ');
    const sellRow = (symbol) => page.locator('.row-card', {has: page.locator(`a[href="/stocks/${symbol}"]`)}).getByRole('button', {name: 'Sell'});

    // --- an order never acts on a holding still in old shares ---------------------------------
    // The split of QBKP is in effect and nothing has applied it: the page shows 10 shares at
    // $121. Selling them would move a tenth of the holding.
    await page.goto(`${BASE}/portfolio`, {waitUntil: 'load'});
    await page.locator('[data-account-heading]').waitFor({timeout: 30000});
    check('before a split is applied, the holding reads as 10 old shares', (await held(mainId, 'QBKP'))?.quantity === 10);
    await shot('01-before-split');
    await sellRow('QBKP').click();
    await page.getByRole('dialog').waitFor({timeout: 15000});
    await page.getByRole('button', {name: 'Sell 10 shares'}).click();
    await page.getByText(/A stock split was just applied to QBKP/).first().waitFor({timeout: 30000});
    const guarded = await held(mainId, 'QBKP');
    check('an order on it applies the split first: 100 shares at $120', guarded?.quantity === 100 && Math.abs(guarded.avgCost - 120) < 1e-9, JSON.stringify(guarded));
    check('…and is not sent: its share count came from before the split', (await trades.countDocuments({accountId: mainId, symbol: 'QBKP', side: 'sell'})) === 0);
    await page.keyboard.press('Escape');

    if (inngestUp) {
        // --- the split job ---------------------------------------------------------------------
        await db.collection('jobruns').deleteMany({jobId: 'stock-splits'});
        await fire('app/apply.stock.splits');
        const stamp = await until(async () => (await db.collection('jobruns').findOne({jobId: 'stock-splits'}))?.lastMessage, 120000);
        check('the split job stamps what it applied', /QBKS 10-for-1 of .* applied to 1 account\(s\)/.test(stamp ?? '') && /QBKF 3-for-2/.test(stamp ?? '') && /QBKR 1-for-10/.test(stamp ?? '') && /QBKL 10-for-1/.test(stamp ?? ''), String(stamp));
        check('…and says detection is off here', /^Detection off/.test(stamp ?? ''), String(stamp));
        check('…and not the one an order had already applied', !/QBKP/.test(stamp ?? ''), String(stamp));

        const after = await account(mainId);
        const qbks = after.positions.find((p) => p.symbol === 'QBKS');
        check('a 10-for-1 split makes 10 shares at $1,200 into 100 at $120', qbks?.quantity === 100 && Math.abs(qbks.avgCost - 120) < 1e-9, JSON.stringify(qbks));
        const qbkf = after.positions.find((p) => p.symbol === 'QBKF');
        check('a 3-for-2 split makes 5 shares at $30 into 7.5 at $20', qbkf?.quantity === 7.5 && Math.abs(qbkf.avgCost - 20) < 1e-9, JSON.stringify(qbkf));
        const qbkr = after.positions.find((p) => p.symbol === 'QBKR');
        check('a 1-for-10 split makes 5 shares at $2 into half a share at $20', qbkr?.quantity === 0.5 && Math.abs(qbkr.avgCost - 20) < 1e-9, JSON.stringify(qbkr));
        check('the account lists its four splits and its split revision moved with each', after.splits?.length === 4 && after.splitRev === 4, `${after.splits?.length} ${after.splitRev}`);
        check('cash did not move: a split is not a trade', after.cash === 100_000 - spent, String(after.cash));
        check('the stored trade rows are untouched', (await trades.findOne({accountId: mainId, symbol: 'QBKS'})).quantity === 10);
        const owed = await held(lateId, 'QBKL');
        check('an account that sold out before the split reached it gets the shares it still had: 90 at $120', owed?.quantity === 90 && Math.abs(owed.avgCost - 120) < 1e-9, JSON.stringify(owed));

        // --- the page reads the ledger in today's shares ---------------------------------------
        await page.goto(`${BASE}/portfolio`, {waitUntil: 'load'});
        await page.locator('[data-testid="split-note"]').waitFor({timeout: 30000});
        const text = await logText();
        check('the trade log shows the fill restated: 100 at $120.00', /100 @ \$120\.00/.test(text), text.slice(text.indexOf('Trade History'), text.indexOf('Trade History') + 400));
        check('…and the fractions: 7.5 at $20.00, 0.5 at $20.00', /7\.5 @ \$20\.00/.test(text) && /0\.5 @ \$20\.00/.test(text));
        const noteText = await page.locator('[data-testid="split-note"]').innerText();
        check('the note under the log names each split once', noteText.startsWith('Fills before a split are shown in today\'s shares: ')
            && ['QBKS 10-for-1', 'QBKF 3-for-2', 'QBKR 1-for-10', 'QBKP 10-for-1'].every((part) => noteText.split(`${part} on ${short(EX)}`).length === 2), noteText);
        await shot('02-after-split');

        // --- applying again changes nothing ----------------------------------------------------
        await db.collection('jobruns').deleteMany({jobId: 'stock-splits'});
        await fire('app/apply.stock.splits');
        const again = await until(async () => (await db.collection('jobruns').findOne({jobId: 'stock-splits'}))?.lastMessage, 120000);
        check('a second run finds nothing to apply', /no split to apply/.test(again ?? ''), String(again));
        check('…and the holding is still 100 shares', (await held(mainId, 'QBKS'))?.quantity === 100);

        // --- the fraction of a share ------------------------------------------------------------
        await page.goto(`${BASE}/portfolio`, {waitUntil: 'load'});
        await sellRow('QBKF').click();
        await page.getByRole('dialog').waitFor({timeout: 15000});
        // The dialog opens on Max, every whole share of the 7.5 held, and says what will move.
        await page.getByRole('button', {name: 'Sell 7.5 shares'}).click();
        await page.getByText(/Sold 7\.5 QBKF @ \$20\.50/).first().waitFor({timeout: 30000});
        check('selling every whole share takes the half share with it', (await held(mainId, 'QBKF')) === null);
        const sold = await trades.findOne({accountId: mainId, symbol: 'QBKF', side: 'sell'});
        check('the trade row records the 7.5 shares that moved', sold?.quantity === 7.5 && Math.abs(sold.total - 7.5 * 20.5) < 1e-9 && Math.abs(sold.realizedPnl - 7.5 * 0.5) < 1e-9, JSON.stringify(sold && {q: sold.quantity, t: sold.total, pnl: sold.realizedPnl}));
        check('…and the account holds no fill waiting for its row', (await account(mainId)).pendingFill === undefined);

        await page.goto(`${BASE}/portfolio`, {waitUntil: 'load'});
        await sellRow('QBKR').click();
        await page.getByRole('dialog').waitFor({timeout: 15000});
        await page.getByRole('button', {name: 'Sell 0.5 shares'}).click();
        await page.getByText(/Sold 0\.5 QBKR @ \$21\.00/).first().waitFor({timeout: 30000});
        check('a holding of half a share can be sold: it sells as one', (await held(mainId, 'QBKR')) === null && (await trades.findOne({accountId: mainId, symbol: 'QBKR', side: 'sell'}))?.quantity === 0.5);
    } else note('split job checks skipped');

    // --- a fill whose trade row never landed ---------------------------------------------------
    // What the account looks like after executeOrder's first write when the second one fails.
    const before = await account(mainId);
    const lostId = new ObjectId();
    const lost = {tradeId: lostId, symbol: 'QBKA', company: 'QBKA Inc', side: 'buy', quantity: 2, price: 50, total: 100, source: 'user', createdAt: new Date()};
    await accounts.updateOne({_id: main._id}, {$set: {
        cash: before.cash - 100,
        positions: [...before.positions, position('QBKA', 2, 50)],
        pendingFill: lost,
    }});
    await page.goto(`${BASE}/portfolio`, {waitUntil: 'load'});
    await page.locator('[data-account-heading]').waitFor({timeout: 30000});
    check('a fill without its trade row is on the trade log all the same', /2 @ \$50\.00/.test(await logText()));
    check('…while the row is still not stored', (await trades.findOne({_id: lostId})) === null);

    await page.goto(`${BASE}/trade?symbol=QBKA`, {waitUntil: 'domcontentloaded'});
    await page.locator('#order-symbol').waitFor({timeout: 30000});
    await page.locator('#order-shares').fill('1');
    await page.getByRole('button', {name: 'Buy QBKA'}).click();
    await page.getByText(/Bought 1 QBKA @ \$/).first().waitFor({timeout: 30000});
    const settled = await trades.findOne({_id: lostId});
    check('the next order records the lost row first, under the id the account kept', settled?.symbol === 'QBKA' && settled.quantity === 2 && settled.accountId === mainId, JSON.stringify(settled && {s: settled.symbol, q: settled.quantity}));
    const final = await account(mainId);
    check('…then fills on top of it: 3 shares, no fill left waiting', final.positions.find((p) => p.symbol === 'QBKA')?.quantity === 3 && final.pendingFill === undefined, JSON.stringify(final.positions.find((p) => p.symbol === 'QBKA')));
    check('one row each: the lost fill and the new one', (await trades.countDocuments({accountId: mainId, symbol: 'QBKA'})) === 2);

    // --- a holding that has stopped quoting -----------------------------------------------------
    await page.goto(`${BASE}/portfolio`, {waitUntil: 'load'});
    const closeOut = page.locator('[data-close-out="QBKG"]');
    await closeOut.waitFor({timeout: 30000});
    check('a gone holding is valued at its last stored close, dated', (await page.locator(`[data-price-close="${GONE_BAR}"]`).count()) === 1 && /\$4\.20/.test(await page.locator(`[data-price-close="${GONE_BAR}"]`).innerText()));
    check('…and its row offers the close-out in place of Trade and Sell', (await sellRow('QBKG').count()) === 0);
    check('a holding with a quote keeps its Sell button and has no close-out', (await sellRow('QBKS').count()) === 1 && (await page.locator('[data-close-out="QBKS"]').count()) === 0);

    if (inngestUp) {
        // --- the snapshot job, scoped to this suite's accounts ---------------------------------
        await db.collection('jobruns').deleteMany({jobId: 'daily-account-snapshots'});
        await db.collection('accountsnapshots').deleteMany({accountId: {$in: [mainId, outageId]}});
        await fire('app/record.daily.snapshots', {full: true, accountIds: [mainId, outageId]});
        const stamp = await until(async () => (await db.collection('jobruns').findOne({jobId: 'daily-account-snapshots'}))?.lastMessage, 120000);
        check('the snapshot stamp counts what it wrote', /^1 of 2 account\(s\) snapshotted/.test(stamp ?? ''), String(stamp));
        check('…names the symbol that had no quote', /1 skipped, no quote for QBKO/.test(stamp ?? ''), String(stamp));
        check('…says a gone holding was valued at its last close', /1 valued a holding at its last stored close \(QBKG\)/.test(stamp ?? ''), String(stamp));
        check('…and that the benchmark was recorded', /SPY recorded$/.test(stamp ?? ''), String(stamp));
        // The job dates its row from the event's own time: read the account's newest, not "today".
        const row = await db.collection('accountsnapshots').findOne({accountId: mainId}, {sort: {date: -1}});
        const holdings = 100 * 121 + 100 * 121 + 3 * 50 + 10 * 4.2;
        check('the account with the gone holding has its snapshot, marked', row?.atClose?.join() === 'QBKG' && row.closedAt instanceof Date && Math.abs(row.holdingsValue - holdings) < 1e-6, JSON.stringify(row && {atClose: row.atClose, holdings: row.holdingsValue, want: holdings}));
        check('the account waiting on a quote has none', (await db.collection('accountsnapshots').countDocuments({accountId: outageId})) === 0);
    } else note('snapshot job checks skipped');

    // --- the server decides what is gone ----------------------------------------------------------
    // The page drew the close-out while QBKG was gone. A price arrives before the reader confirms:
    // the action must refuse, whatever the page still shows.
    await closeOut.click();
    const dialog = page.getByRole('dialog');
    await dialog.waitFor({timeout: 15000});
    const said = (await dialog.innerText()).replace(/\s+/g, ' ');
    check('the dialog says which close and what that price is not', said.includes(`closes the whole holding at its ${short(GONE_BAR)} close`) && said.includes('not always what a holder received') && /\$42\.00/.test(said), said);
    await shot('03-close-out');
    await db.collection('pricequotes').updateOne({symbol: 'QBKG'}, {$set: {price: 5.2, fetchedAt: new Date()}});
    await page.locator('[data-close-out-confirm]').click();
    await page.getByText('QBKG has a live quote, so its orders go through the Trade Desk.').first().waitFor({timeout: 30000});
    check('a holding that quotes again is refused by the server, whatever the page shows', (await held(mainId, 'QBKG'))?.quantity === 10 && (await trades.countDocuments({accountId: mainId, symbol: 'QBKG', side: 'sell'})) === 0);

    // --- closing the gone holding at its last close --------------------------------------------
    await db.collection('pricequotes').updateOne({symbol: 'QBKG'}, {$set: {price: goneRow.price, fetchedAt: tenDaysAgo}});
    await page.locator('[data-close-out-confirm]').click();
    await page.getByText(/Sold 10 QBKG @ \$4\.20/).first().waitFor({timeout: 30000});
    check('the holding is closed', (await held(mainId, 'QBKG')) === null);
    const closed = await trades.findOne({accountId: mainId, symbol: 'QBKG', side: 'sell'});
    check('the fill is at the stored close and says so', closed?.price === 4.2 && closed.quantity === 10 && closed.reason === `Closed at the ${short(GONE_BAR)} close: no live quote for 3 sessions.`, JSON.stringify(closed && {p: closed.price, r: closed.reason}));
    check('…with its loss realised against the cost', Math.abs(closed.realizedPnl - 10 * (4.2 - 5)) < 1e-9, String(closed?.realizedPnl));
    await page.locator('[data-close-out="QBKG"]').waitFor({state: 'detached', timeout: 30000});
    check('the reason is on the trade log', (await logText()).includes(`Closed at the ${short(GONE_BAR)} close: no live quote for 3 sessions.`));
    await shot('04-after');
} catch (error) {
    check('suite ran to the end', false, error instanceof Error ? `${error.message}\n${error.stack}` : String(error));
    await shot('99-error').catch(() => undefined);
} finally {
    // Leave nothing another suite could trip on: the suite's rows on the shared collections,
    // and the SPY quote and benchmark rows its snapshot run wrote, if they were not there before.
    if (db) {
        await db.collection('pricequotes').deleteMany({symbol: {$in: hadSpyQuote ? SYMBOLS : [...SYMBOLS, 'SPY']}}).catch(() => undefined);
        await db.collection('benchmarksnapshots').deleteMany({symbol: 'SPY', date: {$nin: benchmarkBefore}}).catch(() => undefined);
        await db.collection('stocksplits').deleteMany({symbol: {$in: SYMBOLS}}).catch(() => undefined);
        await db.collection('pricebars').deleteMany({symbol: {$in: SYMBOLS}}).catch(() => undefined);
        await db.collection('jobruns').deleteMany({jobId: {$in: JOBS}}).catch(() => undefined);
        if (userId) await db.collection('paperaccounts').updateMany({userId}, {$set: {positions: []}}).catch(() => undefined);
    }
    await stub('/__reset').catch(() => undefined);
    await mongo.close().catch(() => undefined);
    await browser.close().catch(() => undefined);
}
summary('books');
