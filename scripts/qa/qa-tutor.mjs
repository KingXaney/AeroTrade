// The chat tutor's guard rails, keyless: the three rate-limit windows refuse in order
// with honest copy and no retry, and an "Ask in chat" link prefills the composer
// without sending. The tutor's actual answers need a Gemini key and are checked by
// hand. Run against the harness in README.md.
import {chromium} from 'playwright';
import {MongoClient} from 'mongodb';
import {mkdirSync} from 'node:fs';

const BASE = 'http://localhost:3000';
const MONGO = 'mongodb://127.0.0.1:27117/aerotrade';
const OUT = new URL('./output/tutor/', import.meta.url).pathname;
mkdirSync(OUT, {recursive: true});

const CHAT_DIALOG = '[role="dialog"][aria-label="AeroTrade assistant"]';
const LIMITED = /a lot of messages/i;
const CAPACITY = /shared budget/i;

let failures = 0;
const check = (name, ok, detail = '') => {
    if (!ok) failures++;
    console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? `  — ${detail}` : ''}`);
};

const browser = await chromium.launch({channel: 'chrome'});
const page = await browser.newPage({viewport: {width: 1440, height: 900}});
const shot = (n) => page.screenshot({path: `${OUT}${n}.png`, fullPage: true});
const mongo = new MongoClient(MONGO);

try {
    await mongo.connect();
    const db = mongo.db('aerotrade');
    const email = `qatutor${Date.now()}@example.com`;
    await page.goto(`${BASE}/sign-up`, {waitUntil: 'load'});
    await page.fill('#fullName', 'QA Tutor');
    await page.fill('#email', email);
    await page.fill('#password', 'Passw0rd!Passw0rd!');
    await page.click('button[type="submit"]');
    await page.waitForURL(new RegExp(`^${BASE}/(\\?.*)?$`), {timeout: 90000});
    const userDoc = await db.collection('user').findOne({email});
    const userId = String(userDoc?._id ?? userDoc?.id ?? '');
    check('signed up', userId.length > 0);

    const limits = db.collection('ratelimits');
    const windowRow = (key, count, ms) => ({key, count, windowStartedAt: new Date(), expiresAt: new Date(Date.now() + ms)});
    const dialog = page.locator(CHAT_DIALOG);
    const composer = () => dialog.locator('input[placeholder="Query market data..."]');
    const openChat = async () => {
        if (await dialog.count() === 0) {
            await page.locator('button[aria-label="Open Aero-AI Assistant"]').click();
            await dialog.waitFor({timeout: 15000});
        }
    };
    const send = async (text) => {
        await openChat();
        await composer().fill(text);
        await composer().press('Enter');
    };
    const errorBox = () => dialog.locator('p').filter({hasText: /assistant|messages|budget|connection|finish/i}).last();

    // --- the user's hour --------------------------------------------------------------------
    await limits.deleteMany({key: {$in: [`chat:${userId}`, `chat:${userId}:day`, 'chat:global']}});
    await limits.insertOne(windowRow(`chat:${userId}`, 30, 3_600_000));
    await send('hello');
    await dialog.locator('p').filter({hasText: LIMITED}).waitFor({timeout: 30000});
    check('the 31st message in an hour is refused with the hour copy', true);
    check('no retry is offered for a refused request', await dialog.getByRole('button', {name: /try again/i}).count() === 0);
    check('the refused request still counted', (await limits.findOne({key: `chat:${userId}`}))?.count === 31);
    await shot('01-hour-limit');

    // --- the user's day, then everyone's --------------------------------------------------
    await limits.deleteMany({key: `chat:${userId}`});
    await limits.insertOne(windowRow(`chat:${userId}:day`, 60, 86_400_000));
    await dialog.getByRole('button', {name: 'Dismiss'}).click().catch(() => {});
    await send('hello again');
    await dialog.locator('p').filter({hasText: LIMITED}).waitFor({timeout: 30000});
    check('the daily window refuses too, before the shared budget is touched', (await limits.findOne({key: 'chat:global'})) === null);

    await limits.deleteMany({key: `chat:${userId}:day`});
    await limits.insertOne(windowRow('chat:global', 200, 86_400_000));
    await dialog.getByRole('button', {name: 'Dismiss'}).click().catch(() => {});
    await send('and again');
    await dialog.locator('p').filter({hasText: CAPACITY}).waitFor({timeout: 30000});
    check('the shared budget refuses with its own copy', true);

    // --- with no window in the way, the request reaches the (keyless) provider ------------
    await limits.deleteMany({key: {$in: [`chat:${userId}`, `chat:${userId}:day`, 'chat:global']}});
    await dialog.getByRole('button', {name: 'Dismiss'}).click().catch(() => {});
    await send('last one');
    await errorBox().waitFor({timeout: 30000});
    const finalCopy = await errorBox().innerText();
    check('an unlimited request falls through to the provider (no key here), not the limiter', !LIMITED.test(finalCopy) && !CAPACITY.test(finalCopy), finalCopy);
    check('every window counted the request once', (await limits.findOne({key: `chat:${userId}`}))?.count === 1 && (await limits.findOne({key: 'chat:global'}))?.count === 1);
    await shot('02-fallthrough');

    // --- Ask in chat prefills and never sends ----------------------------------------------
    await page.goto(`${BASE}/portfolio`, {waitUntil: 'load'});
    const terms = page.locator('[data-what-these-mean]').first();
    await terms.waitFor({timeout: 30000});
    await terms.locator('summary').click();
    await terms.locator('[data-ask="term"]').first().click();
    await dialog.waitFor({timeout: 15000});
    const typed = await composer().inputValue();
    check('the link opens the chat with the question typed', /^What does ".+" mean here\?$/.test(typed), typed);
    check('nothing was sent', !/mean here/.test(await dialog.innerText()));
    check('the composer is focused', await page.evaluate(() => document.activeElement?.getAttribute('placeholder')) === 'Query market data...');
    await terms.locator('[data-ask="term"]').nth(1).click();
    await page.waitForTimeout(200);
    check('a second link while open replaces the draft', (await composer().inputValue()) !== typed);
    await shot('03-ask');
} catch (err) {
    failures++;
    console.log(`FAIL  threw: ${err.message}`);
    await shot('99-error').catch(() => {});
} finally {
    await mongo.close().catch(() => {});
    await browser.close();
}

console.log(failures === 0 ? '\nAll tutor checks passed.' : `\n${failures} check(s) failed.`);
process.exit(failures === 0 ? 0 : 1);
