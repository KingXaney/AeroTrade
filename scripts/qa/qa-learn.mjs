// The learn surfaces, keyless: the First-week checklist reads its own progress and
// leaves; /learn and the ⌘K palette reach the glossary; a strategy page carries the
// beginner line, column definitions, Guess the Verdict and "What the rule saw"; an
// "Ask in chat" link prefills the assistant without sending. Run against the harness
// in README.md (in-memory Mongo on :27117 + `npm run dev`).
import {chromium} from 'playwright';
import {MongoClient, ObjectId} from 'mongodb';
import {mkdirSync} from 'node:fs';

const BASE = 'http://localhost:3000';
const MONGO = 'mongodb://127.0.0.1:27117/aerotrade';
const OUT = new URL('./output/learn/', import.meta.url).pathname;
mkdirSync(OUT, {recursive: true});

const OWNER = 'system:strategies';
const CHAT_DIALOG = '[role="dialog"][aria-label="AeroTrade assistant"]';

let failures = 0;
const check = (name, ok, detail = '') => {
    if (!ok) failures++;
    console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? `  — ${detail}` : ''}`);
};

const browser = await chromium.launch({channel: 'chrome'});
const mongo = new MongoClient(MONGO);
const isoDaysAgo = (n) => new Date(Date.now() - n * 24 * 60 * 60 * 1000).toLocaleDateString('en-CA', {timeZone: 'America/New_York'});

const signUp = async (page, name) => {
    const email = `${name}${Date.now()}@example.com`.toLowerCase();
    await page.goto(`${BASE}/sign-up`, {waitUntil: 'load'});
    await page.fill('#fullName', `QA ${name}`);
    await page.fill('#email', email);
    await page.fill('#password', 'Passw0rd!Passw0rd!');
    await page.click('button[type="submit"]');
    await page.waitForURL(new RegExp(`^${BASE}/(\\?.*)?$`), {timeout: 90000});
    return email;
};

let page;
try {
    await mongo.connect();
    const db = mongo.db('aerotrade');
    page = await browser.newPage({viewport: {width: 1440, height: 900}});
    const shot = (n) => page.screenshot({path: `${OUT}${n}.png`, fullPage: true});
    const userIdFor = async (email) => {
        const doc = await db.collection('user').findOne({email});
        return String(doc?._id ?? doc?.id ?? '');
    };

    // --- user A: the checklist ticks itself from rows and leaves when done ----------------
    const emailA = await signUp(page, 'learnA');
    const userA = await userIdFor(emailA);
    check('signed up', userA.length > 0);
    const checklist = page.locator('[data-widget-id="getting-started"]');
    await checklist.waitFor({timeout: 30000});
    check('a fresh account starts with the First-week checklist first', (await page.$$eval('[data-widget-id]', (els) => els.map((e) => e.getAttribute('data-widget-id'))))[0] === 'getting-started');
    check('five missions, none done', await checklist.locator('li[data-done="false"]').count() === 5 && await checklist.locator('li[data-done="true"]').count() === 0);
    check('the first mission links to a prefilled ticket', await checklist.locator('a[href="/trade?symbol=SPY"]').count() === 1);
    await checklist.locator('#mission-first-trade summary').click();
    check('a mission opens to its lesson', /Est\. Cost/.test(await checklist.locator('#mission-first-trade').innerText()));
    check('the footer counts and promises to leave', /0\/5 done/.test(await checklist.locator('#missions-footer').innerText()));
    await shot('01-checklist');

    const main = await db.collection('paperaccounts').findOne({userId: userA});
    check('the lazily created account exists', !!main);
    const mainId = String(main._id);
    await db.collection('papertrades').insertOne({userId: userA, accountId: mainId, symbol: 'SPY', company: 'SPDR S&P 500', side: 'buy', quantity: 1, price: 500, total: 500, source: 'user', createdAt: new Date()});
    await page.reload({waitUntil: 'load'});
    await checklist.waitFor({timeout: 30000});
    check('a user fill ticks the first mission', await checklist.locator('#mission-first-trade[data-done="true"]').count() === 1);
    await db.collection('watchlists').insertOne({userId: userA, symbol: 'AAPL', company: 'Apple Inc', addedAt: new Date()});
    await db.collection('userpreferences').updateOne({userId: userA}, {$set: {followedStrategies: ['buy-and-hold-spy'], updatedAt: new Date()}}, {upsert: true});
    await db.collection('topics').updateOne({userId: userA}, {$set: {lastSeenAt: new Date()}});
    await db.collection('ainavigators').insertOne({userId: userA, accountId: mainId, status: 'active', enrolledAt: new Date()});
    await page.reload({waitUntil: 'load'});
    await page.locator('[data-widget-id]').first().waitFor({timeout: 30000});
    check('with every row present the checklist leaves the dashboard', await page.locator('[data-widget-id="getting-started"]').count() === 0);
    await page.goto(`${BASE}/settings`, {waitUntil: 'load'});
    await page.locator('#dashboard').waitFor({timeout: 30000});
    check('…and the settings editor agrees', !/First week/.test(await page.locator('#dashboard').innerText()));
    check('no "Ask in chat" link on any dashboard widget', await page.locator('[data-widget-id] [data-ask]').count() === 0);

    // --- user B: age cap and the one-time hide ----------------------------------------
    const contextB = await browser.newContext({viewport: {width: 1440, height: 900}});
    const pageB = await contextB.newPage();
    const emailB = await signUp(pageB, 'learnB');
    const userB = await userIdFor(emailB);
    await pageB.locator('[data-widget-id="getting-started"]').waitFor({timeout: 30000});
    const accountB = await db.collection('paperaccounts').findOne({userId: userB});
    await db.collection('paperaccounts').updateOne({_id: accountB._id}, {$set: {createdAt: new Date(Date.now() - 40 * 86_400_000)}});
    await pageB.reload({waitUntil: 'load'});
    await pageB.locator('[data-widget-id]').first().waitFor({timeout: 30000});
    check('an account older than a month has no checklist', await pageB.locator('[data-widget-id="getting-started"]').count() === 0);
    await db.collection('paperaccounts').updateOne({_id: accountB._id}, {$set: {createdAt: new Date()}});
    await pageB.reload({waitUntil: 'load'});
    await pageB.locator('[data-widget-id="getting-started"]').waitFor({timeout: 30000});
    await pageB.locator('#missions-hide').click();
    await pageB.locator('[data-widget-id="getting-started"]').waitFor({state: 'detached', timeout: 30000});
    const prefsB = await db.collection('userpreferences').findOne({userId: userB});
    check('Hide stamps the preference once', prefsB?.learn?.missionsDismissedAt instanceof Date);
    await pageB.reload({waitUntil: 'load'});
    await pageB.locator('[data-widget-id]').first().waitFor({timeout: 30000});
    check('a hidden checklist stays hidden', await pageB.locator('[data-widget-id="getting-started"]').count() === 0);
    await contextB.close();

    // --- /learn and the palette ---------------------------------------------------------
    await page.goto(`${BASE}/learn`, {waitUntil: 'load'});
    await page.getByRole('heading', {name: 'Learn', level: 1}).waitFor({timeout: 30000});
    const entries = await page.locator('[data-learn-entry]').count();
    check('/learn lists the whole glossary', entries >= 70, String(entries));
    check('/learn anchors every entry', await page.locator('#max-drawdown').count() === 1 && await page.locator('#fomc').count() === 1);
    check('/learn lists the eight strategies in one line each', await page.locator('#learn-strategies a[href^="/strategies/"]').count() === 8);
    check('/learn states the disclaimer once', ((await page.locator('body').innerText()).match(/not financial advice/gi) ?? []).length === 1);
    check('/learn is in the sidebar', await page.locator('aside a[href="/learn"], nav a[href="/learn"]').count() >= 1);
    await shot('02-learn');
    await page.keyboard.press('Meta+k');
    const palette = page.locator('input[placeholder*="term to learn"]');
    await palette.waitFor({timeout: 15000});
    await palette.fill('drawdown');
    await page.locator('[data-learn-hit="max-drawdown"]').waitFor({timeout: 15000});
    check('⌘K offers the glossary entry for a typed term', true);
    await page.keyboard.press('Escape');

    // --- a strategy page: beginner line, definitions, the quiz and the replay ----------
    const accountIds = (await db.collection('paperaccounts').find({userId: OWNER}).project({_id: 1}).toArray()).map((a) => String(a._id));
    await db.collection('paperaccounts').deleteMany({userId: OWNER});
    await db.collection('papertrades').deleteMany({userId: OWNER});
    await db.collection('accountsnapshots').deleteMany({$or: [{userId: OWNER}, {accountId: {$in: accountIds}}]});
    for (const name of ['strategystates', 'strategyruns', 'strategybacktests']) await db.collection(name).deleteMany({});

    const today = isoDaysAgo(0);
    const inception = new Date(Date.now() - 13 * 86_400_000);
    const gcId = new ObjectId();
    await db.collection('paperaccounts').insertOne({
        _id: gcId, userId: OWNER, name: 'Golden Cross Sectors', cash: 99_578, startingBalance: 100_000, inceptionAt: inception,
        positions: [{symbol: 'XLF', company: 'Financials', quantity: 10, avgCost: 42.2}], createdAt: inception, updatedAt: new Date(),
    });
    await db.collection('strategystates').insertOne({
        strategyId: 'golden-cross', accountId: String(gcId), status: 'active', version: '1.1', launchDate: isoDaysAgo(13),
        lastRunDate: today, lastTradeDate: today, lastRebalanceDate: today, createdAt: inception, updatedAt: new Date(),
    });
    const enterReason = 'enter: SMA50 42.10 > SMA200 40.00 (+5.3%)';
    const exitReason = 'exit: SMA50 80.00 ≤ SMA200 81.00';
    await db.collection('papertrades').insertMany([
        {userId: OWNER, accountId: String(gcId), symbol: 'XLF', company: 'Financials', side: 'buy', quantity: 10, price: 42.2, total: 422, source: 'strategy', reason: enterReason, createdAt: new Date()},
        {userId: OWNER, accountId: String(gcId), symbol: 'XLE', company: 'Energy', side: 'sell', quantity: 5, price: 80, total: 400, realizedPnl: -5, source: 'strategy', reason: exitReason, createdAt: new Date(Date.now() - 401 * 86_400_000)},
    ]);
    const row = (symbol, state, sma50, sma200, note) => ({symbol, state, values: {close: sma50, sma50, sma200, spread: sma50 / sma200 - 1, trendOn: sma50 > sma200}, ...(note ? {note} : {})});
    await db.collection('strategyruns').insertOne({
        strategyId: 'golden-cross', date: today, asOf: isoDaysAgo(1), mode: 'live', status: 'done', staleCount: 0, universeSize: 11, rebalanceTriggered: true,
        board: [row('XLK', 'held', 210.5, 198.2), row('XLF', 'enter', 42.1, 40), row('XLE', 'exit', 80, 81), row('XLU', 'watch', 70, 72), row('XLP', 'excluded', 0, 0, 'needs 200 bars')],
        orders: [
            {symbol: 'XLF', side: 'buy', quantity: 10, kind: 'enter', reason: enterReason, executed: true, price: 42.2},
            {symbol: 'XLE', side: 'sell', quantity: 5, kind: 'exit', reason: exitReason, executed: true, price: 80},
        ],
        skippedOrders: [], dataIssues: [], equity: 100_000, summary: '2/2 order(s) filled', createdAt: new Date(),
    });

    await page.goto(`${BASE}/strategies/golden-cross`, {waitUntil: 'load'});
    await page.locator('#signal-board').waitFor({timeout: 30000});
    check('the beginner line reads as written in the catalog', /accepts being late both ways/.test(await page.locator('#strategy-beginner-line').innerText()));
    check('board column headers carry a definition', await page.locator('#signal-board [title]').count() >= 3);
    check('the board keeps exactly one disclosure of its own', await page.locator('#signal-board details').count() === 0);
    const terms = page.locator('#board-terms');
    // Collapsed <details> keep their body out of innerText; read the definition terms directly.
    const termNames = (await terms.locator('dt').allTextContents()).join(' ');
    check('one "What these mean" sits beside the board and names its columns', await terms.count() === 1 && /SMA50/.test(termNames), termNames.slice(0, 80));
    check('a definition row offers "Ask in chat"', await terms.locator('[data-ask="term"]').count() >= 3);

    const verdictVisible = () => page.$$eval('#signal-board [data-verdict]', (els) => els.map((el) => getComputedStyle(el).visibility));
    check('verdicts are visible before the quiz opens', (await verdictVisible()).every((v) => v === 'visible'));
    await page.locator('#verdict-quiz summary').click();
    await page.waitForTimeout(300);
    check('the verdict column hides while guessing', (await verdictVisible()).every((v) => v === 'hidden'));
    const quizSymbols = await page.$$eval('#verdict-quiz [data-quiz-row]', (els) => els.map((el) => el.getAttribute('data-quiz-row')));
    check('the quiz asks about acted-on rows first and never an excluded one', quizSymbols[0] === 'XLE' && quizSymbols[1] === 'XLF' && !quizSymbols.includes('XLP'), quizSymbols.join(','));
    check('Reveal waits for a guess', await page.locator('#verdict-reveal').isDisabled());
    await page.locator('[data-quiz-row="XLF"] button[aria-pressed]', {hasText: 'enter'}).click();
    await page.locator('#verdict-reveal').click();
    const quizText = await page.locator('#verdict-quiz').innerText();
    check('the reveal quotes the rule\'s own reason', quizText.includes('SMA50 42.10 > SMA200 40.00'));
    check('the tally counts the guess', /1 of 1 matched the rule/.test(quizText));
    check('the disclaimer still appears once', ((await page.locator('body').innerText()).match(/not financial advice/gi) ?? []).length === 1);
    await shot('03-quiz');

    const replays = page.locator('#strategy-trades details[data-replay]');
    check('every strategy fill has one "What the rule saw" disclosure', await replays.count() === 2);
    await replays.first().locator('summary').click();
    const replayText = await replays.first().innerText();
    check('the replay shows the stored row and the planned order', /42\.10/.test(replayText) && /planned order/i.test(replayText) && replayText.includes('SMA50 42.10 > SMA200 40.00'), replayText.replace(/\s+/g, ' ').slice(0, 160));
    await replays.nth(1).locator('summary').click();
    check('an expired fill says the record is gone', /kept 400 days/.test(await replays.nth(1).innerText()));
    await shot('04-replay');

    // --- Ask in chat: prefilled, never sent ------------------------------------------------
    await terms.locator('summary').click();
    await terms.locator('[data-ask="term"]').first().click();
    const dialog = page.locator(CHAT_DIALOG);
    await dialog.waitFor({timeout: 15000});
    const composer = dialog.locator('input[placeholder="Query market data..."]');
    check('the chat opens with the question typed', /mean here\?$/.test(await composer.inputValue()), await composer.inputValue());
    check('nothing was sent', !/mean here/.test(await dialog.innerText()));
    check('the composer is focused', await page.evaluate(() => document.activeElement?.getAttribute('placeholder')) === 'Query market data...');
    await shot('05-ask');
} catch (err) {
    failures++;
    console.log(`FAIL  threw: ${err.message}`);
    if (page) await page.screenshot({path: `${OUT}99-error.png`, fullPage: true}).catch(() => {});
} finally {
    await mongo.close().catch(() => {});
    await browser.close();
}

console.log(failures === 0 ? '\nAll learn checks passed.' : `\n${failures} check(s) failed.`);
process.exit(failures === 0 ? 0 : 1);
