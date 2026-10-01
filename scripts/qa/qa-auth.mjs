// PR 6 (Honest copy + account recovery): the market-hours badge, the /markets tab in
// the URL, the trades on /history, and password reset end to end — the emailed link
// opens logged out (proxy matcher), the token is read out of the throwaway Mongo (no
// SMTP in the harness), the request answers identically for every address, the
// rate limiter stops the fourth request, old sessions are revoked, a token is single-use.
// Sign-in is limited per address (10 in 15 minutes, every spelling of it counted together) and
// per client address (30): the refusal is one fixed sentence, identical for an address with an
// account and one without, it holds even for the right password, and another address is not
// touched. The per-client check seeds its counter; every signin:* row is removed at the end so
// no later suite starts inside this one's window. Sign-up is limited per client address: this
// suite's own sign-up is counted, and a client over the limit (its counter seeded past any
// SIGN_UP_CLIENT_LIMIT the harness sets) gets one fixed sentence and no account; every signup:*
// row is removed at the end too. Neither the sign-up nor the sign-in action hands the browser the
// session token its cookie carries, and the tab icon loads logged out.
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
// lib/auth/limits.ts: SIGN_IN_LIMITED_MESSAGE, SIGN_IN_EMAIL_LIMIT, SIGN_IN_CLIENT_LIMIT.
const LIMITED = 'Too many sign-in attempts. Try again in a few minutes.';
const SIGN_UP_LIMITED = 'Too many sign-up attempts from this network. Try again later.';
const EMAIL_LIMIT = 10;
const CLIENT_LIMIT = 30;

let failures = 0;
const check = (name, ok, detail = '') => {
    if (!ok) failures++;
    console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? `  — ${detail}` : ''}`);
};

const browser = await chromium.launch({channel: 'chrome'});
const mongo = new MongoClient(MONGO);
let page;
let limits;
const shot = (n) => page.screenshot({path: `${OUT}${n}.png`, fullPage: true});

// A server action is a POST carrying a Next-Action header; its response is what the page's
// JavaScript receives.
const actionResponse = () => page.waitForResponse(
    (r) => r.request().method() === 'POST' && Boolean(r.request().headers()['next-action']), {timeout: 90000});
// better-auth's cookie is `<token>.<signature>`; the token alone must never reach the page.
const sessionToken = async (context) => {
    const cookie = (await context.cookies(BASE)).find((c) => c.name.endsWith('session_token'));
    return cookie ? decodeURIComponent(cookie.value).split('.')[0] : null;
};

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
    limits = db.collection('ratelimits');

    // --- signed-in checks: badge, markets tab, history --------------------------------
    const signedIn = await browser.newContext({viewport: {width: 1440, height: 900}});
    page = await signedIn.newPage();
    const email = `qaauth${Date.now()}@example.com`;
    await page.goto(`${BASE}/sign-up`, {waitUntil: 'load'});
    await page.fill('#fullName', 'QA Auth');
    await page.fill('#email', email);
    await page.fill('#password', P1);
    const signUpAction = actionResponse();
    await page.click('button[type="submit"]');
    // Read before the page moves on, while the body is still the browser's to hand over.
    const signUpBody = await (await signUpAction).text();
    await page.waitForURL(new RegExp(`^${BASE}/(\\?.*)?$`), {timeout: 90000});
    const signUpToken = await sessionToken(signedIn);
    check('the sign-up action returns no session token', Boolean(signUpToken) && signUpBody.length > 0 && !signUpBody.includes(signUpToken),
        signUpToken ? '' : 'no session cookie');
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
    const icon = await loggedOut.request.get(`${BASE}/icon.svg`, {maxRedirects: 0});
    check('…and so is the tab icon, not redirected to /sign-in', icon.status() === 200 && /image\/svg\+xml/.test(icon.headers()['content-type'] ?? ''),
        `${icon.status()} ${icon.headers()['content-type'] ?? ''} ${icon.headers().location ?? ''}`);
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
    await page.fill('#password', P2);
    const signInAction = actionResponse();
    await page.click('button[type="submit"]');
    const signInBody = await (await signInAction).text();
    await page.waitForURL(new RegExp(`^${BASE}/(\\?.*)?$`), {timeout: 60000});
    check('the new password signs in', true);
    const signInToken = await sessionToken(loggedOut);
    check('…and the sign-in action returns no session token', Boolean(signInToken) && signInBody.length > 0 && !signInBody.includes(signInToken),
        signInToken ? '' : 'no session cookie');

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

    // --- sign-in rate limit ------------------------------------------------------------
    const limiter = await browser.newContext({viewport: {width: 1440, height: 900}});
    page = await limiter.newPage();
    // A fresh page per attempt, so the one toast on it is this attempt's answer.
    const signInAttempt = async (address, password) => {
        await page.goto(`${BASE}/sign-in`, {waitUntil: 'load'});
        await page.fill('#email', address);
        await page.fill('#password', password);
        await page.click('button[type="submit"]');
        const toast = page.locator('[data-sonner-toast]').first();
        await toast.waitFor({timeout: 30000});
        return (await toast.innerText()).replace(/\s+/g, ' ').trim();
    };
    const sessionsOf = () => db.collection('session').countDocuments({$or: [{userId: user._id}, {userId}]});
    const sessionsBefore = await sessionsOf();
    // The two sign-ins after the reset above counted into this address's window: start it at zero.
    await limits.deleteMany({key: `signin:email:${email}`});

    const answers = [];
    for (let i = 0; i < EMAIL_LIMIT; i += 1) {
        // Every other attempt in capitals: the counter is keyed on the lower-cased address.
        answers.push(await signInAttempt(i % 2 ? email.toUpperCase() : email, `Wrong${i}Passw0rd!`));
    }
    check(`${EMAIL_LIMIT} wrong passwords on one address are each answered as usual`,
        answers.every((a) => /Invalid email or password/i.test(a) && !a.includes(LIMITED)), answers.find((a) => !/Invalid email or password/i.test(a)) ?? '');
    const emailRow = await limits.findOne({key: `signin:email:${email}`});
    check('…and counted under one key for every spelling of the address', emailRow?.count === EMAIL_LIMIT, JSON.stringify(emailRow?.count));

    const refusedKnown = await signInAttempt(email, P2);
    check(`attempt ${EMAIL_LIMIT + 1} is refused with the fixed message, even with the right password`,
        refusedKnown.includes(LIMITED) && /\/sign-in/.test(page.url()), refusedKnown);
    check('…and no session was created', (await sessionsOf()) === sessionsBefore);

    // An address with no account, at the same count: the answer must not tell them apart.
    const stranger = `nobody-limit${Date.now()}@example.com`;
    const now = new Date();
    await limits.insertOne({key: `signin:email:${stranger}`, count: EMAIL_LIMIT, windowStartedAt: now, expiresAt: new Date(now.getTime() + 15 * 60 * 1000)});
    const refusedStranger = await signInAttempt(stranger, P2);
    check('an address with no account is refused with the identical answer', refusedStranger === refusedKnown, refusedStranger);

    const other = `other-limit${Date.now()}@example.com`;
    const otherAnswer = await signInAttempt(other, P2);
    check('a different address is unaffected', /Invalid email or password/i.test(otherAnswer) && !otherAnswer.includes(LIMITED), otherAnswer);

    // Per client: `next dev` fills x-forwarded-for from the socket when the browser sends none,
    // so this run has one key.
    const clientRows = await limits.find({key: /^signin:ip:/}).toArray();
    check('the client address is counted too', clientRows.length === 1 && clientRows[0].count >= EMAIL_LIMIT + 3,
        clientRows.map((r) => `${r.key}=${r.count}`).join(', '));
    if (clientRows.length === 1) {
        await limits.updateOne({_id: clientRows[0]._id}, {$set: {count: CLIENT_LIMIT}});
        const fresh = `fresh-limit${Date.now()}@example.com`;
        const refusedClient = await signInAttempt(fresh, P2);
        check(`a client over ${CLIENT_LIMIT} attempts is refused with the same answer`, refusedClient === refusedKnown, refusedClient);
        check('…before its address is counted', (await limits.countDocuments({key: `signin:email:${fresh}`})) === 0);
    }
    await shot('04-sign-in-limited');

    // --- sign-up, per client --------------------------------------------------------------
    const signUpRows = await limits.find({key: /^signup:ip:/}).toArray();
    check('this suite\'s sign-up was counted against its client', signUpRows.length === 1 && signUpRows[0].count >= 1,
        signUpRows.map((r) => `${r.key}=${r.count}`).join(', '));
    if (signUpRows.length === 1) {
        await limits.updateOne({_id: signUpRows[0]._id}, {$set: {count: 1_000_000}});
        const late = await browser.newContext({viewport: {width: 1440, height: 900}});
        page = await late.newPage();
        const lateEmail = `qaauth-late${Date.now()}@example.com`;
        await page.goto(`${BASE}/sign-up`, {waitUntil: 'load'});
        await page.fill('#fullName', 'QA Late');
        await page.fill('#email', lateEmail);
        await page.fill('#password', P1);
        await page.click('button[type="submit"]');
        const toast = page.getByText(SIGN_UP_LIMITED);
        await toast.waitFor({timeout: 30000}).catch(() => {});
        check('a client over the sign-up limit is refused with the fixed sentence', await toast.isVisible());
        check('…stays on /sign-up', /\/sign-up/.test(page.url()), page.url());
        check('…and no account was created', (await db.collection('user').countDocuments({email: lateEmail})) === 0);
        await shot('05-sign-up-limited');
    }
} catch (err) {
    failures++;
    console.log(`FAIL  threw: ${err.message}`);
    if (page) await shot('99-error').catch(() => {});
} finally {
    // Later suites sign in and sign up from this same client: leave no window open behind.
    if (limits) await limits.deleteMany({key: /^sign(in|up):/}).catch(() => {});
    await mongo.close().catch(() => {});
    await browser.close();
}

console.log(failures === 0 ? '\nAll auth checks passed.' : `\n${failures} check(s) failed.`);
process.exit(failures === 0 ? 0 : 1);
