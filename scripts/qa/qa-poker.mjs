// The poker solver (/poker; lib/poker, components/poker), keyless: everything is worked out in the
// browser, so the suite checks the page's figures against the same modules run in Node through
// jiti. The worker engine and the page-thread one (?engine=main) both give AsAh against KsKh exactly
// (1,410,336 wins and 9,308 ties over 1,712,304 boards); a flop spot matches Node; Monte Carlo
// repeats itself for a seed and lands near the table; Stop answers within a second; push/fold at
// 10 bb matches a Node solve, plays everything at 1 bb, and widens with an ante; pot odds read
// 25% and 66.7% for a half-pot bet; the river's polarized example bluffs and calls at its closed form
// on both engines. Then the range editor, the session across tabs, a phone's width and the no-advice
// list over every tab's text.
// Run: npm run qa -- poker   (the harness: README.md)
import {chromium} from 'playwright';
import {readFileSync} from 'node:fs';
import {createJiti} from 'jiti';
import {BASE, REPO_ROOT, check, outDir, signUp, summary} from './lib.mjs';

const OUT = outDir('poker');
const jiti = createJiti(import.meta.url, {alias: {'@': REPO_ROOT.replace(/\/$/, '')}, fsCache: false});
const {findBanned} = await jiti.import(`${REPO_ROOT}lib/learn/banned.ts`);
const {equityJob, runToEnd} = await jiti.import(`${REPO_ROOT}lib/poker/equity.ts`);
const {pushFoldJob} = await jiti.import(`${REPO_ROOT}lib/poker/pushfold.ts`);
const {decodePreflop} = await jiti.import(`${REPO_ROOT}lib/poker/preflop.ts`);
const {parseRange} = await jiti.import(`${REPO_ROOT}lib/poker/range.ts`);
const {parseCardList, classFromLabel} = await jiti.import(`${REPO_ROOT}lib/poker/cards.ts`);
const table = decodePreflop(JSON.parse(readFileSync(`${REPO_ROOT}lib/poker/data/preflop-equity.json`, 'utf8')));

const nodeEquity = (a, b, board = '', method = 'auto', seed = 1) => runToEnd(equityJob({
    ranges: [parseRange(a).range, parseRange(b).range], board: parseCardList(board).cards, dead: [], method, seed,
}, table));

const browser = await chromium.launch({channel: 'chrome'});
const errors = [];
const watch = (page) => {
    page.on('pageerror', (error) => errors.push(String(error)));
    page.on('console', (message) => {
        if (message.type() === 'error') errors.push(message.text());
    });
};

const equityOf = async (page) => {
    const result = page.locator('[data-equity-result="done"] [data-equity-value]');
    return {
        equity: Number(await result.getAttribute('data-equity-value')),
        win: Number(await result.getAttribute('data-equity-win')),
        tie: Number(await result.getAttribute('data-equity-tie')),
        method: await result.getAttribute('data-equity-method-used'),
        boards: Number(await result.getAttribute('data-equity-boards-used')),
        samples: Number(await result.getAttribute('data-equity-samples')),
        text: await page.locator('[data-equity-result]').innerText(),
    };
};
const setSpot = async (page, a, b, board = '', method = 'auto') => {
    await page.locator('[data-range-text="a"]').fill(a);
    await page.locator('[data-range-text="b"]').fill(b);
    await page.locator('[data-cards-field="board"]').fill(board);
    await page.locator('[data-equity-method]').selectOption(method);
};
const runSpot = async (page) => {
    await page.locator('[data-equity-run]').click();
    await page.locator('[data-equity-result="done"] [data-equity-value]').waitFor({timeout: 60000});
    return equityOf(page);
};

try {
    const page = await browser.newPage({viewport: {width: 1440, height: 900}});
    watch(page);
    // caret: 'initial' leaves the inputs alone: hiding the caret writes a style React would see at hydration.
    const shot = (n) => page.screenshot({path: `${OUT}${n}.png`, fullPage: true, caret: 'initial'});
    await signUp(page, 'poker', {stay: true});

    // --- the page and its engine ------------------------------------------------------------
    await page.goto(`${BASE}/learn`, {waitUntil: 'load'});
    const learnTabs = await page.$$eval('[data-section-tabs="learn"] a', (as) => as.map((a) => a.getAttribute('href')));
    check('Learn carries Games and the Poker solver', learnTabs.join(',') === '/learn,/games,/poker', learnTabs.join(','));

    await page.goto(`${BASE}/poker`, {waitUntil: 'load'});
    await page.locator('[data-poker-tab="equity"]').waitFor({timeout: 30000});
    check('/poker opens on Equity, under one h1', await page.locator('h1').count() === 1 && /poker solver/i.test(await page.locator('h1').innerText()));
    check('…with four tabs', (await page.$$eval('[role="tablist"] [role="tab"]', (tabs) => tabs.map((t) => t.getAttribute('data-tab')))).join(',') === 'equity,push-fold,pot-odds,river');
    check('…and lights the Poker solver tab under Learn', await page.locator('[data-section-tabs="learn"] a[href="/poker"][aria-current="page"]').count() === 1);
    await page.locator('[data-poker-engine="worker"]').waitFor({timeout: 15000});
    check('the solver runs in a Web Worker', true);

    // --- AsAh against KsKh, every board, on both engines -----------------------------------
    await setSpot(page, 'AsAh', 'KsKh');
    check('the plan names every board, 1,712,304 of them', await page.locator('[data-equity-plan="exact"][data-equity-boards="1712304"]').count() === 1,
        await page.locator('[data-equity-plan]').innerText().catch(() => ''));
    const worker = await runSpot(page);
    check('the worker gives AsAh against KsKh exactly: 1,410,336 wins and 9,308 ties over 1,712,304 boards',
        worker.method === 'exact' && worker.boards === 1_712_304 && Math.round(worker.win * worker.boards) === 1_410_336 && Math.round(worker.tie * worker.boards) === 9_308,
        JSON.stringify({...worker, text: undefined}));
    check('…and prints 82.64% and 17.36%', worker.text.includes('82.64%') && worker.text.includes('17.36%'));
    await shot('01-equity-exact');

    const main = await browser.newPage({viewport: {width: 1440, height: 900}});
    watch(main);
    await main.context().addCookies(await page.context().cookies());
    await main.goto(`${BASE}/poker?engine=main`, {waitUntil: 'load'});
    await main.locator('[data-poker-engine="main"]').waitFor({timeout: 15000});
    await setSpot(main, 'AsAh', 'KsKh');
    const onPage = await runSpot(main);
    check('the page-thread engine gives the same integers', onPage.equity === worker.equity && onPage.win === worker.win && onPage.tie === worker.tie && onPage.boards === worker.boards,
        `${onPage.equity} vs ${worker.equity}`);
    check('…and keeps ?engine=main on its tab links', await main.locator('[role="tab"][data-tab="push-fold"]').getAttribute('href') === '/poker?tab=push-fold&engine=main');
    await main.close();

    // --- a flop spot, against Node -------------------------------------------------------------
    await setSpot(page, 'AA, KK, AKs', 'QQ+, AQs+, 87s', 'Ah 7c 2d');
    const flop = await runSpot(page);
    const flopNode = nodeEquity('AA, KK, AKs', 'QQ+, AQs+, 87s', 'Ah 7c 2d');
    check('a flop spot with shared hands equals the same enumeration in Node', flop.method === 'exact' && Math.abs(flop.equity - flopNode.equity) < 1e-12,
        `${flop.equity} vs ${flopNode.equity}`);
    check('…and draws a heat grid of the first side\'s classes', await page.locator('[data-hand-grid="equity-heat"] [data-class-id]').count() === 169);

    // --- Monte Carlo: seeded, repeatable, near the table ------------------------------------------
    await setSpot(page, 'QQ', 'AKs', '', 'monte-carlo');
    await page.locator('[data-equity-seed]').fill('7');
    const first = await runSpot(page);
    const again = await runSpot(page);
    const exactQQ = table.equity(classFromLabel('QQ'), classFromLabel('AKs'));
    const stdErr = Number((/± ([\d.]+) points/.exec(first.text) ?? [])[1]) / 100;
    check('Monte Carlo with seed 7 gives the same figure twice', first.method === 'monte-carlo' && first.equity === again.equity && first.samples === again.samples, `${first.equity} · ${again.equity}`);
    check('…within four standard errors of the table', Math.abs(first.equity - exactQQ) < 4 * stdErr, `${first.equity} vs ${exactQQ}, SE ${stdErr}`);
    check('…the same figure Node draws from the seed', Math.abs(first.equity - nodeEquity('QQ', 'AKs', '', 'monte-carlo', 7).equity) < 1e-12);

    // --- Stop ----------------------------------------------------------------------------------
    await setSpot(page, 'random', 'random', '', 'exact');
    await page.locator('[data-equity-run]').click();
    await page.locator('[data-equity-stop]').waitFor({timeout: 10000});
    await page.waitForTimeout(800);
    const stopAt = Date.now();
    await page.locator('[data-equity-stop]').click();
    await page.locator('[data-equity-result="stopped"]').waitFor({timeout: 5000});
    const stopMs = Date.now() - stopAt;
    check('Stop answers within a second', stopMs < 1000, `${stopMs} ms`);
    check('…and a stopped enumeration shows no figure', await page.locator('[data-equity-stopped="none"]').count() === 1);
    await shot('02-equity-stopped');

    // --- the range editor -----------------------------------------------------------------------
    await setSpot(page, 'QQ+', 'random');
    const pressed = () => page.locator('[data-hand-grid="a"] [aria-pressed="true"]').count();
    check('typing QQ+ lights three cells', await pressed() === 3);
    await page.locator(`[data-hand-grid="a"] [data-class-id="${classFromLabel('AKs')}"]`).click();
    check('a click adds a cell and rewrites the text', await pressed() === 4 && await page.locator('[data-range-text="a"]').inputValue() === 'QQ+, AKs');
    await page.locator(`[data-hand-grid="a"] [data-class-id="${classFromLabel('AKs')}"]`).focus();
    await page.keyboard.press('Enter');
    check('…Enter on a focused cell takes it out again', await pressed() === 3 && await page.locator('[data-range-text="a"]').inputValue() === 'QQ+');
    await page.locator('[data-range-top="a"]').fill('10');
    const topCombos = Number(await page.locator('[data-range-combos="a"]').getAttribute('data-combos'));
    check('Top 10% takes the strongest tenth of all combinations', topCombos >= 132.6 && topCombos < 160, String(topCombos));
    await page.locator('[data-range-text="a"]').fill('QQ+, XYZ');
    check('an unreadable token is named, the rest still read', /"XYZ" is not a hand/.test(await page.locator('[data-range-issues="a"]').innerText()) && await pressed() === 3);
    await page.locator('[data-range-clear="a"]').click();
    check('Clear empties the range, and the plan says why it cannot run',
        await pressed() === 0 && await page.locator('[data-equity-run]').isDisabled() && /no hand left/i.test(await page.locator('[data-equity-issues]').innerText()));
    check('the equity tab says nothing that advises', findBanned(await page.locator('main').innerText(), 'copy').length === 0);

    // --- the session across tabs ---------------------------------------------------------------
    await setSpot(page, 'AA', 'KK');
    const aaKk = await runSpot(page);
    check('AA against KK comes from the preflop table at once, 81.95%', aaKk.method === 'table' && Math.abs(aaKk.equity - 0.81946) < 1e-9 && aaKk.text.includes('81.95%'));
    await page.locator('[role="tab"][data-tab="push-fold"]').click();
    await page.locator('[data-poker-tab="push-fold"]').waitFor({timeout: 15000});

    // --- push or fold -------------------------------------------------------------------------
    await page.locator('[data-push-fold-status="solved"]').waitFor({timeout: 30000});
    const shares = async () => ({
        push: Number(await page.locator('[data-push-fold-result]').getAttribute('data-push-share')),
        call: Number(await page.locator('[data-push-fold-result]').getAttribute('data-call-share')),
        key: await page.locator('[data-push-fold-result]').getAttribute('data-push-fold-result'),
    });
    const ten = await shares();
    const tenNode = runToEnd(pushFoldJob({stack: 10, ante: 0}, table));
    check('push or fold at 10 bb matches a Node solve', ten.key === '10:0' && Math.abs(ten.push - tenNode.pushShare) < 1e-6 && Math.abs(ten.call - tenNode.callShare) < 1e-6,
        `${ten.push} / ${ten.call} vs ${tenNode.pushShare} / ${tenNode.callShare}`);
    check('…about 58% pushed and 37% called', /58\.\d%/.test(await page.locator('[data-push-fold-result]').innerText()) && /37\.\d%/.test(await page.locator('[data-push-fold-result]').innerText()));
    check('…two charts of 169 cells', await page.locator('[data-hand-grid="push"] [data-class-id]').count() === 169 && await page.locator('[data-hand-grid="call"] [data-class-id]').count() === 169);
    await shot('03-push-fold');
    const solvedAt = async (stack, ante) => {
        await page.locator('[data-push-fold-slider]').fill(String(stack));
        await page.locator('[data-push-fold-ante]').selectOption(String(ante));
        await page.locator(`[data-push-fold-result="${stack}:${ante}"]`).waitFor({timeout: 30000});
        await page.locator('[data-push-fold-status="solved"]').waitFor({timeout: 30000});
        return shares();
    };
    const one = await solvedAt(1, 0);
    check('at 1 bb both seats play every hand', one.push === 1 && one.call === 1, JSON.stringify(one));
    const anteZero = await solvedAt(10, 0);
    const anteQuarter = await solvedAt(10, 0.25);
    check('a quarter-blind ante widens both seats at 10 bb', anteQuarter.push >= anteZero.push && anteQuarter.call >= anteZero.call, `${JSON.stringify(anteZero)} → ${JSON.stringify(anteQuarter)}`);
    await page.locator('[data-push-fold-slider]').fill('1');
    check('a stack below the big blind and the ante is named', /starts at 1\.25 bb/.test(await page.locator('[data-push-fold-issues]').innerText()));
    check('the push/fold tab says nothing that advises', findBanned(await page.locator('main').innerText(), 'copy').length === 0);

    await page.locator('[role="tab"][data-tab="equity"]').click();
    await page.locator('[data-poker-tab="equity"]').waitFor({timeout: 15000});
    check('coming back to Equity shows its last result', Number(await page.locator('[data-equity-result="done"] [data-equity-value]').getAttribute('data-equity-value')) === aaKk.equity
        && await page.locator('[data-range-text="a"]').inputValue() === 'AA');

    // --- pot odds -------------------------------------------------------------------------------
    await page.goto(`${BASE}/poker?tab=pot-odds`, {waitUntil: 'load'});
    await page.locator('[data-pot-odds-result]').waitFor({timeout: 15000});
    const potText = await page.locator('[data-pot-odds-result]').innerText();
    check('pot odds of 100 and 50 read 25% to call and 66.7% to defend', /25\.0%/.test(potText) && /66\.7%/.test(potText) && /3 to 1/.test(potText), potText.replace(/\s+/g, ' '));
    await page.locator('[data-pot-odds-field="equity"]').fill('30');
    check('…and a call at 30% equity comes out +10', /\+10\.00/.test(await page.locator('[data-pot-odds-result]').innerText()));
    await page.locator('[data-pot-odds-field="bet"]').fill('0');
    check('a bet of 0 is named', /bet is a number above 0/i.test(await page.locator('[data-pot-odds-issues]').innerText()));
    check('the pot odds tab says nothing that advises', findBanned(await page.locator('main').innerText(), 'copy').length === 0);

    // --- the river -------------------------------------------------------------------------------
    // The polarized example has a closed form: at a bet of 7.5 into 10 the bettor bluffs 7.5/25 = 30%
    // of its bets and the bluff-catcher calls 10/17.5 = 57.1% of the time. The page shows each
    // class's strategy in its cell's title, to a tenth of a point.
    const titleIn = (target, grid, label) => target.locator(`[data-hand-grid="${grid}"] [data-class-id="${classFromLabel(label)}"]`).getAttribute('title');
    const shareIn = (title, action) => Number(new RegExp(`${action} ([\\d.]+)%`).exec(title ?? '')?.[1]) / 100;
    const combosIn = (title) => Number(/: ([\d.]+) combos/.exec(title ?? '')?.[1]);
    const solveRiver = async (target, preset) => {
        await target.locator(`[data-river-preset="${preset}"]`).click();
        await target.locator('[data-river-solve]').click();
        await target.locator('[data-river-result="done"] [data-river-iterations]').waitFor({timeout: 120000});
    };
    const bluffShareOn = async (target) => {
        const aces = await titleIn(target, 'river-0', 'AA');
        const air = await titleIn(target, 'river-0', '65s');
        const bluffs = combosIn(air) * shareIn(air, 'Bet 7.5');
        return {share: bluffs / (bluffs + combosIn(aces) * shareIn(aces, 'Bet 7.5')), aces, air};
    };
    await page.goto(`${BASE}/poker?tab=river`, {waitUntil: 'load'});
    await page.locator('[data-poker-tab="river"]').waitFor({timeout: 30000});
    await page.locator('[data-poker-engine="worker"]').waitFor({timeout: 15000});
    await page.locator('[data-river-preset="polarized"]').click();
    check('the polarized example builds its three-decision tree', await page.locator('[data-river-summary="3"]').count() === 1,
        await page.locator('[data-river-summary]').innerText().catch(() => ''));
    await solveRiver(page, 'polarized');
    const toyWorker = await bluffShareOn(page);
    check('the polarized example bluffs 29–31% of its bets', toyWorker.share >= 0.29 && toyWorker.share <= 0.31, `${toyWorker.share} · ${toyWorker.aces} · ${toyWorker.air}`);
    const toyExploitability = Number(await page.locator('[data-river-exploitability]').getAttribute('data-river-exploitability'));
    check('…and is within 0.5% of the pot of the equilibrium', toyExploitability < 0.5, String(toyExploitability));
    await page.locator('[data-river-goto][data-river-action="bet"]').click();
    await page.locator('[data-hand-grid="river-1"]').waitFor({timeout: 10000});
    const catcher = await titleIn(page, 'river-1', 'KQs');
    check('Bet 7.5 opens the in-position grid, which calls 56–58.5% of the time', shareIn(catcher, 'Call 7.5') >= 0.56 && shareIn(catcher, 'Call 7.5') <= 0.585, catcher);
    await shot('05-river-polarized');
    await page.locator('[data-river-crumb="0"]').click();
    check('…and the breadcrumb leads back to the start of the river', await page.locator('[data-river-node="0"] [data-hand-grid="river-0"]').count() === 1);

    const mainRiver = await browser.newPage({viewport: {width: 1440, height: 900}});
    watch(mainRiver);
    await mainRiver.context().addCookies(await page.context().cookies());
    await mainRiver.goto(`${BASE}/poker?tab=river&engine=main`, {waitUntil: 'load'});
    await mainRiver.locator('[data-poker-engine="main"]').waitFor({timeout: 15000});
    await solveRiver(mainRiver, 'polarized');
    const toyMain = await bluffShareOn(mainRiver);
    check('the page-thread engine solves it to the same strategy', toyMain.aces === toyWorker.aces && toyMain.air === toyWorker.air, `${toyMain.air} vs ${toyWorker.air}`);
    await mainRiver.close();

    await solveRiver(page, 'realistic');
    const realistic = Number(await page.locator('[data-river-exploitability]').getAttribute('data-river-exploitability'));
    check('a realistic spot solves to under 0.3% of the pot', realistic <= 0.3, String(realistic));
    check('…and draws its exploitability as it fell', await page.locator('[data-exploitability-chart]').count() === 1);
    await shot('06-river-realistic');
    await page.locator('[data-river-pot]').fill('12');
    check('editing the spot marks the result as for the spot as it was', await page.locator('[data-river-stale]').count() === 1);
    check('the river tab says nothing that advises', findBanned(await page.locator('main').innerText(), 'copy').length === 0);

    // --- a phone ---------------------------------------------------------------------------------
    const phone = await browser.newPage({viewport: {width: 390, height: 844}});
    watch(phone);
    await phone.context().addCookies(await page.context().cookies());
    for (const tab of ['equity', 'push-fold', 'pot-odds', 'river']) {
        await phone.goto(`${BASE}/poker?tab=${tab}`, {waitUntil: 'load'});
        await phone.locator(`[data-poker-tab="${tab}"]`).waitFor({timeout: 30000});
        if (tab === 'push-fold') await phone.locator('[data-push-fold-status="solved"]').waitFor({timeout: 30000});
        check(`the ${tab} tab fits a phone without sideways scroll`, await phone.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1));
        await phone.screenshot({path: `${OUT}04-phone-${tab}.png`, fullPage: true, caret: 'initial'});
    }
    await phone.close();

    check('no page error or console error on the way', errors.length === 0, errors.slice(0, 3).join(' | '));
} finally {
    await browser.close();
}

summary('poker');
