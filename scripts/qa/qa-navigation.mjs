// PR 2 (App shell) checks: the mobile drawer reaches the four routes the sidebar owned,
// the ⌘K palette is keyboard-drivable, and the friend-request badge appears.
// Run against the harness in README.md (in-memory Mongo on :27117 + `npm run dev`).
import {chromium} from 'playwright';
import {mkdirSync} from 'node:fs';

const BASE = 'http://localhost:3000';
const OUT = new URL('./output/navigation/', import.meta.url).pathname;
mkdirSync(OUT, {recursive: true});

let failures = 0;
const check = (name, ok, detail = '') => {
    if (!ok) failures++;
    console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? `  — ${detail}` : ''}`);
};

const signUp = async (page, tag) => {
    const email = `qa${tag}${Date.now()}@example.com`;
    await page.goto(`${BASE}/sign-up`, {waitUntil: 'load'});
    await page.fill('#fullName', `QA ${tag}`);
    await page.fill('#email', email);
    await page.fill('#password', 'Passw0rd!Passw0rd!');
    await page.click('button[type="submit"]');
    await page.waitForURL(new RegExp(`^${BASE}/(\\?.*)?$`), {timeout: 90000});
    return email;
};

const browser = await chromium.launch({channel: 'chrome'});
const page = await browser.newPage({viewport: {width: 1440, height: 900}});
const shot = (n) => page.screenshot({path: `${OUT}${n}.png`, fullPage: true});

try {
    const firstEmail = await signUp(page, 'one');

    // --- desktop nav unchanged -------------------------------------------------
    const sideHrefs = await page.$$eval('aside nav a', (as) => as.map((a) => a.getAttribute('href')));
    check('sidebar still lists all eleven routes',
        sideHrefs.join(',') === '/topics,/,/brain,/strategies,/portfolio,/trade,/markets,/news,/watchlist,/friends,/history,/settings',
        sideHrefs.join(','));
    check('hamburger is hidden at desktop width',
        !(await page.locator('button[aria-label="Open navigation"]').isVisible()));

    // --- ⌘K is keyboard-drivable ----------------------------------------------
    await page.keyboard.press('Meta+k');
    await page.waitForSelector('[cmdk-input]', {timeout: 5000});
    check('⌘K opens the palette', await page.locator('[cmdk-input]').isVisible());
    await page.keyboard.type('AAPL');
    await page.waitForTimeout(1200); // debounced server search
    // Arrow + Enter alone — never a mouse. This is what the raw <li>/<Link> rows broke.
    await page.keyboard.press('ArrowDown');
    await page.keyboard.press('Enter');
    await page.waitForURL(/\/(stocks|topics)\//, {timeout: 10000}).catch(() => {});
    check('arrow + Enter navigates from the palette', /\/(stocks|topics)\//.test(page.url()), page.url());
    await shot('01-palette-keyboard');

    // --- mobile drawer reaches the four sidebar-only routes --------------------
    await page.setViewportSize({width: 390, height: 844});
    await page.goto(`${BASE}/portfolio`, {waitUntil: 'networkidle'});
    const before = await page.locator('a[href="/watchlist"]:visible').count();
    check('watchlist still has no visible link before opening the drawer', before === 0, String(before));

    await page.locator('button[aria-label="Open navigation"]').click();
    await page.waitForTimeout(400);
    for (const href of ['/watchlist', '/friends', '/history', '/settings']) {
        check(`drawer reaches ${href}`, await page.locator(`[data-slot="sheet-content"] a[href="${href}"]`).count() === 1);
    }
    await shot('02-mobile-drawer');

    // Closing on navigation is manual — Radix does not do it for us.
    await page.locator('[data-slot="sheet-content"] a[href="/watchlist"]').click();
    await page.waitForURL(/\/watchlist/, {timeout: 15000});
    await page.waitForTimeout(600);
    check('drawer closes after navigating', await page.locator('[data-slot="sheet-content"]').count() === 0);
    check('landed on /watchlist', page.url().endsWith('/watchlist'));

    // --- friend-request badge --------------------------------------------------
    const second = await browser.newPage({viewport: {width: 1440, height: 900}});
    await signUp(second, 'two');
    await second.goto(`${BASE}/friends`, {waitUntil: 'networkidle'});
    await second.fill('input[type="email"]', firstEmail);
    await second.locator('form button[type="submit"], button:has-text("Send")').first().click();
    await second.waitForTimeout(1500);
    check('sent request shows in the Sent panel',
        await second.getByText('Sent (1)').count() > 0);
    await second.screenshot({path: `${OUT}03-sent-requests.png`, fullPage: true});

    // The recipient should now see a badge without visiting /friends.
    await page.setViewportSize({width: 1440, height: 900});
    await page.goto(`${BASE}/`, {waitUntil: 'networkidle'});
    const badge = await page.locator('aside nav a[href="/friends"] span[aria-label*="friend request"]').count();
    check('friend-request badge appears in the sidebar', badge === 1, String(badge));
    await shot('04-friend-badge');
    await second.close();
} catch (err) {
    failures++;
    console.log(`FAIL  threw: ${err.message}`);
    await shot('99-error').catch(() => {});
} finally {
    await browser.close();
}

console.log(failures === 0 ? '\nAll navigation checks passed.' : `\n${failures} check(s) failed.`);
process.exit(failures === 0 ? 0 : 1);
