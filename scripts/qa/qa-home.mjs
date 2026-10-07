// Home (app/(root)/page.tsx, lib/home): the signed-in front page. A new account is greeted by
// first name, sees its account's value, its topics and the first first-week step as the one
// thing to do next; the step moves on as soon as the row behind it exists; the widget dashboard
// is its own page under the same rail section; an old /?customize=1 link still opens the
// dashboard's edit mode; and the momentum terrain has no panel until there is a surface to draw
// (qa-landing checks the panel once there is one).
// Run: npm run qa -- home   (the harness: README.md)
import {chromium} from 'playwright';
import {MongoClient} from 'mongodb';
import {BASE, MONGO, check, outDir, signUp, summary} from './lib.mjs';

const OUT = outDir('home');
const browser = await chromium.launch({channel: 'chrome'});
const page = await browser.newPage({viewport: {width: 1440, height: 900}});
const mongo = new MongoClient(MONGO);
const shot = (name) => page.screenshot({path: `${OUT}${name}.png`, fullPage: true});

try {
    await mongo.connect();
    const db = mongo.db();
    const email = await signUp(page, 'home', {name: 'Ada Lovelace', stay: true});
    const user = await db.collection('user').findOne({email});
    const userId = String(user?._id ?? '');

    // --- a new account's Home -------------------------------------------------------
    check('sign-up lands on Home', new URL(page.url()).pathname === '/' && await page.locator('[data-home]').count() === 1, page.url());
    check('…greeted by first name', (await page.locator('h1').innerText()) === 'Welcome back, Ada', await page.locator('h1').innerText());
    check('…with the market status beside it', await page.locator('[data-home] span[title*="NYSE"]').count() === 1);
    check('the account total is the starting balance', (await page.locator('[data-home-total]').innerText()) === '$100,000.00', await page.locator('[data-home-total]').innerText());
    check('…with one row for the account, linking into /portfolio',
        await page.locator('#home-accounts ul a[href^="/portfolio?account="]').count() === 1);
    // The momentum terrain is a panel only when there is a surface to draw: no SPY history yet
    // (and the Tiingo stand-in down), so Home shows no box for it (invariant 8). qa-landing, which
    // runs after this suite, checks the panel once there is one.
    check('no terrain panel before there is a surface to draw',
        await page.locator('[data-home-terrain]').count() === 0 && await page.locator('[data-terrain]').count() === 0);
    const stepText = (await page.locator('#home-next-step').innerText()).replace(/\s+/g, ' ');
    check('the next step is the first first-week step', /Place your first paper trade/.test(stepText) && /0 of 5 first-week steps done/i.test(stepText), stepText.slice(0, 160));
    check('…and it opens the order ticket', await page.locator('[data-home-step]').getAttribute('href') === '/trade?symbol=SPY');
    check('the six seeded topics are listed', await page.locator('#home-topics a[href^="/topics/"]').count() === 6);
    check('the first-week list is on the page', await page.locator('#home-first-week li[data-done]').count() === 5);
    check('a box with nothing to say is not drawn', await page.locator('#home-briefing').count() === 0);
    check('numbers come before prose: the total sits above the fold',
        ((await page.locator('[data-home-total]').boundingBox())?.y ?? 9999) < 400);
    await shot('01-new-account');

    // --- the rail section and the dashboard ------------------------------------------
    const tabs = await page.$$eval('[data-section-tabs="home"] a', (as) => as.map((a) => `${a.getAttribute('href')}${a.getAttribute('aria-current') === 'page' ? '*' : ''}`));
    check('Home and My dashboard are tabs of one section', tabs.join(',') === '/*,/dashboard', tabs.join(','));
    await page.click('[data-section-tabs="home"] a[href="/dashboard"]');
    await page.waitForURL(/\/dashboard$/, {timeout: 15000});
    await page.waitForSelector('[data-widget-id]', {timeout: 15000}).catch(() => {});
    check('the widget grid is at /dashboard', await page.locator('[data-widget-id]').count() >= 5 && (await page.locator('h1').innerText()) === 'Dashboard');
    await page.goto(`${BASE}/?customize=1`, {waitUntil: 'load'});
    // The redirect arrives after the route's loading state has streamed, so wait for it.
    await page.waitForURL(/\/dashboard\?customize=1/, {timeout: 15000}).catch(() => {});
    await page.getByRole('button', {name: /Add widget/i}).waitFor({timeout: 15000}).catch(() => {});
    check('an old /?customize=1 link opens the dashboard in edit mode',
        /\/dashboard\?customize=1$/.test(page.url()) && await page.getByRole('button', {name: /Add widget/i}).count() === 1, page.url());

    // --- the step follows the rows ----------------------------------------------------
    const account = await db.collection('paperaccounts').findOne({userId});
    await db.collection('papertrades').insertOne({
        userId, accountId: String(account?._id), symbol: 'SPY', side: 'buy', quantity: 1, price: 500, total: 500,
        source: 'user', executedAt: new Date(), createdAt: new Date(),
    });
    await page.goto(`${BASE}/`, {waitUntil: 'load'});
    const moved = (await page.locator('#home-next-step').innerText()).replace(/\s+/g, ' ');
    check('with a trade on the ledger, the step moves to the next one', /Follow a quant strategy/.test(moved) && /1 of 5 first-week steps done/i.test(moved), moved.slice(0, 160));

    // Hidden once, the list leaves Home, and the step follows the session instead.
    await db.collection('userpreferences').updateOne({userId}, {$set: {'learn.missionsDismissedAt': new Date()}}, {upsert: true});
    await page.goto(`${BASE}/`, {waitUntil: 'load'});
    const after = (await page.locator('#home-next-step').innerText()).replace(/\s+/g, ' ');
    check('with the list hidden, the step follows the market', /The market is (open|closed)/.test(after) && !/first-week/i.test(after), after.slice(0, 160));
    check('…the list is gone and the lesson takes its place',
        await page.locator('#home-first-week').count() === 0 && await page.locator('#home-learn').count() === 1);
    await shot('02-after-first-week');

    // --- a phone ----------------------------------------------------------------------
    await page.setViewportSize({width: 390, height: 844});
    await page.goto(`${BASE}/`, {waitUntil: 'load'});
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    check('Home fits a phone without sideways scroll', overflow <= 1, String(overflow));
    await shot('03-phone');
} catch (err) {
    check(`threw: ${err.message}`, false);
} finally {
    await mongo.close().catch(() => {});
    await browser.close();
}
summary('home');
