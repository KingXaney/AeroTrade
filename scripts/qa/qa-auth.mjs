// PR 6 (Honest copy + account recovery): the market-hours badge, the /markets tab in
// the URL, the trades on /history, and password reset end to end — the emailed link
// opens logged out (proxy matcher), the token is read out of the throwaway Mongo (no
// SMTP in the harness), the request answers identically for every address, the
// rate limiter stops the fourth request, old sessions are revoked, a token is single-use.
import {chromium} from 'playwright';
import {MongoClient} from 'mongodb';
import {mkdirSync} from 'node:fs';

const BASE = 'http://localhost:3000';
const MONGO = 'mongodb://127.0.0.1:27117/aerotrade';
const OUT = new URL('./output/auth/', import.meta.url).pathname;
mkdirSync(OUT, {recursive: true});

const NEUTRAL = 'If an account exists for that address, a reset link is on its way. It expires in 30 minutes.';
const P1 = 'Passw0rd!Passw0rd!';
const P2 = 'N3wPassw0rd!N3wPassw0rd!';

let failures = 0;
const check = (name, ok, detail = '') => {
    if (!ok) failures++;
    console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? `  — ${detail}` : ''}`);
};

const browser = await chromium.launch({channel: 'chrome'});
const mongo = new MongoClient(MONGO);
let page;
const shot = (n) => page.screenshot({path: `${OUT}${n}.png`, fullPage: true});

const requestReset = async (email) => {
    await page.goto(`${BASE}/forgot-password`, {waitUntil: 'load'});
    await page.fill('#email', email);
    await page.click('button[type="submit"]');
    await page.getByRole('status').waitFor({timeout: 30000});
    return (await page.getByRole('status').innerText()).trim();
};

try {
    await mongo.connect();
    const db = mongo.db('aerotrade');
    const verification = db.collection('verification');

    // --- signed-in checks: badge, markets tab, history --------------------------------
    const signedIn = await browser.newContext({viewport: {width: 1440, height: 900}});
    page = await signedIn.newPage();
    const email = `qaauth${Date.now()}@example.com`;
    await page.goto(`${BASE}/sign-up`, {waitUntil: 'load'});
    await page.fill('#fullName', 'QA Auth');
    await page.fill('#email', email);
    await page.fill('#password', P1);
    await page.click('button[type="submit"]');
    await page.waitForURL(/\/topics/, {timeout: 90000});
    const user = await db.collection('user').findOne({email});
    const userId = String(user._id);

    await page.goto(`${BASE}/trade`, {waitUntil: 'domcontentloaded'});
    await page.getByText('Order Entry').waitFor({timeout: 30000});
    const header = await page.locator('main').innerText();
    // innerText applies the badge's CSS uppercase, hence /i.
    check('trade desk states the market status instead of "live prices"', /Open · closes|Closed ·/i.test(header) && !/live prices/i.test(header));
    // Every route streams behind a loading skeleton, so wait for the page's own heading.
    await page.goto(`${BASE}/watchlist`, {waitUntil: 'load'});
    await page.getByRole('heading', {name: 'Active Watchlist'}).waitFor({timeout: 30000});
    const wl = await page.locator('main').innerText();
    check('watchlist states the market status instead of "real-time telemetry"', /Open · closes|Closed ·/i.test(wl) && !/real-time/i.test(wl));
    check('watchlist empty state promises no alerts', !/alerts/i.test(wl));

    await page.goto(`${BASE}/markets?view=heatmap`, {waitUntil: 'domcontentloaded'});
    const heat = page.getByRole('tab', {name: 'Heatmap'});
    await heat.waitFor({timeout: 30000});
    check('/markets?view=heatmap opens the Heatmap tab', (await heat.getAttribute('aria-selected')) === 'true');
    await page.getByRole('tab', {name: 'Crypto'}).click();
    await page.waitForURL(/\/markets\?view=crypto/, {timeout: 15000});
    check('picking a tab updates the URL', /view=crypto/.test(page.url()), page.url());
    await page.reload({waitUntil: 'domcontentloaded'});
    check('the tab survives a reload', (await page.getByRole('tab', {name: 'Crypto'}).getAttribute('aria-selected')) === 'true');

    await page.goto(`${BASE}/history`, {waitUntil: 'load'});
    await page.getByRole('heading', {name: 'History', exact: true}).waitFor({timeout: 30000});
    const hist = await page.locator('main').innerText();
    check('/history has a Trades section and honest headings',
        await page.getByRole('heading', {name: /^trades$/i}).count() === 1 && await page.getByRole('heading', {name: /^on your watchlist, by date added$/i}).count() === 1 && !/Activity History/i.test(hist));
    await shot('01-history');

    // --- password reset, logged out ----------------------------------------------------
    const loggedOut = await browser.newContext({viewport: {width: 1440, height: 900}});
    page = await loggedOut.newPage();
    await page.goto(`${BASE}/reset-password?token=bogus`, {waitUntil: 'load'});
    check('the reset page is reachable logged out (proxy matcher)', /\/reset-password/.test(page.url()) && await page.getByText('Choose a new password').count() === 1, page.url());
    await page.goto(`${BASE}/reset-password`, {waitUntil: 'load'});
    check('a link without a token explains itself', await page.getByRole('alert').filter({hasText: 'missing its reset token'}).count() === 1);

    const tokensFor = () => verification.countDocuments({identifier: /^reset-password:/, value: userId});
    check('sign-in offers a way to recover', (await page.goto(`${BASE}/sign-in`, {waitUntil: 'load'}), await page.locator('a[href="/forgot-password"]').count() === 1));

    const m1 = await requestReset(email);
    check('a known address gets the neutral message', m1 === NEUTRAL, m1);
    check('…and a reset token', (await tokensFor()) === 1);
    await shot('02-forgot');
    // Count only rows created after this request: better-auth prunes expired tokens
    // lazily, so a before/after total can move for reasons unrelated to the request.
    const t0 = new Date();
    const m2 = await requestReset(`nobody${Date.now()}@example.com`);
    check('an unknown address gets the identical message', m2 === NEUTRAL);
    check('…and no token', (await verification.countDocuments({identifier: /^reset-password:/, createdAt: {$gte: t0}})) === 0);

    await requestReset(email); await requestReset(email);
    check('three requests in a window are honoured', (await tokensFor()) === 3);
    const m4 = await requestReset(email);
    check('the fourth is silently rate-limited with the same message', m4 === NEUTRAL && (await tokensFor()) === 3);

    const doc = await verification.find({identifier: /^reset-password:/, value: userId}).sort({_id: -1}).limit(1).next();
    const token = doc.identifier.slice('reset-password:'.length);
    await page.goto(`${BASE}/reset-password?token=${encodeURIComponent(token)}`, {waitUntil: 'load'});
    await page.fill('#password', P2);
    await page.fill('#confirm', P2);
    await page.click('button[type="submit"]');
    await page.waitForURL(/\/sign-in/, {timeout: 30000});
    check('a valid token lets the user set a new password', true);

    await page.fill('#email', email); await page.fill('#password', P1); await page.click('button[type="submit"]');
    await page.getByText('Sign in failed').waitFor({timeout: 30000});
    check('the old password no longer works', true);
    await page.mouse.move(5, 700); await page.waitForTimeout(800);
    await page.fill('#password', P2); await page.click('button[type="submit"]');
    await page.waitForURL(/\/topics/, {timeout: 60000});
    check('the new password signs in', true);

    await page.goto(`${BASE}/reset-password?token=${encodeURIComponent(token)}`, {waitUntil: 'load'});
    check('a signed-in user can still open the reset page', await page.getByText('Choose a new password').count() === 1);
    await page.fill('#password', P1); await page.fill('#confirm', P1); await page.click('button[type="submit"]');
    await page.getByText(/invalid or has expired/).waitFor({timeout: 30000});
    check('a used token is refused', true);
    await shot('03-token-reused');

    // The first context's session was revoked by the reset.
    page = await signedIn.newPage();
    await page.goto(`${BASE}/topics`, {waitUntil: 'load'});
    check('the pre-reset session was revoked', /\/sign-in/.test(page.url()), page.url());
} catch (err) {
    failures++;
    console.log(`FAIL  threw: ${err.message}`);
    if (page) await shot('99-error').catch(() => {});
} finally {
    await mongo.close().catch(() => {});
    await browser.close();
}

console.log(failures === 0 ? '\nAll auth checks passed.' : `\n${failures} check(s) failed.`);
process.exit(failures === 0 ? 0 : 1);
