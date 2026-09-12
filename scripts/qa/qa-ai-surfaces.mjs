// PR 3 (AI surfaces + confirmations): chat error recovery, safe markdown rendering,
// the read-only portfolio tool, and the three destructive actions that now confirm.
// Run against the harness in README.md (in-memory Mongo on :27117 + `npm run dev`).
import {chromium} from 'playwright';
import {MongoClient} from 'mongodb';
import {mkdirSync} from 'node:fs';

const BASE = 'http://localhost:3000';
const MONGO = 'mongodb://127.0.0.1:27117/aerotrade';
const OUT = new URL('./output/ai-surfaces/', import.meta.url).pathname;
mkdirSync(OUT, {recursive: true});

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

    await page.goto(`${BASE}/sign-up`, {waitUntil: 'load'});
    await page.fill('#fullName', 'QA AI');
    await page.fill('#email', `qaai${Date.now()}@example.com`);
    await page.fill('#password', 'Passw0rd!Passw0rd!');
    await page.click('button[type="submit"]');
    await page.waitForURL(/\/topics/, {timeout: 90000});

    const openChat = async () => {
        await page.locator('button[aria-label*="ssistant" i], button[aria-label*="chat" i]').first().click();
        await page.waitForSelector('[role="dialog"][aria-label="AeroTrade assistant"]', {timeout: 10000});
    };

    // --- the portfolio tool must not create an account just by being asked ----------
    const accountsBefore = await db.collection('paperaccounts').countDocuments();
    await openChat();
    check('chat panel opens', await page.locator('[role="dialog"][aria-label="AeroTrade assistant"]').count() === 1);
    check('composer is focused on open',
        await page.evaluate(() => document.activeElement?.getAttribute('placeholder')) === 'Query market data...');

    // --- error recovery: the panel used to go permanently deaf after one failure ----
    await page.route('**/api/chat', (route) => route.abort());
    await page.locator('[role="dialog"] input').fill('how am I doing?');
    await page.keyboard.press('Enter');
    await page.waitForTimeout(2500);
    const banner = page.locator('[role="dialog"] >> text=/connection|couldn.t finish|unavailable/i');
    check('a failed request shows human copy, not a wire message', await banner.count() > 0);
    check('no raw error text leaked',
        (await page.locator('[role="dialog"]').innerText()).match(/ECONNREFUSED|net::|<!DOCTYPE/i) === null);
    check('a Try again button is offered',
        await page.getByRole('button', {name: /try again/i}).count() > 0);
    await shot('01-chat-error');

    // The real bug: input stayed enabled while every submit silently returned.
    await page.unroute('**/api/chat');
    await page.locator('[role="dialog"] input').fill('hello again');
    await page.keyboard.press('Enter');
    await page.waitForTimeout(1500);
    const userTurns = await page.locator('[role="dialog"] >> text=/hello again/').count();
    check('the panel accepts messages again after an error', userTurns > 0);
    await shot('02-chat-recovered');

    const accountsAfter = await db.collection('paperaccounts').countDocuments();
    check('asking the assistant created no paper account',
        accountsAfter === accountsBefore, `${accountsBefore} -> ${accountsAfter}`);

    // Escape closes the panel.
    await page.keyboard.press('Escape');
    await page.waitForTimeout(400);
    check('Escape closes the chat panel',
        await page.locator('[role="dialog"][aria-label="AeroTrade assistant"]').count() === 0);

    // --- markdown actually renders as a list ---------------------------------------
    // Rendering is exercised via the brain's weekly rationale, which is seeded markdown
    // rather than a live model call (no GEMINI_API_KEY in the harness).
    const today = new Date().toISOString().slice(0, 10);
    // Upsert, not insert — {userId, date} is unique and reruns would collide.
    await db.collection('suggestionsets').replaceOne(
        {userId: 'global', date: today},
        {
            userId: 'global', date: today, kind: 'preview', items: [],
            rationaleMd: ['- first bullet', '- second bullet', '', '[a link](https://example.com)', '', '![img](https://example.com/x.png)'].join('\n'),
            createdAt: new Date(), updatedAt: new Date(),
        },
        {upsert: true},
    );
    await page.goto(`${BASE}/brain`, {waitUntil: 'domcontentloaded'});
    // /brain now has a loading.tsx, so a fixed timeout can land on the skeleton.
    await page.getByText('Weekly Decisions').waitFor({timeout: 30000});
    await page.waitForTimeout(500);
    const lis = await page.locator('li:has-text("first bullet")').count();
    check('model markdown renders as a real list', lis > 0, `${lis} <li>`);
    check('links in model output are neutralised',
        await page.locator('a[href="https://example.com"]').count() === 0);
    check('images in model output are dropped',
        await page.locator('img[src*="example.com"]').count() === 0);
    await shot('03-markdown');

    // --- destructive actions confirm ------------------------------------------------
    await page.goto(`${BASE}/portfolio`, {waitUntil: 'networkidle'});
    await page.getByRole('button', {name: /Reset Strategy/i}).click();
    await page.waitForTimeout(500);
    const resetCopy = await page.locator('[role="dialog"]').innerText();
    check('reset asks first', /Reset .*\?/i.test(resetCopy));
    check('reset names what is destroyed',
        /trade history/i.test(resetCopy) && /snapshot/i.test(resetCopy), resetCopy.slice(0, 90));
    await shot('04-reset-confirm');
    await page.getByRole('button', {name: 'Cancel'}).click();
    await page.waitForTimeout(300);
    const trades = await db.collection('papertrades').countDocuments();
    check('cancelling the reset changed nothing', trades === 0);

    await page.goto(`${BASE}/settings`, {waitUntil: 'networkidle'});
    await page.locator('#dashboard').getByRole('button', {name: /Reset to default/i}).click();
    await page.waitForTimeout(500);
    check('dashboard reset asks first',
        /Reset your dashboard\?/i.test(await page.locator('[role="dialog"]').innerText()));
    await shot('05-dashboard-reset-confirm');
} catch (err) {
    failures++;
    console.log(`FAIL  threw: ${err.message}`);
    await shot('99-error').catch(() => {});
} finally {
    await mongo.close().catch(() => {});
    await browser.close();
}

console.log(failures === 0 ? '\nAll AI-surface checks passed.' : `\n${failures} check(s) failed.`);
process.exit(failures === 0 ? 0 : 1);
