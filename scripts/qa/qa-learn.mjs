// The learn surfaces, keyless: the First-week checklist reads its own progress and
// leaves; /learn and the ⌘K palette reach the glossary; a strategy page carries the
// beginner line, column definitions led by "Read this board" (its top row in plain words,
// hidden while the quiz is open), Guess the Verdict and "What the rule saw"; an
// "Ask in chat" link prefills the assistant without sending; a rule's reason is decoded
// clause by clause wherever a fill or an order shows it, and nowhere else. Today's lesson,
// added from the widget library, teaches the term of the day, then a concept today's topic
// articles used, then a fresh first from the account (a drop, a credited dividend) until
// "Got it", then a followed monthly strategy's rebalance. Run against the harness in
// README.md (in-memory Mongo on :27117 + `npm run dev`).
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
    check('verdicts are visible before the quiz opens', (await verdictVisible()).every((v) => v === 'visible'));
    await page.locator('#verdict-quiz summary').click();
    await page.waitForTimeout(300);
    check('the verdict column hides while guessing', (await verdictVisible()).every((v) => v === 'hidden'));
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
    check('…and decodes nothing it no longer has', await replays.nth(1).locator('[data-reason-gloss]').count() === 0);
    await shot('04-replay');

    const decided = page.locator('#latest-decision details[data-decoded]');
    check('each planned order in the latest decision has one "What the rule saw"', await decided.count() === 2);
    check('…outside the board, which keeps no disclosure of its own', await page.locator('#signal-board details').count() === 0);
    await decided.first().locator('summary').click();
    const decidedText = await decided.first().innerText();
    check('…which reads the reason in the rule\'s own parameters', /one of its 11 equal slots/.test(decidedText) && /50-day average/.test(decidedText), decidedText.replace(/\s+/g, ' ').slice(0, 160));
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
        (await composer.inputValue()) === `Explain this reason from the Golden Cross Sectors strategy for XLF: ${enterReason}`, await composer.inputValue());

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
