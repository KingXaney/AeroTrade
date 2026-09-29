// Browser QA for learning from your own account (learn Wave 2, slice 2.3). Seeds an account
// whose snapshots rise to a peak on day 4 and fall to a low on day 8, plus SPY bars deep
// enough that the benchmark store never refetches, and checks that the Max Drawdown tile's
// hint dates that stretch, sets SPY beside it and says what the climb back takes. A fresh
// account first shows the undated "needs history" hint.

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
    await shot('00-fresh');

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
    await shot('01-dated-drawdown');
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
