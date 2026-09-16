// Browser QA for followed topics, the topics-first dashboard and the theme-picker hover fix.
// Prints one PASS/FAIL line per check and exits non-zero on any failure. Screenshots go to ./output.
import {chromium} from 'playwright';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const BASE = process.env.QA_BASE_URL || 'http://localhost:3000';
const OUT = path.resolve(__dirname, 'output');
fs.mkdirSync(OUT, {recursive: true});

const results = [];
const check = (name, ok, detail = '') => {
    results.push({name, ok, detail});
    console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? '  — ' + detail : ''}`);
};
const note = (name, detail) => console.log(`NOTE  ${name} — ${detail}`);

// Toasts render top-center, directly over the header nav — including the search trigger.
// Sonner also pauses its dismiss timer while the pointer is over a toast, and the theme
// hover sweep leaves the mouse parked mid-page, so after a navigation it can sit on the
// toast and hold it open forever. Park the pointer out of the way, then wait it out.
const settleToasts = async (page) => {
    await page.mouse.move(5, 700);
    await page.locator('[data-sonner-toast]').first().waitFor({state: 'detached', timeout: 10000}).catch(() => {});
};

(async () => {
    const browser = await chromium.launch({channel: 'chrome', headless: true});
    const context = await browser.newContext({viewport: {width: 1440, height: 900}});
    const page = await context.newPage();
    const consoleErrors = [];
    page.on('console', (m) => { if (m.type() === 'error') consoleErrors.push(m.text()); });
    // Keep the stack: TradingView's embed script throws on unmount and is filtered out by name below.
    page.on('pageerror', (e) => consoleErrors.push(`pageerror: ${e.message} @ ${(e.stack || '').split('\n').slice(1, 3).join(' <- ').trim()}`));
    const shot = async (name) => { await page.waitForTimeout(600); await page.screenshot({path: `${OUT}/${name}.png`, fullPage: true}); };
    const widgetOrder = () => page.$$eval('[data-widget-id]', (els) => els.map((e) => e.getAttribute('data-widget-id')));

    // --- sign up: lands on /topics ---
    await page.goto(`${BASE}/sign-up`, {waitUntil: 'load'});
    await page.fill('#fullName', 'QA Tester');
    await page.fill('#email', `qa${Date.now()}@example.com`);
    await page.fill('#password', 'Passw0rd!Passw0rd!');
    await page.click('button[type=submit]');
    await page.waitForURL(/\/topics/, {timeout: 90000}).catch(async (e) => { await shot('00-sign-up-failed'); throw e; });
    await page.waitForTimeout(1200);
    check('sign-up lands on /topics', page.url().endsWith('/topics'), page.url());

    // --- empty state -> follow a starter (a pressed chip is renamed "✓ AI chips", hence the regex) ---
    const starter = page.getByRole('button', {name: /AI chips$/});
    check('empty state shows starter chips', await starter.count() === 1 && await page.getByRole('button', {name: 'Write my own'}).count() === 1);
    await shot('01-topics-empty');
    await starter.click();
    check('starter chip toggles aria-pressed', (await starter.getAttribute('aria-pressed')) === 'true');
    await page.getByRole('button', {name: /^Follow 1 selected/}).click();
    await page.waitForSelector('nav[aria-label="Your topics"]', {timeout: 60000});
    await page.waitForTimeout(800);
    check('after follow: rail appears', true, page.url());

    // --- single topic page (first visit triggers the bounded live fetch) ---
    await page.goto(`${BASE}/topics/ai-chips`, {waitUntil: 'load'});
    await page.waitForTimeout(1500);
    const headings = (await page.locator('h1, h2').allInnerTexts()).map((t) => t.trim());
    check('topic page heading', headings.some((t) => /AI chips/i.test(t)), headings.join(' | '));
    check('keyword chips rendered', await page.locator('[role="group"][aria-label*="eyword" i] span').count() > 0);
    check('Refresh now present', await page.getByRole('button', {name: /Refresh now|Refreshing/}).count() === 1);
    note('article cards on first visit (needs Google News reachability)', String(await page.locator('.news-item').count()));
    await shot('02-topic-ai-chips');

    // --- sidebar card + nav order ---
    const sideCard = (await page.locator('aside a[href="/topics"]').first().innerText()).replace(/\n/g, ' ');
    check('sidebar topics card shows 1 topic followed', /1\s*topic\s*followed/i.test(sideCard), sideCard);
    const sideNav = await page.$$eval('aside nav a', (as) => as.map((a) => a.textContent.trim()));
    check('sidebar nav starts Topics · Dashboard · Brain', sideNav.join(',').startsWith('interestsTopics,space_dashboardDashboard,neurologyBrain'), sideNav.join(','));
    // The sidebar is the surface that owns the account pages; all ten come from lib/navigation.ts.
    check('sidebar nav lists all ten routes', sideNav.length === 10, String(sideNav.length));
    const headerHrefs = await page.$$eval('header nav ul li a', (as) => as.map((a) => a.getAttribute('href')));
    check('header nav order', headerHrefs.join(',') === '/topics,/,/brain,/portfolio,/trade,/markets', headerHrefs.join(','));
    // Search is a palette trigger, not a route — it used to be a fake '/search' NAV_ITEMS entry.
    check('header search is a real button with a ⌘K hint',
        await page.locator('header button.search-text kbd').count() === 1);
    check('no /search route link anywhere', await page.locator('a[href="/search"]').count() === 0);

    // --- dashboard: topics-first default + widgets ---
    await page.goto(`${BASE}/`, {waitUntil: 'load'});
    await page.waitForTimeout(2500);
    const order = await widgetOrder();
    check('default layout is topics-first', order.join(',') === 'topics-overview,portfolio-snapshot,watchlist-movers,topics-latest,friends-rank,news-brain-tile,tv-heatmap,tv-top-stories', order.join(','));
    check('topics-overview lists the topic', /AI chips/i.test(await page.locator('[data-widget-id="topics-overview"]').innerText()));
    await shot('03-dashboard');

    // --- widget library: Topics group first, New badge ---
    await page.goto(`${BASE}/?customize=1`, {waitUntil: 'load'});
    await page.waitForTimeout(1500);
    const addBtn = page.getByRole('button', {name: /Add widget/i}).first();
    if (await addBtn.count()) {
        await addBtn.click();
        await page.waitForTimeout(800);
        const dialog = await page.locator('[role="dialog"]').innerText();
        check('library: Topics group first with New badge', /TOPICS[\s\S]*Today's briefs[\s\S]*NEW/i.test(dialog));
        await page.keyboard.press('Escape');
    } else {
        note('widget library', 'no Add widget button found in customize mode');
    }

    // --- settings: Topics section first, topics email toggle persists ---
    await page.goto(`${BASE}/settings`, {waitUntil: 'load'});
    await page.waitForTimeout(1000);
    const sections = await page.$$eval('nav[aria-label="Settings sections"] a', (as) => as.map((a) => a.textContent.trim()));
    check('settings sections start with Topics', sections[0]?.endsWith('Topics') === true, sections.join(','));
    check('settings topics section lists the topic', /AI chips/.test(await page.locator('#topics').innerText()));
    const toggle = page.locator('#topics-digest-toggle');
    check('topics email toggle present + on', (await toggle.getAttribute('data-state')) === 'checked');
    await toggle.click();
    await page.waitForTimeout(1200);
    await page.reload({waitUntil: 'load'});
    await page.waitForTimeout(800);
    check('topics email toggle persists after reload', (await page.locator('#topics-digest-toggle').getAttribute('data-state')) === 'unchecked');
    await shot('04-settings');

    // --- theme hover: sweep across the gutter between two style cards; the committed style must never flash ---
    await page.evaluate(() => {
        window.__styleLog = [document.documentElement.dataset.style];
        new MutationObserver(() => window.__styleLog.push(document.documentElement.dataset.style))
            .observe(document.documentElement, {attributes: true, attributeFilter: ['data-style']});
    });
    const fut = page.getByRole('radio', {name: /^Futuristic/}).first();
    const bru = page.getByRole('radio', {name: /^Brutalist/}).first();
    if (await fut.count() && await bru.count()) {
        await fut.scrollIntoViewIfNeeded();
        await page.waitForTimeout(400);
        const a = await fut.boundingBox();
        const b = await bru.boundingBox();
        await page.mouse.move(a.x + a.width / 2, a.y + a.height / 2);
        await page.waitForTimeout(250);
        const sameRow = Math.abs(a.y - b.y) < 8;
        for (let i = 0; i <= 8; i++) {   // crawl through the gutter like a real pointer
            const x = sameRow ? (a.x + a.width - 2) + (((b.x + 2) - (a.x + a.width - 2)) * i) / 8 : a.x + a.width / 2;
            const y = sameRow ? a.y + a.height / 2 : (a.y + a.height - 2) + (((b.y + 2) - (a.y + a.height - 2)) * i) / 8;
            await page.mouse.move(x, y);
            await page.waitForTimeout(25);
        }
        await page.mouse.move(b.x + b.width / 2, b.y + b.height / 2);
        await page.waitForTimeout(250);
        await page.mouse.move(5, 5);
        await page.waitForTimeout(400);
        const log = await page.evaluate(() => window.__styleLog);
        const committed = log[0];
        check('hover sweep: no flash of the committed style between cards', log.length >= 3 && !log.slice(1, -1).includes(committed) && log[log.length - 1] === committed, log.join(' → '));
    } else {
        note('theme hover', 'style radios not found');
    }

    // --- ⌘K: follow a topic from the palette, open an existing one ---
    await page.locator('header .search-text').first().click();
    await page.waitForTimeout(500);
    await page.keyboard.type('climate policy');
    await page.waitForTimeout(900);
    // Palette rows are cmdk items now (role=option in a listbox), not buttons — that is
    // what makes arrow keys and Enter work.
    const followRow = page.getByRole('option', {name: /Follow topic: “climate policy”/});
    check('⌘K shows Follow topic row', await followRow.count() === 1);
    // Drive it from the keyboard, which the old raw <li>/<Link> rows could not do.
    await page.keyboard.press('ArrowDown');
    await page.keyboard.press('Enter');
    await page.waitForURL(/\/topics\/climate-policy/, {timeout: 60000});
    await page.waitForTimeout(1200);
    check('⌘K follow navigates to the new topic', /climate-policy/.test(page.url()), page.url());
    await settleToasts(page);
    await page.locator('header .search-text').first().click();
    await page.waitForTimeout(400);
    await page.keyboard.type('AI chips');
    await page.waitForTimeout(700);
    check('⌘K shows Open topic for an existing topic', await page.getByText(/Open topic: AI chips/).count() === 1);
    await page.keyboard.press('Escape');

    // --- edit keywords via the header menu ---
    await page.goto(`${BASE}/topics/climate-policy`, {waitUntil: 'load'});
    await page.waitForTimeout(800);
    await page.getByRole('button', {name: 'Topic actions'}).click();
    await page.getByRole('menuitem', {name: 'Edit keywords'}).click();
    await page.waitForTimeout(500);
    const kwInput = page.locator('[role="dialog"] input[placeholder="Add another…"], [role="dialog"] input[placeholder="Add a keyword…"]').first();
    await kwInput.fill('carbon tax');
    await kwInput.press('Enter');
    await page.getByRole('button', {name: 'Save changes'}).click();
    await page.waitForTimeout(1500);
    check('edited keyword appears on the topic page', /carbon tax/i.test(await page.locator('body').innerText()));

    // --- index rail, then delete via the header menu ---
    await page.goto(`${BASE}/topics`, {waitUntil: 'load'});
    await page.waitForTimeout(1000);
    const rail = await page.$$eval('nav[aria-label="Your topics"] a', (as) => as.map((a) => a.textContent.trim()));
    check('rail lists All topics + 2 topics', rail.length === 3, rail.join(' | '));
    await page.goto(`${BASE}/topics/climate-policy`, {waitUntil: 'load'});
    await page.waitForTimeout(800);
    await page.getByRole('button', {name: 'Topic actions'}).click();
    await page.getByRole('menuitem', {name: 'Stop following'}).click();
    await page.getByRole('button', {name: 'Stop following'}).last().click();
    await page.waitForURL(/\/topics$/, {timeout: 30000}).catch(() => {});
    await page.waitForTimeout(1200);
    const rail2 = await page.$$eval('nav[aria-label="Your topics"] a', (as) => as.map((a) => a.textContent.trim()));
    check('after delete: rail has All topics + 1', rail2.length === 2, rail2.join(' | '));
    await page.goto(`${BASE}/topics/climate-policy`, {waitUntil: 'load'});
    await page.waitForTimeout(1000);
    // notFound() streams behind loading.tsx, so the status is 200; the not-found UI is what matters.
    check('deleted topic slug shows the not-found UI', /not found|could not be found|doesn.t exist/i.test(await page.locator('body').innerText()));

    // --- chat launcher copy ---
    await page.goto(`${BASE}/topics`, {waitUntil: 'load'});
    await page.waitForTimeout(800);
    const chatBtn = page.locator('button[aria-label*="chat" i], button[aria-label*="assistant" i], button[aria-label*="advisor" i]').first();
    if (await chatBtn.count()) {
        await chatBtn.click();
        await page.waitForTimeout(700);
        check('chat suggestions mention topics', /What's new in my topics\?/.test(await page.locator('body').innerText()));
    } else {
        note('chat', 'no chat launcher button found by aria-label');
    }

    const relevantErrors = consoleErrors.filter((e) => !/tradingview|_replaceScript|embed-widget|ERR_BLOCKED|favicon|hydrat/i.test(e));
    check('no unexpected console/page errors', relevantErrors.length === 0, relevantErrors.slice(0, 5).join(' || ').slice(0, 600));

    await browser.close();
    const failed = results.filter((r) => !r.ok);
    console.log(`\n${results.length - failed.length}/${results.length} checks passed`);
    process.exit(failed.length ? 1 : 0);
})().catch((e) => {
    console.error('QA crashed:', e);
    process.exit(2);
});
