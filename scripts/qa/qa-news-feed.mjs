// The personal news feed: default = Google News top stories, every control persists
// through a real save + reload, the four surfaces follow it, and reset returns to absence.
// Run against the harness in README.md (in-memory Mongo on :27117 + `npm run dev`).
// Headline counts depend on Google News being reachable, so they are NOTEs, not FAILs;
// everything about the preference itself is deterministic.
import {chromium} from 'playwright';
import {MongoClient} from 'mongodb';
import {mkdirSync} from 'node:fs';

const BASE = 'http://localhost:3000';
const MONGO = 'mongodb://127.0.0.1:27117/aerotrade';
const OUT = new URL('./output/news-feed/', import.meta.url).pathname;
mkdirSync(OUT, {recursive: true});

let failures = 0;
const check = (name, ok, detail = '') => {
    if (!ok) failures++;
    console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? `  — ${detail}` : ''}`);
};
const note = (name, detail = '') => console.log(`NOTE  ${name}${detail ? `  — ${detail}` : ''}`);

const browser = await chromium.launch({channel: 'chrome'});
const page = await browser.newPage({viewport: {width: 1440, height: 900}});
const shot = (n) => page.screenshot({path: `${OUT}${n}.png`, fullPage: true});
// sonner pauses dismissal while the pointer hovers a toast; park the mouse elsewhere.
const settleToasts = async () => { await page.mouse.move(5, 700); await page.waitForTimeout(600); };
const mongo = new MongoClient(MONGO);

try {
    await mongo.connect();
    const db = mongo.db('aerotrade');
    const email = `qanews${Date.now()}@example.com`;
    await page.goto(`${BASE}/sign-up`, {waitUntil: 'load'});
    await page.fill('#fullName', 'QA News');
    await page.fill('#email', email);
    await page.fill('#password', 'Passw0rd!Passw0rd!');
    await page.click('button[type="submit"]');
    await page.waitForURL(/\/topics/, {timeout: 90000});
    const userDoc = await db.collection('user').findOne({email});
    const userId = String(userDoc?._id ?? userDoc?.id ?? '');
    check('signed up', userId.length > 0);
    const prefsDoc = () => db.collection('userpreferences').findOne({userId});

    // --- navigation carries the new page ------------------------------------------------
    const headerHrefs = await page.$$eval('header nav ul li a', (as) => as.map((a) => a.getAttribute('href')));
    check('header nav ends with /news', headerHrefs.join(',') === '/topics,/,/brain,/portfolio,/trade,/markets,/news', headerHrefs.join(','));

    // --- default: top stories, nothing stored -------------------------------------------
    await page.goto(`${BASE}/news`, {waitUntil: 'load'});
    check('/news renders its heading', await page.getByRole('heading', {name: 'News', level: 1}).count() === 1);
    check('default summary is top stories for the US', (await page.locator('#news-feed-summary').innerText()).trim() === 'Top stories · US');
    const cards = await page.locator('.news-item').count();
    if (cards > 0) check('default feed shows headlines', true, `${cards} cards`);
    else note('default feed showed no headlines (Google News unreachable?)');
    if (cards > 0) {
        const metas = await page.locator('.news-item .news-meta').allInnerTexts();
        check('every card names its outlet', metas.every((m) => / · .+/.test(m)), metas[0]);
    }
    check('nothing is stored for the default feed', (await prefsDoc())?.newsFeed === undefined);
    await shot('01-default');

    // --- customise: category, region, hidden outlet, keyword ----------------------------
    await page.locator('#news-feed-edit').click();
    await page.locator('#news-cat-world').click();
    await page.locator('#news-region-GB').click();
    check('category and region chips press', (await page.locator('#news-cat-world').getAttribute('aria-pressed')) === 'true'
        && (await page.locator('#news-region-GB').getAttribute('aria-pressed')) === 'true');
    // Hide whichever outlet wrote the first card, so the assertion works against live data.
    const firstMeta = cards > 0 ? await page.locator('.news-item .news-meta').first().innerText() : '';
    const hidden = firstMeta.includes(' · ') ? firstMeta.split(' · ').pop().trim() : 'Reuters';
    await page.getByLabel('Add to Hidden outlets').fill(hidden);
    await page.getByLabel('Add to Hidden outlets').press('Enter');
    await page.getByLabel('Add to Keywords').fill('climate');
    await page.getByLabel('Add to Keywords').press('Enter');
    check('save is enabled once the draft differs', !(await page.locator('#news-feed-save').isDisabled()));
    await page.locator('#news-feed-save').click();
    await page.getByText('News feed saved').waitFor({timeout: 30000});
    await settleToasts();
    await shot('02-edited');

    await page.reload({waitUntil: 'load'});
    const summary = (await page.locator('#news-feed-summary').innerText()).trim();
    check('summary reflects the saved feed', /Top stories & World · US, GB · 1 keyword · 1 outlet hidden/.test(summary), summary);
    await page.locator('#news-feed-edit').click();
    check('chips persist after reload', (await page.locator('#news-cat-world').getAttribute('aria-pressed')) === 'true'
        && (await page.locator('#news-region-GB').getAttribute('aria-pressed')) === 'true');
    const metasAfter = await page.locator('.news-item .news-meta').allInnerTexts();
    check('the hidden outlet is gone from the feed', metasAfter.every((m) => !m.endsWith(` · ${hidden}`)), `${hidden} · ${metasAfter.length} cards`);
    const stored = (await prefsDoc())?.newsFeed;
    check('preference persisted in Mongo', !!stored
        && stored.categories.join(',') === 'top,world' && stored.regions.join(',') === 'US,GB'
        && stored.excludeSources.length === 1 && stored.keywords.join(',') === 'climate',
        JSON.stringify(stored));

    // --- the other surfaces follow the feed ---------------------------------------------
    await page.goto(`${BASE}/history`, {waitUntil: 'load'});
    // The page streams past its loading boundary after `load`; wait for the section itself.
    await page.getByRole('heading', {name: /^your news feed$/i}).waitFor({timeout: 30000});
    check('/history shows the feed heading with an edit link',
        await page.getByRole('heading', {name: /^your news feed$/i}).count() === 1 && await page.locator('a[href="/news?edit=1"]').count() >= 1);
    const historyMetas = await page.locator('.news-item .news-meta').allInnerTexts();
    check('/history respects the hidden outlet', historyMetas.every((m) => !m.endsWith(` · ${hidden}`)), `${historyMetas.length} cards`);

    await page.goto(`${BASE}/settings`, {waitUntil: 'load'});
    await page.locator('#settings-news-summary').waitFor({timeout: 30000});
    check('settings has a News feed section with the summary',
        /World/.test(await page.locator('#news').innerText()) && await page.locator('#settings-news-summary').count() === 1);
    await shot('03-settings');

    // --- reset from settings: back to absence -------------------------------------------
    await page.locator('#settings-news-reset').click();
    await page.getByRole('button', {name: 'Reset feed'}).click();
    await page.getByText('News feed reset to top stories').waitFor({timeout: 30000});
    await settleToasts();
    await page.reload({waitUntil: 'load'});
    check('settings summary is back to the default', (await page.locator('#settings-news-summary').innerText()).trim() === 'Top stories · US');
    check('reset unset the field', (await prefsDoc())?.newsFeed === undefined);

    // --- saving the default is the same as reset ----------------------------------------
    await page.goto(`${BASE}/news?edit=1`, {waitUntil: 'load'});
    await page.locator('#news-cat-business').click();
    await page.locator('#news-feed-save').click();
    await page.getByText('News feed saved').waitFor({timeout: 30000});
    await settleToasts();
    check('a customised feed is stored', (await prefsDoc())?.newsFeed?.categories?.includes('business') === true);
    await page.locator('#news-cat-business').click();
    await page.locator('#news-feed-save').click();
    await page.getByText('News feed saved').waitFor({timeout: 30000});
    await settleToasts();
    check('saving the default unsets the field again', (await prefsDoc())?.newsFeed === undefined);
    await shot('04-back-to-default');
} catch (err) {
    failures++;
    console.log(`FAIL  threw: ${err.message}`);
    await shot('99-error').catch(() => {});
} finally {
    await mongo.close().catch(() => {});
    await browser.close();
}

console.log(failures === 0 ? '\nAll news-feed checks passed.' : `\n${failures} check(s) failed.`);
process.exit(failures === 0 ? 0 : 1);
