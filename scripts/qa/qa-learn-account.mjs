// Learning from your own account (lib/learn, components/learn on /portfolio). Seeds an account
// whose snapshots rise to a peak on day 4 and fall to a low on day 8, plus SPY bars deep
// enough that the benchmark store never refetches, and checks that the Max Drawdown tile's
// hint dates that stretch, sets SPY beside it and says what the climb back takes, and that
// the chart shades it. Then a sell, a holding with no quote and income totals: the return
// bridge asks for a guess, reveals lines that add up to the Total Return tile to the cent,
// remembers the guess across a reload, and the risk lens names the largest position beside
// the Navigator's rails. Notes on the seeded buys come back as text under the sell that closed
// them and in the sell dialog, every fill carries a receipt, and /trade shows the last fill.
// The Income panel reads a receipt for every month and a buy made on its own ex-date. Luck or
// skill places the account among a replayed sample of random portfolios (dividends and interest
// replayed on the one income convention, the window's sessions on the NYSE calendar, each marker
// placed on the axis; withheld with an unpriced holding and no snapshot on the last session,
// ended on the last snapshot's date and seeded from it when everything is priced), and Trading
// habits measures the learner's own lots over its window, a strategy round trip and an older
// sale left out. A fresh account first shows every empty state.
// Run: npm run qa -- learn-account   (the harness: README.md)

import {chromium} from 'playwright';
import {MongoClient} from 'mongodb';
// A TypeScript loader (declared in scripts/qa/package.json), for the app's NYSE holiday table
// (lib/prices/market-hours.ts).
import {createJiti} from 'jiti';
import {BASE, MONGO, check, outDir, signUp, summary} from './lib.mjs';

const OUT = outDir('learn-account');

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
const PEAK_INDEX = 3;
const TROUGH_INDEX = 7;
const PEAK = addDays(FIRST_SNAP, PEAK_INDEX);
const TROUGH = addDays(FIRST_SNAP, TROUGH_INDEX);
// PerformanceChart's own geometry: x(i) = PAD_X + i / (n − 1) × (WIDTH − 2 × PAD_X).
const CHART = {width: 720, padX: 44};
// '+0.2%', '−3.1%', '0.0%' — lib/learn/copy/portfolio.ts pctOneDecimal.
const pctOneDecimal = (pct) => { const r = Math.round(pct * 10) / 10; return r === 0 ? '0.0%' : `${r < 0 ? '−' : '+'}${Math.abs(r).toFixed(1)}%`; };

const browser = await chromium.launch({channel: 'chrome'});
const page = await browser.newPage({viewport: {width: 1440, height: 900}});
const shot = (n) => page.screenshot({path: `${OUT}${n}.png`, fullPage: true});
const mongo = new MongoClient(MONGO);
// Puts back the bars the luck checks set aside or seeded; replaced once they are seeded.
let restoreLuck = async () => {};
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
    const db = mongo.db();

    // --- a fresh account -------------------------------------------------------------------
    const email = await signUp(page, 'Learn Account');
    await page.goto(`${BASE}/portfolio`, {waitUntil: 'load'});   // lazily creates "Main account"
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
    // /portfolio has no order ticket, so the empty Holdings table links to the page that does.
    check('the empty Holdings table links to the Trade Desk, not to an order panel',
        await page.locator('[data-testid=positions-empty] a[href="/trade"]').count() === 1
            && !/order panel/i.test(await text('[data-testid=positions-empty]'))
            && await page.locator('#order-symbol').count() === 0,
        await text('[data-testid=positions-empty]'));
    check('an all-cash account has no concentration caption', (await page.locator('[data-testid=risk-caption]').count()) === 0);
    check('a fresh account shades no band', (await page.locator('[data-testid=drawdown-band]').count()) === 0);
    check('a fresh account has no income and no missed block', /No income yet/.test(await text('#income')) && (await page.locator('[data-testid=income-missed]').count()) === 0, await text('#income'));
    check('a fresh account\'s luck panel needs 10 trading days', /Needs 10 trading days/.test(await text('#luck-or-skill')) && (await page.locator('#luck-or-skill [data-testid=luck-histogram]').count()) === 0, await text('#luck-or-skill'));
    check('a fresh account\'s habits wait for 3 closed lots', /Habits show after 3 closed lots/.test(await text('#trading-habits')) && /closed 0 lots/.test(await text('#trading-habits')), await text('#trading-habits'));
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
    // SPY over exactly those days, from the seeded closes: each date reads the last bar on or
    // before it (the chart's forward fill across weekends), and no dividend moves the index.
    const spyClose = (date) => 600 + weekdays.indexOf(weekdayOnOrBefore(date)) * 0.5;
    const spySameDays = `SPY ${pctOneDecimal((spyClose(TROUGH) / spyClose(PEAK) - 1) * 100)} same days`;
    check('the hint sets SPY beside it over the same days', hint.includes(spySameDays), `${hint} | expected ${spySameDays}`);
    check('the hint says what the climb back takes', /\+6\.3% to recover/.test(hint), hint);
    check('the hint matches the dated pattern', /[A-Z][a-z]{2} \d+ → [A-Z][a-z]{2} \d+ · SPY [+−]\d+\.\d% same days · \+\d+\.\d% to recover/.test(hint), hint);
    const panels = page.locator('main [data-what-these-mean]');
    await panels.evaluateAll((els) => els.forEach((d) => { d.open = true; }));
    const terms = (await panels.allInnerTexts()).join(' | ');
    check('a dated hint brings Recovery into the panel\'s definitions', /recovery/i.test(terms), terms.replace(/\s+/g, ' ').slice(0, 300));
    const band = page.locator('[data-testid=drawdown-band]');
    check('the chart shades one drawdown band', (await band.count()) === 1);
    // Where the band sits, not only that it exists: from the seeded peak's x to the seeded low's,
    // on an n-point series (n read off the account line the band is drawn under).
    const accountLine = await page.locator('svg:has([data-testid=drawdown-band]) path.stroke-brand').first().getAttribute('d');
    const points = (accountLine?.match(/[ML]/g) ?? []).length;
    const xAt = (i) => CHART.padX + (i / (points - 1)) * (CHART.width - CHART.padX * 2);
    const bandX = Number(await band.first().getAttribute('x'));
    const bandWidth = Number(await band.first().getAttribute('width'));
    check('the band spans the seeded peak to the seeded low', points === VALUES.length + 1
        && Math.abs(bandX - xAt(PEAK_INDEX)) < 0.5 && Math.abs(bandWidth - (xAt(TROUGH_INDEX) - xAt(PEAK_INDEX))) < 0.5,
        `points=${points} x=${bandX} width=${bandWidth}, expected x=${xAt(PEAK_INDEX).toFixed(1)} width=${(xAt(TROUGH_INDEX) - xAt(PEAK_INDEX)).toFixed(1)}`);
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

    // --- luck or skill, and trading habits (learn Wave 3, slice 3.4) --------------------------
    // Sixty days of epoch, edge closes for all 40 large caps (every one bought at 100, large cap i
    // ends at 100 + i, so five of them in equal dollars return the mean of their i's), the SPY bars
    // seeded above, a flat 4.07% ^IRX over the window, and dividends: SPY and ten large caps paid
    // inside the window, one on the buy day (the seller's) and one whose pay date is after the last
    // day (not cash yet). The sample, SPY and the window are replayed here from the same seed, the
    // NYSE calendar and the one income convention (owed to the shares held the evening before the
    // ex-date, paid five days later, cash earning the rate's daily factor from the next day), so
    // the printed rank, SPY, the median and each marker's place are checked against numbers
    // computed outside the app.
    const LARGE_CAPS = ['AAPL', 'MSFT', 'NVDA', 'AMZN', 'GOOGL', 'META', 'AVGO', 'TSLA', 'JPM', 'V',
        'MA', 'UNH', 'XOM', 'JNJ', 'PG', 'COST', 'HD', 'LLY', 'ABBV', 'KO',
        'PEP', 'MRK', 'CVX', 'WMT', 'BAC', 'ORCL', 'CSCO', 'CRM', 'ADBE', 'NFLX',
        'AMD', 'INTC', 'TMO', 'ACN', 'MCD', 'DIS', 'PFE', 'CAT', 'HON', 'LIN'];
    const fnv1a = (t) => { let h = 0x811c9dc5; for (let i = 0; i < t.length; i++) { h ^= t.charCodeAt(i); h = Math.imul(h, 0x01000193); } return h >>> 0; };
    const mulberry32 = (seed) => { let s = seed >>> 0; return () => { s = (s + 0x6d2b79f5) >>> 0; let t = s; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; };
    // The app's NYSE calendar, loaded through jiti for its holiday table (a table, not what these
    // checks test); the window's rule is applied here with it.
    const ROOT = new URL('../../', import.meta.url).pathname;
    const jiti = createJiti(import.meta.url, {alias: {'@': ROOT.replace(/\/$/, '')}, fsCache: false});
    const {isTradingDay} = await jiti.import(`${ROOT}lib/prices/market-hours.ts`);
    const sessionOnOrBefore = (date) => { let d = date; while (!isTradingDay(d)) d = addDays(d, -1); return d; };
    const sessionsBetween = (from, to) => { let n = 0; for (let d = addDays(from, 1); d <= to; d = addDays(d, 1)) if (isTradingDay(d)) n += 1; return n; };
    const nextWeekday = (date) => { let d = addDays(date, 1); while (!isWeekday(d)) d = addDays(d, 1); return d; };
    const daysBetween = (a, b) => Math.round((Date.parse(`${b}T12:00:00Z`) - Date.parse(`${a}T12:00:00Z`)) / 86_400_000);
    // 4.07% discount → bond-equivalent − 0.25%, compounded once a calendar day.
    const F = (1 + (365 * 0.0407 / (360 - 91 * 0.0407) - 0.0025)) ** (1 / 365) - 1;

    // The last stored SPY session is what the app ends a window on; read it rather than assume it.
    const END = (await db.collection('pricebars').find({symbol: 'SPY', date: {$lte: TODAY}}).sort({date: -1}).limit(1).toArray())[0]?.date;
    const LUCK_INCEPTION = addDays(TODAY, -60);
    // The portfolios buy at the inception date's close, or the session's before it.
    const START = sessionOnOrBefore(LUCK_INCEPTION);
    const MID = weekdayOnOrBefore(addDays(LUCK_INCEPTION, 20));
    const LATE = weekdayOnOrBefore(addDays(END, -2));     // paid five days later: after the last day
    const DIVIDENDS = [
        {symbol: 'SPY', exDate: START, perShare: 50},     // the buy day's: the seller keeps it
        {symbol: 'SPY', exDate: nextWeekday(START), perShare: 4},
        {symbol: 'SPY', exDate: LATE, perShare: 30},
        {symbol: 'AAPL', exDate: START, perShare: 50},
        // The calendar day after the buy, weekend or not, on every large cap: the first ex-date the
        // shares are owed (a read of the dividends that began a day late would move the median).
        ...LARGE_CAPS.map((symbol) => ({symbol, exDate: addDays(START, 1), perShare: 1})),
        ...LARGE_CAPS.slice(10, 20).map((symbol) => ({symbol, exDate: MID, perShare: 3})),
        {symbol: 'LIN', exDate: LATE, perShare: 40},
    ];
    const endClose = (symbol) => 100 + LARGE_CAPS.indexOf(symbol);
    // What a share bought at START's close has brought in by `end`: each dividend with an ex-date
    // after START whose pay date is before `end` (the snapshot holds the rows dated before its
    // day), grown by interest from the day after it was paid.
    const incomePerShare = (symbol, end, paid = true) => (!paid ? 0 : DIVIDENDS
        .filter((d) => d.symbol === symbol && d.exDate > START && d.exDate <= end && addDays(d.exDate, 5) < end)
        .reduce((sum, d) => sum + d.perShare * (1 + F) ** (daysBetween(addDays(d.exDate, 5), end) - 1), 0));
    const sampleReturns = (seedText, end, paid = true) => {
        const random = mulberry32(fnv1a(seedText));
        const names = [...LARGE_CAPS].sort();
        const out = [];
        for (let n = 0; n < 1000; n += 1) {
            const deck = [...names];
            for (let i = 0; i < 5; i += 1) { const j = i + Math.floor(random() * (deck.length - i)); [deck[i], deck[j]] = [deck[j], deck[i]]; }
            // $20,000 a name at $100 is 200 whole shares, nothing left over as cash.
            let value = 0;
            for (const s of deck.slice(0, 5)) value += Math.floor(20_000 / 100 + 1e-9) * (endClose(s) + incomePerShare(s, end, paid));
            out.push((value / 100_000 - 1) * 100);
        }
        return out.sort((a, b) => a - b);
    };
    const landed = (returns, yoursPct) => {
        const below = returns.filter((r) => r < yoursPct).length;
        const pct = Math.floor((below / 1000) * 100);
        return below >= 1000 ? 'above all 1,000' : below === 0 ? 'above none of the 1,000' : pct < 1 ? `above ${below} of the 1,000` : `above ${pct}% of 1,000`;
    };
    const median = (sorted) => (sorted[499] + sorted[500]) / 2;
    // SPY the same way: whole shares, the remainder as cash earning from START's close.
    const spyHold = (end, paid = true) => {
        const shares = Math.floor(100_000 / spyClose(START) + 1e-9);
        const cash = 100_000 - shares * spyClose(START);
        return ((cash * (1 + F) ** daysBetween(START, end) + shares * (spyClose(end) + incomePerShare('SPY', end, paid))) / 100_000 - 1) * 100;
    };
    const windowLineFor = (end) => {
        const withYear = START.slice(0, 4) !== end.slice(0, 4);
        const label = (d) => (withYear ? `${short(d)}, ${d.slice(0, 4)}` : short(d));
        return `bought at the ${label(START)} close · valued at the ${label(end)} close`;
    };
    // LuckOrSkill's geometry: x = 16 + (pct − min) / (max − min) × 688, the span covering the
    // sample and every marker.
    const markerPlaces = async (returns, markers) => {
        const all = [...returns, ...Object.values(markers)];
        const min = Math.min(...all);
        const max = Math.max(...all);
        const places = [];
        for (const [key, pct] of Object.entries(markers)) {
            const x1 = Number(await page.locator(`#luck-or-skill [data-luck-marker=${key}] line`).getAttribute('x1'));
            const want = 16 + ((pct - min) / (max - min)) * 688;
            places.push({key, x1: Math.round(x1 * 10) / 10, want: Math.round(want * 10) / 10, ok: Math.abs(x1 - want) < 1 && x1 >= 15.5 && x1 <= 704.5});
        }
        return places;
    };

    const pricebars = db.collection('pricebars');
    const startRegion = [];
    for (let d = addDays(LUCK_INCEPTION, -7); d <= addDays(LUCK_INCEPTION, 3); d = addDays(d, 1)) if (isWeekday(d)) startRegion.push(d);
    const endRegion = [];
    for (let d = addDays(END, -14); d <= END; d = addDays(d, 1)) if (isWeekday(d)) endRegion.push(d);
    await pricebars.bulkWrite(LARGE_CAPS.flatMap((symbol) => [
        ...startRegion.map((date) => ({updateOne: {filter: {symbol, date}, update: {$set: {symbol, date, close: 100, source: 'yahoo', dividend: 0, qaLuck: true}}, upsert: true}})),
        ...endRegion.map((date) => ({updateOne: {filter: {symbol, date}, update: {$set: {symbol, date, close: endClose(symbol), source: 'yahoo', dividend: 0, qaLuck: true}}, upsert: true}})),
        ...[MID, addDays(START, 1)].map((date) => ({updateOne: {filter: {symbol, date}, update: {$set: {symbol, date, close: 100, source: 'yahoo', dividend: 0, qaLuck: true}}, upsert: true}})),
    ]), {ordered: false});
    // An earlier suite's large-cap dividend inside the window (qa-income's AAPL) would pay the
    // sample too, and its ^IRX would be a rate these numbers do not know: both are set aside for
    // the luck checks and put back after them.
    const foreignDividends = await pricebars.find({symbol: {$in: LARGE_CAPS}, date: {$gt: START, $lte: END}, dividend: {$gt: 0}, qaLuck: {$ne: true}}, {projection: {_id: 1, dividend: 1}}).toArray();
    await pricebars.updateMany({_id: {$in: foreignDividends.map((b) => b._id)}}, {$set: {dividend: 0}});
    const RATE_FROM = addDays(START, -14);
    const savedRates = await pricebars.find({symbol: '^IRX', date: {$gte: RATE_FROM, $lte: TODAY}}).toArray();
    await pricebars.deleteMany({symbol: '^IRX', date: {$gte: RATE_FROM, $lte: TODAY}});
    const rateDays = [];
    for (let d = RATE_FROM; d <= END; d = addDays(d, 1)) if (isWeekday(d)) rateDays.push(d);
    await pricebars.insertMany(rateDays.map((date) => ({symbol: '^IRX', date, close: 4.07, open: 4.07, high: 4.07, low: 4.07, source: 'yahoo', dividend: 0})));
    for (const d of DIVIDENDS) await pricebars.updateOne({symbol: d.symbol, date: d.exDate}, {$set: {dividend: d.perShare}});
    restoreLuck = async () => {
        restoreLuck = async () => {};
        await pricebars.deleteMany({symbol: '^IRX', date: {$gte: RATE_FROM, $lte: TODAY}});
        if (savedRates.length > 0) await pricebars.insertMany(savedRates);
        for (const b of foreignDividends) await pricebars.updateOne({_id: b._id}, {$set: {dividend: b.dividend}});
        await pricebars.updateMany({symbol: 'SPY', date: {$in: DIVIDENDS.filter((d) => d.symbol === 'SPY').map((d) => d.exDate)}}, {$set: {dividend: 0}});
        await pricebars.deleteMany({qaLuck: true});
    };
    await db.collection('paperaccounts').updateOne({_id: account._id}, {$set: {inceptionAt: etNoon(LUCK_INCEPTION)}});
    // A snapshot on the last session would be a real close; take it away so the holding with no
    // quote (QALRN) leaves nothing to read the learner's return from.
    await db.collection('accountsnapshots').deleteMany({accountId, date: {$gte: END}});

    // Case A: unpriced holding, no snapshot on the last session → the marker is withheld.
    await page.goto(`${BASE}/portfolio`, {waitUntil: 'load'});
    await page.locator('#luck-or-skill').waitFor({timeout: 30000});
    const luckText = async () => text('#luck-or-skill [data-testid=luck-landed]');
    const sampleLine = await luckText();
    const sampleMatch = /^1,000 random five-stock portfolios over the same (\d+) trading days$/.exec(sampleLine);
    const SESSIONS = sessionsBetween(START, END);
    check('with an unpriced holding and no snapshot that day, the panel places no one', sampleMatch !== null, sampleLine);
    check('…over the NYSE sessions after the inception close through the last one, counted here', Number(sampleMatch?.[1]) === SESSIONS && SESSIONS >= 10, `${sampleLine} | expected ${SESSIONS}`);
    check('…and says why with the unpriced note', (await text('#luck-or-skill [data-testid=luck-withheld]')) === 'This holding is unpriced — valued at cost, P&L withheld', await text('#luck-or-skill [data-testid=luck-withheld]'));
    check('…with SPY and the median marked, and no "you" marker',
        (await page.locator('#luck-or-skill [data-luck-marker=spy]').count()) === 1 && (await page.locator('#luck-or-skill [data-luck-marker=median]').count()) === 1
            && (await page.locator('#luck-or-skill [data-luck-marker=you]').count()) === 0);
    const windowLine = await text('#luck-or-skill [data-testid=luck-window]');
    check('the window starts at the inception close and ends on the last session', windowLine === windowLineFor(END), `${windowLine} | expected ${windowLineFor(END)}`);
    const returnsA = sampleReturns(`${accountId}|${END}`, END);
    const markerText = async (key) => text(`#luck-or-skill [data-luck-value=${key}]`);
    check('SPY is held the same way over the same days, paid what a paper account is paid (not the buy day\'s dividend, not one paid after the last day)',
        (await markerText('spy')) === `SPY ${pctOneDecimal(spyHold(END))}` && pctOneDecimal(spyHold(END)) !== pctOneDecimal(spyHold(END, false)),
        `${await markerText('spy')} vs SPY ${pctOneDecimal(spyHold(END))} (price only ${pctOneDecimal(spyHold(END, false))})`);
    check('the median is the replayed sample\'s, its dividends paid in',
        (await markerText('median')) === `Median ${pctOneDecimal(median(returnsA))}` && pctOneDecimal(median(returnsA)) !== pctOneDecimal(median(sampleReturns(`${accountId}|${END}`, END, false))),
        `${await markerText('median')} vs Median ${pctOneDecimal(median(returnsA))} (without dividends ${pctOneDecimal(median(sampleReturns(`${accountId}|${END}`, END, false)))})`);
    const barTitles = await page.locator('#luck-or-skill [data-luck-bar] title').allTextContents();
    const barTotal = barTitles.reduce((sum, t) => sum + Number(/: (\d+) portfolios?$/.exec(t.trim())?.[1] ?? NaN), 0);
    check('the histogram draws the thousand as bars, their counts adding up to 1,000', barTitles.length >= 5 && barTotal === 1000, `${barTitles.length} bars, ${barTotal}`);
    const placesA = await markerPlaces(returnsA, {spy: spyHold(END), median: median(returnsA)});
    check('each marker sits on the axis at its value, the axis stretched to SPY below the sample', placesA.every((p) => p.ok), JSON.stringify(placesA));
    check('the luck panel has exactly one What these mean, and no link outside it',
        (await page.locator('#luck-or-skill [data-what-these-mean]').count()) === 1
            && (await page.locator('#luck-or-skill a').count()) === (await page.locator('#luck-or-skill [data-what-these-mean] a').count()));
    await shot('07-luck-withheld');

    // Case B: a snapshot on the last session is a real close — the learner is placed from it,
    // not from today's value (cash plus a holding at cost, about +0.3%).
    await db.collection('accountsnapshots').insertOne({accountId, userId, date: END, totalValue: 120_300, cash: 120_300, holdingsValue: 0, startingBalance: 100_000});
    await page.goto(`${BASE}/portfolio`, {waitUntil: 'load'});
    await page.locator('#luck-or-skill [data-luck-marker]').first().waitFor({timeout: 30000});
    const yoursB = (120_300 / 100_000 - 1) * 100;
    const expectedB = `Your return landed ${landed(returnsA, yoursB)} random five-stock portfolios over the same ${SESSIONS} trading days`;
    check('the snapshot return lands where the replayed sample puts it', (await luckText()) === expectedB, `${await luckText()} | expected ${expectedB}`);
    check('…marked "You +20.3%" beside SPY and the median, with nothing withheld',
        (await markerText('you')) === 'You +20.3%' && (await page.locator('#luck-or-skill [data-luck-marker=you]').count()) === 1
            && (await page.locator('#luck-or-skill [data-testid=luck-withheld]').count()) === 0, await markerText('you'));
    const placesB = await markerPlaces(returnsA, {you: yoursB, spy: spyHold(END), median: median(returnsA)});
    check('…each of the three markers at its value on the axis', placesB.every((p) => p.ok), JSON.stringify(placesB));
    check('the copy places, never ranks', !/\bbeat|outperform|better|worse\b/i.test(await text('#luck-or-skill')), await text('#luck-or-skill'));
    await shot('08-luck-placed');

    // Case C: everything priced (no holdings), last snapshot a week before the last session → the
    // portfolios end on the snapshot's session, the sample is seeded from that window, and the
    // snapshot's return (+19.9%) sits near the sample's middle, where the share it lands above
    // depends on the seed.
    const C_DATE = endRegion[endRegion.length - 6];
    const C_END = sessionOnOrBefore(C_DATE);
    await db.collection('paperaccounts').updateOne({_id: account._id}, {$set: {positions: []}});
    await db.collection('accountsnapshots').deleteMany({accountId, date: {$gt: C_DATE}});
    await db.collection('accountsnapshots').updateOne({accountId, date: C_DATE}, {$set: {accountId, userId, date: C_DATE, totalValue: 119_900, cash: 119_900, holdingsValue: 0, startingBalance: 100_000}}, {upsert: true});
    await page.goto(`${BASE}/portfolio`, {waitUntil: 'load'});
    await page.locator('#luck-or-skill [data-luck-marker]').first().waitFor({timeout: 30000});
    const lineC = await luckText();
    const matchC = /^Your return landed (.+) random five-stock portfolios over the same (\d+) trading days$/.exec(lineC);
    const returnsC = sampleReturns(`${accountId}|${C_END}`, C_END);
    const yoursC = (119_900 / 100_000 - 1) * 100;
    check('with every holding priced, the window ends on the last snapshot\'s date',
        (await text('#luck-or-skill [data-testid=luck-window]')) === windowLineFor(C_END) && Number(matchC?.[2]) === sessionsBetween(START, C_END),
        `${await text('#luck-or-skill [data-testid=luck-window]')} | ${lineC} | expected ${sessionsBetween(START, C_END)} days`);
    check('…and places the snapshot return in the sample seeded from that window', matchC?.[1] === landed(returnsC, yoursC) && (await markerText('you')) === 'You +19.9%',
        `${lineC} | expected ${landed(returnsC, yoursC)}; seeded from the last session it would be ${landed(sampleReturns(`${accountId}|${END}`, C_END), yoursC)}`);
    check('…beside that sample\'s median and SPY over the same days',
        (await markerText('median')) === `Median ${pctOneDecimal(median(returnsC))}` && (await markerText('spy')) === `SPY ${pctOneDecimal(spyHold(C_END))}`,
        `${await markerText('median')} · ${await markerText('spy')} vs Median ${pctOneDecimal(median(returnsC))} · SPY ${pctOneDecimal(spyHold(C_END))}`);
    await shot('09-luck-stale-snapshot');

    // Case D: the same account with none of its fills placed by the learner (as the AI
    // Navigator's account is) → the sample and its markers stay, "you" is not placed, and the
    // note says why. The fills are put back before the habits below count them.
    const ownFillIds = (await db.collection('papertrades').find({accountId, source: 'user'}, {projection: {_id: 1}}).toArray()).map((t) => t._id);
    await db.collection('papertrades').updateMany({_id: {$in: ownFillIds}}, {$set: {source: 'ai-navigator'}});
    try {
        await page.goto(`${BASE}/portfolio`, {waitUntil: 'load'});
        await page.locator('#luck-or-skill [data-luck-marker]').first().waitFor({timeout: 30000});
        check('an account without a fill of the learner\'s is not placed: the sample, SPY and the median only',
            ownFillIds.length > 0 && /^1,000 random five-stock portfolios over the same \d+ trading days$/.test(await luckText())
                && (await page.locator('#luck-or-skill [data-luck-marker=you]').count()) === 0
                && (await page.locator('#luck-or-skill [data-luck-marker=spy]').count()) === 1
                && (await page.locator('#luck-or-skill [data-luck-marker=median]').count()) === 1,
            `${ownFillIds.length} fills · ${await luckText()}`);
        check('…and says why, once', (await text('#luck-or-skill [data-testid=luck-withheld]')) === 'No fill in this account was placed by you, so its return is not placed among them.'
            && (await page.locator('#luck-or-skill [data-testid=luck-withheld]').count()) === 1, await text('#luck-or-skill [data-testid=luck-withheld]'));
    } finally {
        await db.collection('papertrades').updateMany({_id: {$in: ownFillIds}}, {$set: {source: 'user'}});
    }

    // --- trading habits: four closed lots of the learner's own, and a strategy fill ignored ------
    // Closed: SPY (the round trip above, minutes long, a winner), AAPL (5 days, a winner), MSFT
    // (10 days, a loser), IBM (10 days, a loser, sold 35 days ago: before the 30-day window).
    // Open: QALRN, no quote. A strategy's NVDA round trip must not count.
    const daysAgo = (n) => new Date(Date.now() - n * 86_400_000);
    await db.collection('papertrades').insertMany([
        {userId, accountId, symbol: 'IBM', company: 'IBM', side: 'buy', quantity: 5, price: 100, total: 500, source: 'user', createdAt: daysAgo(45)},
        {userId, accountId, symbol: 'IBM', company: 'IBM', side: 'sell', quantity: 5, price: 90, total: 450, realizedPnl: -50, source: 'user', createdAt: daysAgo(35)},
        {userId, accountId, symbol: 'AAPL', company: 'Apple Inc', side: 'buy', quantity: 10, price: 100, total: 1000, source: 'user', createdAt: daysAgo(20)},
        {userId, accountId, symbol: 'MSFT', company: 'Microsoft', side: 'buy', quantity: 10, price: 200, total: 2000, source: 'user', createdAt: daysAgo(18)},
        {userId, accountId, symbol: 'AAPL', company: 'Apple Inc', side: 'sell', quantity: 10, price: 120, total: 1200, realizedPnl: 200, source: 'user', createdAt: daysAgo(15)},
        {userId, accountId, symbol: 'MSFT', company: 'Microsoft', side: 'sell', quantity: 10, price: 180, total: 1800, realizedPnl: -200, source: 'user', createdAt: daysAgo(8)},
        {userId, accountId, symbol: 'NVDA', company: 'NVIDIA', side: 'buy', quantity: 5, price: 100, total: 500, source: 'strategy', reason: 'qa strategy fill', createdAt: daysAgo(7)},
        {userId, accountId, symbol: 'NVDA', company: 'NVIDIA', side: 'sell', quantity: 5, price: 90, total: 450, realizedPnl: -50, source: 'strategy', reason: 'qa strategy fill', createdAt: daysAgo(6)},
    ]);
    await page.goto(`${BASE}/portfolio`, {waitUntil: 'load'});
    await page.locator('#trading-habits [data-testid=habits-hold]').waitFor({timeout: 30000});
    const habitTile = async (id) => text(`#trading-habits [data-testid=${id}]`);
    // Distinct ET dates of the learner's seven fills: today's three and four earlier days.
    const userDays = new Set([etDate(), ...[20, 18, 15, 8].map((n) => etDate(daysAgo(n)))]).size;
    check('habits count only the learner\'s own fills in the last 30 days (the strategy round trip and the sale 35 days ago left out)',
        new RegExp(`7 fills on ${userDays} days`).test(await habitTile('habits-pace')) && /in the last 30 days/.test(await habitTile('habits-pace')), await habitTile('habits-pace'));
    check('hold time: winners a median of 3 days, losers 10', /winners 3 days · losers 10 days/.test(await habitTile('habits-hold'))
        && /median of 2 winning lots and 2 losing lots sold/.test(await habitTile('habits-hold')), await habitTile('habits-hold'));
    const soldTile = await habitTile('habits-sold');
    const soldShares = /sold (\d+)% of winners · (\d+)% of losers/.exec(soldTile);
    const soldCounts = /(\d+) of (\d+) lots? up · (\d+) of (\d+) lots? down/.exec(soldTile);
    check('"sold N% of winners · M% of losers", each share reproduced by the counts beside it',
        soldShares !== null && soldCounts !== null && soldShares[1] === '100' && soldShares[2] === '100'
            && Number(soldShares[1]) === Math.round(Number(soldCounts[1]) / Number(soldCounts[2]) * 100)
            && Number(soldShares[2]) === Math.round(Number(soldCounts[3]) / Number(soldCounts[4]) * 100), soldTile);
    check('the open lot with no quote is left out, said once', (await text('#trading-habits [data-testid=habits-unpriced]')) === '1 open lot without a live quote left out of winners and losers');
    const turnoverTile = await habitTile('habits-turnover');
    const turnover = /\$([\d,]+\.\d{2})\s+(\d+)% of the \$([\d,]+\.\d{2}) starting balance, same days/.exec(turnoverTile);
    check('shares sold in the window: $5,750.00 (not the $450.00 sale 35 days ago), and the printed share reproduces from the two amounts',
        turnover !== null && turnover[1] === '5,750.00'
            && Number(turnover[2]) === Math.round(Number(turnover[1].replace(/,/g, '')) / Number(turnover[3].replace(/,/g, '')) * 100), turnoverTile);
    check('no quote, no "had you held" tile', (await page.locator('#trading-habits [data-testid=habits-held]').count()) === 0);
    // The window's NYSE sessions: from the ET date 30 days back through today, both included.
    let paceSessions = 0;
    for (let d = etDate(daysAgo(30)); d <= etDate(); d = addDays(d, 1)) if (isTradingDay(d)) paceSessions += 1;
    check('the pace sits beside the catalog\'s cadences only, over the window\'s NYSE sessions counted here',
        (await text('#trading-habits [data-testid=habits-cadence]')) === `Beside the strategies' clocks: 3 daily rules on any of these ${paceSessions} sessions · 3 monthly rules on 1 day a month · 1 quarterly rule on 1 day a quarter · 1 buy-once rule on its first day only`,
        `${await text('#trading-habits [data-testid=habits-cadence]')} | expected ${paceSessions} sessions`);
    check('the habits panel has one What these mean, holding every link', (await page.locator('#trading-habits [data-what-these-mean]').count()) === 1
        && (await page.locator('#trading-habits a').count()) === (await page.locator('#trading-habits [data-what-these-mean] a').count()));
    await page.locator('#trading-habits [data-what-these-mean]').evaluate((d) => { d.open = true; });
    const habitsDefs = await text('#trading-habits [data-what-these-mean]');
    check('…whose definitions name the jargon the tiles avoid', /Disposition effect/.test(habitsDefs) && /Turnover/.test(habitsDefs) && /Time held/.test(habitsDefs), habitsDefs.slice(0, 300));
    await shot('10-trading-habits');
    await restoreLuck();
} catch (err) {
    check(`threw: ${err.message}`, false);
    await shot('99-error').catch(() => {});
} finally {
    await restoreLuck().catch(() => {});
    await mongo.close().catch(() => {});
    await browser.close();
}

summary('learn-account');
