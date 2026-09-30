// The learn surfaces, keyless: the First-week checklist reads its own progress and
// leaves; /learn and the ⌘K palette reach the glossary; a strategy page carries the
// beginner line, column definitions led by "Read this board" (its top row in plain words,
// hidden while the quiz is open), Guess the Verdict and "What the rule saw"; an
// "Ask in chat" link prefills the assistant without sending; a rule's reason is decoded
// clause by clause wherever a fill or an order shows it, and nowhere else. Today's lesson,
// added from the widget library, teaches the term of the day, then a concept today's topic
// articles used, then a fresh first from the account (a drop, a credited dividend) until
// "Got it", then a followed monthly strategy's rebalance. The Daily quiz, added the same way,
// asks one question from the one board inside its ten-day window (a skipped day and older
// boards are passed over), reveals the seeded reason and its gloss, counts an answered day
// once however often it is answered, and says plainly when there is no board to ask about.
// On the buy-and-hold page, Time in the market sets three ways of owning a seeded V-shaped SPY
// side by side from the account's inception, moves with a start typed inside the dip, holds
// its printed arithmetic to the cent, and prints a dash for cash once ^IRX is gone.
// Run against the harness in README.md (in-memory Mongo on :27117 + `npm run dev`).
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
    // The two widgets that reuse page panels carrying a "What these mean" disclosure: on the
    // dashboard they keep their Term titles but get neither the disclosure nor its "Ask in
    // chat" links (invariant 12). Neither is in the default layout, so put them there.
    await db.collection('userpreferences').updateOne({userId: userA}, {$set: {dashboardLayout: {version: 1, widgets: [{id: 'account-summary', span: 12}, {id: 'analytics-stats', span: 12}]}, updatedAt: new Date()}}, {upsert: true});
    await page.goto(`${BASE}/`, {waitUntil: 'load'});
    await page.locator('[data-widget-id="account-summary"] [data-term]').first().waitFor({timeout: 30000});
    check('the account-summary widget keeps its Term titles', await page.locator('[data-widget-id="account-summary"] [data-term]').count() >= 4);
    check('no "What these mean" disclosure on any dashboard widget', await page.locator('[data-widget-id] [data-what-these-mean]').count() === 0);
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
    // Older than its 401-day-old fill below: every trade read starts at the account's inceptionAt
    // (a fill from before it belongs to an epoch a reset ended), so the expired fill needs a
    // current epoch that reaches back past the 400-day run retention.
    const gcInception = new Date(Date.now() - 402 * 86_400_000);
    await db.collection('paperaccounts').insertOne({
        _id: gcId, userId: OWNER, name: 'Golden Cross Sectors', cash: 99_578, startingBalance: 100_000, inceptionAt: gcInception,
        positions: [{symbol: 'XLF', company: 'Financials', quantity: 10, avgCost: 42.2}], createdAt: gcInception, updatedAt: new Date(),
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
            // Today's exit did not fill (the XLE fill in the log is the 401-day-old one), so the
            // latest decision has one order with a "What the rule saw" of its own and one without.
            {symbol: 'XLE', side: 'sell', quantity: 5, kind: 'exit', reason: exitReason, executed: false, price: null, message: 'not held'},
        ],
        skippedOrders: [], dataIssues: [], equity: 100_000, summary: '1/2 order(s) filled', createdAt: new Date(),
    });

    await page.goto(`${BASE}/strategies/golden-cross`, {waitUntil: 'load'});
    await page.locator('#signal-board').waitFor({timeout: 30000});
    check('the beginner line reads as written in the catalog', /accepts being late both ways/.test(await page.locator('#strategy-beginner-line').innerText()));
    check('board column headers carry a definition', await page.locator('#signal-board [title]').count() >= 3);
    check('the board keeps exactly one disclosure of its own', await page.locator('#signal-board details').count() === 0);
    const terms = page.locator('#board-terms');
    // Collapsed <details> keep their body out of innerText; read the definition terms directly.
    const termNames = (await terms.locator('dt').allTextContents()).join(' ');
    check('one disclosure sits beside the board and names its columns', await terms.count() === 1 && /SMA50/.test(termNames), termNames.slice(0, 80));
    check('a definition row offers "Ask in chat"', await terms.locator('[data-ask="term"]').count() >= 3);

    // --- Read this board: the row the board lists first, read by the rule's own narrator ---
    check('the panel still has one "What these mean" of its own', await page.locator('#strategy-decision [data-what-these-mean]').count() === 1);
    check('the disclosure is titled by the board\'s top row', (await terms.locator('summary').innerText()).includes('Read this board — XLF'),
        (await terms.locator('summary').innerText()).replace(/\s+/g, ' '));
    await terms.locator('summary').click();
    const rowReading = terms.locator('[data-board-row-reading]');
    const rowReadingText = await rowReading.innerText();
    check('the reading quotes the top row\'s numbers as the board prints them',
        /50-day average \(\$42\.10\) is above its 200-day average \(\$40\.00\)/.test(rowReadingText) && /Trend on reads yes/.test(rowReadingText),
        rowReadingText.replace(/\s+/g, ' ').slice(0, 200));
    check('…and ends on the verdict in the rule\'s own slot count', /verdict is enter/.test(rowReadingText) && /one of its 11 equal slots/.test(rowReadingText));
    check('one line says how every other row reads', /while the 50-day average is above the 200-day average/.test(await terms.locator('[data-board-key]').innerText()));
    check('the definitions follow the reading, under their usual heading', /what these mean/i.test(await terms.innerText()) && await terms.locator('dl dt').count() >= 3);
    check('the reading is prose, with no chat link of its own', await terms.locator('[data-board-reading] [data-ask]').count() === 0);
    await shot('03a-read-this-board');

    const verdictVisible = () => page.$$eval('#signal-board [data-verdict]', (els) => els.map((el) => getComputedStyle(el).visibility));
    // Everything in the latest decision that states a row's verdict: the headline, each order
    // (side, kind, raw reason, decoded reason) — the orders say "buy XLF · enter" as plainly as the board.
    const RUN_VERDICTS = ['[data-run-verdict]', '[data-order-reason]', 'details[data-decoded]'].map((sel) => `#latest-decision ${sel}`).join(', ');
    const runVerdictVisible = () => page.$$eval(RUN_VERDICTS, (els) => els.map((el) => getComputedStyle(el).visibility));
    check('verdicts are visible before the quiz opens', (await verdictVisible()).every((v) => v === 'visible'));
    check('…and so are the run\'s headline, orders and their reasons', (await runVerdictVisible()).length === 6 && (await runVerdictVisible()).every((v) => v === 'visible'),
        (await runVerdictVisible()).join(','));
    await page.locator('#verdict-quiz summary').click();
    await page.waitForTimeout(300);
    check('the verdict column hides while guessing', (await verdictVisible()).every((v) => v === 'hidden'));
    check('…and so do the run\'s headline, orders, their reasons and "What the rule saw"', (await runVerdictVisible()).every((v) => v === 'hidden'),
        (await runVerdictVisible()).join(','));
    // The reading states the top row's verdict, which the quiz asks for.
    check('the top row\'s reading hides while guessing, and says why', !(await rowReading.isVisible())
        && await terms.locator('[data-board-reading-paused]').isVisible()
        && await terms.locator('[data-board-key]').isVisible());
    await terms.locator('summary').click();
    const quizSymbols = await page.$$eval('#verdict-quiz [data-quiz-row]', (els) => els.map((el) => el.getAttribute('data-quiz-row')));
    check('the quiz asks about acted-on rows first and never an excluded one', quizSymbols[0] === 'XLE' && quizSymbols[1] === 'XLF' && !quizSymbols.includes('XLP'), quizSymbols.join(','));
    check('Reveal waits for a guess', await page.locator('#verdict-reveal').isDisabled());
    await page.locator('[data-quiz-row="XLF"] button[aria-pressed]', {hasText: 'enter'}).click();
    await page.locator('#verdict-reveal').click();
    const quizText = await page.locator('#verdict-quiz').innerText();
    check('the reveal quotes the rule\'s own reason', quizText.includes('SMA50 42.10 > SMA200 40.00'));
    check('the tally counts the guess', /1 of 1 matched the rule/.test(quizText));
    const quizGloss = page.locator('[data-quiz-row="XLF"] [data-reason-gloss]');
    check('the reveal decodes the reason in plain words', await quizGloss.count() === 1
        && /50-day average \(42\.10\) was above the 200-day average \(40\.00\)/.test(await quizGloss.innerText()));
    check('a verdict explained by its fixed meaning gets no gloss', await page.locator('[data-quiz-row="XLK"] [data-reason-gloss]').count() === 0);
    check('the disclaimer still appears once', ((await page.locator('body').innerText()).match(/not financial advice/gi) ?? []).length === 1);
    await shot('03-quiz');
    await page.locator('#verdict-quiz summary').click();
    await page.waitForTimeout(300);
    check('closing the quiz brings the orders back', (await runVerdictVisible()).every((v) => v === 'visible'));

    const replays = page.locator('#strategy-trades details[data-replay]');
    check('every strategy fill has one "What the rule saw" disclosure', await replays.count() === 2);
    await replays.first().locator('summary').click();
    const replayText = await replays.first().innerText();
    check('the replay shows the stored row and the planned order', /42\.10/.test(replayText) && /planned order/i.test(replayText) && replayText.includes('SMA50 42.10 > SMA200 40.00'), replayText.replace(/\s+/g, ' ').slice(0, 160));
    const replayGloss = replays.first().locator('[data-reason-gloss]');
    check('the replay decodes the planned order clause by clause', await replayGloss.count() === 1
        && /50-day average \(42\.10\) was above the 200-day average \(40\.00\)/.test(await replayGloss.innerText()));
    check('a decoded clause carries its glossary definition', await replayGloss.locator('[data-term="trend-on"][title]').count() === 1);
    await replays.nth(1).locator('summary').click();
    check('an expired fill says the record is gone', /kept 400 days/.test(await replays.nth(1).innerText()));
    // The board row expired with the record; the rule's words did not — the fill stores them.
    check('…shows no board row it no longer has', await replays.nth(1).locator('[data-replay-body] [data-verdict]').count() === 0);
    const expiredGloss = replays.nth(1).locator('[data-reason-gloss]');
    check('…and still decodes the reason the fill stores', await expiredGloss.count() === 1
        && /50-day average \(80\.00\)/.test(await expiredGloss.innerText()) && /at or below/.test(await expiredGloss.innerText()),
        (await replays.nth(1).innerText()).replace(/\s+/g, ' ').slice(0, 200));
    check('…with its one "Ask in chat"', await replays.nth(1).locator('[data-ask="reason"]').count() === 1);
    await shot('04-replay');

    // One "What the rule saw" per fill: a filled order's lives on its trade-log row, so only
    // the order that did not fill carries one here.
    const decided = page.locator('#latest-decision details[data-decoded]');
    const orderRow = (symbol) => page.locator('#latest-decision li[data-run-verdict]', {has: page.locator('span', {hasText: new RegExp(`^${symbol}$`)})});
    check('the filled order in the latest decision has no disclosure of its own', await orderRow('XLF').locator('details').count() === 0);
    check('the order that did not fill has one "What the rule saw"', await decided.count() === 1 && await orderRow('XLE').locator('details[data-decoded]').count() === 1);
    check('…outside the board, which keeps no disclosure of its own', await page.locator('#signal-board details').count() === 0);
    await decided.first().locator('summary').click();
    const decidedText = await decided.first().innerText();
    check('…which reads the reason in the rule\'s own words', /50-day average \(80\.00\)/.test(decidedText) && /at or below/.test(decidedText), decidedText.replace(/\s+/g, ' ').slice(0, 160));
    check('…and ends with one "Ask in chat"', await decided.first().locator('[data-ask="reason"]').count() === 1);

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
    // The panel may cover the link, and what is under test is the link's own handler.
    await decided.first().locator('[data-ask="reason"]').evaluate((el) => el.click());
    await page.waitForTimeout(300);
    check('a decoded reason\'s Ask names the strategy, the symbol and the reason',
        (await composer.inputValue()) === `Explain this reason from the Golden Cross Sectors strategy for XLE: ${exitReason}`, await composer.inputValue());

    // --- RSI-2: a real entry decoded in the replay; a simulated exit in the backtest log --
    const rsiId = new ObjectId();
    const rsiReason = 'enter: RSI(2) 3.4 < 10 with close 123.45 above SMA200 110.00';
    await db.collection('paperaccounts').insertOne({
        _id: rsiId, userId: OWNER, name: 'RSI-2 Mean Reversion', cash: 80_224, startingBalance: 100_000, inceptionAt: inception,
        positions: [{symbol: 'AAPL', company: 'Apple Inc', quantity: 160, avgCost: 123.6}], createdAt: inception, updatedAt: new Date(),
    });
    await db.collection('strategystates').insertOne({
        strategyId: 'rsi2-mean-reversion', accountId: String(rsiId), status: 'active', version: '1', launchDate: isoDaysAgo(13),
        lastRunDate: today, lastTradeDate: today, lastRebalanceDate: today, createdAt: inception, updatedAt: new Date(),
    });
    await db.collection('papertrades').insertOne({
        userId: OWNER, accountId: String(rsiId), symbol: 'AAPL', company: 'Apple Inc', side: 'buy', quantity: 160, price: 123.6, total: 19_776,
        source: 'strategy', reason: rsiReason, createdAt: new Date(),
    });
    await db.collection('strategyruns').insertOne({
        strategyId: 'rsi2-mean-reversion', date: today, asOf: isoDaysAgo(1), mode: 'live', status: 'done', staleCount: 0, universeSize: 40, rebalanceTriggered: true,
        board: [
            {symbol: 'AAPL', state: 'enter', values: {close: 123.45, rsi2: 3.4, sma5: 126.1, sma200: 110, aboveSma200: true}},
            {symbol: 'MSFT', state: 'watch', values: {close: 410, rsi2: 6.2, sma5: 415, sma200: 380, aboveSma200: true}, note: 'signal, but no open slot'},
        ],
        orders: [{symbol: 'AAPL', side: 'buy', quantity: 160, kind: 'enter', reason: rsiReason, executed: true, price: 123.6}],
        skippedOrders: [], dataIssues: [], equity: 100_000, summary: '1/1 order(s) filled', createdAt: new Date(),
    });
    const simPoints = Array.from({length: 30}, (_, k) => ({date: isoDaysAgo(60 - k), value: 100_000 * (1 + k * 0.002)}));
    await db.collection('strategybacktests').insertOne({
        strategyId: 'rsi2-mean-reversion', version: '1', from: simPoints[0].date, to: simPoints[simPoints.length - 1].date, fillRule: 'next-open',
        closeFills: 0, skippedDays: 0, points: simPoints, benchmark: simPoints.map((p) => ({date: p.date, value: 500 + (p.value - 100_000) / 400})),
        trades: [{date: simPoints[3].date, symbol: 'MSFT', side: 'sell', quantity: 10, price: 130, total: 1_300, realizedPnl: 20, reason: 'exit: close 130.00 > SMA5 128.00', fill: 'open'}],
        stats: {totalReturnPct: 5.8, cagrPct: 4.1, annualizedVolPct: 9.3, maxDrawdownPct: 1.2, winRatePct: 100, wins: 1, losses: 0, tradeCount: 1, benchmarkReturnPct: 5.0, excessReturnPct: 0.8},
        computedAt: new Date(),
    });

    await page.goto(`${BASE}/strategies/rsi2-mean-reversion`, {waitUntil: 'load'});
    await page.locator('#strategy-trades').waitFor({timeout: 30000});
    const rsiTerms = page.locator('#board-terms');
    check('the RSI-2 board is read from its top row', (await rsiTerms.locator('summary').innerText()).includes('Read this board — AAPL'));
    await rsiTerms.locator('summary').click();
    const rsiReading = await rsiTerms.locator('[data-board-reading]').innerText();
    check('…in its own entry level, trend filter, slots and exit average',
        /2-day RSI reads 3\.4, under the entry level of 10/.test(rsiReading) && /close \(\$123\.45\) is above the 200-day average \(\$110\.00\)/.test(rsiReading)
        && /one of 5 equal slots/.test(rsiReading) && /under 10 and its close is above the 200-day average/.test(rsiReading),
        rsiReading.replace(/\s+/g, ' ').slice(0, 240));
    await rsiTerms.locator('summary').click();
    const rsiReplay = page.locator('#strategy-trades details[data-replay]');
    check('the RSI-2 fill has one "What the rule saw"', await rsiReplay.count() === 1);
    await rsiReplay.locator('summary').click();
    const rsiGloss = await rsiReplay.locator('[data-reason-gloss]').innerText();
    check('the seeded RSI-2 reason opens to its decoded clauses', /\b10\b/.test(rsiGloss) && /SMA200/.test(rsiGloss), rsiGloss.replace(/\s+/g, ' ').slice(0, 200));
    check('…reading the entry level and the trend filter in plain words',
        /under the entry level of 10/.test(rsiGloss) && /200-day average \(110\.00\)/.test(rsiGloss) && /5-day average/.test(rsiGloss));
    check('…with the RSI clause carrying its definition', await rsiReplay.locator('[data-reason-gloss] [data-term="rsi2"]').count() === 1);
    await page.locator('#verdict-quiz summary').click();
    await page.locator('[data-quiz-row="MSFT"] button[aria-pressed]', {hasText: 'watch'}).click();
    await page.locator('#verdict-reveal').click();
    check('a board note is decoded in the reveal too', /all 5 slots were taken/.test(await page.locator('[data-quiz-row="MSFT"] [data-reason-gloss]').innerText()));
    await page.locator('#strategy-simulated-trades > details > summary').click();
    const simDecoded = page.locator('#simulated-trades details[data-decoded]');
    check('a simulated fill has its own "What the rule saw", and no replay', await simDecoded.count() === 1 && await page.locator('#simulated-trades details[data-replay]').count() === 0);
    await simDecoded.locator('summary').click();
    check('…decoding the simulated exit', /rose above the 5-day average \(128\.00\)/.test(await simDecoded.innerText()));
    check('the disclaimer still appears once on the RSI-2 page', ((await page.locator('body').innerText()).match(/not financial advice/gi) ?? []).length === 1);
    await shot('06-rsi2-decoded');

    // --- /history is the user's own trades: the reason line, never the decoder ------------
    // Strategy fills live in the system owner's accounts, so this is seeded under user A's
    // own account: the placement rule says the decoder belongs to the strategy page's fills.
    await db.collection('papertrades').insertOne({
        userId: userA, accountId: mainId, symbol: 'AAPL', company: 'Apple Inc', side: 'buy', quantity: 1, price: 123.6, total: 123.6,
        source: 'strategy', reason: rsiReason, createdAt: new Date(),
    });
    await page.goto(`${BASE}/history`, {waitUntil: 'load'});
    await page.getByRole('heading', {name: 'Trades', exact: true}).waitFor({timeout: 30000});
    const historyTrades = page.locator('section', {has: page.getByRole('heading', {name: 'Trades', exact: true})});
    check('/history shows the reason line as written', (await historyTrades.innerText()).includes(rsiReason));
    check('/history carries no decoder, disclosure or Ask link', await historyTrades.locator('[data-reason-gloss], details, [data-ask]').count() === 0);

    // --- Today's lesson: library-only; a fresh first from the account, else today's concept -
    const contextC = await browser.newContext({viewport: {width: 1440, height: 900}});
    const pageC = await contextC.newPage();
    const emailC = await signUp(pageC, 'learnC');
    const userC = await userIdFor(emailC);
    await pageC.locator('[data-widget-id]').first().waitFor({timeout: 30000});
    check('Today\'s lesson is not on the default dashboard', await pageC.locator('[data-widget-id="todays-lesson"]').count() === 0);
    // A deterministic feed: no topics at all, so nothing in them can have used a term today.
    await db.collection('topics').deleteMany({userId: userC});
    await pageC.goto(`${BASE}/?customize=1`, {waitUntil: 'load'});
    await pageC.getByRole('button', {name: /Add widget/i}).first().click();
    const library = pageC.locator('[role="dialog"]');
    await library.waitFor({timeout: 15000});
    check('the library lists it under Learn, badged New', /LEARN[\s\S]*Today's lesson[\s\S]*NEW/i.test(await library.innerText()));
    await library.locator('div')
        .filter({has: pageC.getByText('Today\'s lesson', {exact: true})})
        .filter({has: pageC.getByRole('button', {name: 'Add', exact: true})})
        .last().getByRole('button', {name: 'Add', exact: true}).click();
    await pageC.keyboard.press('Escape');
    await pageC.getByRole('button', {name: 'Save', exact: true}).click();
    const lessonWidget = pageC.locator('[data-widget-id="todays-lesson"]');
    await lessonWidget.locator('#todays-lesson-concept').waitFor({timeout: 60000});
    const savedC = await db.collection('userpreferences').findOne({userId: userC});
    check('adding it from the library saves it into the layout', (savedC?.dashboardLayout?.widgets ?? []).some((w) => w.id === 'todays-lesson'));
    check('with no topic articles today it teaches the term of the day',
        await lessonWidget.locator('[data-lesson-mode="day"]').count() === 1
        && /Nothing in your topics used a glossary term today/.test(await lessonWidget.innerText()));
    check('…with a link to that term on /learn', await lessonWidget.locator('a[href^="/learn#"]').count() === 1);
    const noHandOff = async () => await lessonWidget.locator('[data-what-these-mean], [data-ask], details').count() === 0;
    check('the widget carries no "What these mean" and no "Ask in chat"', await noHandOff());

    // A followed topic whose article used "fomc" today: the concept, with the headline as text.
    const lessonHash = 900_000_000 + Math.floor(Math.random() * 1_000_000);
    await db.collection('topics').insertOne({userId: userC, name: 'QA Fed', slug: 'qa-fed', keywords: ['fomc'], exclude: [], keywordSetHash: lessonHash, createdAt: new Date(), updatedAt: new Date()});
    const trickyHeadline = 'Fed <b>holds</b> rates & "signals" patience after the FOMC';
    await db.collection('topicarticles').insertOne({
        keywordSetHash: lessonHash, contentHash: lessonHash + 1, headline: trickyHeadline, summary: '', url: 'https://example.com/fomc-holds',
        source: 'Example Wire', sourceType: 'google', datetime: Math.floor(Date.now() / 1000), publishedDate: today, score: 3, matchedTerms: ['fomc'], createdAt: new Date(),
    });
    await pageC.reload({waitUntil: 'load'});
    await lessonWidget.locator('[data-lesson-concept="fomc"]').waitFor({timeout: 30000});
    const conceptText = await lessonWidget.innerText();
    check('an article that used "fomc" today makes the FOMC the lesson', /The FOMC/.test(conceptText) && /1 of today's articles in your topics used this term/.test(conceptText), conceptText.replace(/\s+/g, ' ').slice(0, 160));
    check('…quoting the headline as text, never as markup', conceptText.includes(trickyHeadline) && await lessonWidget.locator('[data-lesson-headline] b').count() === 0);
    check('…linking to the article', await lessonWidget.locator('[data-lesson-headline] a[href="https://example.com/fomc-holds"][rel~="noopener"]').count() === 1);
    await pageC.screenshot({path: `${OUT}07a-todays-lesson-concept.png`, fullPage: true});

    // The first 5% drop: shown while it is fresh, hidden once it is outside the week.
    const accountC = await db.collection('paperaccounts').findOne({userId: userC});
    const accountCId = String(accountC._id);
    const snap = (date, totalValue) => ({accountId: accountCId, userId: userC, date, totalValue, cash: totalValue, holdingsValue: 0, startingBalance: 100_000});
    await db.collection('accountsnapshots').insertMany([snap(isoDaysAgo(3), 100_000), snap(isoDaysAgo(2), 94_000)]);
    await pageC.reload({waitUntil: 'load'});
    await lessonWidget.locator('[data-lesson-moment="first-drawdown"]').waitFor({timeout: 30000});
    const dropText = await lessonWidget.innerText();
    check('a fresh 6% fall from the high is the lesson', /first 5% drop/.test(dropText) && /−6\.0% from the/.test(dropText) && /\+6\.4% to get back/.test(dropText), dropText.replace(/\s+/g, ' ').slice(0, 200));
    check('…with its terms titled from the glossary', await lessonWidget.locator('[data-term="max-drawdown"][title], [data-term="recovery"][title]').count() === 2);
    check('…and still no hand-off on the widget', await noHandOff());
    await db.collection('accountsnapshots').updateOne({accountId: accountCId, date: isoDaysAgo(3)}, {$set: {date: isoDaysAgo(12)}});
    await db.collection('accountsnapshots').updateOne({accountId: accountCId, date: isoDaysAgo(2)}, {$set: {date: isoDaysAgo(11)}});
    await pageC.reload({waitUntil: 'load'});
    await lessonWidget.locator('[data-lesson-concept="fomc"]').waitFor({timeout: 30000});
    check('the same fall moved outside the window no longer shows', await lessonWidget.locator('[data-lesson-moment]').count() === 0);

    // The first dividend: only once it is credited (on or before the watermark).
    const epochC = new Date(accountC.inceptionAt ?? accountC.createdAt).getTime();
    await db.collection('accountincomes').insertOne({
        accountId: accountCId, userId: userC, epoch: epochC, kind: 'dividend', date: isoDaysAgo(1), symbol: 'SPY',
        amount: 18.89, perShare: 1.889, quantity: 10, exDate: isoDaysAgo(6), createdAt: new Date(),
    });
    await db.collection('paperaccounts').updateOne({_id: accountC._id}, {$set: {incomeThrough: isoDaysAgo(2)}});
    await pageC.reload({waitUntil: 'load'});
    await lessonWidget.locator('#todays-lesson-concept').waitFor({timeout: 30000});
    check('a dividend past the watermark is not income yet', await lessonWidget.locator('[data-lesson-moment]').count() === 0);
    await db.collection('paperaccounts').updateOne({_id: accountC._id}, {$set: {incomeThrough: isoDaysAgo(1)}});
    await pageC.reload({waitUntil: 'load'});
    await lessonWidget.locator('[data-lesson-moment="first-dividend"]').waitFor({timeout: 30000});
    const dividendFigure = await lessonWidget.locator('[data-lesson-figure]').innerText();
    check('the credited dividend is the lesson, with its own arithmetic', /^SPY: 10 shares × \$1\.889 = \$18\.89 · paid /.test(dividendFigure), dividendFigure);
    check('…linking to the Income panel', await lessonWidget.locator('a[href="/portfolio#income"]').count() === 1);
    await lessonWidget.locator('#lesson-got-it').click();
    await lessonWidget.locator('[data-lesson-concept="fomc"]').waitFor({timeout: 30000});
    const prefsC = await db.collection('userpreferences').findOne({userId: userC});
    check('Got it stamps the key once', JSON.stringify(prefsC?.learn?.lessonsSeen) === JSON.stringify(['first-dividend']), JSON.stringify(prefsC?.learn?.lessonsSeen));
    await pageC.reload({waitUntil: 'load'});
    await lessonWidget.locator('#todays-lesson-concept').waitFor({timeout: 30000});
    check('a seen moment stays gone', await lessonWidget.locator('[data-lesson-moment]').count() === 0);

    // A followed strategy's rebalance: a monthly check is a moment, a daily one is routine.
    // One state per strategy (unique index): borrow momentum-12-1's and put it back afterwards.
    const priorMomentum = await db.collection('strategystates').findOne({strategyId: 'momentum-12-1'});
    await db.collection('strategystates').updateOne({strategyId: 'momentum-12-1'}, {$set: {
        accountId: priorMomentum?.accountId ?? 'qa-lesson-none', status: 'active', version: priorMomentum?.version ?? '1', launchDate: priorMomentum?.launchDate ?? isoDaysAgo(40),
        lastRunDate: today, lastTradeDate: today, lastRebalanceDate: today, updatedAt: new Date(),
    }, $setOnInsert: {createdAt: new Date()}}, {upsert: true});
    await db.collection('userpreferences').updateOne({userId: userC}, {$set: {followedStrategies: ['golden-cross']}});
    await pageC.reload({waitUntil: 'load'});
    await lessonWidget.locator('#todays-lesson-concept').waitFor({timeout: 30000});
    check('a followed daily strategy\'s check is not a moment', await lessonWidget.locator('[data-lesson-moment]').count() === 0);
    await db.collection('userpreferences').updateOne({userId: userC}, {$set: {followedStrategies: ['golden-cross', 'momentum-12-1']}});
    await pageC.reload({waitUntil: 'load'});
    await lessonWidget.locator('[data-lesson-moment="rebalance"]').waitFor({timeout: 30000});
    const rebalanceText = await lessonWidget.innerText();
    check('a followed monthly strategy\'s rebalance is, by cadence and outcome', /12-1 Momentum|Momentum/.test(rebalanceText) && /first trading day of each month/.test(rebalanceText) && /placed orders/.test(rebalanceText), rebalanceText.replace(/\s+/g, ' ').slice(0, 200));
    check('…linking to the strategy', await lessonWidget.locator('a[href="/strategies/momentum-12-1"]').count() === 1);
    if (priorMomentum) await db.collection('strategystates').replaceOne({strategyId: 'momentum-12-1'}, priorMomentum);
    else await db.collection('strategystates').deleteOne({strategyId: 'momentum-12-1'});
    await pageC.screenshot({path: `${OUT}07-todays-lesson.png`, fullPage: true});

    // The page and the settings editor read the same onboarding facts.
    await pageC.goto(`${BASE}/`, {waitUntil: 'load'});
    await pageC.locator('[data-widget-id]').first().waitFor({timeout: 30000});
    const onDashboard = await pageC.locator('[data-widget-id="getting-started"]').count() === 1;
    await pageC.goto(`${BASE}/settings`, {waitUntil: 'load'});
    await pageC.locator('#dashboard').waitFor({timeout: 30000});
    const settingsText = await pageC.locator('#dashboard').innerText();
    check('/ and /settings agree on the First-week checklist', onDashboard && /First week/.test(settingsText), `dashboard=${onDashboard}`);
    check('…and list Today\'s lesson in the saved layout', /Today's lesson/.test(settingsText));
    await contextC.close();

    // --- Daily quiz: library-only; one question from a recent board, a day counted once ------
    // The board is RSI-2's from yesterday, the only usable one in the ten-day window: today's
    // RSI-2 run is a skipped day, and every other strategy's board is twelve days old. Every
    // askable row carries a reason the decoder reads, so whichever question today's date
    // seeds, its reveal quotes a seeded reason and its gloss.
    await db.collection('strategyruns').deleteMany({});
    const quizExit = 'exit: close 130.00 > SMA5 128.00';
    const quizRows = {
        AAPL: {state: 'enter', reason: rsiReason, gloss: /under the entry level of 10/},
        MSFT: {state: 'watch', reason: 'signal, but no open slot', gloss: /all 5 slots were taken/},
        NVDA: {state: 'exit', reason: quizExit, gloss: /rose above the 5-day average \(128\.00\)/},
    };
    const quizRun = (strategyId, date, extra) => ({
        strategyId, date, asOf: date, mode: 'live', status: 'done', staleCount: 0, universeSize: 40, rebalanceTriggered: true,
        board: [], orders: [], skippedOrders: [], dataIssues: [], equity: 100_000, summary: '', createdAt: new Date(), ...extra,
    });
    await db.collection('strategyruns').insertMany([
        quizRun('rsi2-mean-reversion', isoDaysAgo(1), {
            board: [
                {symbol: 'AAPL', state: 'enter', values: {close: 123.45, rsi2: 3.4, sma5: 126.1, sma200: 110, aboveSma200: true}},
                {symbol: 'MSFT', state: 'watch', values: {close: 410, rsi2: 6.2, sma5: 415, sma200: 380, aboveSma200: true}, note: quizRows.MSFT.reason},
                {symbol: 'NVDA', state: 'exit', values: {close: 130, rsi2: 81.5, sma5: 128, sma200: 100, aboveSma200: true}},
                {symbol: 'KO', state: 'excluded', values: {close: null, rsi2: null, sma5: null, sma200: null, aboveSma200: null}, note: 'needs 200 bars'},
            ],
            orders: [
                {symbol: 'AAPL', side: 'buy', quantity: 160, kind: 'enter', reason: rsiReason, executed: true, price: 123.6},
                {symbol: 'NVDA', side: 'sell', quantity: 10, kind: 'exit', reason: quizExit, executed: true, price: 130},
            ],
        }),
        quizRun('rsi2-mean-reversion', today, {mode: 'skipped', status: 'skipped', summary: 'skipped: stale data'}),
        ...['buy-and-hold-spy', 'sixty-forty', 'golden-cross', 'dual-momentum', 'momentum-12-1', 'donchian-breakout', 'low-volatility'].map((id) =>
            quizRun(id, isoDaysAgo(12), {board: [{symbol: 'SPY', state: 'held', values: {close: 500}}, {symbol: 'QQQ', state: 'watch', values: {close: 400}}]})),
    ]);

    const contextD = await browser.newContext({viewport: {width: 1440, height: 900}});
    const pageD = await contextD.newPage();
    const emailD = await signUp(pageD, 'learnD');
    const userD = await userIdFor(emailD);
    await pageD.locator('[data-widget-id]').first().waitFor({timeout: 30000});
    check('the Daily quiz is not on the default dashboard', await pageD.locator('[data-widget-id="daily-quiz"]').count() === 0);
    await pageD.goto(`${BASE}/?customize=1`, {waitUntil: 'load'});
    await pageD.getByRole('button', {name: /Add widget/i}).first().click();
    const libraryD = pageD.locator('[role="dialog"]');
    await libraryD.waitFor({timeout: 15000});
    check('the library lists the Daily quiz under Learn, badged New', /LEARN[\s\S]*Daily quiz[\s\S]*NEW/i.test(await libraryD.innerText()));
    await libraryD.locator('div')
        .filter({has: pageD.getByText('Daily quiz', {exact: true})})
        .filter({has: pageD.getByRole('button', {name: 'Add', exact: true})})
        .last().getByRole('button', {name: 'Add', exact: true}).click();
    await pageD.keyboard.press('Escape');
    await pageD.getByRole('button', {name: 'Save', exact: true}).click();
    const quizWidget = pageD.locator('[data-widget-id="daily-quiz"]');
    const quiz = quizWidget.locator('#daily-quiz');
    await quiz.waitFor({timeout: 60000});
    const savedD = await db.collection('userpreferences').findOne({userId: userD});
    check('adding it from the library saves it into the layout', (savedD?.dashboardLayout?.widgets ?? []).some((w) => w.id === 'daily-quiz'));

    const [, runMonth, runDay] = isoDaysAgo(1).split('-');
    const runLabel = `${['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'][Number(runMonth) - 1]} ${Number(runDay)}`;
    check('the question comes from the one board inside the window, past today\'s skipped day',
        await quiz.getAttribute('data-quiz-strategy') === 'rsi2-mean-reversion'
        && (await quiz.innerText()).toUpperCase().includes(`RSI-2 MEAN REVERSION · ${runLabel}`.toUpperCase()),
        `${await quiz.getAttribute('data-quiz-strategy')} · ${runLabel}`);
    const template = await quiz.getAttribute('data-quiz-template');
    check('today\'s date seeds one of the three kinds of question', ['which-verdict', 'why-this-verdict', 'which-symbol'].includes(template), template);
    check('no count before the first answer', await quiz.locator('[data-quiz-days]').count() === 0);
    const noHandOffD = async () => await quizWidget.locator('[data-what-these-mean], [data-ask], details').count() === 0;
    check('the widget carries no "What these mean", no "Ask in chat" and no disclosure', await noHandOffD());
    const prompt = await quiz.locator('[data-quiz-prompt]').innerText();
    const optionIds = await quiz.locator('[data-quiz-option]').evaluateAll((els) => els.map((e) => e.getAttribute('data-quiz-option')));
    check('no answer is marked before one is given', await quiz.locator('[data-quiz-correct]').count() === 0 && optionIds.length >= 3, JSON.stringify(optionIds));
    const optionTexts = await quiz.locator('[data-quiz-option]').allInnerTexts();
    if (template === 'which-verdict') {
        const symbol = await quiz.locator('[data-quiz-row]').getAttribute('data-quiz-row');
        check('which verdict: one seeded row with its numbers, the four decisions as options',
            symbol in quizRows && prompt === `What did the rule decide for ${symbol}?` && /RSI\(2\)/.test(await quiz.locator('[data-quiz-row]').innerText())
            && JSON.stringify(optionIds) === JSON.stringify(['enter', 'exit', 'held', 'watch']), `${symbol} · ${prompt}`);
    } else if (template === 'why-this-verdict') {
        check('why this verdict: four plain-English readings, never the raw strings',
            optionTexts.length === 4 && optionTexts.every((t) => !Object.values(quizRows).some((r) => t.trim() === r.reason))
            && /^The rule marked (AAPL|MSFT|NVDA) “(enter|watch|exit)”\. Which reading explains that verdict\?$/.test(prompt),
            `${prompt} · ${optionTexts.join(' | ').slice(0, 300)}`);
    } else {
        check('which symbol: seeded rows with their numbers as options',
            optionIds.every((id) => id in quizRows) && /^Which of these did the rule mark “(enter|watch|exit)”\?$/.test(prompt)
            && optionTexts.every((t) => /RSI\(2\)/.test(t)), `${prompt} · ${optionIds.join(',')}`);
    }

    // The first answer: the reveal is the stored verdict and reason, decoded; the day counts once.
    const waitText = async (locator, pattern, ms = 15000) => {
        const until = Date.now() + ms;
        let text = '';
        while (Date.now() < until) {
            text = (await locator.count()) > 0 ? await locator.first().innerText() : '';
            if (pattern.test(text)) return text;
            await new Promise((r) => setTimeout(r, 200));
        }
        return text;
    };
    const answerWith = async (id) => {
        await Promise.all([
            pageD.waitForResponse((r) => r.request().method() === 'POST' && !!r.request().headers()['next-action'], {timeout: 15000}),
            quiz.locator(`[data-quiz-option="${id}"]`).click(),
        ]);
        await quiz.locator('[data-quiz-reveal]').waitFor({timeout: 15000});
    };
    await answerWith(optionIds[0]);
    const reveal = quiz.locator('[data-quiz-reveal]');
    const revealedSymbol = await reveal.getAttribute('data-quiz-reveal');
    const seeded = quizRows[revealedSymbol];
    const explanation = await reveal.locator('[data-quiz-explanation]').innerText();
    const glossText = (await reveal.locator('[data-reason-gloss]').count()) === 1 ? await reveal.locator('[data-reason-gloss]').innerText() : '';
    check('the reveal quotes the seeded reason', !!seeded && explanation === seeded.reason, `${revealedSymbol}: ${explanation}`);
    check('…decodes it clause by clause', !!seeded && seeded.gloss.test(glossText), glossText.replace(/\s+/g, ' ').slice(0, 200));
    check('…under the stored verdict', !!seeded && await reveal.getAttribute('data-quiz-verdict') === seeded.state);
    const correctIds = await quiz.locator('[data-quiz-correct="true"]').evaluateAll((els) => els.map((e) => e.getAttribute('data-quiz-option')));
    const expectedCorrect = template === 'which-symbol' ? revealedSymbol : seeded?.state;
    check('exactly one option is the rule\'s answer, and it is the stored one', correctIds.length === 1 && correctIds[0] === expectedCorrect, `${correctIds} vs ${expectedCorrect}`);
    check('…about the row or the verdict the question named',
        template === 'which-symbol' ? prompt.includes(`“${seeded?.state}”`) : prompt.includes(revealedSymbol ?? '—'), prompt);
    const outcome = await reveal.locator('[data-quiz-outcome]').innerText();
    check('the outcome says whether the answer matched', (optionIds[0] === correctIds[0]) === /^Matched the rule$/.test(outcome.trim()), outcome);
    check('…and the pick is pressed, the rest locked', await quiz.locator(`[data-quiz-option="${optionIds[0]}"][aria-pressed="true"]`).count() === 1
        && await quiz.locator('[data-quiz-option]:not([disabled])').count() === 0);
    check('…linking to the whole board', await reveal.locator('a[href="/strategies/rsi2-mean-reversion"]').count() === 1);
    check('the first answer counts the day', await waitText(quiz.locator('[data-quiz-days]'), /^Days answered: 1$/) === 'Days answered: 1');
    let prefsD = await db.collection('userpreferences').findOne({userId: userD});
    check('…once, dated today in ET', prefsD?.learn?.quizDaysAnswered === 1 && prefsD?.learn?.quizLastAnsweredDate === today, JSON.stringify(prefsD?.learn));
    check('…and still no hand-off after the reveal', await noHandOffD());
    await pageD.screenshot({path: `${OUT}08-daily-quiz.png`, fullPage: true});

    // Answering again the same day — after a reload, with another option — counts nothing.
    await pageD.reload({waitUntil: 'load'});
    await quiz.waitFor({timeout: 30000});
    check('a reload asks the same question', await quiz.getAttribute('data-quiz-template') === template && (await quiz.locator('[data-quiz-prompt]').innerText()) === prompt);
    check('…and shows the count before an answer', (await quiz.locator('[data-quiz-days]').innerText()) === 'Days answered: 1');
    await answerWith(optionIds[optionIds.length - 1]);
    check('answering twice the same day counts once', await waitText(quiz.locator('[data-quiz-days]'), /^Days answered: \d+$/) === 'Days answered: 1');
    prefsD = await db.collection('userpreferences').findOne({userId: userD});
    check('…in the stored count too', prefsD?.learn?.quizDaysAnswered === 1 && prefsD?.learn?.quizLastAnsweredDate === today, JSON.stringify(prefsD?.learn));

    // A day last counted yesterday: today's first answer counts.
    await db.collection('userpreferences').updateOne({userId: userD}, {$set: {'learn.quizLastAnsweredDate': isoDaysAgo(1)}});
    await pageD.reload({waitUntil: 'load'});
    await quiz.waitFor({timeout: 30000});
    await answerWith(optionIds[0]);
    check('the next day\'s answer counts a second day', await waitText(quiz.locator('[data-quiz-days]'), /^Days answered: 2$/) === 'Days answered: 2');
    prefsD = await db.collection('userpreferences').findOne({userId: userD});
    check('…stored as two, dated today', prefsD?.learn?.quizDaysAnswered === 2 && prefsD?.learn?.quizLastAnsweredDate === today, JSON.stringify(prefsD?.learn));

    // With no usable board in the window: an honest empty state that still shows the count.
    await db.collection('strategyruns').deleteMany({strategyId: 'rsi2-mean-reversion', date: isoDaysAgo(1)});
    await pageD.reload({waitUntil: 'load'});
    await quizWidget.getByText('No question today').waitFor({timeout: 30000});
    const emptyText = await quizWidget.innerText();
    check('twelve-day-old boards and a skipped day ask nothing: the empty state says why',
        await quizWidget.locator('#daily-quiz').count() === 0 && /signal board of the last 10 days/.test(emptyText) && /Days answered: 2/.test(emptyText),
        emptyText.replace(/\s+/g, ' ').slice(0, 200));
    await pageD.goto(`${BASE}/settings`, {waitUntil: 'load'});
    await pageD.locator('#dashboard').waitFor({timeout: 30000});
    check('/settings lists the Daily quiz in the saved layout', /Daily quiz/.test(await pageD.locator('#dashboard').innerText()));
    await contextD.close();

    // --- user E: time in the market on the buy-and-hold page -------------------------------
    // Seeds a V in SPY (a rise to a peak about a year ago, a 30% fall over 60 sessions, a long
    // climb) with no dividends, so the total-return index is the closes, and a flat ^IRX. The
    // bars already stored are put back afterwards, so later suites see the database they expect.
    const pricebars = db.collection('pricebars');
    const savedBars = await pricebars.find({symbol: {$in: ['SPY', '^IRX']}}).toArray();
    try {
        const addDays = (date, n) => { const [y, m, d] = date.split('-').map(Number); return new Date(Date.UTC(y, m - 1, d + n)).toISOString().slice(0, 10); };
        const weekday = (date) => ![0, 6].includes(new Date(`${date}T12:00:00Z`).getUTCDay());
        const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
        const long = (date) => `${MONTHS[Number(date.slice(5, 7)) - 1]} ${Number(date.slice(8, 10))}, ${date.slice(0, 4)}`;
        const cents = (x) => Math.round(x * 100);
        const money = (c) => `$${(c / 100).toLocaleString('en-US', {minimumFractionDigits: 2, maximumFractionDigits: 2})}`;
        const parseMoney = (text) => { const m = /^([+−]?)\$([\d,]+\.\d{2})$/.exec(text.trim()); return m ? (m[1] === '−' ? -1 : 1) * Math.round(Number(m[2].replace(/,/g, '')) * 100) : NaN; };
        const addMonths = (date, k) => {
            const [y, m, d] = date.split('-').map(Number);
            const first = new Date(Date.UTC(y, m - 1 + k, 1));
            const last = new Date(Date.UTC(first.getUTCFullYear(), first.getUTCMonth() + 1, 0)).getUTCDate();
            return new Date(Date.UTC(first.getUTCFullYear(), first.getUTCMonth(), Math.min(d, last))).toISOString().slice(0, 10);
        };

        const todayE = isoDaysAgo(0);
        const sessions = [];
        for (let d = addDays(todayE, -800); d < todayE; d = addDays(d, 1)) if (weekday(d)) sessions.push(d);
        const N = sessions.length;
        const P = N - 250;             // the peak, about a year back
        const T = P + 60;              // the low, 60 sessions later
        const close = (i) => (i <= P ? 500 - (P - i) * 0.25 : i <= T ? 500 - (i - P) * 2.5 : 350 + (i - T) * 1.5);
        const PEAK_DATE = sessions[P];
        const LOW_DATE = sessions[T];
        const LAST = sessions[N - 1];
        await pricebars.deleteMany({symbol: {$in: ['SPY', '^IRX']}});
        const bar = (symbol, date, value) => ({symbol, date, close: value, open: value, high: value, low: value, source: 'yahoo', dividend: 0});
        await pricebars.insertMany([...sessions.map((d, i) => bar('SPY', d, close(i))), ...sessions.map((d) => bar('^IRX', d, 4.07))]);

        const contextE = await browser.newContext({viewport: {width: 1440, height: 900}});
        const pageE = await contextE.newPage();
        const emailE = await signUp(pageE, 'learnE');
        const userE = await userIdFor(emailE);
        await pageE.locator('[data-widget-id]').first().waitFor({timeout: 30000});
        let accountE = null;
        for (let i = 0; i < 30 && !accountE; i++) { accountE = await db.collection('paperaccounts').findOne({userId: userE}); if (!accountE) await pageE.waitForTimeout(1000); }
        await db.collection('paperaccounts').updateOne({_id: accountE._id}, {$set: {inceptionAt: new Date(`${PEAK_DATE}T16:00:00Z`)}});

        const panel = pageE.locator('#time-in-market');
        const openPage = async (query = '') => {
            await pageE.goto(`${BASE}/strategies/buy-and-hold-spy${query}`, {waitUntil: 'load'});
            await panel.waitFor({timeout: 60000});
        };
        const tiles = async (way) => {
            const read = async (i) => (await pageE.locator(`#time-in-market-${way} [data-tile="${i}"]`).innerText()).split('\n').map((s) => s.trim()).filter(Boolean);
            const [end, change, under] = [await read(0), await read(1), await read(2)];
            return {end: end[1], putIn: (end[2] ?? '').replace(/ put in$/, ''), change: change[1], pct: change[2] ?? '', under: under[1], underHint: under[2] ?? ''};
        };
        const addsUp = (t) => parseMoney(t.end) - parseMoney(t.putIn) === parseMoney(t.change);

        await openPage();
        check('buy-and-hold carries Time in the market, starting on the account\'s inception', await pageE.inputValue('#time-in-market-from') === PEAK_DATE
            && (await panel.locator('[data-testid="time-in-market-source"]').innerText()) === 'Starts the day your first paper account opened.');
        check('…over the seeded window', (await pageE.locator('#time-in-market-window').innerText()) === `$10,000 each way · ${long(PEAK_DATE)} → ${long(LAST)} · ${N - P} trading days`,
            await pageE.locator('#time-in-market-window').innerText());
        check('three ways render side by side', await pageE.locator('#time-in-market-ways > *').count() === 3
            && await pageE.locator('#time-in-market-ways [data-term="lump-sum"][title], #time-in-market-ways [data-term="dollar-cost-averaging"][title], #time-in-market-ways [data-term="cash-only"][title]').count() === 3);

        const lumpPeak = await tiles('lumpSum');
        check('all at once from the peak: the closes\' own ratio, to the cent', parseMoney(lumpPeak.end) === cents(10_000 * close(N - 1) / close(P)) && lumpPeak.putIn === '$10,000.00',
            `${lumpPeak.end} vs ${money(cents(10_000 * close(N - 1) / close(P)))}`);
        const firstBack = sessions.findIndex((d, i) => i > T && close(i) >= 500);
        check('…below the dollars put in from the day after the peak until the climb back', lumpPeak.under === `${firstBack - P - 1} of ${N - P} days`
            && lumpPeak.underHint === `longest ${long(sessions[P + 1])} → ${long(sessions[firstBack - 1])}, ${firstBack - P - 1} trading days`, `${lumpPeak.under} · ${lumpPeak.underHint}`);
        const f = (1 + (365 * 0.0407 / (360 - 91 * 0.0407) - 0.0025)) ** (1 / 365) - 1;
        const days = Math.round((Date.parse(`${LAST}T00:00:00Z`) - Date.parse(`${PEAK_DATE}T00:00:00Z`)) / 86_400_000) + 1;
        const cashPeak = await tiles('cashOnly');
        check('cash only: daily compounding at the seeded rate for every calendar day, to the cent', parseMoney(cashPeak.end) === cents(10_000 * (1 + f) ** days)
            && cashPeak.under === `0 of ${N - P} days` && cashPeak.underHint === 'not one trading day', `${cashPeak.end} vs ${money(cents(10_000 * (1 + f) ** days))}`);
        const dca = await tiles('dollarCostAverage');
        let deposits = 0;
        while (addMonths(PEAK_DATE, deposits) <= LAST) deposits++;
        check('monthly deposits: the whole amount, in one deposit a month', dca.putIn === '$10,000.00'
            && (await pageE.locator('#time-in-market-dollarCostAverage').innerText()).includes(`$10,000 in ${deposits} monthly deposits into SPY`));
        check('every way\'s printed end minus what went in is its printed change', [lumpPeak, cashPeak, dca].every(addsUp), JSON.stringify([lumpPeak, cashPeak, dca].map((t) => [t.end, t.putIn, t.change])));
        check('…and the printed percentage is that change over what went in', [lumpPeak, cashPeak, dca].every((t) => {
            const pct = Math.round(parseMoney(t.change) / parseMoney(t.putIn) * 10_000) / 100;
            return t.pct === `${pct > 0 ? '+' : pct < 0 ? '−' : ''}${Math.abs(pct).toFixed(2)}% of the dollars put in`;
        }), [lumpPeak, cashPeak, dca].map((t) => t.pct).join(' | '));
        const chart = panel.locator('[data-testid="dollar-chart"]');
        check('the chart draws the three ways as dollars per dollar put in', await chart.locator('path[data-line]').count() === 3
            && (await chart.locator('[data-line="lumpSum"] [data-line-value]').innerText()) === `$${(close(N - 1) / close(P)).toFixed(2)}`);
        const panelText = await panel.innerText();
        check('"growth of each dollar contributed" is said once, the caveat once', (panelText.match(/Growth of each dollar contributed/g) ?? []).length === 1
            && (panelText.match(/In hindsight/g) ?? []).length === 1);
        check('one disclosure, "Why the start date matters", holding the definitions', await panel.locator('details').count() === 1
            && /Why the start date matters/.test(await panel.locator('details summary').innerText()));
        await panel.locator('details').evaluate((d) => { d.open = true; });
        const rows = panel.locator('[data-testid="time-in-market-table"] tbody tr');
        check('…with earlier starts a quarter apart, each a link to that start', await rows.count() >= 3
            && (await rows.first().locator('a').getAttribute('href')).startsWith('/strategies/buy-and-hold-spy?from='), String(await rows.count()));
        await pageE.screenshot({path: `${OUT}09-time-in-market.png`, fullPage: true});

        // A start inside the dip: the native form, then the same three ways from the low.
        await pageE.fill('#time-in-market-from', LOW_DATE);
        await Promise.all([pageE.waitForURL(new RegExp(`from=${LOW_DATE}`), {timeout: 30000}), pageE.click('#time-in-market-form button[type="submit"]')]);
        await panel.waitFor({timeout: 60000});
        const lumpLow = await tiles('lumpSum');
        check('a start inside the dip changes the numbers', parseMoney(lumpLow.end) === cents(10_000 * close(N - 1) / close(T)) && lumpLow.end !== lumpPeak.end
            && lumpLow.under === `0 of ${N - T} days`, `${lumpLow.end} · ${lumpLow.under}`);
        check('…and a typed start says nothing about the account', await panel.locator('[data-testid="time-in-market-source"]').count() === 0);

        await openPage('?from=not-a-date');
        check('a malformed ?from= falls back to the inception date', await pageE.inputValue('#time-in-market-from') === PEAK_DATE && await panel.locator('[data-testid="time-in-market-moved"]').count() === 0);
        await openPage('?from=1990-01-01');
        check('a start before the stored history is clamped, and says so', /^1990-01-01 is outside the stored range; showing /.test(await panel.locator('[data-testid="time-in-market-moved"]').innerText())
            && (await pageE.locator('#time-in-market-window').innerText()).includes(`${long(sessions[0])} → ${long(LAST)}`));

        // No stored ^IRX: the ways that hold cash cannot be priced — a dash, never a zero.
        await pricebars.deleteMany({symbol: '^IRX'});
        await openPage();
        const cashNoRate = await tiles('cashOnly');
        check('removing ^IRX shows — for cash only', cashNoRate.end === '—' && cashNoRate.change === '—' && cashNoRate.under === '—', JSON.stringify(cashNoRate));
        check('…says why once, and keeps all at once, which never holds cash', /No usable T-bill rate is stored for /.test(await panel.locator('[data-testid="time-in-market-rate-gap"]').innerText())
            && parseMoney((await tiles('lumpSum')).end) === cents(10_000 * close(N - 1) / close(P))
            && await panel.locator('[data-testid="dollar-chart"] path[data-line="cashOnly"]').count() === 0);

        await pageE.goto(`${BASE}/strategies/golden-cross`, {waitUntil: 'load'});
        await pageE.locator('#strategy-explainer').waitFor({timeout: 30000});
        check('no other strategy page carries it', await pageE.locator('#time-in-market').count() === 0);
        await contextE.close();
    } finally {
        await pricebars.deleteMany({symbol: {$in: ['SPY', '^IRX']}});
        if (savedBars.length > 0) await pricebars.insertMany(savedBars);
    }
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
