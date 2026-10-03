// The app shell (components/shell, lib/shell): the icon rail lists the eight sections and names
// each on hover, Portfolio and News open their cards, a section's other pages are tabs on the page,
// ⌘K works by keyboard alone and finds a page by name, the mobile drawer stands in for the rail
// and closes after navigating, and the drawer's Logout signs out and lands on /sign-in. Also
// friends: a sent request is listed with its age, and the recipient sees a dot on the avatar and
// a count in the account menu.
// Run: npm run qa -- shell   (the harness: README.md)
import {chromium} from 'playwright';
import {MongoClient} from 'mongodb';
import {BASE, MONGO, check, outDir, signUp, summary} from './lib.mjs';

const OUT = outDir('shell');

const browser = await chromium.launch({channel: 'chrome'});
const page = await browser.newPage({viewport: {width: 1440, height: 900}});
const shot = (n) => page.screenshot({path: `${OUT}${n}.png`, fullPage: true});
const mongo = new MongoClient(MONGO);

try {
    await mongo.connect();
    const db = mongo.db();
    const firstEmail = await signUp(page, 'one');

    // --- the desktop rail: one icon per section, nothing repeated in the header ---
    const railHrefs = await page.$$eval('aside.rail nav a', (as) => as.map((a) => a.getAttribute('href')));
    check('the rail lists the eight sections',
        railHrefs.join(',') === '/,/news,/markets,/trade,/portfolio,/strategies,/brain,/learn', railHrefs.join(','));
    check('…each named for a screen reader, with the dashboard lit',
        await page.locator('aside.rail nav a[aria-label]').count() === 8
        && await page.locator('aside.rail nav a[aria-current="page"]').getAttribute('data-rail') === 'home');
    check('the header carries no section links',
        await page.locator('header nav a').count() === 0 && await page.locator('header a[href="/"]').count() === 1);
    check('hamburger is hidden at desktop width',
        !(await page.locator('button[aria-label="Open navigation"]').isVisible()));
    await page.locator('aside.rail a[data-rail="trade"]').hover();
    const tip = page.locator('[data-rail-tip="trade"]');
    await tip.waitFor({timeout: 5000}).catch(() => {});
    check('an icon names itself on hover', (await tip.innerText().catch(() => '')).includes('Trade'));
    await page.locator('aside.rail a[data-rail="portfolio"]').hover();
    const flyout = page.locator('[data-rail-flyout="portfolio"]');
    await flyout.waitFor({timeout: 5000}).catch(() => {});
    check('…and Portfolio opens its summary beside the rail', /total return/.test(await flyout.innerText().catch(() => '')));
    await page.locator('aside.rail a[data-rail="news"]').hover();
    const newsFly = page.locator('[data-rail-flyout="news"]');
    await newsFly.waitFor({timeout: 5000}).catch(() => {});
    const newsText = (await newsFly.innerText().catch(() => '')).replace(/\n/g, ' ');
    // `/i`: the card's eyebrow and footer are label-type, which a style may uppercase.
    check('…and News opens its card, which leads to the news',
        /News/i.test(newsText) && /Open the news/i.test(newsText) && await newsFly.locator('a[href="/news"]').count() === 1, newsText);
    await page.mouse.move(700, 500);

    // --- a section's other pages are tabs on the page ---
    await page.goto(`${BASE}/portfolio`, {waitUntil: 'load'});
    const tabs = await page.$$eval('[data-section-tabs="portfolio"] a', (as) => as.map((a) => `${a.getAttribute('href')}${a.getAttribute('aria-current') === 'page' ? '*' : ''}`));
    check('Portfolio shows Overview and Activity, Overview current', tabs.join(',') === '/portfolio*,/history', tabs.join(','));
    await page.goto(`${BASE}/trade`, {waitUntil: 'load'});
    check('a section of one page shows no tabs', await page.locator('[data-section-tabs]').count() === 0);
    await page.goto(`${BASE}/stocks/SPY`, {waitUntil: 'load'});
    check('a stock page lights Markets', await page.locator('aside.rail nav a[aria-current="page"]').getAttribute('data-rail') === 'markets');
    // The palette listens for ⌘K from an effect, so a press before Home has hydrated is lost —
    // on a cold dev server that is seconds after 'load'. Wait for the network to settle first.
    await page.goto(`${BASE}/`, {waitUntil: 'networkidle'});

    // --- ⌘K is keyboard-drivable ----------------------------------------------
    await page.keyboard.press('Meta+k');
    await page.waitForSelector('[cmdk-input]', {timeout: 15000});
    check('⌘K opens the palette', await page.locator('[cmdk-input]').isVisible());
    await page.keyboard.type('act');
    check('…and finds a page by name', await page.locator('[data-page-hit="/history"]').count() === 1);
    for (let i = 0; i < 3; i++) await page.keyboard.press('Backspace');
    await page.keyboard.type('AAPL');
    await page.waitForTimeout(1200); // debounced server search
    // Arrow + Enter alone — never a mouse. This is what the raw <li>/<Link> rows broke.
    await page.keyboard.press('ArrowDown');
    await page.keyboard.press('Enter');
    await page.waitForURL(/\/(stocks|topics)\//, {timeout: 10000}).catch(() => {});
    check('arrow + Enter navigates from the palette', /\/(stocks|topics)\//.test(page.url()), page.url());
    await shot('01-palette-keyboard');

    // --- below lg: the drawer stands in for the rail ---------------------------
    await page.setViewportSize({width: 390, height: 844});
    await page.goto(`${BASE}/portfolio`, {waitUntil: 'networkidle'});
    check('the rail is gone and search is still one tap away',
        !(await page.locator('aside.rail').isVisible()) && await page.locator('header button.search-text').isVisible());
    check('Activity is a tab on the page, without opening anything', await page.locator('[data-section-tabs] a[href="/history"]:visible').count() === 1);
    const before = await page.locator('a[href="/markets"]:visible').count();
    check('markets has no visible link before opening the drawer', before === 0, String(before));

    await page.locator('button[aria-label="Open navigation"]').click();
    await page.waitForTimeout(400);
    for (const href of ['/', '/news', '/markets', '/trade', '/portfolio', '/strategies', '/brain', '/learn', '/friends', '/settings']) {
        check(`drawer reaches ${href}`, await page.locator(`[data-slot="sheet-content"] a[href="${href}"]`).count() === 1);
    }
    await shot('02-mobile-drawer');

    // Closing on navigation is manual — Radix does not do it for us.
    await page.locator('[data-slot="sheet-content"] a[href="/markets"]').click();
    await page.waitForURL(/\/markets/, {timeout: 15000});
    await page.waitForTimeout(600);
    check('drawer closes after navigating', await page.locator('[data-slot="sheet-content"]').count() === 0);
    check('landed on /markets, where Watchlist is a tab',
        page.url().endsWith('/markets') && await page.locator('[data-section-tabs="markets"] a[href="/watchlist"]:visible').count() === 1);

    // --- friend-request badge --------------------------------------------------
    const second = await browser.newPage({viewport: {width: 1440, height: 900}});
    const secondEmail = await signUp(second, 'two');
    await second.goto(`${BASE}/friends`, {waitUntil: 'networkidle'});
    await second.fill('input[type="email"]', firstEmail);
    await second.locator('form button[type="submit"], button:has-text("Send")').first().click();
    await second.waitForTimeout(1500);
    check('sent request shows in the Sent panel',
        await second.getByText('Sent (1)').count() > 0);
    await second.screenshot({path: `${OUT}03-sent-requests.png`, fullPage: true});

    const sender = await db.collection('user').findOne({email: secondEmail});
    const backdated = await db.collection('friendships').updateOne(
        {requesterId: String(sender?._id), status: 'pending'},
        {$set: {createdAt: new Date(Date.now() - 3 * 86_400_000)}});
    await second.reload({waitUntil: 'networkidle'});
    const waiting = await second.getByText(/Waiting · sent/).first().innerText().catch(() => '');
    check('a three-day-old sent request says so', backdated.modifiedCount === 1 && /sent 3 days ago/.test(waiting), waiting);

    // The recipient should now see a badge without visiting /friends.
    await page.setViewportSize({width: 1440, height: 900});
    await page.goto(`${BASE}/`, {waitUntil: 'networkidle'});
    const badge = await page.locator('header [data-friend-requests="1"]').count();
    check('a pending friend request puts a dot on the avatar', badge === 1, String(badge));
    await page.getByRole('button', {name: /Account menu, 1 pending friend request/}).click();
    check('…and a count beside Friends in the account menu',
        await page.locator('[data-slot="dropdown-menu-content"] a[href="/friends"] span[aria-label="1 pending friend request"]').count() === 1);
    await page.keyboard.press('Escape');
    await shot('04-friend-badge');
    await second.close();

    // --- logout from the mobile drawer --------------------------------------------
    // Its Logout used to close the drawer and stay on the page; every logout button now goes
    // through one hook that lands on /sign-in only once the sign-out succeeded.
    await page.setViewportSize({width: 390, height: 844});
    await page.goto(`${BASE}/portfolio`, {waitUntil: 'networkidle'});
    await page.locator('button[aria-label="Open navigation"]').click();
    await page.waitForTimeout(400);
    await page.locator('[data-slot="sheet-content"] button:has-text("Logout")').click();
    await page.waitForURL(/\/sign-in/, {timeout: 15000}).catch(() => {});
    check('drawer logout lands on /sign-in', /\/sign-in/.test(page.url()), page.url());
    await page.goto(`${BASE}/portfolio`, {waitUntil: 'load'});
    check('…and the session is gone', /\/sign-in/.test(page.url()), page.url());

    // --- the front door, signed out ---------------------------------------------------
    await page.setViewportSize({width: 1440, height: 900});
    await page.goto(`${BASE}/`, {waitUntil: 'load'});
    check('signed out, "/" is the landing page under its own address',
        new URL(page.url()).pathname === '/' && await page.locator('[data-landing]').count() === 1, page.url());
    check('…with one h1, the sign-up button and no app chrome',
        await page.locator('h1').count() === 1 && await page.locator('a[data-landing-cta][href="/sign-up"]').count() === 1
        && await page.locator('aside.rail').count() === 0);
    check('…the three pillars and the not-advice line',
        await page.locator('#landing-news, #landing-learn, #landing-practise').count() === 3
        && /never gives financial advice/.test(await page.locator('[data-landing-disclaimer]').innerText()));
    const styleBefore = await page.evaluate(() => document.documentElement.dataset.style);
    await page.locator('[data-theme-demo="gruvbox-brutal"]').click();
    await page.waitForFunction(() => document.documentElement.dataset.style === 'brutalist', null, {timeout: 5000}).catch(() => {});
    check('a theme button repaints the page, saving nothing',
        styleBefore === 'minimal' && await page.evaluate(() => document.documentElement.dataset.style) === 'brutalist'
        && !(await page.context().cookies()).some((c) => c.name === 'aero-theme'));
    await shot('05-landing');
    await page.setViewportSize({width: 390, height: 844});
    await page.goto(`${BASE}/`, {waitUntil: 'load'});
    check('the landing page fits a phone without sideways scroll',
        await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth) <= 1);
    await page.locator('a[data-landing-cta]').click();
    await page.waitForURL(/\/sign-up/, {timeout: 15000}).catch(() => {});
    check('its button opens sign-up, whose logo leads back to it', /\/sign-up/.test(page.url())
        && await page.locator('a.auth-logo[href="/"]').count() === 1);
} catch (err) {
    check(`threw: ${err.message}`, false);
    await shot('99-error').catch(() => {});
} finally {
    await mongo.close().catch(() => {});
    await browser.close();
}

summary('shell');
