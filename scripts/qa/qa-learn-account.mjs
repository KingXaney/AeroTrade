// Browser QA for learning from your own account (learn Wave 2, slice 2.3). Seeds an account
// whose snapshots rise to a peak on day 4 and fall to a low on day 8, plus SPY bars deep
// enough that the benchmark store never refetches, and checks that the Max Drawdown tile's
// hint dates that stretch, sets SPY beside it and says what the climb back takes, and that
// the chart shades it. Then a sell, a holding with no quote and income totals: the return
// bridge asks for a guess, reveals lines that add up to the Total Return tile to the cent,
// remembers the guess across a reload, and the risk lens names the largest position beside
// the Navigator's rails. Notes on the seeded buys come back as text under the sell that closed
// them and in the sell dialog, every fill carries a receipt, and /trade shows the last fill.
// The Income panel reads a receipt for every month and a buy made on its own ex-date. A fresh
// account first shows every empty state.

import {chromium} from 'playwright';
import {MongoClient} from 'mongodb';
import {mkdirSync} from 'node:fs';

const BASE = 'http://localhost:3000';
const MONGO = 'mongodb://127.0.0.1:27117/aerotrade';
const OUT = new URL('./output/learn-account/', import.meta.url).pathname;
mkdirSync(OUT, {recursive: true});

let failures = 0;
const check = (name, ok, detail = '') => {
    if (!ok) failures++;
    console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? `  — ${detail}` : ''}`);
};

const etDate = (d = new Date()) => new Intl.DateTimeFormat('en-CA', {timeZone: 'America/New_York'}).format(d);
const addDays = (date, n) => { const [y, m, d] = date.split('-').map(Number); return new Date(Date.UTC(y, m - 1, d + n)).toISOString().slice(0, 10); };
const isWeekday = (date) => { const wd = new Date(`${date}T12:00:00Z`).getUTCDay(); return wd !== 0 && wd !== 6; };
const weekdayOnOrBefore = (date) => { let d = date; while (!isWeekday(d)) d = addDays(d, -1); return d; };
const etNoon = (date) => new Date(`${date}T16:00:00Z`);
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const short = (date) => `${MONTHS[Number(date.slice(5, 7)) - 1]} ${Number(date.slice(8, 10))}`;
const escape = (text) => text.replace(/[.*+?^${}()|[\]\\]/g, (m) => `\\${m}`);

const TODAY = etDate();
const LAST_BAR = weekdayOnOrBefore(addDays(TODAY, -1));
const FIRST_SNAP = addDays(TODAY, -12);
// Day 4 is the peak (102,000), day 8 the low (96,000): a 5.88% fall that needs +6.25% back.
// Today's live point is the cash, 100,000, still short of the peak.
const VALUES = [100_000, 100_500, 101_000, 102_000, 101_000, 99_000, 97_000, 96_000, 97_000, 98_000];
const PEAK = addDays(FIRST_SNAP, 3);
const TROUGH = addDays(FIRST_SNAP, 7);

const browser = await chromium.launch({channel: 'chrome'});
const page = await browser.newPage({viewport: {width: 1440, height: 900}});
const shot = (n) => page.screenshot({path: `${OUT}${n}.png`, fullPage: true});
const mongo = new MongoClient(MONGO);
const until = async (fn, ms) => { const end = Date.now() + ms; let v = await fn(); while (!v && Date.now() < end) { await page.waitForTimeout(1000); v = await fn(); } return v; };
// The Max Drawdown tile's hint: the element whose own text is the hint, found by its shape.
const HINT = /^(Needs 2\+ days of history|Largest peak-to-trough dip|[A-Z][a-z]{2} \d+.* → .*)$/;
const drawdownHint = async () => {
    await page.locator('main').getByText(/max drawdown/i).first().waitFor({timeout: 30000});
    const found = page.locator('main span, main p, main div').filter({hasText: HINT});
    const texts = await found.evaluateAll((els) => els.filter((el) => el.children.length === 0).map((el) => el.textContent.trim()));
    return texts.find((t) => /Needs 2\+ days|peak-to-trough| → /.test(t)) ?? '';
};
const tileValue = async () => (await page.locator('main').getByText(/^−\d+\.\d{2}%$/).allTextContents()).join(' ');

try {
    await mongo.connect();
    const db = mongo.db('aerotrade');

    // --- a fresh account -------------------------------------------------------------------
    const email = `qalearnaccount${Date.now()}@example.com`;
    await page.goto(`${BASE}/sign-up`, {waitUntil: 'load'});
    await page.fill('#fullName', 'QA Learn Account');
    await page.fill('#email', email);
    await page.fill('#password', 'Passw0rd!Passw0rd!');
    await page.click('button[type="submit"]');
    await page.waitForURL(new RegExp(`^${BASE}/(\\?.*)?$`), {timeout: 90000});
    await page.goto(`${BASE}/portfolio`, {waitUntil: 'load'});   // lazily creates "Main Strategy"
    const user = await db.collection('user').findOne({email: email.toLowerCase()});
    const userId = String(user?._id ?? user?.id);
    const account = await until(() => db.collection('paperaccounts').findOne({userId}), 30000);
    check('signed up with a paper account', !!account);
    const accountId = String(account._id);
    await page.goto(`${BASE}/portfolio`, {waitUntil: 'load'});
    const fresh = await drawdownHint();
    check('a fresh account keeps the undated hint', /Needs 2\+ days of history/.test(fresh), fresh || (await page.locator('main').innerText()).replace(/\s+/g, ' ').slice(0, 400));
    const text = async (sel) => (await page.locator(sel).first().innerText().catch(() => '')).replace(/\s+/g, ' ').trim();
    check('a fresh account has nothing to split yet', /Nothing to split yet/.test(await text('#return-bridge')), await text('#return-bridge'));
    check('a fresh account has no swing yet', /Needs 3\+ days of history/.test(await text('[data-testid=risk-swing]')), await text('[data-testid=risk-swing]'));
    check('an all-cash account says so', /cash 100% · no holdings yet/.test(await text('[data-testid=risk-largest]')), await text('[data-testid=risk-largest]'));
    check('an all-cash account has no concentration caption', (await page.locator('[data-testid=risk-caption]').count()) === 0);
    check('a fresh account shades no band', (await page.locator('[data-testid=drawdown-band]').count()) === 0);
    check('a fresh account has no income and no missed block', /No income yet/.test(await text('#income')) && (await page.locator('[data-testid=income-missed]').count()) === 0, await text('#income'));
    await shot('00-fresh');
    await page.goto(`${BASE}/trade`, {waitUntil: 'load'});
    await page.locator('#last-fill').waitFor({timeout: 30000});
    check('a fresh desk has no last fill yet', /No fills in this account yet/.test(await text('#last-fill')) && (await page.locator('#last-fill [data-testid=fill-receipt]').count()) === 0, await text('#last-fill'));
    check('the ticket offers a why field capped at 200', (await page.locator('#order-note').getAttribute('maxlength')) === '200');

    // --- SPY bars, deeper than the store's "deep enough" check, and dividend coverage -------
    const weekdays = [];
    for (let d = addDays(TODAY, -800); d <= LAST_BAR; d = addDays(d, 1)) if (isWeekday(d)) weekdays.push(d);
    await db.collection('pricebars').bulkWrite(weekdays.map((d, i) => ({
        updateOne: {filter: {symbol: 'SPY', date: d}, update: {$set: {symbol: 'SPY', date: d, close: 600 + i * 0.5, open: 600, high: 600, low: 600, source: 'yahoo', dividend: 0}}, upsert: true},
    })));
    await db.collection('priceseriesmetas').updateOne({symbol: 'SPY'}, {$set: {symbol: 'SPY', dividendsFrom: '2021-01-04', dividendsThrough: LAST_BAR, updatedAt: new Date()}, $unset: {failingSince: ''}}, {upsert: true});

    // --- ten days of history: peak day 4, low day 8 ------------------------------------------
    await db.collection('paperaccounts').updateOne({_id: account._id}, {
        $set: {inceptionAt: etNoon(addDays(FIRST_SNAP, -1)), startingBalance: 100_000, cash: 100_000, positions: []},
    });
    await db.collection('accountsnapshots').insertMany(VALUES.map((value, i) => ({
        accountId, userId, date: addDays(FIRST_SNAP, i), totalValue: value, cash: value, holdingsValue: 0, startingBalance: 100_000,
    })));

    await page.goto(`${BASE}/portfolio`, {waitUntil: 'load'});
    const hint = await drawdownHint();
    check('the tile shows the seeded fall', /−5\.88%/.test(await tileValue()), await tileValue());
    check('the hint dates the stretch peak → low', new RegExp(`${escape(short(PEAK))} → ${escape(short(TROUGH))}`).test(hint), hint);
    check('the hint sets SPY beside it over the same days', /SPY [+−]\d+\.\d% same days/.test(hint), hint);
    check('the hint says what the climb back takes', /\+6\.3% to recover/.test(hint), hint);
    check('the hint matches the dated pattern', /[A-Z][a-z]{2} \d+ → [A-Z][a-z]{2} \d+ · SPY [+−]\d+\.\d% same days · \+\d+\.\d% to recover/.test(hint), hint);
    const panels = page.locator('main [data-what-these-mean]');
    await panels.evaluateAll((els) => els.forEach((d) => { d.open = true; }));
    const terms = (await panels.allInnerTexts()).join(' | ');
    check('a dated hint brings Recovery into the panel\'s definitions', /recovery/i.test(terms), terms.replace(/\s+/g, ' ').slice(0, 300));
    const band = page.locator('[data-testid=drawdown-band]');
    check('the chart shades one drawdown band', (await band.count()) === 1);
    const bandWidth = Number(await band.first().getAttribute('width').catch(() => '0'));
    check('the band has width', bandWidth > 0, String(bandWidth));
    check('the band legend dates the stretch', new RegExp(`${escape(short(PEAK))} → ${escape(short(TROUGH))}`).test(await text('[data-testid=drawdown-band-legend]')), await text('[data-testid=drawdown-band-legend]'));
    check('ten days of history give a typical daily swing', /±\$[\d,]+/.test(await text('[data-testid=risk-swing]')), await text('[data-testid=risk-swing]'));
    await shot('01-dated-drawdown');

    // --- a sell, a holding and income: the bridge ------------------------------------------
    // Total return = 250 realized + 12.34 interest + 5.66 dividends + 0 on a holding with no
    // quote (valued at cost) = +$268.00, of which income is 18.00 (7%).
    await db.collection('paperaccounts').updateOne({_id: account._id}, {$set: {
        cash: 100_000 + 250 + 12.34 + 5.66 - 6_000,
        positions: [{symbol: 'QALRN', company: 'QA Learn Co', quantity: 10, avgCost: 600}],
        incomeTotals: {interest: 12.34, dividends: 5.66},
    }});
    const at = (n) => new Date(Date.now() - n * 60_000);
    await db.collection('papertrades').insertMany([
        {userId, accountId, symbol: 'SPY', company: 'SPDR S&P 500', side: 'buy', quantity: 5, price: 500, total: 2500, source: 'user', reason: 'earnings <b>beat</b>', createdAt: at(30)},
        {userId, accountId, symbol: 'SPY', company: 'SPDR S&P 500', side: 'sell', quantity: 5, price: 550, total: 2750, realizedPnl: 250, source: 'user', createdAt: at(20)},
        {userId, accountId, symbol: 'QALRN', company: 'QA Learn Co', side: 'buy', quantity: 10, price: 600, total: 6000, source: 'user', reason: 'long runway', createdAt: at(10)},
    ]);
    await page.goto(`${BASE}/portfolio`, {waitUntil: 'load'});
    await page.locator('main').getByText(/max drawdown/i).first().waitFor({timeout: 30000});
    const form = page.locator('[data-bridge-guess-form]');
    check('a gain with income asks for a guess first', (await form.count()) === 1 && (await page.locator('[data-bridge-line]').count()) === 0, await text('#return-bridge'));
    check('the guess prompt names the total', /\+\$268\.00/.test(await text('[data-bridge-guess-form]')), await text('[data-bridge-guess-form]'));
    await page.locator('#bridge-guess').fill('10');
    await page.click('#bridge-reveal');
    await page.locator('[data-bridge-line]').first().waitFor({timeout: 10000});
    const cents = await page.locator('[data-bridge-line]').evaluateAll((els) => els.map((el) => [el.dataset.bridgeLine, Number(el.dataset.cents)]));
    const totalCents = Number(await page.locator('[data-bridge-total]').getAttribute('data-cents'));
    const sum = cents.reduce((acc, [, c]) => acc + c, 0);
    check('the bridge lines add up to its total to the cent', sum === totalCents, JSON.stringify(cents) + ` total ${totalCents}`);
    const tile = (await page.locator('main').getByText(/^\+\$[\d,]+\.\d{2} \(\+\d+\.\d{2}%\)$/).first().textContent().catch(() => '')) ?? '';
    const tileCents = Math.round(Number(tile.replace(/^\+\$/, '').split(' ')[0].replace(/,/g, '')) * 100);
    check('the bridge total matches the Total Return tile', tileCents === totalCents && totalCents === 26_800, `tile "${tile}" bridge ${totalCents}`);
    const byKey = Object.fromEntries(cents);
    check('each line carries its part', byKey.realized === 25_000 && byKey.interest === 1_234 && byKey.dividends === 566 && byKey.price === 0 && !('residual' in byKey), JSON.stringify(byKey));
    check('the unpriced holding is noted once, on the price line', /valued at cost/.test(await text('[data-bridge-line=price]')), await text('[data-bridge-line=price]'));
    check('the reveal states the guess and the share', /You guessed 10% on [A-Z][a-z]{2} \d+ · interest and dividends were 7% of it/.test(await text('[data-bridge-guess]')), await text('[data-bridge-guess]'));
    await shot('02-bridge');

    await page.reload({waitUntil: 'load'});
    await page.locator('[data-bridge-guess]').waitFor({timeout: 30000});
    check('a stored guess skips the slider', (await form.count()) === 0 && (await page.locator('[data-bridge-line]').count()) > 0);
    await page.click('#bridge-guess-again');
    check('guess again brings the slider back', (await form.count()) === 1 && (await page.locator('[data-bridge-line]').count()) === 0);

    check('the largest position is the holding', /6%/.test(await text('[data-testid=risk-largest]')) && /QALRN/.test(await text('[data-testid=risk-largest]')), await text('[data-testid=risk-largest]'));
    check('the caption sets it beside the Navigator rails', /6% of this account moves with one holding, QALRN · the AI Navigator caps itself at 20% per name and keeps at least 10% in cash/.test(await text('[data-testid=risk-caption]')), await text('[data-testid=risk-caption]'));
    await shot('03-risk-lens');

    // --- the learner's why and each fill's receipt ------------------------------------------
    const reasons = await page.locator('main [data-trade-reason]').allInnerTexts();
    check('a note with markup renders as the text typed', reasons.includes('earnings <b>beat</b>') && (await page.locator('main [data-trade-reason] b').count()) === 0, reasons.join(' | '));
    check('a sell quotes the note of the buy it closed', /^bought for: “earnings <b>beat<\/b>”$/.test(await text('[data-testid=bought-for]')) && (await page.locator('[data-testid=bought-for]').count()) === 1, await text('[data-testid=bought-for]'));
    const receipts = (await page.locator('main [data-testid=fill-receipt]').allInnerTexts()).map((r) => r.replace(/\s+/g, ' ').trim());
    check('every fill carries a receipt', receipts.length === 3, String(receipts.length));
    check('the sell\'s receipt reads cash, shares, cost and result',
        receipts.includes('Cash +$2,750.00 · SPY 5 → 0 shares · avg cost $500.00 → — · realized +$250.00'), receipts.join(' | '));
    check('a buy\'s receipt reads cash, shares and the new cost', receipts.includes('Cash −$6,000.00 · QALRN 0 → 10 shares · avg cost — → $600.00'), receipts.join(' | '));
    await page.getByRole('button', {name: /^Sell$/}).first().click();
    const lotNotes = page.locator('[data-testid=sell-lot-notes]');
    await lotNotes.waitFor({timeout: 15000}).catch(() => {});
    check('the sell dialog shows what you wrote when you bought', /10 shares from [A-Z][a-z]{2} \d+ at \$600\.00 — “long runway”/.test(await text('[data-testid=sell-lot-notes]')), await text('[data-testid=sell-lot-notes]'));
    await shot('04-sell-notes');
    await page.keyboard.press('Escape');

    await page.goto(`${BASE}/trade`, {waitUntil: 'load'});
    await page.locator('#last-fill [data-testid=last-fill-title]').waitFor({timeout: 30000});
    check('the desk shows the last fill', /^Bought 10 QALRN @ \$600\.00 · [A-Z][a-z]{2} \d+$/.test(await text('#last-fill [data-testid=last-fill-title]')), await text('#last-fill'));
    check('…with its receipt', (await text('#last-fill [data-testid=fill-receipt]')) === 'Cash −$6,000.00 · QALRN 0 → 10 shares · avg cost — → $600.00', await text('#last-fill [data-testid=fill-receipt]'));
    check('…and the why you wrote', (await text('#last-fill [data-testid=last-fill-note]')) === 'your why: “long runway”', await text('#last-fill [data-testid=last-fill-note]'));
    await shot('05-last-fill');

    // --- income receipts: seeded rows, and a buy on its own ex-date --------------------------
    // QALRN was bought 10 minutes ago; a dividend with that day as its ex-date is one the buy
    // missed by a day. Three interest rows on $100,000 at 3.92% APY give a receipt to rebuild.
    const QALRN_DAY = etDate((await db.collection('papertrades').findOne({accountId, symbol: 'QALRN'})).createdAt);
    const factor = (1 + 0.0392) ** (1 / 365) - 1;
    const interestDays = [3, 2, 1].map((n) => addDays(QALRN_DAY, -n));
    const epoch = etNoon(addDays(FIRST_SNAP, -1)).getTime();
    await db.collection('pricebars').updateOne({symbol: 'QALRN', date: QALRN_DAY}, {$set: {symbol: 'QALRN', date: QALRN_DAY, close: 600, source: 'yahoo', dividend: 0.5}}, {upsert: true});
    await db.collection('accountincomes').insertMany(interestDays.map((date) => ({
        accountId, userId, epoch, kind: 'interest', date, symbol: '', amount: 100_000 * factor, apy: 0.0392, createdAt: new Date(),
    })));
    await db.collection('paperaccounts').updateOne({_id: account._id}, {$set: {incomeThrough: QALRN_DAY}});
    await page.goto(`${BASE}/portfolio`, {waitUntil: 'load'});
    await page.locator('#income [data-testid=income-interest]').waitFor({timeout: 30000});
    const missedLines = (await page.locator('[data-testid=income-missed] p').allInnerTexts()).map((l) => l.trim());
    check('a buy on the ex-date is stated once, in the one missed block',
        (await page.locator('[data-testid=income-missed]').count()) === 1 && /missed by a day/i.test(await text('[data-testid=income-missed]'))
            && missedLines.length === 1 && missedLines[0] === `Bought 10 QALRN on ${short(QALRN_DAY)}, its ex-dividend date: a day late for $0.50 a share ($5.00).`,
        missedLines.join(' | '));
    check('the missed block is muted, not a warning', /text-fg-muted/.test(await page.locator('[data-testid=income-missed]').getAttribute('class')) && !/text-warning/.test(await page.locator('[data-testid=income-missed]').getAttribute('class')));
    await page.locator('#income details[data-income-receipt]').evaluateAll((els) => els.forEach((d) => { d.open = true; }));
    const monthReceipts = (await page.locator('#income [data-income-month] details p').allInnerTexts()).map((r) => r.trim());
    // The rate prints to as many decimals (6–12) as it takes for the printed numbers to multiply
    // back to the printed total: 0.010535% × 3 days on $100,000 is $31.605, so this one needs 7.
    const RECEIPT_100K = /^average cash \$100,000\.00 × (0\.010535\d{0,6})%\/day \(\(1 \+ 3\.92%\)\^\(1\/365\) − 1\) × (\d) days? = \$([\d.]+)$/;
    check('each interest month rebuilds from $100,000 at the daily factor of 3.92%, to its printed cent',
        monthReceipts.length > 0 && monthReceipts.every((r) => {
            const m = RECEIPT_100K.exec(r);
            return m !== null && Math.round(100_000 * (Number(m[1]) / 100) * Number(m[2]) * 100) === Math.round(Number(m[3]) * 100);
        }),
        monthReceipts.join(' | '));
    const seededByMonth = {};
    for (const date of interestDays) seededByMonth[date.slice(0, 7)] = (seededByMonth[date.slice(0, 7)] ?? 0) + 100_000 * factor;
    const printedByMonth = Object.fromEntries(await page.locator('#income [data-income-month]').evaluateAll((els) =>
        els.map((el) => [el.dataset.incomeMonth, Number((/= \$([\d,]+\.\d{2})$/.exec((el.querySelector('details p')?.textContent ?? '').trim())?.[1] ?? 'NaN').replace(/,/g, ''))])));
    check('…and each receipt totals its month\'s seeded rows to the cent',
        Object.keys(seededByMonth).length === Object.keys(printedByMonth).length
            && Object.entries(seededByMonth).every(([month, sum]) => Math.round(printedByMonth[month] * 100) === Math.round(sum * 100)),
        `${JSON.stringify(printedByMonth)} vs ${JSON.stringify(seededByMonth)}`);
    const incomeTerms = page.locator('#income [data-what-these-mean]');
    check('the income panel keeps exactly one What these mean', (await incomeTerms.count()) === 1);
    await incomeTerms.evaluateAll((els) => els.forEach((d) => { d.open = true; }));
    const incomeDefs = await text('#income [data-what-these-mean]');
    check('…and it carries the discount → bond-equivalent − spread conversion', /Bond-equivalent yield/.test(incomeDefs) && /APY = 365 × d ÷ \(360 − 91 × d\) − 0\.25%/.test(incomeDefs), incomeDefs.slice(0, 300));
    check('no Ask link inside a receipt', (await page.locator('#income [data-income-receipt] a').count()) === 0);
    await shot('06-income-receipts');
} catch (err) {
    failures++;
    console.log(`FAIL  threw: ${err.message}`);
    await shot('99-error').catch(() => {});
} finally {
    await mongo.close().catch(() => {});
    await browser.close();
}

console.log(failures === 0 ? '\nAll learn-account checks passed.' : `\n${failures} check(s) failed.`);
process.exit(failures === 0 ? 0 : 1);
