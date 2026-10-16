// The app shell (components/shell, lib/shell): the icon rail lists the seven sections and names
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
    // The Learn icon goes to the games: /learn is the owner's lab, and this account is not the owner.
    check('the rail lists the seven sections',
        railHrefs.join(',') === '/,/news,/trade,/portfolio,/strategies,/brain,/games', railHrefs.join(','));
    check('…each named for a screen reader, with the dashboard lit',
        await page.locator('aside.rail nav a[aria-label]').count() === 7
        && await page.locator('aside.rail nav a[aria-current="page"]').getAttribute('data-rail') === 'home');
    check('the header carries no section links',
        await page.locator('header nav a').count() === 0 && await page.locator('header a[href="/"]').count() === 1);
    check('hamburger is hidden at desktop width',
        !(await page.locator('button[aria-label="Open navigation"]').isVisible()));

    // --- the bar's search sits in its middle (.header-bar) ---
    // Every style that draws the search as a box centres it in the bar, wide and narrow, whatever
    // the logo's and the account button's widths; on a phone, and in Minimal at every width, it is
    // an icon beside the account menu. The theme cookie is taken away again after.
    const barPlaces = () => page.evaluate(() => {
        const bar = document.querySelector('header.header').getBoundingClientRect();
        const search = document.querySelector('header .search-text').getBoundingClientRect();
        const account = document.querySelector('header .header-bar > :last-child').getBoundingClientRect();
        return {off: Math.round(search.left + search.width / 2 - (bar.left + bar.width / 2)), gap: Math.round(account.left - search.right)};
    });
    const offCentre = [];
    for (const style of ['futuristic', 'liquid-glass', 'brutalist', 'soft']) {
        await page.context().addCookies([{name: 'aero-theme', value: `v1:quiet-cyber:${style}:0`, domain: new URL(BASE).hostname, path: '/'}]);
        for (const width of [1440, 1024, 768]) {
            await page.setViewportSize({width, height: 900});
            await page.goto(`${BASE}/trade`, {waitUntil: 'load'});
            await page.locator('header .search-text').waitFor({timeout: 30000});
            const {off} = await barPlaces();
            if (Math.abs(off) > 1) offCentre.push(`${style} at ${width}px: ${off}px`);
        }
    }
    check('the bar\'s search sits in its middle in every boxed style, wide and narrow', offCentre.length === 0, offCentre.join(', '));
    await page.setViewportSize({width: 390, height: 844});
    await page.goto(`${BASE}/trade`, {waitUntil: 'load'});
    const phoneBar = await barPlaces();
    check('…and on a phone it is an icon beside the account menu', phoneBar.gap >= 0 && phoneBar.gap <= 16, JSON.stringify(phoneBar));
    await page.context().clearCookies({name: 'aero-theme'});
    await page.setViewportSize({width: 1440, height: 900});
    await page.goto(`${BASE}/`, {waitUntil: 'load'});
    const minimalBar = await barPlaces();
    check('…while Minimal keeps it an icon beside the account menu at every width',
        await page.evaluate(() => document.documentElement.dataset.style) === 'minimal' && minimalBar.gap >= 0 && minimalBar.gap <= 16, JSON.stringify(minimalBar));
    await page.locator('aside.rail a[data-rail="markets"]').hover();
    const tip = page.locator('[data-rail-tip="markets"]');
    await tip.waitFor({timeout: 5000}).catch(() => {});
    check('an icon names itself on hover', (await tip.innerText().catch(() => '')).includes('Markets'));
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
    await page.goto(`${BASE}/games`, {waitUntil: 'load'});
    const learnTabs = await page.$$eval('[data-section-tabs="learn"] a', (as) => as.map((a) => `${a.getAttribute('href')}${a.getAttribute('aria-current') === 'page' ? '*' : ''}`));
    check('Learn shows Games, the Poker solver, Poker night and the Glossary, Games current', learnTabs.join(',') === '/games*,/poker,/poker-night,/glossary', learnTabs.join(','));
    await page.goto(`${BASE}/strategies`, {waitUntil: 'load'});
    check('a section of one page shows no tabs', await page.locator('[data-section-tabs]').count() === 0);
    // Markets and Trade merged on 2026-10-13: the desk is the Markets section's first page.
    await page.goto(`${BASE}/trade`, {waitUntil: 'load'});
    const marketTabs = await page.$$eval('[data-section-tabs="markets"] a', (as) => as.map((a) => `${a.getAttribute('href')}${a.getAttribute('aria-current') === 'page' ? '*' : ''}`));
    check('Markets shows the trade desk and the Watchlist, the desk current', marketTabs.join(',') === '/trade*,/watchlist', marketTabs.join(','));
    check('…under the Markets heading, with the ticker tape, the ticket and the scan on one page',
        await page.getByRole('heading', {name: 'Markets', exact: true}).count() === 1
        && await page.getByText('Order Entry').count() === 1
        && await page.getByRole('tablist', {name: 'Market views'}).count() === 1);
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
    const before = await page.locator('a[href="/news"]:visible').count();
    check('news has no visible link before opening the drawer', before === 0, String(before));

    await page.locator('button[aria-label="Open navigation"]').click();
    await page.waitForTimeout(400);
    for (const href of ['/', '/news', '/trade', '/portfolio', '/strategies', '/brain', '/games', '/friends', '/settings']) {
        check(`drawer reaches ${href}`, await page.locator(`[data-slot="sheet-content"] a[href="${href}"]`).count() === 1);
    }
    await shot('02-mobile-drawer');

    // Closing on navigation is manual — Radix does not do it for us.
    await page.locator('[data-slot="sheet-content"] a[href="/trade"]').click();
    await page.waitForURL(/\/trade/, {timeout: 15000});
    await page.waitForTimeout(600);
    check('drawer closes after navigating', await page.locator('[data-slot="sheet-content"]').count() === 0);
    check('landed on /trade, where Watchlist is a tab',
        page.url().endsWith('/trade') && await page.locator('[data-section-tabs="markets"] a[href="/watchlist"]:visible').count() === 1);

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
