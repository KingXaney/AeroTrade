// Captures the README screenshots: sign up, follow two starter topics, then the main screens at 1440x900.
// Output: ./output/*.png. Downscale for the README with `sips -Z 1200 output/dashboard.png --out ../../docs/screenshots/dashboard.png`.
import {chromium} from 'playwright';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const BASE = process.env.QA_BASE_URL || 'http://localhost:3000';
const OUT = path.resolve(__dirname, 'output');
fs.mkdirSync(OUT, {recursive: true});

(async () => {
    const browser = await chromium.launch({channel: 'chrome', headless: true});
    const context = await browser.newContext({viewport: {width: 1440, height: 900}, deviceScaleFactor: 1});
    const page = await context.newPage();
    const shot = async (name, wait = 1200) => {
        await page.waitForTimeout(wait);
        await page.screenshot({path: `${OUT}/${name}.png`, fullPage: false});
        console.log('shot', name);
    };

    await page.goto(`${BASE}/sign-up`, {waitUntil: 'load'});
    await page.fill('#fullName', 'Ada Lovelace');
    await page.fill('#email', `ada${Date.now()}@example.com`);
    await page.fill('#password', 'Passw0rd!Passw0rd!');
    await page.click('button[type=submit]');
    await page.waitForURL(/\/topics/, {timeout: 90000});
    await page.waitForTimeout(1000);

    // Two starters so every topics surface has real content (the first visit does a live Google News fetch).
    for (const name of ['AI chips', 'Fed rate decisions']) {
        await page.getByRole('button', {name: new RegExp(`${name}$`)}).click();
    }
    await page.getByRole('button', {name: /^Follow 2 selected/}).click();
    await page.waitForSelector('nav[aria-label="Your topics"]', {timeout: 90000});
    for (const slug of ['ai-chips', 'fed-rate-decisions']) {
        await page.goto(`${BASE}/topics/${slug}`, {waitUntil: 'load'});
        await page.waitForTimeout(2500);
    }

    await page.goto(`${BASE}/topics`, {waitUntil: 'load'});
    await shot('topics', 2000);
    await page.goto(`${BASE}/topics/ai-chips`, {waitUntil: 'load'});
    await shot('topic-ai-chips', 2000);
    await page.goto(`${BASE}/`, {waitUntil: 'load'});
    await shot('dashboard', 3500);
    await page.goto(`${BASE}/brain`, {waitUntil: 'load'});
    await shot('brain', 2000);
    await page.goto(`${BASE}/trade`, {waitUntil: 'load'});
    await shot('trade', 2500);

    await page.goto(`${BASE}/settings`, {waitUntil: 'load'});
    await page.waitForTimeout(800);
    await page.getByRole('radio', {name: /^Neon Terminal/}).first().click();
    await page.waitForTimeout(1500);
    await page.goto(`${BASE}/settings`, {waitUntil: 'load'});
    await shot('settings-themes', 1500);
    await page.goto(`${BASE}/settings`, {waitUntil: 'load'});
    await page.waitForTimeout(800);
    await page.getByRole('radio', {name: /^Paper/}).first().click();
    await page.waitForTimeout(1500);
    await page.goto(`${BASE}/topics`, {waitUntil: 'load'});
    await shot('topics-paper', 2000);

    await browser.close();
    console.log('DONE');
})().catch((e) => {
    console.error('screenshots failed:', e);
    process.exit(1);
});
