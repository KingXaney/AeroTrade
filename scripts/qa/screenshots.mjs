// Captures the README screenshots: sign up, follow two starter topics, then the main screens at 1440x900.
// Output: ./output/screenshots/*.png, at the size the README shows them; copy the ones it uses
// into docs/screenshots/.
import {chromium} from 'playwright';
import {BASE, outDir, signUp} from './lib.mjs';

const OUT = outDir('screenshots');

(async () => {
    const browser = await chromium.launch({channel: 'chrome', headless: true});
    const context = await browser.newContext({viewport: {width: 1440, height: 900}, deviceScaleFactor: 1});
    const page = await context.newPage();
    const shot = async (name, wait = 1200) => {
        await page.waitForTimeout(wait);
        await page.screenshot({path: `${OUT}${name}.png`, fullPage: false});
        console.log('shot', name);
    };

    // Sign-up lands on the dashboard now, with the default topics already seeded — no
    // starter picking to do. Visiting each page triggers its bounded live fetch, so the
    // topics surfaces have real content in the shots.
    await signUp(page, 'Ada', {name: 'Ada Lovelace'});
    await page.waitForTimeout(1000);

    for (const slug of ['ai-chips', 'fed-rate-decisions']) {
        await page.goto(`${BASE}/topics/${slug}`, {waitUntil: 'load'});
        await page.waitForTimeout(2500);
    }

    await page.goto(`${BASE}/topics`, {waitUntil: 'load'});
    await shot('topics', 2000);
    await page.goto(`${BASE}/topics/ai-chips`, {waitUntil: 'load'});
    await shot('topic-ai-chips', 2000);
    await page.goto(`${BASE}/`, {waitUntil: 'load'});
    await shot('home', 2500);
    await page.goto(`${BASE}/dashboard`, {waitUntil: 'load'});
    await shot('dashboard', 3500);
    await page.goto(`${BASE}/brain`, {waitUntil: 'load'});
    await shot('brain', 2000);
    await page.goto(`${BASE}/trade`, {waitUntil: 'load'});
    await shot('trade', 2500);

    await page.goto(`${BASE}/settings?tab=appearance`, {waitUntil: 'load'});
    await page.waitForTimeout(800);
    await page.getByRole('radio', {name: /^Neon Terminal/}).first().click();
    await page.waitForTimeout(1500);
    await page.goto(`${BASE}/settings?tab=appearance`, {waitUntil: 'load'});
    await shot('settings-themes', 1500);
    await page.goto(`${BASE}/settings?tab=appearance`, {waitUntil: 'load'});
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
