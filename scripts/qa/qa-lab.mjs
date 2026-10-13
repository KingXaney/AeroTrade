// The owner's lab at /learn (lib/lab): the one page not every account sees. The harness names
// qa-lab-owner@example.com in LAB_OWNER_EMAILS (run.sh), so this suite signs that address up and
// sees the lab; a second user does not, and lands on the games. The old /learn#term addresses
// (⌘K, Today's lesson, the daily email) keep their hash on the way to /glossary for both.
// Then the lab's day: today's unit opened and marked studied (once), its cards due the day
// after (the unit row is dated back a day), one graded, the problem answered on the server,
// the streak counting the day, the library's thirty rows, and a seeded day of papers with its
// digest on the Papers view and on Today.
// Run: npm run qa -- lab   (the harness: README.md)
import {chromium} from 'playwright';
import {MongoClient} from 'mongodb';
import {BASE, MONGO, check, outDir, signUp, summary} from './lib.mjs';

const OUT = outDir('lab');
const OWNER_EMAIL = 'qa-lab-owner@example.com';

const browser = await chromium.launch({channel: 'chrome'});
const page = await browser.newPage({viewport: {width: 1440, height: 900}});
const shot = (n) => page.screenshot({path: `${OUT}${n}.png`, fullPage: true});
const mongo = new MongoClient(MONGO);
const addDays = (date, days) => { const d = new Date(`${date}T12:00:00Z`); d.setUTCDate(d.getUTCDate() + days); return d.toISOString().slice(0, 10); };

try {
    await mongo.connect();
    const db = mongo.db();

    // --- the owner ---------------------------------------------------------------------------
    await signUp(page, 'Lab owner', {email: OWNER_EMAIL});
    const owner = String((await db.collection('user').findOne({email: OWNER_EMAIL}))._id);
    await page.goto(`${BASE}/learn`, {waitUntil: 'load'});
    await page.locator('[data-lab]').waitFor({timeout: 30000});
    check('the owner sees the lab at /learn', await page.getByRole('heading', {name: 'Lab', level: 1}).count() === 1 && /\/learn$/.test(page.url()), page.url());
    const railHrefs = await page.$$eval('aside.rail nav a', (as) => as.map((a) => a.getAttribute('href')));
    check('…with the Learn icon going to the lab', railHrefs.at(-1) === '/learn' && await page.locator('aside.rail nav a[data-rail="learn"][aria-current="page"]').count() === 1, railHrefs.join(','));
    const ownerTabs = await page.$$eval('[data-section-tabs="learn"] a', (as) => as.map((a) => `${a.getAttribute('href')}${a.getAttribute('aria-current') === 'page' ? '*' : ''}`));
    check('…and the Lab tab first, before the games and the glossary', ownerTabs.join(',') === '/learn*,/games,/poker,/poker-night,/glossary', ownerTabs.join(','));

    // --- today: the first unit of the first track, nothing due, a problem, no streak ------------
    const unitId = await page.locator('[data-lab-unit-id]').getAttribute('data-lab-unit-id');
    check('Today opens on the first unit of the computer-vision track, to study', await page.locator('[data-lab-unit="study"]').count() === 1 && unitId === 'cv-vit-dinov2', String(unitId));
    check('…nothing due yet, the day\'s problem posed, its solution not in the page',
        await page.locator('[data-lab-review-due="0"]').count() === 1 && await page.locator('[data-review-done]').count() === 1
        && await page.locator('[data-lab-problem]').count() === 1 && await page.locator('[data-lab-solution]').count() === 0
        && !/1369/.test(await page.locator('#lab-problem').innerText()));
    check('…and no streak', await page.locator('[data-lab-streak="0"]').count() === 1);
    await shot('01-lab-today');

    // --- the unit page, marked studied once ------------------------------------------------------
    await page.locator(`[data-lab-open-unit="${unitId}"]`).click();
    await page.locator(`[data-lab-unit-page="${unitId}"]`).waitFor({timeout: 30000});
    check('the unit opens on its own page with its five sections, sources and maths',
        await page.locator('[data-lab-section]').count() === 5 && await page.locator('#lab-sources a[href^="https://"]').count() >= 3
        && await page.locator('.katex').count() > 5 && await page.locator('#lab-section-code pre code').count() >= 1);
    check('…its glossary terms in one disclosure, or none', await page.locator('[data-what-these-mean]').count() <= 1);
    await page.locator('[data-lab-mark]').click();
    await page.locator('[data-lab-marked]').waitFor({timeout: 15000});
    const unitRows = () => db.collection('labevents').find({userId: owner, kind: 'unit'}).toArray();
    check('"Mark as studied" stamps the unit once', (await unitRows()).length === 1 && (await unitRows())[0].key === unitId);
    await page.locator('[data-lab-mark]').click();
    await page.waitForTimeout(1200);
    check('…and a second click adds no row', (await unitRows()).length === 1);
    check('…the day counts toward the streak', await db.collection('labevents').countDocuments({userId: owner, kind: 'session'}) === 1);
    await shot('02-lab-unit');
    await page.goto(`${BASE}/learn`, {waitUntil: 'load'});
    await page.locator('[data-lab]').waitFor({timeout: 30000});
    check('Today now shows the unit as studied today, and the streak at one',
        await page.locator('[data-lab-unit="studied-today"]').count() === 1 && await page.locator('[data-lab-streak="1"]').count() === 1);

    // --- the day after: its cards are due; one graded, written as a row ----------------------------
    const today = (await unitRows())[0].day;
    const yesterday = addDays(today, -1);
    await db.collection('labevents').updateMany({userId: owner}, {$set: {day: yesterday, lastDay: yesterday}});
    await page.reload({waitUntil: 'load'});
    await page.locator('[data-lab]').waitFor({timeout: 30000});
    const dueText = await page.locator('[data-lab-review-due]').getAttribute('data-lab-review-due');
    check('the unit\'s cards are due the day after it was studied, as new cards', dueText === '7' && await page.locator('[data-review-left="7"]').count() === 1, String(dueText));
    check('…the next unit is the machine-learning track\'s first', await page.locator('[data-lab-unit-id="ml-transformer-internals"]').count() === 1);
    const cardId = await page.locator('[data-review-card]').getAttribute('data-review-card');
    check('a card shows its front only until asked', await page.locator('[data-review-back]').count() === 0 && cardId !== null);
    await page.locator('[data-review-show]').click();
    check('…then its back and four grades', await page.locator('[data-review-back]').count() === 1 && await page.locator('[data-review-grade]').count() === 4);
    await page.locator('[data-review-grade="good"]').click();
    await page.locator('[data-review-left="6"]').waitFor({timeout: 15000});
    const row = await db.collection('labcardstates').findOne({userId: owner, cardId});
    check('"Good" writes the card\'s row: one rep, due tomorrow, ease kept', row?.reps === 1 && row?.dueOn === addDays(today, 1) && row?.ease === 2.5 && row?.lastGrade === 'good', JSON.stringify(row && {reps: row.reps, dueOn: row.dueOn, ease: row.ease}));
    await page.locator('[data-review-show]').click();
    await page.locator('[data-review-grade="again"]').click();
    await page.locator('[data-review-left="5"]').waitFor({timeout: 15000});
    const lapsed = await db.collection('labcardstates').find({userId: owner, lastGrade: 'again'}).toArray();
    check('"Again" counts a lapse and keeps the card due today', lapsed.length === 1 && lapsed[0].lapses === 1 && lapsed[0].dueOn === today && lapsed[0].intervalDays === 0);
    await shot('03-lab-review');

    // --- the problem: answered on the server, then its solution ---------------------------------------
    check('the problem is the studied unit\'s, taking a number', await page.locator('[data-lab-problem="ml-transformer-internals/p1"]').count() === 1 && await page.locator('[data-lab-answer]').count() === 1);
    await page.locator('[data-lab-next-hint]').click();
    check('a hint comes one at a time', await page.locator('[data-lab-hint="1"]').count() === 1 && await page.locator('[data-lab-hint="2"]').count() === 0);
    await page.locator('[data-lab-answer]').fill('42');
    await page.locator('[data-lab-check]').click();
    await page.locator('[data-lab-verdict]').waitFor({timeout: 15000});
    check('a wrong answer is told, and the solution stays out of the page', /Not it/.test(await page.locator('[data-lab-verdict]').innerText()) && await page.locator('[data-lab-solution]').count() === 0);
    await page.locator('[data-lab-answer]').fill('176160768');
    await page.locator('[data-lab-check]').click();
    await page.locator('[data-lab-solution]').waitFor({timeout: 20000});
    const closed = await db.collection('labevents').findOne({userId: owner, kind: 'problem'});
    check('the right answer closes the problem as solved and shows the worked solution',
        closed?.key === 'ml-transformer-internals/p1' && closed?.how === 'solved' && /Answered on/.test(await page.locator('[data-lab-solution]').innerText()));
    check('…and today counts again', await db.collection('labevents').countDocuments({userId: owner, kind: 'session', key: today}) === 1);

    // --- the library ---------------------------------------------------------------------------------
    await page.goto(`${BASE}/learn?view=library`, {waitUntil: 'load'});
    await page.locator('#lab-library').waitFor({timeout: 30000});
    check('the library lists the thirty syllabus rows, the written ones as links', await page.locator('[data-lab-row]').count() === 30
        && await page.locator('[data-lab-written="true"] a').count() >= 9 && await page.locator('[data-lab-written="false"]').count() <= 21);
    check('…with the studied unit marked', await page.locator(`[data-lab-row="${unitId}"] [data-badge]`).count() === 1);
    await shot('04-lab-library');

    // --- the papers: a seeded day, its digest citing by number, the links built from the ids ----------
    const labDay = {
        day: today,
        papers: [
            {id: '2610.00001', title: 'Patch tokens as geometry', abstract: 'Frozen patch tokens carry depth and correspondence.', authors: ['Ada', 'Bo', 'Cy', 'Di'], categories: ['cs.CV'], primary: 'cs.CV', track: 'cv', published: `${today}T00:00:00Z`, source: 'both', upvotes: 12},
            {id: '2610.00002', title: 'A routing paper', abstract: 'Experts and their balance.', authors: ['Eve'], categories: ['cs.LG'], primary: 'cs.LG', track: 'ml', published: `${today}T00:00:00Z`, source: 'arxiv', upvotes: null},
            {id: '2610.00003', title: 'Factor decay measured', abstract: 'Published factors fade.', authors: ['Fay', 'Gus'], categories: ['q-fin.PM'], primary: 'q-fin.PM', track: 'quant', published: `${today}T00:00:00Z`, source: 'arxiv', upvotes: null},
        ],
        counts: {listed: 3, hf: 1, novel: 3, kept: 3},
        digest: {headline: 'Three papers on representation and decay', bullets: [{text: 'Patch tokens carry geometry.', papers: [0]}, {text: 'Routing and factor decay, side by side.', papers: [1, 2]}], model: 'qa', writtenAt: new Date()},
        fetchedAt: new Date(), createdAt: new Date(),
    };
    await db.collection('labdays').insertOne(labDay);
    await page.goto(`${BASE}/learn?view=papers`, {waitUntil: 'load'});
    await page.locator('#lab-papers').waitFor({timeout: 30000});
    const absHrefs = await page.$$eval('[data-paper-abs]', (as) => as.map((a) => `${a.getAttribute('data-paper-abs')}=${a.getAttribute('href')}`));
    check('the Papers view lists the day\'s papers by field, each linked to its arXiv page by id',
        await page.locator('[data-lab-paper]').count() === 3 && absHrefs.join(',') === '2610.00001=https://arxiv.org/abs/2610.00001,2610.00002=https://arxiv.org/abs/2610.00002,2610.00003=https://arxiv.org/abs/2610.00003', absHrefs.join(','));
    check('…the Hugging Face link only where the paper was on its list', await page.locator('[data-paper-hf]').count() === 1 && await page.locator('[data-paper-hf="2610.00001"]').count() === 1);
    check('…the digest as text with "[n]" links to the rows, and not stale today',
        /Patch tokens carry geometry\./.test(await page.locator('[data-lab-digest]').innerText()) && await page.locator('[data-digest-bullet]').count() === 2
        && (await page.locator('[data-digest-ref="2610.00003"]').getAttribute('href')) === '#paper-2610.00003' && await page.locator('[id="paper-2610.00003"]').count() === 1
        && await page.locator('[data-lab-papers-stale]').count() === 0);
    check('…and the digest\'s text holds no link of the model\'s', !/http/.test(await page.locator('[data-lab-digest]').innerText()));
    await shot('05-lab-papers');
    await page.goto(`${BASE}/learn`, {waitUntil: 'load'});
    await page.locator('[data-lab]').waitFor({timeout: 30000});
    check('Today carries the digest with a link to the day\'s papers', await page.locator('#lab-digest').count() === 1 && await page.locator('#lab-digest a[href="/learn?view=papers"]').count() === 1
        && (await page.locator('#lab-digest [data-digest-ref="2610.00001"]').getAttribute('href')) === '/learn?view=papers#paper-2610.00001');
    await db.collection('labdays').updateOne({day: today}, {$set: {day: yesterday}});
    await page.goto(`${BASE}/learn?view=papers`, {waitUntil: 'load'});
    await page.locator('#lab-papers').waitFor({timeout: 30000});
    check('a day before today shows as the latest read, marked stale', await page.locator(`[data-lab-papers-stale="${yesterday}"]`).count() === 1 && await page.locator('[data-lab-paper]').count() === 3);
    await db.collection('labdays').deleteMany({});
    await page.goto(`${BASE}/learn?view=papers`, {waitUntil: 'load'});
    await page.locator('#lab-papers').waitFor({timeout: 30000});
    check('with no day read yet the view says so and Today shows no papers box', await page.locator('#lab-papers-none').count() === 1);

    // --- everyone else -------------------------------------------------------------------------------
    await page.goto(`${BASE}/learn#max-drawdown`, {waitUntil: 'load'});
    await page.waitForURL(/\/glossary#max-drawdown$/, {timeout: 15000}).catch(() => {});
    await page.locator('#max-drawdown').waitFor({timeout: 15000}).catch(() => {});
    check('an old /learn#term address lands on the glossary entry for the owner too', /\/glossary#max-drawdown$/.test(page.url()) && await page.locator('#max-drawdown').isVisible(), page.url());
    const other = await browser.newContext({viewport: {width: 1440, height: 900}});
    const pageB = await other.newPage();
    await signUp(pageB, 'Lab other');
    await pageB.goto(`${BASE}/learn`, {waitUntil: 'load'});
    await pageB.waitForURL(/\/games$/, {timeout: 15000}).catch(() => {});
    check('any other account\'s /learn goes to the games', /\/games$/.test(pageB.url()), pageB.url());
    const otherTabs = await pageB.$$eval('[data-section-tabs="learn"] a', (as) => as.map((a) => `${a.getAttribute('href')}${a.getAttribute('aria-current') === 'page' ? '*' : ''}`));
    check('…whose Learn section has no Lab tab', otherTabs.join(',') === '/games*,/poker,/poker-night,/glossary', otherTabs.join(','));
    await pageB.goto(`${BASE}/learn/units/${unitId}`, {waitUntil: 'load'});
    await pageB.waitForURL(/\/games$/, {timeout: 15000}).catch(() => {});
    check('…nor a way into a unit page', /\/games$/.test(pageB.url()), pageB.url());
    await pageB.goto(`${BASE}/learn#fomc`, {waitUntil: 'load'});
    await pageB.waitForURL(/\/glossary#fomc$/, {timeout: 15000}).catch(() => {});
    await pageB.locator('#fomc').waitFor({timeout: 15000}).catch(() => {});
    check('…while an old /learn#term address still lands on the glossary entry', /\/glossary#fomc$/.test(pageB.url()) && await pageB.locator('#fomc').isVisible(), pageB.url());
    await pageB.keyboard.press('Meta+k');
    const paletteB = pageB.locator('input[placeholder*="term to learn"]');
    await paletteB.waitFor({timeout: 15000});
    await paletteB.fill('learn');
    check('⌘K offers another account the games under the section\'s name, never the lab',
        await pageB.locator('[data-page-hit="/games"]').waitFor({timeout: 10000}).then(() => true, () => false) && await pageB.locator('[data-page-hit="/learn"]').count() === 0);
    await other.close();
} finally {
    await browser.close();
    await mongo.close();
}

summary('lab');
