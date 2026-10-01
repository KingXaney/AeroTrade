// Browser + job QA for brokerage income: interest on idle cash, dividends on holdings, and
// the retroactive back-credit. Seeds an account with trades across two ex-dates, fresh ^IRX,
// SPY and AAPL bars (with dividend fields and coverage, so the job's bar step finds nothing
// to fetch and never overwrites the fixtures), and legacy snapshots — then fires the REAL
// job through the Inngest dev server, scoped to this suite's own account.
// The panel's receipts are then held to the rows the job stored: each month's interest to the
// cent from average cash × the daily factor × days, each dividend from the entitled close.
//
// Needs the Inngest dev server on :8288 (`npx inngest-cli@latest dev -u
// http://localhost:3000/api/inngest`); without it the job checks are skipped and noted.

import {chromium} from 'playwright';
import {MongoClient} from 'mongodb';
import {BASE, INNGEST, MONGO, check, note, outDir, signUp, summary} from './lib.mjs';

const OUT = outDir('income');

// ET calendar helpers — the job dates everything in America/New_York.
const etDate = (d = new Date()) => new Intl.DateTimeFormat('en-CA', {timeZone: 'America/New_York'}).format(d);
const addDays = (date, n) => { const [y, m, d] = date.split('-').map(Number); return new Date(Date.UTC(y, m - 1, d + n)).toISOString().slice(0, 10); };
const isWeekday = (date) => { const wd = new Date(`${date}T12:00:00Z`).getUTCDay(); return wd !== 0 && wd !== 6; };
const weekdayOnOrBefore = (date) => { let d = date; while (!isWeekday(d)) d = addDays(d, -1); return d; };
const etNoon = (date) => new Date(`${date}T16:00:00Z`);
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const short = (date) => `${MONTHS[Number(date.slice(5, 7)) - 1]} ${Number(date.slice(8, 10))}`;
const dollars = (text) => Number(text.replace(/[$,]/g, ''));
const cents = (amount) => Math.round(amount * 100);
const dailyFactor = (apy) => (1 + apy) ** (1 / 365) - 1;

const TODAY = etDate();
const YESTERDAY = addDays(TODAY, -1);
const LAST_BAR = weekdayOnOrBefore(YESTERDAY);
const INCEPTION = addDays(TODAY, -24);
const BUY_SPY = weekdayOnOrBefore(addDays(TODAY, -22));
const BUY_AAPL = weekdayOnOrBefore(addDays(TODAY, -20));
const EX_AAPL = weekdayOnOrBefore(addDays(TODAY, -14));   // paid 5 days later, well before yesterday
const EX_SPY = weekdayOnOrBefore(addDays(TODAY, -8));
const SNAP_EARLY = addDays(TODAY, -15);
const SNAP_LATE = addDays(TODAY, -2);

const browser = await chromium.launch({channel: 'chrome'});
const page = await browser.newPage({viewport: {width: 1440, height: 900}});
const shot = (n) => page.screenshot({path: `${OUT}${n}.png`, fullPage: true});
const mongo = new MongoClient(MONGO);
const inngestUp = await fetch(`${INNGEST}/`).then(() => true).catch(() => false);
console.log(inngestUp ? `Inngest dev server on ${INNGEST} — running the real job` : 'No Inngest dev server — job checks skipped');

const until = async (fn, ms) => { const end = Date.now() + ms; let v = await fn(); while (!v && Date.now() < end) { await page.waitForTimeout(1000); v = await fn(); } return v; };

try {
    await mongo.connect();
    const db = mongo.db();

    // --- account ------------------------------------------------------------------------
    const email = await signUp(page, 'Income');
    await page.goto(`${BASE}/portfolio`, {waitUntil: 'load'});   // lazily creates "Main account"
    const user = await db.collection('user').findOne({email});
    const userId = String(user?._id ?? user?.id);
    const account = await until(() => db.collection('paperaccounts').findOne({userId}), 30000);
    const accountId = String(account._id);
    check('signed up with a paper account', !!account);

    // --- market data: fresh through the previous session, fully covered --------------------
    // Deeper than ensureBars' 730-day "deep enough" check, or the job's bar step decides the
    // history is shallow, refetches five real years from Yahoo and overwrites these fixtures.
    const weekdays = [];
    for (let d = addDays(TODAY, -800); d <= LAST_BAR; d = addDays(d, 1)) if (isWeekday(d)) weekdays.push(d);
    const bar = (symbol, date, close, dividend = 0) => ({
        updateOne: {filter: {symbol, date}, update: {$set: {symbol, date, close, open: close, high: close, low: close, source: 'yahoo', dividend}}, upsert: true},
    });
    await db.collection('pricebars').bulkWrite([
        ...weekdays.map((d) => bar('^IRX', d, 4.07)),
        ...weekdays.map((d, i) => bar('SPY', d, 600 + i * 0.5, d === EX_SPY ? 1.889 : 0)),
        ...weekdays.map((d) => bar('AAPL', d, 230, d === EX_AAPL ? 0.26 : 0)),
    ]);
    for (const symbol of ['SPY', 'AAPL']) {
        await db.collection('priceseriesmetas').updateOne({symbol}, {$set: {symbol, dividendsFrom: '2021-01-04', dividendsThrough: LAST_BAR, updatedAt: new Date()}, $unset: {failingSince: ''}}, {upsert: true});
    }

    // --- history: two buys before their ex-dates, two snapshots written before income existed
    await db.collection('paperaccounts').updateOne({_id: account._id}, {
        $set: {
            inceptionAt: etNoon(INCEPTION), startingBalance: 100_000, cash: 100_000 - 6_000 - 4_600,
            positions: [{symbol: 'SPY', company: 'SPDR S&P 500', quantity: 10, avgCost: 600}, {symbol: 'AAPL', company: 'Apple', quantity: 20, avgCost: 230}],
        },
        $unset: {incomeThrough: '', incomeTotals: ''},
    });
    await db.collection('papertrades').insertMany([
        {userId, accountId, symbol: 'SPY', company: 'SPDR S&P 500', side: 'buy', quantity: 10, price: 600, total: 6_000, source: 'user', createdAt: etNoon(BUY_SPY)},
        {userId, accountId, symbol: 'AAPL', company: 'Apple', side: 'buy', quantity: 20, price: 230, total: 4_600, source: 'user', createdAt: etNoon(BUY_AAPL)},
    ]);
    await db.collection('accountsnapshots').insertMany([
        {accountId, userId, date: SNAP_EARLY, totalValue: 100_050, cash: 89_400, holdingsValue: 10_650, startingBalance: 100_000},
        {accountId, userId, date: SNAP_LATE, totalValue: 100_120, cash: 89_400, holdingsValue: 10_720, startingBalance: 100_000},
    ]);

    // --- before any credit: the page is honest about there being none yet ---------------
    await page.goto(`${BASE}/portfolio`, {waitUntil: 'load'});
    await page.locator('#income').waitFor({timeout: 30000});
    check('income panel says there is none yet', /No income yet/.test(await page.locator('#income').innerText()));
    check('the Income tile says the first credit is tonight', /First credit tonight/.test(await page.locator('main').innerText()));

    if (inngestUp) {
        const fire = () => fetch(`${INNGEST}/e/qa`, {
            method: 'POST', headers: {'Content-Type': 'application/json'},
            body: JSON.stringify({name: 'app/credit.account.income', data: {accountIds: [accountId]}}),
        });

        // --- the back-credit: replayed from inception ---------------------------------
        await fire();
        const credited = await until(async () => (await db.collection('paperaccounts').findOne({_id: account._id}))?.incomeThrough, 120000);
        check('the job credits through yesterday', credited === YESTERDAY, String(credited));
        const rows = await db.collection('accountincomes').find({accountId}).sort({date: 1}).toArray();
        const interest = rows.filter((r) => r.kind === 'interest');
        const dividends = rows.filter((r) => r.kind === 'dividend');
        const days = Math.round((Date.parse(`${YESTERDAY}T00:00:00Z`) - Date.parse(`${INCEPTION}T00:00:00Z`)) / 86_400_000) + 1;
        check('one interest row per calendar day since inception', interest.length === days, `${interest.length}/${days}`);
        check('both dividends paid, five days after their ex-dates', dividends.length === 2
            && dividends.some((r) => r.symbol === 'SPY' && r.exDate === EX_SPY && r.date === addDays(EX_SPY, 5) && Math.abs(r.amount - 18.89) < 1e-9)
            && dividends.some((r) => r.symbol === 'AAPL' && r.exDate === EX_AAPL && Math.abs(r.amount - 5.2) < 1e-9), JSON.stringify(dividends.map((d) => [d.symbol, d.exDate, d.date, d.amount])));
        const total = rows.reduce((s, r) => s + r.amount, 0);
        const after = await db.collection('paperaccounts').findOne({_id: account._id});
        check('cash rose by exactly the credited rows', Math.abs(after.cash - (89_400 + total)) < 1e-6, `${(after.cash - 89_400).toFixed(4)} vs ${total.toFixed(4)}`);

        const snaps = await db.collection('accountsnapshots').find({accountId}).sort({date: 1}).toArray();
        const before = (d) => rows.filter((r) => r.date < d).reduce((s, r) => s + r.amount, 0);
        check('each old snapshot gains exactly the income dated before it', snaps.length === 2
            && Math.abs(snaps[0].cash - (89_400 + before(SNAP_EARLY))) < 1e-6
            && Math.abs(snaps[1].totalValue - (100_120 + before(SNAP_LATE))) < 1e-6);

        // --- a second run changes nothing -------------------------------------------------
        await fire();
        await page.waitForTimeout(8000);
        const again = await db.collection('paperaccounts').findOne({_id: account._id});
        const snapsAgain = await db.collection('accountsnapshots').find({accountId}).sort({date: 1}).toArray();
        check('a second run changes nothing', again.cash === after.cash && (await db.collection('accountincomes').countDocuments({accountId})) === rows.length);
        check('…and never shifts a snapshot twice', snapsAgain.every((s, i) => s.cash === snaps[i].cash));

        // --- the page ------------------------------------------------------------------------
        await page.goto(`${BASE}/portfolio`, {waitUntil: 'load'});
        await page.locator('#income').waitFor({timeout: 30000});
        const main = await page.locator('main').innerText();
        check('Buying Power shows the rate cash is earning', /earning \d+\.\d{2}% APY/.test(main));
        check('Total Return says how much came from income', /incl\. \$[\d,.]+ interest · \$[\d,.]+ dividends/.test(main));
        const panel = await page.locator('#income').innerText();
        check('the panel lists both dividends at their declared amount', /SPY/.test(panel) && /AAPL/.test(panel) && /10 × \$1\.889 · paid/.test(panel) && /20 × \$0\.26 · paid/.test(panel), panel.replace(/\n/g, ' | ').slice(0, 200));
        const months = [...new Set(interest.map((r) => r.date.slice(0, 7)))];
        check('interest is one line per month, not one per day', (await page.locator('[data-testid="income-interest"] li').count()) === months.length, `${await page.locator('[data-testid="income-interest"] li').count()} li for ${months.length} month(s)`);

        // --- receipts: each one reproduces the stored rows to the cent ------------------------
        await page.locator('#income details[data-income-receipt]').evaluateAll((els) => els.forEach((d) => { d.open = true; }));
        // The daily rate prints to 6–12 decimals: the fewest at which the printed numbers multiply back.
        const RECEIPT = /^average cash (\$[\d,]+\.\d{2}) × (0\.\d{6,12})%\/day \(\(1 \+ (\d+\.\d{2})%\)\^\(1\/365\) − 1\) × (\d+) days? = (\$[\d,]+\.\d{2})$/;
        for (const month of months) {
            const text = (await page.locator(`[data-income-month="${month}"] details p`).first().innerText().catch(() => '')).trim();
            const stored = interest.filter((r) => r.date.startsWith(month));
            const sum = stored.reduce((s, r) => s + r.amount, 0);
            const averageCash = stored.reduce((s, r) => s + r.amount / dailyFactor(r.apy), 0) / stored.length;
            const m = RECEIPT.exec(text);
            check(`${month}: the receipt prints the daily factor, not ÷ 365`, m !== null && !/÷/.test(text), text);
            if (m === null) continue;
            check(`${month}: its total is the stored rows to the cent`, cents(dollars(m[5])) === cents(sum), `${m[5]} vs ${sum.toFixed(4)}`);
            check(`${month}: its average cash is rebuilt from the stored rows`, cents(dollars(m[1])) === cents(averageCash) && Number(m[4]) === stored.length, `${m[1]} vs ${averageCash.toFixed(4)}, ${m[4]} days`);
            check(`${month}: the printed numbers multiply back to the stored cent`, cents(dollars(m[1]) * Number(m[2]) / 100 * Number(m[4])) === cents(sum), `${(dollars(m[1]) * Number(m[2]) / 100 * Number(m[4])).toFixed(4)} vs ${sum.toFixed(4)}`);
        }
        const dividendReceipt = async (symbol) => (await page.locator(`[data-income-dividend="${symbol}"] details p`).first().innerText().catch(() => '')).trim();
        check('the SPY receipt reads the entitled close, the arithmetic and the pay lag',
            await dividendReceipt('SPY') === `10 shares held at the end of ${short(addDays(EX_SPY, -1))}, the day before the ${short(EX_SPY)} ex-date (held since ${short(BUY_SPY)}) · 10 × $1.889 = $18.89 · paid ${short(addDays(EX_SPY, 5))}, 5 days after the ex-date`,
            await dividendReceipt('SPY'));
        check('the AAPL receipt too', /^20 shares held at the end of .* · 20 × \$0\.26 = \$5\.20 · paid .*, 5 days after the ex-date$/.test(await dividendReceipt('AAPL')), await dividendReceipt('AAPL'));
        check('no fill missed an ex-date, so there is no missed block', (await page.locator('#income [data-testid=income-missed]').count()) === 0);
        check('the chart is against SPY total return', /SPY, total return/.test(main) && /benchmark is SPY/.test(main));
        check('trade count is unchanged by income', /Trades\s*2\b/i.test(main.replace(/\n/g, ' ')), main.match(/Trades[\s\S]{0,20}/)?.[0]);
        const csv = await (await page.request.get(`${BASE}/api/accounts/${accountId}/export`)).text();
        check('the CSV export still holds only the two trades', csv.trim().split('\n').length === 3, `${csv.trim().split('\n').length - 1} rows`);
        await shot('01-portfolio-with-income');

        // --- reset clears it all -------------------------------------------------------------
        await page.getByRole('button', {name: /Reset Account/i}).click();
        await page.locator('[role="dialog"]').getByRole('button', {name: /Reset account/i}).click();
        await until(async () => (await db.collection('papertrades').countDocuments({accountId})) === 0, 30000);
        const reset = await db.collection('paperaccounts').findOne({_id: account._id});
        check('a reset clears the watermark and totals', reset.incomeThrough === undefined && reset.incomeTotals === undefined);
        check('a reset deletes the income rows', (await db.collection('accountincomes').countDocuments({accountId})) === 0);
    } else {
        note('job, idempotency, snapshots and panel checks', 'start the Inngest dev server to run them');
    }
} catch (err) {
    check(`threw: ${err.message}`, false);
    await shot('99-error').catch(() => {});
} finally {
    await mongo.close().catch(() => {});
    await browser.close();
}

summary('income');
