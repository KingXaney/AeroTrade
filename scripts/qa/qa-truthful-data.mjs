// PR 4 (Truthful data): a missing quote is labelled, never faked as a flat P&L; a new
// user's starter batch lands on articles; /topics fetches at most once per view and
// stops; the refresh button tells the truth about the queue and the cooldown.
// Run against the harness in README.md (in-memory Mongo on :27117 + `npm run dev`,
// no Finnhub key — so every position is unpriced). With no Inngest dev server it
// exercises the dead-queue path (honest failure, claim rolled back); with one on :8288
// it exercises the queued path (first-run fill lands every starter, the on-demand job
// runs, the cooldown is kept).
import {chromium} from 'playwright';
import {MongoClient} from 'mongodb';
import {mkdirSync} from 'node:fs';

const BASE = 'http://localhost:3000';
const MONGO = 'mongodb://127.0.0.1:27117/aerotrade';
const OUT = new URL('./output/truthful-data/', import.meta.url).pathname;
mkdirSync(OUT, {recursive: true});

// The six topics seeded for every new account (lib/topics/starters.ts DEFAULT_TOPIC_NAMES).
const DEFAULTS = ['Fed rate decisions', 'AI chips', 'Big Tech earnings', 'Oil & energy', 'Geopolitics', 'World economy'];
// The per-row placeholder the old code rendered for a quote-less position.
const FAKE_FLAT = /\+\$0\.00 \(0\.00%\)/;

let failures = 0;
const check = (name, ok, detail = '') => {
    if (!ok) failures++;
    console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? `  — ${detail}` : ''}`);
};

const browser = await chromium.launch({channel: 'chrome'});
const page = await browser.newPage({viewport: {width: 1440, height: 900}});
const shot = (n) => page.screenshot({path: `${OUT}${n}.png`, fullPage: true});
// sonner pauses dismissal while the pointer hovers a toast; park the mouse elsewhere.
const settleToasts = async () => { await page.mouse.move(5, 700); await page.waitForTimeout(600); };
const mongo = new MongoClient(MONGO);
const inngestUp = await fetch('http://localhost:8288/').then(() => true).catch(() => false);
console.log(inngestUp ? 'Inngest dev server on :8288 — exercising the queued path' : 'No Inngest dev server — exercising the dead-queue path');

// Poll a predicate with Playwright's clock (no bash sleeps).
const until = async (fn, ms) => { const end = Date.now() + ms; let v = await fn(); while (!v && Date.now() < end) { await page.waitForTimeout(1000); v = await fn(); } return v; };

try {
    await mongo.connect();
    const db = mongo.db('aerotrade');
    const topics = db.collection('topics');

    const email = `qatruth${Date.now()}@example.com`;
    await page.goto(`${BASE}/sign-up`, {waitUntil: 'load'});
    await page.fill('#fullName', 'QA Truth');
    await page.fill('#email', email);
    await page.fill('#password', 'Passw0rd!Passw0rd!');
    await page.click('button[type="submit"]');
    // Sign-up lands on the dashboard now: topics are seeded, so there is nothing to set up.
    await page.waitForURL(new RegExp(`^${BASE}/(\\?.*)?$`), {timeout: 90000});

    // --- the defaults are installed, and no setup screen was shown -------------------
    // Earlier harness runs leave other users' topics behind; ours is the newest.
    const userId = (await topics.find({slug: 'fed-rate-decisions'}).sort({createdAt: -1}).limit(1).next())?.userId;
    check('sign-up lands on the dashboard, not a setup screen', new RegExp(`^${BASE}/(\\?.*)?$`).test(page.url()), page.url());
    check(`all ${DEFAULTS.length} default topics were seeded`, await topics.countDocuments({userId}) === DEFAULTS.length,
        String(await topics.countDocuments({userId})));
    const seededNames = (await topics.find({userId}).toArray()).map((t) => t.name).sort();
    check('the seeded set is finance-led with world news in it', seededNames.join('|') === [...DEFAULTS].sort().join('|'), seededNames.join('|'));

    await page.goto(`${BASE}/topics`, {waitUntil: 'load'});
    await page.waitForSelector('nav[aria-label="Your topics"]', {timeout: 60000});
    check('/topics shows the feed, never the picker', await page.getByRole('button', {name: 'Write my own'}).count() === 0);
    check('the preinstalled notice is shown while the set is untouched',
        /came preinstalled/i.test(await page.locator('main').innerText()));

    const stamped = async () => topics.countDocuments({userId, lastFetchedAt: {$ne: null}});
    if (inngestUp) {
        // ONE first-run event fills every default a second apart. Under per-topic events
        // the on-demand job's rateLimit would drop the tail of the batch.
        const all = await until(async () => (await stamped()) === DEFAULTS.length, 60000);
        check('the first-run job fetched every default, none dropped', all, `${await stamped()}/${DEFAULTS.length} stamped`);
    }
    await shot('01-first-topic');

    // --- the marker: deleting them all must stick ------------------------------------
    const seeded = await topics.find({userId}).toArray();
    await topics.deleteMany({userId});
    await page.goto(`${BASE}/topics`, {waitUntil: 'load'});
    await page.getByRole('button', {name: 'Write my own'}).waitFor({timeout: 30000});
    check('unfollowing everything is not undone on the next view', await topics.countDocuments({userId}) === 0);
    check('the empty state offers the defaults back',
        await page.getByRole('button', {name: 'Restore the default topics'}).count() === 1);
    await topics.insertMany(seeded);

    // --- /topics safety net: at most one fetch per view, and it stops -----------------
    const hashes = (await topics.find({userId}).toArray()).map((t) => t.keywordSetHash);
    // Reset to "followed, never fetched" so the net has something to do regardless of
    // whether a job runner filled the topics above.
    await topics.updateMany({userId}, {$unset: {lastFetchedAt: 1}});
    await db.collection('topicarticles').deleteMany({keywordSetHash: {$in: hashes}});
    const before = await stamped();
    await page.goto(`${BASE}/topics`, {waitUntil: 'load'});
    await page.waitForSelector('nav[aria-label="Your topics"]', {timeout: 60000});
    const afterOne = await stamped();
    check('an empty merged feed fetches for exactly one more topic', afterOne - before === 1, `${before} -> ${afterOne}`);
    check('…the oldest never-fetched one', (await topics.findOne({userId, slug: 'fed-rate-decisions'}))?.lastFetchedAt != null);
    await page.goto(`${BASE}/topics`, {waitUntil: 'load'});
    await page.waitForSelector('nav[aria-label="Your topics"]', {timeout: 60000});
    check('a reload fetches at most one more', (await stamped()) - afterOne <= 1);

    // Everything stamped + no articles: the net must not fire again, and the merged
    // empty state must offer real actions.
    await topics.updateMany({userId}, {$set: {lastFetchedAt: new Date()}});
    await db.collection('topicarticles').deleteMany({keywordSetHash: {$in: hashes}});
    // Millisecond resolution: String(Date) drops ms and could hide a same-second re-fetch.
    const stampsBefore = (await topics.find({userId}).toArray()).map((t) => t.lastFetchedAt?.getTime()).join('|');
    await page.goto(`${BASE}/topics`, {waitUntil: 'load'});
    await page.getByText('No articles yet').waitFor({timeout: 30000});
    await page.goto(`${BASE}/topics`, {waitUntil: 'load'});
    await page.getByText('No articles yet').waitFor({timeout: 30000});
    const stampsAfter = (await topics.find({userId}).toArray()).map((t) => t.lastFetchedAt?.getTime()).join('|');
    check('once every topic is stamped, /topics stops fetching', stampsBefore === stampsAfter);
    check('merged empty state offers Refresh now', await page.getByRole('button', {name: 'Refresh now'}).count() === 1);
    check('merged empty state offers Follow a topic', await page.getByRole('button', {name: 'Follow a topic'}).count() === 1);
    check('it says which topic the refresh targets',
        /Refreshes “Fed rate decisions”/.test(await page.locator('main').innerText()));
    await shot('02-merged-empty');

    // --- refresh honesty: what the button says must match what the queue did ---------
    const clickedAt = new Date();
    await page.getByRole('button', {name: 'Refresh now'}).click();
    if (inngestUp) {
        await page.getByText(/Refresh queued/).waitFor({timeout: 30000});
        check('a live queue reports Refresh queued', true);
        const fed = await topics.findOne({userId, slug: 'fed-rate-decisions'});
        check('the 10-minute claim is kept', fed?.refreshRequestedAt instanceof Date && fed.refreshRequestedAt >= clickedAt);
        const cooling = page.getByRole('button', {name: /Refresh in (10|9) min/});
        await cooling.first().waitFor({timeout: 15000});
        check('the button counts down after a queued refresh', await cooling.first().isDisabled());
        const ran = await until(async () => db.collection('jobruns').findOne({jobId: 'refresh-topic-on-demand', lastRunAt: {$gte: clickedAt}}), 60000);
        check('the on-demand job ran for the queued event', !!ran, ran?.lastMessage);
        await settleToasts();
        await shot('03-refresh-queued');
    } else {
        await page.getByText(/Could not queue the refresh/).waitFor({timeout: 30000});
        check('a dead queue is reported as a failure, not "Refresh queued"', true);
        const fed = await topics.findOne({userId, slug: 'fed-rate-decisions'});
        check('the 10-minute claim was rolled back', fed?.refreshRequestedAt === undefined, String(fed?.refreshRequestedAt));
        await settleToasts();
        check('the button is still usable', !(await page.getByRole('button', {name: 'Refresh now'}).isDisabled()));
        await shot('03-refresh-failed');
    }

    // --- cooldown truth: the button mirrors the server's claim ------------------------
    await topics.updateOne({userId, slug: 'ai-chips'}, {$set: {refreshRequestedAt: new Date()}});
    await page.goto(`${BASE}/topics/ai-chips`, {waitUntil: 'load'});
    // Header + empty-state both render the button; both must agree.
    const cooling = page.getByRole('button', {name: /Refresh in 10 min/});
    await cooling.first().waitFor({timeout: 15000});
    check('a fresh claim shows a 10-minute countdown, disabled, on every refresh button',
        await cooling.count() === 2 && await cooling.first().isDisabled() && await cooling.nth(1).isDisabled());
    await topics.updateOne({userId, slug: 'ai-chips'}, {$set: {refreshRequestedAt: new Date(Date.now() - 11 * 60_000)}});
    await page.goto(`${BASE}/topics/ai-chips`, {waitUntil: 'load'});
    await page.waitForTimeout(1500);
    check('an expired claim shows Refresh now, enabled', !(await page.getByRole('button', {name: 'Refresh now'}).first().isDisabled()));
    check('a single topic\'s empty state offers Edit keywords', await page.getByRole('button', {name: 'Edit keywords'}).count() === 1);
    await shot('04-cooldown');

    // --- stale prices: no Finnhub key, so every holding is unpriced -------------------
    const accounts = db.collection('paperaccounts');
    const account = await accounts.findOne({userId});
    check('a paper account exists for the user', !!account);
    await accounts.updateOne({_id: account._id}, {$set: {
        cash: 97_000,
        positions: [
            {symbol: 'AAPL', company: 'Apple Inc', quantity: 10, avgCost: 150},
            {symbol: 'MSFT', company: 'Microsoft', quantity: 5, avgCost: 300},
        ],
    }});

    await page.goto(`${BASE}/portfolio`, {waitUntil: 'load'});
    await page.getByText('Holdings', {exact: true}).waitFor({timeout: 30000});
    const portfolioText = await page.locator('main').innerText();
    check('portfolio never shows a fake flat P&L', !FAKE_FLAT.test(portfolioText));
    check('holdings are still valued at cost (history untouched)', /\$1,500\.00/.test(portfolioText));
    const notes = await page.getByText('All 2 holdings are unpriced — valued at cost, P&L withheld').count();
    check('summary and holdings both carry the unpriced note', notes >= 2, `${notes} notes`);
    check('the P&L cell reads —', await page.locator('[title="No live quote — value shown at cost"]').count() === 2);
    await shot('05-portfolio-unpriced');

    await page.goto(`${BASE}/trade`, {waitUntil: 'domcontentloaded'});
    await page.getByText('AAPL', {exact: false}).first().waitFor({timeout: 30000});
    const tradeText = await page.locator('main').innerText();
    check('trade desk chips read — for both unpriced positions',
        await page.locator('[title="No live quote — value shown at cost"]').count() === 2);
    check('trade desk strip carries the note', /unpriced — valued at cost/.test(tradeText));

    const sidebar = await page.locator('aside a[href="/portfolio"]').first().innerText();
    const flat = sidebar.replace(/\s+/g, ' ');
    check('sidebar top holdings read — instead of +0.00%', /AAPL ×10 —/.test(flat) && /MSFT ×5 —/.test(flat), flat.slice(0, 140));
    check('sidebar headline return admits the unpriced holdings', /· 2 unpriced/.test(flat));

    await page.goto(`${BASE}/`, {waitUntil: 'load'});
    await page.locator('[data-widget-id="portfolio-snapshot"]').waitFor({timeout: 30000});
    check('dashboard snapshot widget admits the holdings are unpriced',
        /unpriced/.test(await page.locator('[data-widget-id="portfolio-snapshot"]').innerText()));
    await shot('06-dashboard-unpriced');
} catch (err) {
    failures++;
    console.log(`FAIL  threw: ${err.message}`);
    await shot('99-error').catch(() => {});
} finally {
    await mongo.close().catch(() => {});
    await browser.close();
}

console.log(failures === 0 ? '\nAll truthful-data checks passed.' : `\n${failures} check(s) failed.`);
process.exit(failures === 0 ? 0 : 1);
