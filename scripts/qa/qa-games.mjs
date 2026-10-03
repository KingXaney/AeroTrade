// The games (lib/games; /games, the daily puzzle and its archive, the streak on Home, Learn ›
// Today and the dashboard), keyless. Today's puzzle is the same for everyone on an ET day, so the
// suite reads its answer key from the app's own bank through jiti — the page never holds it. A
// wrong answer and an unreadable one, a hint, then the right answer: the solve counts once,
// shows its solution and starts the streak, which Home, the hub, Learn › Today and the widget
// all show. A streak carries over from yesterday and resets after a missed day; an archive solve
// and a revealed solution count nothing toward it.
// Run: npm run qa -- games   (the harness: README.md)
import {chromium} from 'playwright';
import {MongoClient} from 'mongodb';
import {createJiti} from 'jiti';
import {BASE, MONGO, REPO_ROOT, check, outDir, signUp, summary} from './lib.mjs';

const OUT = outDir('games');
const jiti = createJiti(import.meta.url, {alias: {'@': REPO_ROOT.replace(/\/$/, '')}, fsCache: false});
const {dailyPuzzleFor, archiveFor} = await jiti.import(`${REPO_ROOT}lib/games/puzzles.ts`);
const {findBanned} = await jiti.import(`${REPO_ROOT}lib/learn/banned.ts`);
const {parseAnswer} = await jiti.import(`${REPO_ROOT}lib/games/answer.ts`);

// ET dates, as the server keys the day.
const today = new Date().toLocaleDateString('en-CA', {timeZone: 'America/New_York'});
const daysAgo = (n) => {
    const [y, m, d] = today.split('-').map(Number);
    return new Date(Date.UTC(y, m - 1, d - n)).toISOString().slice(0, 10);
};
// Far from any answer, so never "close".
const wrongFor = (puzzle) => String(Math.round((parseAnswer(puzzle.answer)?.value ?? 1) * 10 + 97));

const browser = await chromium.launch({channel: 'chrome'});
const mongo = new MongoClient(MONGO);
const errors = [];

try {
    await mongo.connect();
    const db = mongo.db();
    const solves = db.collection('puzzlesolves');
    const userIdFor = async (email) => {
        const doc = await db.collection('user').findOne({email});
        return String(doc?._id ?? doc?.id ?? '');
    };
    const daily = dailyPuzzleFor(today);
    check('today has a puzzle', !!daily, today);
    const puzzle = daily.puzzle;

    // --- user A: the first solve ----------------------------------------------------------
    const page = await browser.newPage({viewport: {width: 1440, height: 900}});
    page.on('pageerror', (error) => errors.push(String(error)));
    const shot = (n) => page.screenshot({path: `${OUT}${n}.png`, fullPage: true});
    const emailA = await signUp(page, 'gamesA', {stay: true});
    const userA = await userIdFor(emailA);

    await page.locator('[data-streak-chip]').waitFor({timeout: 30000});
    const chip = page.locator('[data-streak-chip]');
    check('Home names today\'s puzzle beside the market, with no bare zero',
        await chip.getAttribute('data-streak') === '0' && /today's puzzle/i.test(await chip.innerText()) && !/\b0\b/.test(await chip.innerText()),
        await chip.innerText());
    check('…and links to it', await chip.getAttribute('href') === '/games/puzzle');

    await page.goto(`${BASE}/learn`, {waitUntil: 'load'});
    const learnTabs = await page.$$eval('[data-section-tabs="learn"] a', (as) => as.map((a) => `${a.getAttribute('href')}${a.getAttribute('aria-current') === 'page' ? '*' : ''}`));
    check('Learn carries a Games tab', learnTabs.join(',') === '/learn*,/games', learnTabs.join(','));

    await page.goto(`${BASE}/games`, {waitUntil: 'load'});
    await page.locator('[data-games-hub]').waitFor({timeout: 30000});
    check('the hub opens on the streak, empty so far', /no streak yet/i.test(await page.locator('#games-streak').innerText()));
    check('…lights the Games tab under Learn', await page.locator('[data-section-tabs="learn"] a[href="/games"][aria-current="page"]').count() === 1);
    check('…counts the archive', await page.locator('[data-archive-count="0"]').count() === 1
        && new RegExp(`0 of ${archiveFor(today).length} posted`).test(await page.locator('#games-archive').innerText()));
    await shot('01-hub');

    await page.goto(`${BASE}/games/puzzle`, {waitUntil: 'load'});
    await page.locator('[data-puzzle]').waitFor({timeout: 30000});
    check('today\'s puzzle is the one the schedule names', await page.locator('[data-puzzle]').getAttribute('data-puzzle') === puzzle.id, puzzle.id);
    check('…numbered by its day', (await page.locator('h1 + p, h1 ~ p').first().innerText()).includes(`Puzzle #${daily.number}`));
    const html = await page.content();
    check('the page holds no solution and no hint before they are asked for',
        !html.includes(puzzle.solution[0]) && !puzzle.hints.some((hint) => html.includes(hint)));
    check('the Games tab stays lit on a game page', await page.locator('[data-section-tabs="learn"] a[href="/games"][aria-current="page"]').count() === 1);

    const answer = page.locator('[data-puzzle-answer]');
    const submit = async (text, outcome) => {
        await answer.fill(text);
        await page.locator('[data-puzzle-check]').click();
        await page.locator(`[data-puzzle-feedback="${outcome}"]`).waitFor({timeout: 15000});
    };
    await submit(wrongFor(puzzle), 'wrong');
    check('a wrong answer says so and counts one try', /not this one/i.test(await page.locator('[data-puzzle-feedback]').innerText())
        && /1 try/.test(await page.locator('[data-puzzle-feedback]').innerText()));
    await submit('half a dozen', 'unreadable');
    check('…an answer that is not a number is not a try', /1 try/.test(await page.locator('[data-puzzle-feedback]').innerText())
        && (await solves.findOne({userId: userA, puzzleId: puzzle.id}))?.attempts === 1);
    await page.locator('[data-puzzle-hint]').click();
    await page.locator('[data-puzzle-hints] li').first().waitFor({timeout: 15000});
    check('a hint arrives one at a time', await page.locator('[data-puzzle-hints] li').count() === 1
        && (await page.locator('[data-puzzle-hints]').innerText()).includes(puzzle.hints[0]));
    await shot('02-puzzle-open');
    await answer.fill(puzzle.answer);
    await page.locator('[data-puzzle-check]').click();
    await page.locator('[data-puzzle-solution]').waitFor({timeout: 15000});
    check('the right answer solves it and shows the solution', (await page.locator('[data-puzzle-solution]').innerText()).includes(puzzle.solution[0]));
    check('…with when, how many tries and hints', /Solved .+ ET · 2 tries · 1 hint/.test(await page.locator('[data-puzzle-outcome]').innerText()),
        await page.locator('[data-puzzle-outcome]').innerText());
    check('…and the streak it starts', await page.locator('[data-puzzle-streak="1"]').count() === 1);
    const rowA = await solves.findOne({userId: userA, puzzleId: puzzle.id, day: today});
    check('one row, dated today, solved after two tries and a hint',
        rowA?.status === 'solved' && rowA.attempts === 2 && rowA.hintsUsed === 1 && rowA.solvedAt instanceof Date
        && await solves.countDocuments({userId: userA}) === 1);
    await shot('03-puzzle-solved');

    await page.reload({waitUntil: 'load'});
    await page.locator('[data-puzzle-solution]').waitFor({timeout: 30000});
    check('a reload keeps it solved, with no answer box', await page.locator('[data-puzzle-form]').count() === 0);

    await page.goto(`${BASE}/`, {waitUntil: 'load'});
    await page.locator('[data-streak-chip]').waitFor({timeout: 30000});
    check('Home shows the one-day streak, today done', await chip.getAttribute('data-streak') === '1'
        && await chip.getAttribute('data-today-done') !== null && /1-day streak/.test(await chip.innerText()));
    await shot('04-home-chip');

    await page.goto(`${BASE}/games`, {waitUntil: 'load'});
    check('the hub agrees', /1-day streak/.test(await page.locator('#games-streak').innerText())
        && /solved: the streak counts today/i.test(await page.locator('[data-streak-status]').innerText())
        && await page.locator('[data-streak-grid] [data-solved]').count() === 1);

    await page.goto(`${BASE}/learn?tab=today`, {waitUntil: 'load'});
    await page.locator('#learn-today-puzzle [data-daily-puzzle]').waitFor({timeout: 30000});
    const todayPanel = page.locator('#learn-today-puzzle');
    check('Learn › Today shows the puzzle and the streak', await todayPanel.locator('[data-card-streak="1"]').count() === 1
        && await todayPanel.locator('[data-puzzle-status="solved"]').count() === 1);
    check('…with no "What these mean" and no "Ask in chat"', await todayPanel.locator('[data-what-these-mean], [data-ask]').count() === 0);

    await db.collection('userpreferences').updateOne({userId: userA},
        {$set: {dashboardLayout: {version: 1, widgets: [{id: 'daily-puzzle', span: 6}]}, updatedAt: new Date()}}, {upsert: true});
    await page.goto(`${BASE}/dashboard`, {waitUntil: 'load'});
    const widget = page.locator('[data-widget-id="daily-puzzle"]');
    await widget.locator('[data-daily-puzzle]').waitFor({timeout: 30000});
    check('the daily-puzzle widget shows the same card', await widget.locator('[data-card-streak="1"]').count() === 1
        && await widget.locator('a[href="/games/puzzle"]').count() === 1);
    check('…carrying no "What these mean" and no "Ask in chat"', await widget.locator('[data-what-these-mean], [data-ask]').count() === 0);

    // --- the archive: solvable, never a streak day ----------------------------------------
    const older = archiveFor(today).find((entry) => entry.puzzle.id !== puzzle.id);
    await page.goto(`${BASE}/games/puzzles`, {waitUntil: 'load'});
    await page.locator('[data-puzzle-archive]').waitFor({timeout: 30000});
    check('the archive lists every posted puzzle, today\'s solved on its day',
        await page.locator('[data-archive-puzzle]').count() === archiveFor(today).length
        && /on its day/.test(await page.locator(`[data-archive-puzzle="${puzzle.id}"]`).innerText()));
    // A redirect from a streamed page lands once the client takes over, after 'load'.
    await page.goto(`${BASE}/games/puzzles/${puzzle.id}`, {waitUntil: 'load'});
    await page.waitForURL(/\/games\/puzzle$/, {timeout: 15000}).catch(() => {});
    check('today\'s puzzle in the archive goes to today\'s page', /\/games\/puzzle$/.test(page.url()), page.url());
    if (older) {
        await page.goto(`${BASE}/games/puzzles/${older.puzzle.id}`, {waitUntil: 'load'});
        await page.locator('[data-puzzle]').waitFor({timeout: 30000});
        await answer.fill(older.puzzle.answer);
        await page.locator('[data-puzzle-check]').click();
        await page.locator('[data-puzzle-solution]').waitFor({timeout: 15000});
        const archived = await solves.findOne({userId: userA, puzzleId: older.puzzle.id});
        check('an archive puzzle solves, in a row with no day', archived?.status === 'solved' && archived.day === null);
        check('…and leaves the streak where it was', await page.locator('[data-puzzle-streak]').count() === 0);
        await page.goto(`${BASE}/`, {waitUntil: 'load'});
        check('…Home still says one day', await page.locator('[data-streak-chip]').getAttribute('data-streak') === '1');
    }
    const notYet = dailyPuzzleFor(daysAgo(-1));
    const unposted = notYet && !archiveFor(today).some((entry) => entry.puzzle.id === notYet.puzzle.id) ? notYet.puzzle.id : null;
    if (unposted) {
        await page.goto(`${BASE}/games/puzzles/${unposted}`, {waitUntil: 'load'});
        check('tomorrow\'s puzzle has no page yet', /not found/i.test(await page.locator('h1').first().innerText().catch(() => '')));
    }

    // --- user B: a streak carried from yesterday ------------------------------------------
    const pageB = await browser.newPage({viewport: {width: 1440, height: 900}});
    pageB.on('pageerror', (error) => errors.push(String(error)));
    const userB = await userIdFor(await signUp(pageB, 'gamesB', {stay: true}));
    const yesterday = dailyPuzzleFor(daysAgo(1));
    const solvedRow = (userId, puzzleId, day) => ({userId, puzzleId, day, status: 'solved', attempts: 1, hintsUsed: 0,
        firstTryAt: new Date(`${day}T15:00:00Z`), solvedAt: new Date(`${day}T15:05:00Z`), revealedAt: null, createdAt: new Date(), updatedAt: new Date()});
    await solves.insertOne(solvedRow(userB, yesterday.puzzle.id, daysAgo(1)));
    await pageB.goto(`${BASE}/`, {waitUntil: 'load'});
    const chipB = pageB.locator('[data-streak-chip]');
    await chipB.waitFor({timeout: 30000});
    check('yesterday\'s solve keeps a one-day streak alive, today not done',
        await chipB.getAttribute('data-streak') === '1' && await chipB.getAttribute('data-today-done') === null);
    await pageB.goto(`${BASE}/games`, {waitUntil: 'load'});
    check('…and the hub says it is at risk', /by midnight eastern to keep the 1-day streak/i.test(await pageB.locator('[data-streak-status]').innerText()));
    await pageB.goto(`${BASE}/games/puzzle`, {waitUntil: 'load'});
    await pageB.locator('[data-puzzle-answer]').fill(puzzle.answer);
    await pageB.locator('[data-puzzle-check]').click();
    await pageB.locator('[data-puzzle-streak]').waitFor({timeout: 15000});
    check('solving today makes it two', await pageB.locator('[data-puzzle-streak="2"]').count() === 1);

    // --- user C: a missed day resets it ---------------------------------------------------
    const pageC = await browser.newPage({viewport: {width: 1440, height: 900}});
    pageC.on('pageerror', (error) => errors.push(String(error)));
    const userC = await userIdFor(await signUp(pageC, 'gamesC', {stay: true}));
    await solves.insertMany([2, 3].map((n) => solvedRow(userC, dailyPuzzleFor(daysAgo(n)).puzzle.id, daysAgo(n))));
    await pageC.goto(`${BASE}/games`, {waitUntil: 'load'});
    await pageC.locator('#games-streak').waitFor({timeout: 30000});
    check('a missed day resets the streak and keeps the longest', /no streak yet/i.test(await pageC.locator('#games-streak').innerText())
        && /Longest streak\s*2/i.test(await pageC.locator('#games-streak').innerText()), (await pageC.locator('#games-streak').innerText()).replace(/\s+/g, ' ').slice(0, 160));
    await pageC.goto(`${BASE}/`, {waitUntil: 'load'});
    check('…and Home names today\'s puzzle again', await pageC.locator('[data-streak-chip]').getAttribute('data-streak') === '0');

    // --- user D: a revealed solution counts nothing ---------------------------------------
    const pageD = await browser.newPage({viewport: {width: 390, height: 844}});
    pageD.on('pageerror', (error) => errors.push(String(error)));
    const userD = await userIdFor(await signUp(pageD, 'gamesD', {stay: true}));
    await pageD.goto(`${BASE}/games/puzzle`, {waitUntil: 'load'});
    await pageD.locator('[data-puzzle]').waitFor({timeout: 30000});
    check('the puzzle fits a phone without sideways scroll', await pageD.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1));
    await pageD.locator('[data-puzzle-reveal]').click();
    await pageD.locator('[data-puzzle-reveal-yes]').click();
    await pageD.locator('[data-puzzle-solution]').waitFor({timeout: 15000});
    check('a revealed solution shows the answer and says no solve counted', /no solve counted/i.test(await pageD.locator('[data-puzzle-outcome]').innerText())
        && (await solves.findOne({userId: userD, puzzleId: puzzle.id}))?.status === 'revealed');
    await pageD.goto(`${BASE}/`, {waitUntil: 'load'});
    check('…and starts no streak', await pageD.locator('[data-streak-chip]').getAttribute('data-streak') === '0');
    await pageD.goto(`${BASE}/games`, {waitUntil: 'load'});
    check('the hub fits a phone too', await pageD.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1));
    await pageD.screenshot({path: `${OUT}05-hub-phone.png`, fullPage: true});

    // --- user E: the arithmetic sprint, its custom mode and interview mode -------------------
    // A round runs on the page's own clock; Playwright's fake clock, installed after the page has
    // loaded, ends a two-minute round at once. The suite works each problem out from its text.
    const solveText = (text) => {
        const fractions = /^(\d+)\/(\d+) \+ (\d+)\/(\d+)$/.exec(text);
        if (fractions) return Number(fractions[1]) / Number(fractions[2]) + Number(fractions[3]) / Number(fractions[4]);
        const percent = /^([\d.]+)% of (\d+)$/.exec(text);
        if (percent) return (Number(percent[1]) * Number(percent[2])) / 100;
        if (/²$/.test(text)) return Number(text.slice(0, -1)) ** 2;
        if (text.startsWith('√')) return Math.sqrt(Number(text.slice(1)));
        const [a, op, b] = text.split(' ');
        return {'+': Number(a) + Number(b), '−': Number(a) - Number(b), '×': Number(a) * Number(b), '÷': Number(a) / Number(b)}[op];
    };
    const optionValue = (option) => (option.includes('/') ? Number(option.split('/')[0]) / Number(option.split('/')[1]) : Number(option));
    const rounds = db.collection('gamerounds');
    const pageE = await browser.newPage({viewport: {width: 1440, height: 900}});
    pageE.on('pageerror', (error) => errors.push(String(error)));
    // Installed once, before any page loads; it runs at real speed until fastForward jumps it.
    await pageE.clock.install();
    const userE = await userIdFor(await signUp(pageE, 'gamesE', {stay: true}));
    await pageE.goto(`${BASE}/games`, {waitUntil: 'load'});
    check('the hub has the arithmetic sprint, no record yet', /no round yet/i.test(await pageE.locator('[data-game-card="arithmetic"]').innerText()));
    await pageE.goto(`${BASE}/games/arithmetic`, {waitUntil: 'networkidle'});
    await pageE.locator('[data-arithmetic-lobby="sprint"]').waitFor({timeout: 30000});
    check('the sprint opens on Zetamac\'s defaults', /2–100/.test(await pageE.locator('[data-arithmetic-lobby]').innerText()));
    const playSprint = async (answers) => {
        await pageE.locator('[data-round-start], [data-round-again]').first().click();
        await pageE.locator('[data-problem-text]').waitFor({timeout: 15000});
        for (let i = 0; i < answers; i++) {
            const text = await pageE.locator('[data-problem-text]').innerText();
            await pageE.locator('[data-arithmetic-answer]').fill(String(solveText(text)));
            await pageE.locator(`[data-round-score="${i + 1}"]`).waitFor({timeout: 15000});
        }
        await pageE.clock.fastForward(121_000);
        await pageE.locator('[data-arithmetic-done]').waitFor({timeout: 15000});
        await pageE.locator('[data-round-record]').waitFor({timeout: 15000});
    };
    await playSprint(12);
    check('a right answer moves on at once, and the round ends on the clock', await pageE.locator('[data-round-final="12"]').count() === 1);
    check('…its first round is a new record', await pageE.locator('[data-round-record="true"]').count() === 1);
    const sprintRow = await rounds.findOne({userId: userE, game: 'arithmetic'});
    check('…kept under the defaults with its counts', sprintRow?.key === 'zetamac' && sprintRow.score === 12
        && Object.values(sprintRow.detail).reduce((a, b) => a + b, 0) === 12 && sprintRow.durationMs <= 120_000, JSON.stringify(sprintRow?.detail));
    await pageE.screenshot({path: `${OUT}06-sprint-done.png`, fullPage: true});
    await playSprint(5);
    check('a lower round keeps the record', await pageE.locator('[data-round-record="false"]').count() === 1
        && /record: 12/i.test(await pageE.locator('[data-arithmetic-done]').innerText()));
    check('…and the last rounds draw a line', await pageE.locator('[data-arithmetic-done] [data-sparkline="2"]').count() === 1);

    await pageE.goto(`${BASE}/games/arithmetic?mode=custom`, {waitUntil: 'networkidle'});
    await pageE.locator('[data-custom-settings]').waitFor({timeout: 30000});
    await pageE.locator('[data-range="addLeft-min"]').fill('90');
    await pageE.locator('[data-range="addLeft-max"]').fill('10');
    await pageE.locator('[data-round-start]').click();
    check('settings that cannot make a round say so', /cannot make a round/i.test(await pageE.locator('[data-custom-invalid]').innerText()));
    await pageE.locator('[data-range="addLeft-min"]').fill('2');
    await pageE.locator('[data-range="addLeft-max"]').fill('100');
    for (const op of ['add', 'subtract', 'divide']) await pageE.locator(`[data-operation="${op}"]`).uncheck();
    await pageE.locator('[data-duration]').selectOption('30');
    await pageE.locator('[data-round-start]').click();
    await pageE.locator('[data-problem-text]').waitFor({timeout: 15000});
    check('a custom round asks only what was chosen', /×/.test(await pageE.locator('[data-problem-text]').innerText()));
    await pageE.locator('[data-arithmetic-answer]').fill(String(solveText(await pageE.locator('[data-problem-text]').innerText())));
    await pageE.clock.fastForward(31_000);
    await pageE.locator('[data-round-record]').waitFor({timeout: 15000});
    const customRow = await rounds.findOne({userId: userE, game: 'arithmetic', key: {$ne: 'zetamac'}});
    check('…and keeps its record under its own settings', customRow?.key === 'ops=m;add=2-100x2-100;mul=2-12x2-100;t=30' && customRow.score === 1, customRow?.key);

    await pageE.goto(`${BASE}/games/arithmetic?mode=interview`, {waitUntil: 'networkidle'});
    await pageE.locator('[data-arithmetic-lobby="interview"]').waitFor({timeout: 30000});
    await pageE.locator('[data-round-start]').click();
    let rightPicked = 0;
    for (let i = 0; i < 5; i++) {
        await pageE.locator(`[data-interview-question="${i}"]`).waitFor({timeout: 15000});
        const truth = solveText(await pageE.locator('[data-question-text]').innerText());
        const options = await pageE.locator('[data-option]').allInnerTexts();
        const rightIndex = options.findIndex((text) => Math.abs(optionValue(text.replace(/^\d\s*/, '').trim()) - truth) < 1e-6);
        // Three right by keyboard, two wrong.
        const pick = i < 3 ? rightIndex : (rightIndex + 1) % 5;
        if (i < 3 && rightIndex >= 0) rightPicked++;
        await pageE.keyboard.press(String(pick + 1));
    }
    await pageE.locator('[data-interview-question="5"]').waitFor({timeout: 15000});
    await pageE.keyboard.press('Meta+k');
    await pageE.waitForSelector('[cmdk-input]', {timeout: 15000});
    check('⌘K still opens search mid-round, and is not an answer', await pageE.locator('[data-interview-question="5"]').count() === 1);
    await pageE.keyboard.press('Escape');
    await pageE.locator('[data-round-stop]').click();
    await pageE.locator('[data-round-record]').waitFor({timeout: 15000});
    const interviewRow = await rounds.findOne({userId: userE, game: 'interview'});
    check('the interview mode counts keys 1–5, right and wrong', rightPicked === 3 && interviewRow?.score === 3 && interviewRow.wrong === 2
        && /2 wrong/.test(await pageE.locator('[data-arithmetic-done]').innerText()), JSON.stringify({rightPicked, score: interviewRow?.score, wrong: interviewRow?.wrong}));
    await pageE.goto(`${BASE}/games`, {waitUntil: 'load'});
    const card = await pageE.locator('[data-game-card="arithmetic"]').innerText();
    check('the hub shows both records', /Sprint record\s*12/i.test(card) && /Interview record\s*3/i.test(card), card.replace(/\s+/g, ' '));

    // --- user F: Kelly coin, market making, guess the correlation -----------------------------
    // Each game sends its seed and its moves; the server replays them for the score, so the row's
    // score is checked against what the page shows.
    const pageF = await browser.newPage({viewport: {width: 1440, height: 900}});
    pageF.on('pageerror', (error) => errors.push(String(error)));
    const userF = await userIdFor(await signUp(pageF, 'gamesF', {stay: true}));
    await pageF.goto(`${BASE}/games/kelly`, {waitUntil: 'networkidle'});
    await pageF.locator('[data-kelly-start]').click();
    await pageF.locator('[data-kelly-game]').waitFor({timeout: 15000});
    await pageF.locator('[data-kelly-preset="0.2"]').click();
    check('a preset stakes a share of the bankroll', await pageF.locator('[data-kelly-amount]').inputValue() === '5.00');
    for (let i = 0; i < 5; i++) {
        await pageF.locator(`[data-kelly-bet="${i % 2 ? 'tails' : 'heads'}"]`).click();
        await pageF.locator(`[data-kelly-flips="${i + 1}"]`).waitFor({timeout: 15000});
    }
    check('every flip says what it did', /the bet (won|lost) \$/.test(await pageF.locator('[data-kelly-last]').innerText()));
    await pageF.locator('[data-kelly-stop]').click();
    await pageF.locator('[data-round-record]').waitFor({timeout: 15000});
    const kellyShown = await pageF.locator('[data-kelly-bankroll]').getAttribute('data-kelly-bankroll');
    const kellyRow = await rounds.findOne({userId: userF, game: 'kelly'});
    check('a stopped game is kept at the bankroll the server replays', kellyRow && String(kellyRow.score) === kellyShown && kellyRow.detail.flips === 5,
        `${kellyShown} vs ${kellyRow?.score}`);
    check('…beside the three fixed rules on the same flips', await pageF.locator('[data-kelly-rule]').count() === 3
        && await pageF.locator('[data-path-chart] polyline').count() === 4);
    await pageF.screenshot({path: `${OUT}07-kelly.png`, fullPage: true});

    await pageF.goto(`${BASE}/games/market-making`, {waitUntil: 'networkidle'});
    await pageF.locator('[data-market-start]').click();
    await pageF.locator('[data-market-form]').waitFor({timeout: 15000});
    await pageF.locator('[data-market-bid]').fill('10');
    await pageF.locator('[data-market-ask]').fill('20');
    await pageF.locator('[data-market-quote]').click();
    await pageF.waitForTimeout(500);
    check('a quote more than 4 apart is refused', await pageF.locator('[data-market-round="0"]').count() === 1);
    for (let round = 0; round < 4; round++) {
        await pageF.locator('[data-market-bid]').fill('13');
        await pageF.locator('[data-market-ask]').fill('15');
        await pageF.locator('[data-market-quote]').click();
        await pageF.locator(`[data-market-round="${round + 1}"]`).waitFor({timeout: 15000});
        if (round === 0) check('a round reports its trades and shows a die', await pageF.locator('[data-market-trades]').count() === 1
            && (await pageF.locator('[data-market-dice]').getAttribute('data-market-dice')).split(',').length === 1);
    }
    await pageF.locator('[data-round-record]').waitFor({timeout: 15000});
    const marketRow = await rounds.findOne({userId: userF, game: 'market-making'});
    check('the settlement is kept at the profit the server replays', marketRow && String(marketRow.score) === await pageF.locator('[data-market-summary]').getAttribute('data-market-pnl'),
        String(marketRow?.score));
    check('…and says what each trader believed, one informed a round', await pageF.locator('[data-trader-kind="informed"]').count() === 4
        && await pageF.locator('[data-trader-kind="noise"]').count() === 8);
    await pageF.screenshot({path: `${OUT}08-market.png`, fullPage: true});

    await pageF.goto(`${BASE}/games/correlation`, {waitUntil: 'networkidle'});
    await pageF.locator('[data-correlation-start]').click();
    for (let plot = 0; plot < 10; plot++) {
        await pageF.locator(`[data-correlation-plot="${plot}"]`).waitFor({timeout: 15000});
        if (plot === 0) {
            check('a plot is fifty points', await pageF.locator('[data-scatter="50"] circle').count() === 50);
            await pageF.locator('[data-correlation-slider]').fill('0.35');
            check('the slider reads its guess', await pageF.locator('[data-correlation-guess]').innerText() === '0.35');
        }
        await pageF.locator('[data-correlation-reveal]').click();
        await pageF.locator('[data-correlation-miss]').waitFor({timeout: 15000});
        await pageF.locator('[data-correlation-next]').click();
    }
    await pageF.locator('[data-round-record]').waitFor({timeout: 15000});
    const correlationRow = await rounds.findOne({userId: userF, game: 'correlation'});
    check('ten guesses are kept at the miss the server replays', correlationRow && String(correlationRow.score) === await pageF.locator('[data-correlation-summary]').getAttribute('data-correlation-score'),
        String(correlationRow?.score));
    await pageF.goto(`${BASE}/games`, {waitUntil: 'load'});
    check('the hub shows a record for each game played', !/no round yet/i.test(await pageF.locator('[data-game-card="kelly"]').innerText())
        && !/no round yet/i.test(await pageF.locator('[data-game-card="market-making"]').innerText())
        && !/no round yet/i.test(await pageF.locator('[data-game-card="correlation"]').innerText()));
    await pageF.goto(`${BASE}/learn?tab=glossary`, {waitUntil: 'load'});
    check('the glossary homes the games\' terms on /games', await pageF.locator('#learn-games [data-learn-entry="kelly-criterion"]').count() === 1
        && await pageF.locator('#learn-games a[href="/games"]').count() === 1);

    // --- every page in plain words ---------------------------------------------------------
    for (const path of ['/games', '/games/puzzle', '/games/puzzles', '/games/arithmetic', '/games/arithmetic?mode=interview', '/games/kelly', '/games/market-making', '/games/correlation']) {
        await page.goto(`${BASE}${path}`, {waitUntil: 'load'});
        const banned = findBanned(await page.locator('main').innerText().catch(() => page.locator('body').innerText()), 'copy');
        check(`${path} reads as description, never advice`, banned.length === 0, banned.join(', '));
    }
    check('no page threw', errors.length === 0, errors.slice(0, 3).join(' | '));
} finally {
    await browser.close();
    await mongo.close();
}
summary('games');
