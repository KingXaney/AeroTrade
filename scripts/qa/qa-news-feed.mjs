// The personal news feed (lib/news, /news): default = Google News top stories, every control persists
// through a real save + reload, the surfaces that show it follow it, and reset returns to absence.
// Run: npm run qa -- news-feed   (the harness: README.md)
// Headline counts depend on Google News being reachable, so they are NOTEs, not FAILs;
// everything about the preference itself is deterministic.
import {chromium} from 'playwright';
import {MongoClient} from 'mongodb';
import {BASE, MONGO, check, note, outDir, signUp, summary} from './lib.mjs';

const OUT = outDir('news-feed');

const browser = await chromium.launch({channel: 'chrome'});
const page = await browser.newPage({viewport: {width: 1440, height: 900}});
const shot = (n) => page.screenshot({path: `${OUT}${n}.png`, fullPage: true});
// sonner pauses dismissal while the pointer hovers a toast: park the mouse, then wait it
// out, so the next wait for a toast cannot resolve against the previous one.
const settleToasts = async () => {
    await page.mouse.move(5, 700);
    await page.locator('[data-sonner-toast]').first().waitFor({state: 'detached', timeout: 10000}).catch(() => {});
};
const mongo = new MongoClient(MONGO);

try {
    await mongo.connect();
    const db = mongo.db();
    // Topic articles are shared by keywordSetHash, so a previous run's seeded story is
    // still in the feed — and because topics lead the rotation it would be the first
    // outlet the hidden-outlet section below picks, hiding the very source we seed.
    const QA_TOPIC_SOURCE = 'QA Topic Wire';
    await db.collection('topicarticles').deleteMany({source: {$in: [QA_TOPIC_SOURCE, 'QA Wire']}});
    const email = await signUp(page, 'News');
    const userDoc = await db.collection('user').findOne({email});
    const userId = String(userDoc?._id ?? userDoc?.id ?? '');
    check('signed up', userId.length > 0);
    const prefsDoc = () => db.collection('userpreferences').findOne({userId});

    // --- navigation carries the new page ------------------------------------------------
    check('the rail carries News', await page.locator('aside.rail nav a[data-rail="news"][href="/news"]').count() === 1);

    // --- default: top stories, nothing stored -------------------------------------------
    await page.goto(`${BASE}/news`, {waitUntil: 'load'});
    // The page streams past its loading boundary after `load` — same as /history below.
    await page.getByRole('heading', {name: 'News', level: 1}).waitFor({timeout: 30000});
    check('/news renders its heading', await page.getByRole('heading', {name: 'News', level: 1}).count() === 1);
    check('default summary is top stories for the US', (await page.locator('#news-feed-summary').innerText()).trim() === 'Top stories · US');
    const cards = await page.locator('.news-item').count();
    if (cards > 0) check('default feed shows headlines', true, `${cards} cards`);
    else note('default feed showed no headlines (Google News unreachable?)');
    if (cards > 0) {
        const metas = await page.locator('.news-item .news-meta').allTextContents();
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
    const metasAfter = await page.locator('.news-item .news-meta').allTextContents();
    check('the hidden outlet is gone from the feed', metasAfter.every((m) => !m.endsWith(` · ${hidden}`)), `${hidden} · ${metasAfter.length} cards`);
    const stored = (await prefsDoc())?.newsFeed;
    check('preference persisted in Mongo', !!stored
        && stored.categories.join(',') === 'top,world' && stored.regions.join(',') === 'US,GB'
        && stored.excludeSources.length === 1 && stored.keywords.join(',') === 'climate',
        JSON.stringify(stored));

    // --- the other surfaces follow the feed ---------------------------------------------
    // The activity page used to repeat six of the feed's cards under its trades; the news has
    // one page now.
    await page.goto(`${BASE}/history`, {waitUntil: 'load'});
    await page.getByRole('heading', {name: /^trades$/i}).waitFor({timeout: 30000});
    check('the activity page no longer repeats the news feed', await page.locator('.news-item').count() === 0);

    await page.goto(`${BASE}/settings?tab=news`, {waitUntil: 'load'});
    await page.locator('#settings-news-summary').waitFor({timeout: 30000});
    check('settings has a News feed section with the summary',
        /World/.test(await page.locator('#news').innerText()) && await page.locator('#settings-news-summary').count() === 1);
    await shot('03-settings');

    // --- followed topics reach the feed --------------------------------------------------
    // Inserted straight into Mongo so the check does not depend on Google News being
    // reachable: the point under test is the merge, not the fetch.
    const seededTopic = await db.collection('topics').findOne({userId, slug: 'ai-chips'});
    check('the account was seeded with default topics', !!seededTopic, String(seededTopic?.name));
    if (seededTopic) {
        const url = `https://example.com/qa-topic-${Date.now()}`;
        await db.collection('topicarticles').insertOne({
            keywordSetHash: seededTopic.keywordSetHash,
            contentHash: Math.floor(Math.random() * 1e9),
            headline: 'QA topic story about AI chips',
            summary: 'Seeded by the QA harness.',
            url,
            source: QA_TOPIC_SOURCE,
            sourceType: 'web',
            datetime: Math.floor(Date.now() / 1000) - 600,
            publishedDate: new Date().toISOString().slice(0, 10),
            score: 12,
            matchedTerms: ['ai chips'],
            createdAt: new Date(),
        });

        await page.goto(`${BASE}/news`, {waitUntil: 'load'});
        const topicCards = page.locator(':is(.news-item, [data-article-row]) [data-topic]');
        check('a followed topic reaches /news', await topicCards.count() > 0, `${await topicCards.count()} tagged cards`);
        check('the card names the topic that brought it in',
            /AI chips/.test(await page.locator(':is(.news-item, [data-article-row]) [data-topic="ai-chips"]').first().innerText().catch(() => '')));
        const hrefs = await page.$$eval('.news-item, [data-article-row]', (as) => as.map((a) => a.getAttribute('href')));
        check('no article is printed twice', new Set(hrefs).size === hrefs.length, `${hrefs.length} cards, ${new Set(hrefs).size} unique`);
        check('topics do not swamp the feed', hrefs.length === 0 || (await topicCards.count()) < hrefs.length,
            `${await topicCards.count()}/${hrefs.length}`);
        await shot('05-topic-in-feed');

        // Back to settings: the reset section below picks up where this one left off.
        await page.goto(`${BASE}/settings?tab=news`, {waitUntil: 'load'});
        await page.locator('#settings-news-summary').waitFor({timeout: 30000});
    }

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

    // --- the morning briefing: seeded, since the harness has no model key ---------------
    // One global document a day, each point carrying the articles it cites. A point's text is
    // model output, so a tag inside it must print as text.
    const etDate = new Intl.DateTimeFormat('en-CA', {timeZone: 'America/New_York'}).format(new Date());
    const cite = (n, source) => ({headline: `QA cited headline ${n}`, source, url: `https://example.com/qa-briefing/${n}`, datetime: Math.floor(Date.now() / 1000) - n * 60});
    await db.collection('marketbriefings').deleteMany({writtenBy: 'qa'});
    check('before any briefing exists the section is absent, not empty', await (async () => {
        await db.collection('marketbriefings').deleteMany({date: etDate});
        await page.goto(`${BASE}/news`, {waitUntil: 'load'});
        await page.getByRole('heading', {name: 'News', level: 1}).waitFor({timeout: 30000});
        return await page.locator('#news-briefing').count() === 0;
    })());
    await db.collection('marketbriefings').insertOne({
        date: etDate,
        headline: 'QA briefing headline',
        bullets: [
            {text: 'A point with a <b>tag</b> in it.', sources: [cite(1, 'QA Briefing Wire'), cite(2, 'QA Second Wire'), cite(3, 'QA Third Wire')]},
            {text: 'A point from one outlet.', sources: [cite(4, 'QA Second Wire')]},
        ],
        stories: [{title: 'QA story title', summary: 'QA story summary.', eventType: 'earnings', tickers: ['SPY'], sources: [cite(5, 'QA Briefing Wire')]}],
        writtenBy: 'qa',
        generatedAt: new Date(),
        createdAt: new Date(),
    });
    await page.goto(`${BASE}/news`, {waitUntil: 'load'});
    await page.locator('#news-briefing').waitFor({timeout: 30000});
    const briefing = page.locator('#news-briefing');
    check('the briefing leads the page, above every headline card',
        ((await briefing.boundingBox())?.y ?? 9999) < ((await page.locator('.news-item, [data-article-row]').first().boundingBox().catch(() => null))?.y ?? 99999));
    check('…with its headline, its points and the AI caveat dated today',
        (await briefing.locator('[data-briefing-headline]').innerText()) === 'QA briefing headline'
        && await briefing.locator('[data-briefing-bullet]').count() === 2
        && (await briefing.innerText()).includes(`${etDate} · AI summary · may contain errors`.toUpperCase())
        || (await briefing.innerText()).includes(`${etDate} · AI summary · may contain errors`));
    check('a tag in a point prints as text, never as markup',
        (await briefing.locator('[data-briefing-bullet]').first().innerText()) === 'A point with a <b>tag</b> in it.' && await briefing.locator('b').count() === 0);
    const firstSources = briefing.locator('[data-briefing-sources]').first();
    check('a point names two outlets as links to the cited articles, then counts the rest',
        await firstSources.locator('a[href^="https://example.com/qa-briefing/"]').count() === 2 && /\+1 more/.test(await firstSources.innerText()));
    await briefing.locator('#news-briefing-stories > summary').click();
    check('the stories open in place, with the event badge the glossary defines',
        /QA story title/.test(await briefing.locator('#news-briefing-stories').innerText())
        && await briefing.locator('#news-briefing-stories [data-term="event-earnings"]').count() === 1);
    await shot('06-briefing');

    // The rail's News card carries the same headline as a text node under the dated caveat. The
    // card is portaled and mounted only while open, with no `data-briefing-*` or `#news-briefing`
    // of its own, so the page-scoped checks above never see it. `/i`: the caveat is a MicroLabel,
    // which a style may uppercase.
    await page.locator('aside.rail a[data-rail="news"]').hover();
    const railCard = page.locator('[data-rail-flyout="news"]');
    await railCard.waitFor({timeout: 5000}).catch(() => {});
    const railText = (await railCard.innerText().catch(() => '')).replace(/\n/g, ' ');
    check("the rail's News card carries the briefing headline under the dated AI caveat",
        /QA briefing headline/.test(railText)
        && new RegExp(`${etDate} · AI summary · may contain errors`, 'i').test(railText)
        && await railCard.locator('b').count() === 0, railText);
    await page.mouse.move(700, 500);

    await page.goto(`${BASE}/`, {waitUntil: 'load'});
    await page.locator('#home-briefing').waitFor({timeout: 30000});
    check('Home shows the briefing too, as text',
        /QA briefing headline/.test(await page.locator('#home-briefing').innerText()) && await page.locator('#home-briefing b').count() === 0);

    // A hidden outlet is hidden in the briefing as well: its citations go, and a point that
    // stood only on it goes with them.
    await page.goto(`${BASE}/news?edit=1`, {waitUntil: 'load'});
    await page.getByLabel('Add to Hidden outlets').fill('QA Second Wire');
    await page.getByLabel('Add to Hidden outlets').press('Enter');
    await page.locator('#news-feed-save').click();
    await page.getByText('News feed saved').waitFor({timeout: 30000});
    await settleToasts();
    await page.goto(`${BASE}/news`, {waitUntil: 'load'});
    await page.locator('#news-briefing').waitFor({timeout: 30000});
    check('hiding an outlet removes its citations and the point that stood on it alone',
        await briefing.locator('[data-briefing-bullet]').count() === 1 && !/QA Second Wire/.test(await briefing.innerText()));
    // With every cited outlet hidden the briefing is absent on the page and in the rail's card alike.
    await page.goto(`${BASE}/news?edit=1`, {waitUntil: 'load'});
    for (const outlet of ['QA Briefing Wire', 'QA Third Wire']) {
        await page.getByLabel('Add to Hidden outlets').fill(outlet);
        await page.getByLabel('Add to Hidden outlets').press('Enter');
    }
    await page.locator('#news-feed-save').click();
    await page.getByText('News feed saved').waitFor({timeout: 30000});
    await settleToasts();
    await page.goto(`${BASE}/news`, {waitUntil: 'load'});
    await page.getByRole('heading', {name: 'News', level: 1}).waitFor({timeout: 30000});
    await page.locator('aside.rail a[data-rail="news"]').hover();
    await railCard.waitFor({timeout: 5000}).catch(() => {});
    const railTextHidden = (await railCard.innerText().catch(() => '')).replace(/\n/g, ' ');
    check('with every cited outlet hidden the briefing is absent on the page and in the card',
        await page.locator('#news-briefing').count() === 0 && /Open the news/i.test(railTextHidden) && !/QA briefing headline/.test(railTextHidden), railTextHidden);
    await page.mouse.move(700, 500);
    await db.collection('marketbriefings').deleteMany({writtenBy: 'qa'});
    await db.collection('userpreferences').updateOne({userId}, {$unset: {newsFeed: ''}});
} catch (err) {
    check(`threw: ${err.message}`, false);
    await shot('99-error').catch(() => {});
} finally {
    await mongo.close().catch(() => {});
    await browser.close();
}

summary('news-feed');
