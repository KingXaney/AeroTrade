// The owner's lab at /learn (lib/lab): the one page not every account sees. The harness names
// qa-lab-owner@example.com in LAB_OWNER_EMAILS (run.sh), so this suite signs that address up and
// sees the lab; a second user does not, and lands on the games. The old /learn#term addresses
// (⌘K, Today's lesson, the daily email) keep their hash on the way to /glossary for both.
// Then the lab's day: Today's list and the streak hero at zero; today's unit opened, its quiz
// failed on a wrong set and passed on the right one (the gate on "Mark as studied"), then marked
// studied (once), its cards due the day after (the unit row is dated back a day), one graded,
// the problem answered on the server, the streak counting the day, the library's thirty rows, a
// seeded day of papers with its digest on the Papers view and on Today, the digest ticked by hand
// and unticked, the check-in (the date and the greeting, today's focus written and edited, the end
// of the day's note saved and read the next morning as yesterday's, the look back at yesterday),
// the list's groups and the overdue state, the game widgets (the older preference read as a layout,
// then arranged at /learn?arrange=1 — added from the library, sized, moved, removed, saved as
// learn.labLayout — a seeded round ticking the sprint, Codeforces ticked by hand), the account
// menu's "Lab layout" for the owner alone, and a phone width.
// Run: npm run qa -- lab   (the harness: README.md)
import {chromium} from 'playwright';
import {MongoClient} from 'mongodb';
import {createJiti} from 'jiti';
import {BASE, MONGO, REPO_ROOT, check, outDir, signUp, summary} from './lib.mjs';

// The bank, for the quiz's answers (the page never holds them).
const jiti = createJiti(import.meta.url, {alias: {'@': REPO_ROOT.replace(/\/$/, '')}, fsCache: false});

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
    await page.locator('button[aria-label^="Account menu"]').click();
    await page.locator('[data-menu-lab-layout]').waitFor({timeout: 15000}).catch(() => {});
    const menuHref = await page.locator('[data-menu-lab-layout]').getAttribute('href').catch(() => null);
    check('the account menu offers the owner the lab\'s layout', menuHref === '/learn?arrange=1' && /lab layout/i.test(await page.locator('[data-menu-lab-layout]').innerText()), String(menuHref));
    await page.keyboard.press('Escape');

    // --- the check-in: the date, the greeting by name, today's focus written and edited ----------------
    const todayEt = new Intl.DateTimeFormat('en-CA', {timeZone: 'America/New_York'}).format(new Date());
    const dateLabel = new Intl.DateTimeFormat('en-US', {weekday: 'long', month: 'long', day: 'numeric', timeZone: 'UTC'}).format(new Date(`${todayEt}T00:00:00Z`));
    check('the check-in opens on the date and a greeting by first name, the focus to be written, no look back on a first day',
        await page.locator('[data-lab-checkin] [data-lab-date]').innerText() === dateLabel && /good (morning|afternoon|evening), qa\./i.test(await page.locator('#lab-checkin-heading').innerText())
        && await page.locator('[data-focus-form]').count() === 1 && await page.locator('[data-focus-plan]').count() === 0 && await page.locator('[data-lab-yesterday]').count() === 0,
        `${await page.locator('[data-lab-checkin] [data-lab-date]').innerText()} / ${await page.locator('#lab-checkin-heading').innerText()}`);
    await page.locator('[data-focus-input]').fill('Finish the DINOv2 unit');
    await page.locator('[data-focus-save]').click();
    await page.locator('[data-focus-text]').waitFor({timeout: 15000});
    const firstNote = await db.collection('labnotes').findOne({userId: owner});
    check('today\'s focus is saved to the day\'s note and shown as text without a reload', firstNote?.day === todayEt && firstNote?.focus === 'Finish the DINOv2 unit'
        && /Finish the DINOv2 unit/.test(await page.locator('[data-focus-text]').innerText()));
    await page.locator('[data-focus-edit]').click();
    await page.locator('[data-focus-input]').fill('Cards first, then the unit');
    await page.locator('[data-focus-save]').click();
    await page.locator('[data-focus-text]:has-text("Cards first")').waitFor({timeout: 15000});
    check('…and edited in place, one row for the day', (await db.collection('labnotes').findOne({userId: owner}))?.focus === 'Cards first, then the unit' && await db.collection('labnotes').countDocuments({userId: owner}) === 1);

    // --- today: the streak hero at zero, the list, the first unit of the first track, nothing due, a problem ---
    const unitId = await page.locator('[data-lab-unit-id]').getAttribute('data-lab-unit-id');
    check('Today opens on the first unit of the computer-vision track, to study', await page.locator('[data-lab-unit="study"]').count() === 1 && unitId === 'cv-vit-dinov2', String(unitId));
    check('…nothing due yet, the day\'s problem posed, its solution not in the page',
        await page.locator('[data-lab-review-due="0"]').count() === 1 && await page.locator('[data-review-done]').count() === 1
        && await page.locator('[data-lab-problem]').count() === 1 && await page.locator('[data-lab-solution]').count() === 0
        && !/1369/.test(await page.locator('#lab-problem').innerText()));
    check('…and no streak: the hero at zero, naming the first milestone', await page.locator('[data-lab-streak="0"]').count() === 1
        && await page.locator('#lab-streak [data-streak-hero][data-streak-tone="none"]').count() === 1 && /3 days to 3/.test(await page.locator('#lab-streak').innerText()));
    const listStates = async () => page.locator('[data-lab-todo]').evaluateAll((els) => els.map((el) => `${el.getAttribute('data-lab-todo')}:${el.getAttribute('data-todo-state')}`));
    check('Today\'s list: the unit to do, no cards due, the problem to do, the puzzle from the default widget',
        (await listStates()).join(',') === 'unit:todo,review:none,problem:todo,daily-puzzle:todo' && await page.locator('[data-list-progress]').innerText() === '0 of 3 done', (await listStates()).join(','));
    check('…the unit item opens its page and the puzzle item the puzzle', (await page.locator('[data-todo-open="unit"]').getAttribute('href')) === `/learn/units/${unitId}`
        && (await page.locator('[data-todo-open="daily-puzzle"]').getAttribute('href')) === '/games/puzzle');
    check('the default widget is the puzzle card at half width, with Arrange leading to the arranging view', await page.locator('[data-lab-widget="daily-puzzle"] [data-daily-puzzle]').count() === 1
        && await page.locator('[data-lab-widgets="1"] [data-widget-id="daily-puzzle"][data-widget-span="6"]').count() === 1 && (await page.locator('[data-lab-arrange]').getAttribute('href')) === '/learn?arrange=1');
    check('…the list under its group eyebrows, study then play, and the end of the day with nothing done', (await page.locator('[data-todo-group]').evaluateAll((els) => els.map((el) => el.getAttribute('data-todo-group')))).join(',') === 'study,play'
        && await page.locator('[data-lab-reflection] [data-reflection-done="0"]').count() === 1 && Number(await page.locator('[data-reflection-left]').getAttribute('data-reflection-left')) >= 2);
    await shot('01-lab-today');

    // --- the unit page: the quiz gates the mark; a wrong set fails, the right set passes and counts the day ---
    await page.locator(`[data-lab-open-unit="${unitId}"]`).click();
    await page.locator(`[data-lab-unit-page="${unitId}"]`).waitFor({timeout: 30000});
    check('the unit opens on its own page with its five sections, sources and maths',
        await page.locator('[data-lab-section]').count() === 5 && await page.locator('#lab-sources a[href^="https://"]').count() >= 3
        && await page.locator('.katex').count() > 5 && await page.locator('#lab-section-code pre code').count() >= 1);
    check('…its glossary terms in one disclosure, or none', await page.locator('[data-what-these-mean]').count() <= 1);
    const {unitById} = await jiti.import(`${REPO_ROOT}lib/learn/copy/lab/bank.ts`);
    const quiz = unitById(unitId).quiz;
    check('the quiz is in the page without its answers, and "Mark as studied" waits for it', await page.locator('[data-quiz-question]').count() === quiz.length
        && await page.locator('[data-lab-mark]').isDisabled() && await page.locator('[data-lab-mark-gated]').count() === 1
        && !(await page.content()).includes(quiz[0].why));
    // The result line stays from one attempt to the next, so each attempt waits for its own outcome.
    const answer = async (choices, outcome) => {
        for (const [qi, oi] of choices.entries()) await page.locator(`[data-quiz-option="${qi}:${oi}"]`).check();
        await page.locator('[data-quiz-check]').click();
        return page.locator(`[data-quiz-result="${outcome}"]`).waitFor({timeout: 15000}).then(() => true, () => false);
    };
    const wrongSet = quiz.map((q) => (q.answer + 1) % 4);
    check('a wrong set fails, marks the wrong questions and writes nothing', await answer(wrongSet, 'failed')
        && await page.locator('[data-quiz-wrong]').count() === quiz.length && await db.collection('labevents').countDocuments({userId: owner, kind: 'quiz'}) === 0
        && await page.locator('[data-lab-mark]').isDisabled());
    check('the right set passes, shows why, stamps the quiz once and counts the day', await answer(quiz.map((q) => q.answer), 'passed')
        && await page.locator('[data-quiz-why]').count() === quiz.length
        && (await db.collection('labevents').findOne({userId: owner, kind: 'quiz'}))?.key === unitId
        && await db.collection('labevents').countDocuments({userId: owner, kind: 'session'}) === 1);
    await page.locator('[data-lab-mark]:not([disabled])').waitFor({timeout: 15000});
    await page.locator('[data-lab-mark]').click();
    await page.locator('[data-lab-marked]').waitFor({timeout: 15000});
    const unitRows = () => db.collection('labevents').find({userId: owner, kind: 'unit'}).toArray();
    check('"Mark as studied" stamps the unit once', (await unitRows()).length === 1 && (await unitRows())[0].key === unitId);
    await page.locator('[data-lab-mark]').click();
    await page.waitForTimeout(1200);
    check('…and a second click adds no row', (await unitRows()).length === 1);
    check('…the day counts toward the streak once', await db.collection('labevents').countDocuments({userId: owner, kind: 'session'}) === 1);
    await shot('02-lab-unit');
    await page.goto(`${BASE}/learn`, {waitUntil: 'load'});
    await page.locator('[data-lab]').waitFor({timeout: 30000});
    check('Today now shows the unit as studied today, ticked on the list, and the streak at one',
        await page.locator('[data-lab-unit="studied-today"]').count() === 1 && await page.locator('[data-lab-streak="1"]').count() === 1
        && await page.locator('[data-lab-todo="unit"][data-todo-state="done"]').count() === 1 && await page.locator('[data-list-progress]').innerText() === '1 of 3 done'
        && await page.locator('#lab-streak [data-streak-tone="done"]').count() === 1 && await page.locator('#lab-streak [data-week-pills] li[data-today][data-solved]').count() === 1);

    // --- the day after: its cards are due; one graded, written as a row ----------------------------
    const today = (await unitRows())[0].day;
    const yesterday = addDays(today, -1);
    await db.collection('labevents').updateMany({userId: owner}, {$set: {day: yesterday, lastDay: yesterday}});
    await page.reload({waitUntil: 'load'});
    await page.locator('[data-lab]').waitFor({timeout: 30000});
    const dueText = await page.locator('[data-lab-review-due]').getAttribute('data-lab-review-due');
    check('the unit\'s cards are due the day after it was studied, as new cards', dueText === '7' && await page.locator('[data-review-left="7"]').count() === 1, String(dueText));
    check('…the next unit is the machine-learning track\'s first', await page.locator('[data-lab-unit-id="ml-transformer-internals"]').count() === 1);
    check('the check-in looks back at yesterday: the unit studied counted, the puzzle left', await page.locator('[data-lab-yesterday][data-yesterday-done="1"][data-yesterday-left="1"]').count() === 1
        && /Studied ViT/.test(await page.locator('[data-lab-yesterday]').innerText()) && /The puzzle/.test(await page.locator('[data-lab-yesterday]').innerText()), await page.locator('[data-lab-yesterday]').innerText().catch(() => 'none'));
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
    await db.collection('labcardstates').updateOne({userId: owner, cardId: lapsed[0].cardId}, {$set: {dueOn: yesterday}});
    await page.reload({waitUntil: 'load'});
    await page.locator('[data-lab-list]').waitFor({timeout: 30000});
    check('a card past its day marks the review overdue on the list, said in words', await page.locator('[data-lab-todo="review"][data-todo-state="overdue"]').count() === 1
        && /past its day/.test(await page.locator('[data-lab-todo="review"]').innerText()) && await page.locator('[data-list-done]').count() === 1);
    await db.collection('labcardstates').updateOne({userId: owner, cardId: lapsed[0].cardId}, {$set: {dueOn: today}});
    await page.reload({waitUntil: 'load'});
    await page.locator('[data-lab-list]').waitFor({timeout: 30000});
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
    // Every written unit's page renders: five sections, the python sketch, every formula (KaTeX
    // marks one it could not render), and no interpolation left in the text.
    const unitHrefs = await page.$$eval('[data-lab-written="true"] a[href^="/learn/units/"]', (as) => as.map((a) => a.getAttribute('href')));
    const broken = [];
    for (const href of unitHrefs) {
        await page.goto(`${BASE}${href}`, {waitUntil: 'load'});
        await page.locator('[data-lab-unit-page]').waitFor({timeout: 30000});
        const text = await page.locator('main').innerText().catch(() => page.locator('body').innerText());
        const ok = await page.locator('[data-lab-section]').count() === 5 && await page.locator('#lab-section-code pre code').count() >= 1
            && await page.locator('.katex-error').count() === 0 && await page.locator('.katex').count() > 3
            && await page.locator('#lab-sources a[href^="https://"]').count() >= 3 && !/undefined|\$\{|\[object/.test(text);
        if (!ok) broken.push(href);
    }
    check(`every written unit page renders whole (${unitHrefs.length} pages)`, unitHrefs.length >= 18 && broken.length === 0, broken.join(','));

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

    // --- the list's manual ticks and the game widgets ---------------------------------------------
    check('the digest is an item of the list, ticked by hand', await page.locator('[data-lab-todo="papers"][data-todo-state="todo"] [data-todo-tick="papers"]').count() === 1);
    await page.locator('[data-todo-tick="papers"]').click();
    await page.locator('[data-lab-todo="papers"][data-todo-state="done"]').waitFor({timeout: 15000});
    const tickRow = await db.collection('labevents').findOne({userId: owner, kind: 'todo'});
    check('a tick writes the day\'s row, keyed on the item and the day', tickRow?.key === `papers:${today}` && tickRow?.day === today && await page.locator('[data-todo-tick="papers"][aria-pressed="true"]').count() === 1);
    await page.locator('[data-todo-tick="papers"]').click();
    await page.locator('[data-lab-todo="papers"][data-todo-state="todo"]').waitFor({timeout: 15000});
    check('…and Undo removes it', await db.collection('labevents').countDocuments({userId: owner, kind: 'todo'}) === 0);

    // --- the end of the day: the lines from the list, the note saved, and the morning after ---------
    check('the end of the day lists what is done and what is open, read from the list', Number(await page.locator('[data-reflection-done]').getAttribute('data-reflection-done')) >= 1
        && Number(await page.locator('[data-reflection-left]').getAttribute('data-reflection-left')) >= 1 && /problem/i.test(await page.locator('[data-reflection-done]').innerText()));
    await page.locator('[data-reflection-notes]').fill('Slow start; the review deck went well.');
    await page.locator('[data-reflection-next]').fill('Open with the problem');
    await page.locator('[data-reflection-save]').click();
    await page.getByText('Saved.').first().waitFor({timeout: 15000});
    const dayNote = await db.collection('labnotes').findOne({userId: owner, day: today});
    check('the notes and tomorrow\'s focus are saved to the day\'s note beside the morning\'s', dayNote?.notes === 'Slow start; the review deck went well.' && dayNote?.next === 'Open with the problem' && dayNote?.focus === 'Cards first, then the unit');
    // The morning after: the note is yesterday's, and its line for today is offered until a focus is written.
    await db.collection('labnotes').updateOne({userId: owner, day: today}, {$set: {day: yesterday}, $unset: {focus: 1}});
    await page.reload({waitUntil: 'load'});
    await page.locator('[data-lab-list]').waitFor({timeout: 30000});
    check('the next morning offers yesterday\'s note for today', await page.locator('[data-focus-form]').count() === 1 && /Open with the problem/.test(await page.locator('[data-focus-plan]').innerText()));
    await page.locator('[data-focus-use-plan]').click();
    await page.locator('[data-focus-text]').waitFor({timeout: 15000});
    check('…and one press makes it today\'s focus', (await db.collection('labnotes').findOne({userId: owner, day: today}))?.focus === 'Open with the problem' && /Open with the problem/.test(await page.locator('[data-focus-text]').innerText())
        && await page.locator('[data-focus-plan]').count() === 0);

    // --- the game widgets: the older preference read as a layout, then arranged, saved and drawn ----
    await db.collection('userpreferences').updateOne({userId: owner}, {$set: {'learn.labWidgets': ['kelly', 'daily-puzzle']}, $unset: {'learn.labLayout': 1}}, {upsert: true});
    await page.reload({waitUntil: 'load'});
    await page.locator('[data-lab-list]').waitFor({timeout: 30000});
    const drawnOrder = async () => page.locator('[data-lab-widgets] [data-widget-id]').evaluateAll((els) => els.map((el) => `${el.getAttribute('data-widget-id')}@${el.getAttribute('data-widget-span')}`));
    check('the older labWidgets preference reads as a layout at the default width, in the registry order', (await drawnOrder()).join(',') === 'daily-puzzle@6,kelly@6'
        && await page.locator('[data-lab-todo="kelly"][data-todo-state="todo"]').count() === 1, (await drawnOrder()).join(','));
    await page.goto(`${BASE}/learn?arrange=1`, {waitUntil: 'load'});
    await page.locator('[data-lab-arrange-view]').waitFor({timeout: 30000});
    check('the arranging view shows the two cards in editing shells with their bodies, Save waiting on a change, the Today tab lit',
        await page.locator('[data-lab-arrange-view] [data-widget-id]').count() === 2 && await page.locator('[data-lab-arrange-view] [data-widget-id="daily-puzzle"] [data-daily-puzzle]').count() === 1
        && await page.locator('[data-toolbar-save][disabled]').count() === 1 && await page.locator('[data-tab="today"][aria-selected="true"]').count() === 1);
    await page.locator('[data-toolbar-add]').click();
    await page.locator('[data-widget-library]').waitFor({timeout: 15000});
    const libraryRows = await page.locator('[data-widget-library] [data-library-row]').evaluateAll((els) => els.map((el) => el.getAttribute('data-library-row')));
    check('the library offers the eight games not yet on the page, those in the app before elsewhere', libraryRows.join(',') === 'arithmetic,market-making,correlation,poker-night,lichess,monkeytype,codeforces,leetcode', libraryRows.join(','));
    const iconWidths = await page.locator('[data-widget-library] [data-library-row] .material-symbols-outlined').evaluateAll((els) => els.map((el) => Math.round(el.getBoundingClientRect().width)));
    check('…every icon a glyph, not a word', iconWidths.length === 8 && iconWidths.every((w) => w > 0 && w <= 32), iconWidths.join(','));
    await page.locator('[data-library-add="arithmetic"]').click();
    await page.keyboard.press('Escape');
    await page.locator('[data-widget-library]').waitFor({state: 'hidden', timeout: 15000});
    check('a game added waits for the save behind a stand-in, and Save is offered', await page.locator('[data-lab-arrange-view] [data-widget-id="arithmetic"]').count() === 1
        && /save to load/i.test(await page.locator('[data-lab-arrange-view] [data-widget-id="arithmetic"]').innerText()) && await page.locator('[data-toolbar-save]:not([disabled])').count() === 1);
    await page.locator('[data-widget-id="arithmetic"] [role="group"][aria-label="Widget width"] button[title="8 of 12 columns"]').click();
    await page.locator('[data-widget-id="arithmetic"] button[aria-label="Move earlier"]').click();
    await page.locator('[data-widget-id="arithmetic"] button[aria-label="Move earlier"]').click();
    await page.locator('[data-widget-id="kelly"] button[aria-label="Remove Kelly coin"]').click();
    const arranged = await page.locator('[data-lab-arrange-view] [data-widget-id]').evaluateAll((els) => els.map((el) => el.getAttribute('data-widget-id')));
    check('its width set to L, moved to the front, and Kelly coin removed', arranged.join(',') === 'arithmetic,daily-puzzle' && await page.locator('[data-widget-id="arithmetic"] button[title="8 of 12 columns"][aria-pressed="true"]').count() === 1, arranged.join(','));
    await shot('06a-lab-arrange');
    await page.locator('[data-toolbar-save]').click();
    await page.waitForURL(/\/learn$/, {timeout: 20000});
    await page.locator('[data-lab-widgets]').waitFor({timeout: 30000});
    const savedPrefs = await db.collection('userpreferences').findOne({userId: owner});
    check('Save writes the layout with its widths and unsets the older list', savedPrefs?.learn?.labLayout?.version === 1
        && JSON.stringify(savedPrefs?.learn?.labLayout?.widgets) === JSON.stringify([{id: 'arithmetic', span: 8}, {id: 'daily-puzzle', span: 6}]) && savedPrefs?.learn?.labWidgets === undefined, JSON.stringify(savedPrefs?.learn));
    check('Today draws the grid as arranged, the sprint first at eight columns, and lists its round', (await drawnOrder()).join(',') === 'arithmetic@8,daily-puzzle@6'
        && ((await page.locator('[data-widget-id="arithmetic"]').getAttribute('class')) ?? '').includes('xl:col-span-8') && await page.locator('[data-lab-todo="kelly"]').count() === 0
        && await page.locator('[data-lab-todo="arithmetic"][data-todo-state="todo"]').count() === 1 && /Play a round of/.test(await page.locator('[data-lab-todo="arithmetic"]').innerText())
        && (await page.locator('[data-todo-open="arithmetic"]').getAttribute('href')) === '/games/arithmetic', (await drawnOrder()).join(','));
    await db.collection('gamerounds').insertOne({userId: owner, game: 'arithmetic', key: 'zetamac', score: 31, wrong: 2, durationMs: 120000, detail: {}, day: today, finishedAt: new Date()});
    await page.reload({waitUntil: 'load'});
    await page.locator('[data-lab-list]').waitFor({timeout: 30000});
    check('a round kept today ticks it, and the card shows the record', await page.locator('[data-lab-todo="arithmetic"][data-todo-state="done"]').count() === 1
        && /31/.test(await page.locator('[data-lab-widget="arithmetic"]').innerText()));
    await page.goto(`${BASE}/learn?arrange=1`, {waitUntil: 'load'});
    await page.locator('[data-lab-arrange-view]').waitFor({timeout: 30000});
    await page.locator('[data-toolbar-add]').click();
    await page.locator('[data-library-add="codeforces"]').click();
    await page.keyboard.press('Escape');
    await page.locator('[data-widget-library]').waitFor({state: 'hidden', timeout: 15000});
    await page.locator('[data-toolbar-save]').click();
    await page.waitForURL(/\/learn$/, {timeout: 20000});
    await page.locator('[data-lab-widget="codeforces"]').waitFor({timeout: 30000});
    check('Codeforces is a card with its link and an item ticked by hand, under its own eyebrow', await page.locator('[data-lab-widget="codeforces"] a[href="https://codeforces.com/problemset"]').count() === 1
        && await page.locator('[data-lab-todo="codeforces"] [data-todo-tick="codeforces"]').count() === 1 && (await page.locator('[data-todo-open="codeforces"]').getAttribute('target')) === '_blank'
        && (await page.locator('[data-todo-group]').evaluateAll((els) => els.map((el) => el.getAttribute('data-todo-group')))).join(',') === 'study,play,elsewhere');
    const prefs = await db.collection('userpreferences').findOne({userId: owner});
    check('…saved after the sprint and the puzzle at the default width', JSON.stringify(prefs?.learn?.labLayout?.widgets) === JSON.stringify([{id: 'arithmetic', span: 8}, {id: 'daily-puzzle', span: 6}, {id: 'codeforces', span: 6}]), JSON.stringify(prefs?.learn?.labLayout));
    const labText = await page.locator('main').innerText().catch(() => page.locator('body').innerText());
    check('Today keeps to the descriptive voice', !/\b(should|recommend|best|optimal)\b/i.test(labText), labText.match(/.{0,40}\b(should|recommend|best|optimal)\b.{0,40}/i)?.[0] ?? '');
    await shot('06-lab-list');
    await page.setViewportSize({width: 375, height: 812});
    await page.goto(`${BASE}/learn`, {waitUntil: 'load'});
    await page.locator('[data-lab-list]').waitFor({timeout: 30000});
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    check('Today has no horizontal scroll at 375px', overflow <= 1, `${overflow}px`);
    await shot('07-lab-phone');
    await page.goto(`${BASE}/learn?arrange=1`, {waitUntil: 'load'});
    await page.locator('[data-lab-arrange-view]').waitFor({timeout: 30000});
    const arrangeOverflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    const arrangeText = await page.locator('main').innerText().catch(() => page.locator('body').innerText());
    check('the arranging view has no horizontal scroll at 375px, its toolbar on screen, and keeps to the descriptive voice', arrangeOverflow <= 1 && await page.locator('[data-toolbar-save]').isVisible()
        && !/\b(should|recommend|best|optimal)\b/i.test(arrangeText), `${arrangeOverflow}px`);
    await shot('08-lab-arrange-phone');
    await page.setViewportSize({width: 1440, height: 900});
    await db.collection('gamerounds').deleteMany({userId: owner});
    await db.collection('labnotes').deleteMany({userId: owner});
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
    await pageB.keyboard.press('Escape');
    await pageB.locator('button[aria-label^="Account menu"]').click();
    await pageB.getByRole('menuitem', {name: 'Settings'}).waitFor({timeout: 15000}).catch(() => {});
    check('…and its account menu has no lab layout', await pageB.locator('[data-menu-lab-layout]').count() === 0 && await pageB.getByRole('menuitem', {name: 'Settings'}).count() === 1);
    await other.close();
} finally {
    await browser.close();
    await mongo.close();
}

summary('lab');
