// Followed topics (lib/topics, /topics): six topics preinstalled at sign-up, a topic page's first
// live fetch, the sidebar card, ⌘K following a topic and opening one, a refresh that brings new
// articles, editing keywords and deleting from the header menu. Also the surfaces topics lead: the
// topics-first dashboard and the widget library's Topics group, the settings page's Topics section
// and email toggle, the chat launcher's topic suggestion, the header nav order, and the theme
// picker's hover sweep (the committed style never flashes).
// Run: npm run qa -- topics   (the harness: README.md)
import {chromium} from 'playwright';
import {MongoClient} from 'mongodb';
import {BASE, MONGO, check, note, outDir, signUp, summary} from './lib.mjs';

// Articles this suite seeds straight into Mongo, removed by source before and after the run.
const QA_FEED_SOURCE = 'QA Feed Wire';
const OUT = outDir('topics');

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
    const shot = async (name) => { await page.waitForTimeout(600); await page.screenshot({path: `${OUT}${name}.png`, fullPage: true}); };
    const widgetOrder = () => page.$$eval('[data-widget-id]', (els) => els.map((e) => e.getAttribute('data-widget-id')));
    const mongo = new MongoClient(MONGO);
    await mongo.connect();
    const db = mongo.db();
    // Topic articles are shared by keywordSetHash, so a previous run's seeded rows would
    // still be in this run's climate-policy feed.
    await db.collection('topicarticles').deleteMany({source: QA_FEED_SOURCE});

    // --- sign up: lands on the dashboard with topics already installed ---
    const email = await signUp(page, 'Tester').catch(async (e) => { await shot('00-sign-up-failed'); throw e; });
    await page.waitForTimeout(1200);
    check('sign-up lands in the app, not a setup screen', page.url().endsWith('/dashboard'), page.url());

    // --- the defaults are there, and the picker never appeared ---
    await page.goto(`${BASE}/topics`, {waitUntil: 'load'});
    await page.waitForSelector('nav[aria-label="Your topics"]', {timeout: 60000});
    await page.waitForTimeout(800);
    check('no setup wall: /topics opens on the feed', await page.getByRole('button', {name: 'Write my own'}).count() === 0);
    // The rail leads with an "All topics" link, so key on the per-topic hrefs, not on `a`.
    const railSel = 'nav[aria-label="Your topics"] a[href^="/topics/"]';
    const railNames = await page.$$eval(railSel, (as) => as.map((a) => a.textContent.trim()));
    const railText = railNames.join('|');
    check('six topics preinstalled', railNames.length === 6, `${railNames.length}: ${railText}`);
    check('the set is finance-led', /Fed rate decisions/.test(railText) && /AI chips/.test(railText), railText);
    check('…with major world news in it', /Geopolitics/.test(railText) && /World economy/.test(railText), railText);
    check('the preinstalled notice is shown', /came preinstalled/i.test(await page.locator('main').innerText()));
    await shot('01-topics-preinstalled');

    // Seeding runs once per account, not once per page view.
    await page.goto(`${BASE}/topics`, {waitUntil: 'load'});
    await page.waitForSelector('nav[aria-label="Your topics"]', {timeout: 60000});
    check('seeding is idempotent across reloads',
        (await page.$$eval(railSel, (as) => as.length)) === 6);

    // --- single topic page (first visit triggers the bounded live fetch) ---
    await page.goto(`${BASE}/topics/ai-chips`, {waitUntil: 'load'});
    await page.waitForTimeout(1500);
    const headings = (await page.locator('h1, h2').allInnerTexts()).map((t) => t.trim());
    check('topic page heading', headings.some((t) => /AI chips/i.test(t)), headings.join(' | '));
    check('keyword chips rendered', await page.locator('[role="group"][aria-label*="eyword" i] span').count() > 0);
    check('Refresh now present', await page.getByRole('button', {name: /Refresh now|Refreshing/}).count() === 1);
    note('article cards on first visit (needs Google News reachability)', String(await page.locator('.news-item').count()));
    await shot('02-topic-ai-chips');

    // --- the rail's News card + the section's tabs ---
    await page.locator('aside.rail a[data-rail="news"]').hover();
    const newsCard = page.locator('[data-rail-flyout="news"]');
    await newsCard.waitFor({timeout: 5000}).catch(() => {});
    const sideCard = (await newsCard.innerText().catch(() => '')).replace(/\n/g, ' ');
    check('the rail card over News shows the six followed topics', /6\s*topics\s*followed/i.test(sideCard), sideCard);
    await page.mouse.move(700, 500);
    const railNav = await page.$$eval('aside.rail nav a', (as) => as.map((a) => a.getAttribute('aria-label')?.split(',')[0]));
    // All eight come from lib/shell/navigation.ts; the account pages are in the avatar menu.
    check('the rail runs Home · News · Markets … Learn', railNav.join(',') === 'Home,News,Markets,Trade,Portfolio,Strategies,Brain,Learn', railNav.join(','));
    const tabHrefs = await page.$$eval('[data-section-tabs="news"] a', (as) => as.map((a) => `${a.getAttribute('href')}${a.getAttribute('aria-current') === 'page' ? '*' : ''}`));
    check('a topic page sits under News, on its Topics tab', tabHrefs.join(',') === '/news,/topics*', tabHrefs.join(','));
    // Search is a palette trigger, not a route — it used to be a fake '/search' NAV_ITEMS entry.
    check('header search is a real button with a ⌘K hint',
        await page.locator('header button.search-text kbd').count() === 1);
    check('no /search route link anywhere', await page.locator('a[href="/search"]').count() === 0);

    // --- dashboard: topics-first default + widgets ---
    await page.goto(`${BASE}/dashboard`, {waitUntil: 'load'});
    await page.waitForTimeout(2500);
    const order = await widgetOrder();
    check('default layout is checklist-then-topics', order.join(',') === 'getting-started,topics-overview,portfolio-snapshot,watchlist-movers,topics-latest,friends-rank,news-brain-tile,tv-heatmap,tv-top-stories', order.join(','));
    check('topics-overview lists the topic', /AI chips/i.test(await page.locator('[data-widget-id="topics-overview"]').innerText()));
    await shot('03-dashboard');

    // --- widget library: Topics group first, New badge ---
    await page.goto(`${BASE}/dashboard?customize=1`, {waitUntil: 'load'});
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
    check('settings shows one section at a time', await page.locator('#topics').count() === 1
        && await page.locator('#news, #appearance, #dashboard, #notifications, #account').count() === 0);
    // The address the daily email's footer has always used.
    await page.goto(`${BASE}/settings#notifications`, {waitUntil: 'load'});
    await page.waitForURL(/\/settings\?tab=notifications/, {timeout: 15000}).catch(() => {});
    await page.locator('#topics-digest-toggle').waitFor({timeout: 15000}).catch(() => {});
    check('an old /settings#notifications link opens that section', /\?tab=notifications/.test(page.url()) && await page.locator('#notifications').count() === 1, page.url());
    const toggle = page.locator('#topics-digest-toggle');
    check('topics email toggle present + on', (await toggle.getAttribute('data-state')) === 'checked');
    await toggle.click();
    await page.waitForTimeout(1200);
    await page.reload({waitUntil: 'load'});
    await page.waitForTimeout(800);
    check('topics email toggle persists after reload', (await page.locator('#topics-digest-toggle').getAttribute('data-state')) === 'unchecked');
    await shot('04-settings');
    await page.goto(`${BASE}/settings?tab=appearance`, {waitUntil: 'load'});
    await page.waitForTimeout(800);

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

    // --- a refresh that brings new articles shows them ---
    // TopicFeed copies its first page into state for "Load more"; the page keys it on that
    // page, so a router.refresh() with a newer article must remount it. Seeded straight
    // into Mongo so it does not depend on Google News, and triggered by saving the topic
    // unchanged — same slug, same keyword set — which refreshes the page in place.
    const qaUser = await db.collection('user').findOne({email});
    const climate = await db.collection('topics').findOne({userId: String(qaUser?._id ?? ''), slug: 'climate-policy'});
    check('the palette topic is stored', !!climate);
    const seedArticle = (headline, ageSeconds) => db.collection('topicarticles').insertOne({
        keywordSetHash: climate.keywordSetHash,
        contentHash: Math.floor(Math.random() * 1e9),
        headline,
        summary: 'Seeded by the QA harness.',
        url: `https://example.com/qa-feed-${Date.now()}-${ageSeconds}`,
        source: QA_FEED_SOURCE,
        sourceType: 'web',
        datetime: Math.floor(Date.now() / 1000) - ageSeconds,
        publishedDate: new Date().toISOString().slice(0, 10),
        score: 12,
        matchedTerms: ['climate policy'],
        createdAt: new Date(),
    });
    const OLD_HEADLINE = 'QA feed: the story already on screen';
    const NEW_HEADLINE = 'QA feed: a story that landed after the page loaded';
    const headlineShown = (h) => page.locator('.news-title', {hasText: h}).first()
        .waitFor({state: 'visible', timeout: 15000}).then(() => true, () => false);
    if (climate) {
        await seedArticle(OLD_HEADLINE, 120);
        await page.goto(`${BASE}/topics/climate-policy`, {waitUntil: 'load'});
        check('the seeded article is on the topic page', await headlineShown(OLD_HEADLINE));
        await seedArticle(NEW_HEADLINE, 0);
        await page.getByRole('button', {name: 'Topic actions'}).click();
        await page.getByRole('menuitem', {name: 'Edit keywords'}).click();
        await page.getByRole('button', {name: 'Save changes'}).click();
        check('a refresh with a newer article shows it, not the page the feed first got', await headlineShown(NEW_HEADLINE));
        await settleToasts(page);
    }

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
    // The seeded rows belong to the old keyword set. Whether or not Google answered for the
    // new one, none of them may stay on screen above "Load more" pages from the new set.
    const oldSet = page.locator('.news-title', {hasText: /^QA feed: /});
    await oldSet.first().waitFor({state: 'detached', timeout: 20000}).catch(() => {});
    const oldSetShown = await oldSet.count();
    check('after a keyword edit, no article from the old set stays on screen', oldSetShown === 0, `${oldSetShown} left`);

    // --- index rail, then delete via the header menu ---
    await page.goto(`${BASE}/topics`, {waitUntil: 'load'});
    await page.waitForTimeout(1000);
    // Counted relative to the seeded defaults: the absolute number is a property of the
    // default set, which is asserted once above and free to change.
    const rail = await page.$$eval(railSel, (as) => as.map((a) => a.textContent.trim()));
    check('rail lists the defaults plus the topic just followed', rail.length === 7, rail.join(' | '));
    check('…including the one made from the palette', rail.some((t) => /climate policy/i.test(t)), rail.join(' | '));
    check('the preinstalled notice is gone once the set is no longer ours',
        !/came preinstalled/i.test(await page.locator('main').innerText()));
    await page.goto(`${BASE}/topics/climate-policy`, {waitUntil: 'load'});
    await page.waitForTimeout(800);
    await page.getByRole('button', {name: 'Topic actions'}).click();
    await page.getByRole('menuitem', {name: 'Stop following'}).click();
    await page.getByRole('button', {name: 'Stop following'}).last().click();
    await page.waitForURL(/\/topics$/, {timeout: 30000}).catch(() => {});
    await page.waitForTimeout(1200);
    const rail2 = await page.$$eval(railSel, (as) => as.map((a) => a.textContent.trim()));
    check('after delete: the rail is one shorter', rail2.length === rail.length - 1, rail2.join(' | '));
    // The notice describes the current set, not history: back at exactly the defaults, it
    // is true again and says so. That is the point of deriving it instead of storing a flag.
    check('back at exactly the defaults, the notice is honest again',
        /came preinstalled/i.test(await page.locator('main').innerText()));
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
        check('chat offers no stock tip', !/NVDA|should I/i.test(await page.locator('[role="dialog"][aria-label="AeroTrade assistant"]').innerText()));
    } else {
        note('chat', 'no chat launcher button found by aria-label');
    }

    const relevantErrors = consoleErrors.filter((e) => !/tradingview|_replaceScript|embed-widget|ERR_BLOCKED|favicon|hydrat/i.test(e));
    check('no unexpected console/page errors', relevantErrors.length === 0, relevantErrors.slice(0, 5).join(' || ').slice(0, 600));

    await db.collection('topicarticles').deleteMany({source: QA_FEED_SOURCE});
    await mongo.close();
    await browser.close();
    summary('topics');
})().catch((e) => {
    check(`threw: ${e.message}`, false);
    summary('topics');
});
