// The chat panel (components/chat, app/api/chat): it opens with the composer focused, a failed
// request shows human copy and a Try again that works, the read-only portfolio tool creates no
// account, a conversation outlives closing the panel and a cleared one stays cleared, and model
// markdown renders as a list with links neutralised and images dropped. Also the destructive
// actions that confirm first: Reset Account on /portfolio and Reset to default on /settings. Then
// the robot launcher bottom-right with its SVG mascot, and its tips on /topics under a fake clock.
// Run: npm run qa -- chat   (the harness: README.md)
import {chromium} from 'playwright';
import {MongoClient} from 'mongodb';
import {createJiti} from 'jiti';
import {BASE, MONGO, REPO_ROOT, check, outDir, signUp, summary} from './lib.mjs';

const OUT = outDir('chat');

const browser = await chromium.launch({channel: 'chrome'});
const page = await browser.newPage({viewport: {width: 1440, height: 900}});
const shot = (n) => page.screenshot({path: `${OUT}${n}.png`, fullPage: true});
const mongo = new MongoClient(MONGO);

try {
    await mongo.connect();
    const db = mongo.db();

    const email = await signUp(page, 'AI');
    // Scoped to this user: other harness scripts seed rows for their own users.
    const me = await db.collection('user').findOne({email});
    const userId = String(me._id);

    const openChat = async () => {
        await page.locator('button[aria-label*="ssistant" i], button[aria-label*="chat" i]').first().click();
        await page.waitForSelector('[role="dialog"][aria-label="AeroTrade assistant"]', {timeout: 10000});
    };

    // --- the portfolio tool must not create an account just by being asked ----------
    const accountsBefore = await db.collection('paperaccounts').countDocuments();
    await openChat();
    check('chat panel opens', await page.locator('[role="dialog"][aria-label="AeroTrade assistant"]').count() === 1);
    check('composer is focused on open',
        await page.evaluate(() => document.activeElement?.getAttribute('placeholder')) === 'Query market data...');

    // --- error recovery: the panel used to go permanently deaf after one failure ----
    await page.route('**/api/chat', (route) => route.abort());
    await page.locator('[role="dialog"] input').fill('how am I doing?');
    await page.keyboard.press('Enter');
    await page.waitForTimeout(2500);
    const banner = page.locator('[role="dialog"] >> text=/connection|couldn.t finish|unavailable/i');
    check('a failed request shows human copy, not a wire message', await banner.count() > 0);
    check('no raw error text leaked',
        (await page.locator('[role="dialog"]').innerText()).match(/ECONNREFUSED|net::|<!DOCTYPE/i) === null);
    check('a Try again button is offered',
        await page.getByRole('button', {name: /try again/i}).count() > 0);
    await shot('01-chat-error');

    // The real bug: input stayed enabled while every submit silently returned.
    await page.unroute('**/api/chat');
    await page.locator('[role="dialog"] input').fill('hello again');
    await page.keyboard.press('Enter');
    await page.waitForTimeout(1500);
    const userTurns = await page.locator('[role="dialog"] >> text=/hello again/').count();
    check('the panel accepts messages again after an error', userTurns > 0);
    await shot('02-chat-recovered');

    const accountsAfter = await db.collection('paperaccounts').countDocuments();
    check('asking the assistant created no paper account',
        accountsAfter === accountsBefore, `${accountsBefore} -> ${accountsAfter}`);

    // Escape closes the panel.
    await page.keyboard.press('Escape');
    await page.waitForTimeout(400);
    check('Escape closes the chat panel',
        await page.locator('[role="dialog"][aria-label="AeroTrade assistant"]').count() === 0);

    // --- the conversation outlives closing the panel, and a cleared one stays cleared --
    // The panel unmounts on close; it used to be reseeded from the page-load snapshot, so
    // reopening lost the exchange and brought a cleared conversation back.
    await openChat();
    check('a sent message is still there after close and reopen',
        await page.locator('[role="dialog"] >> text=/hello again/').count() > 0);
    await page.locator('[role="dialog"] button[title="Clear chat"]').click();
    await page.keyboard.press('Escape');
    await page.waitForTimeout(400);
    await openChat();
    check('a cleared conversation stays cleared after close and reopen',
        await page.locator('[role="dialog"] >> text=/hello again|how am I doing/').count() === 0);
    const storedChats = await page.evaluate(() => Object.keys(localStorage)
        .filter((key) => key.startsWith('aero-chat:'))
        .map((key) => localStorage.getItem(key)));
    check('what is stored is the cleared conversation',
        storedChats.length === 1 && storedChats[0] === '[]', JSON.stringify(storedChats));
    await shot('02b-chat-cleared-reopened');
    await page.keyboard.press('Escape');
    await page.waitForTimeout(400);

    // --- markdown actually renders as a list ---------------------------------------
    // Rendering is exercised via the brain's weekly rationale, which is seeded markdown
    // rather than a live model call (no GEMINI_API_KEY in the harness).
    const today = new Date().toISOString().slice(0, 10);
    // Upsert, not insert — {userId, date} is unique and reruns would collide.
    await db.collection('suggestionsets').replaceOne(
        {userId: 'global', date: today},
        {
            userId: 'global', date: today, kind: 'preview', items: [],
            rationaleMd: ['- first bullet', '- second bullet', '', '[a link](https://example.com)', '', '![img](https://example.com/x.png)'].join('\n'),
            createdAt: new Date(), updatedAt: new Date(),
        },
        {upsert: true},
    );
    await page.goto(`${BASE}/brain?view=navigator`, {waitUntil: 'domcontentloaded'});
    // /brain now has a loading.tsx, so a fixed timeout can land on the skeleton.
    await page.getByText('Weekly Decisions').waitFor({timeout: 30000});
    await page.waitForTimeout(500);
    const lis = await page.locator('li:has-text("first bullet")').count();
    check('model markdown renders as a real list', lis > 0, `${lis} <li>`);
    check('links in model output are neutralised',
        await page.locator('a[href="https://example.com"]').count() === 0);
    check('images in model output are dropped',
        await page.locator('img[src*="example.com"]').count() === 0);
    await shot('03-markdown');

    // --- destructive actions confirm ------------------------------------------------
    await page.goto(`${BASE}/portfolio`, {waitUntil: 'networkidle'});
    await page.getByRole('button', {name: /Reset Account/i}).click();
    await page.waitForTimeout(500);
    const resetCopy = await page.locator('[role="dialog"]').innerText();
    check('reset asks first', /Reset .*\?/i.test(resetCopy));
    check('reset names what is destroyed',
        /trade history/i.test(resetCopy) && /snapshot/i.test(resetCopy), resetCopy.slice(0, 90));
    await shot('04-reset-confirm');
    await page.getByRole('button', {name: 'Cancel'}).click();
    await page.waitForTimeout(300);
    const trades = await db.collection('papertrades').countDocuments({userId});
    check('cancelling the reset changed nothing', trades === 0);

    await page.goto(`${BASE}/settings?tab=dashboard`, {waitUntil: 'networkidle'});
    await page.locator('#dashboard').getByRole('button', {name: /Reset to default/i}).click();
    await page.waitForTimeout(500);
    check('dashboard reset asks first',
        /Reset your dashboard\?/i.test(await page.locator('[role="dialog"]').innerText()));
    await shot('05-dashboard-reset-confirm');

    // --- the robot launcher, and its tips on /topics -------------------------------------
    // The launcher is the robot (components/chat/ChatWidget, RobotMascot), bottom-right at every
    // width; on the topics pages it speaks (RobotTipBubble) on the timings in lib/chat/robot-tips.
    // Fake timers are installed per browser context (Playwright's Clock), so the tips get a context
    // of their own with this user's cookies: nothing above ran under a faked clock, and the clock is
    // installed before navigation so React captures the fake setTimeout. The clock keeps flowing;
    // fastForward jumps it by the module's own constants, firing each due one-shot timer once —
    // exactly the show → hide → show chain.
    const jiti = createJiti(import.meta.url, {alias: {'@': REPO_ROOT.replace(/\/$/, '')}, fsCache: false});
    const {ROBOT_TIP_FIRST_MS, ROBOT_TIP_VISIBLE_MS, ROBOT_TIP_GAP_MS, ROBOT_TIP_HOLD_MS, ROBOT_SHOWN_KEY} =
        await jiti.import(`${REPO_ROOT}lib/chat/robot-tips.ts`);
    const {ROBOT_TIPS} = await jiti.import(`${REPO_ROOT}lib/learn/copy/robot.ts`);
    const robotCtx = await browser.newContext({viewport: {width: 1440, height: 900}});
    await robotCtx.addCookies(await page.context().cookies());
    await robotCtx.clock.install();
    const robot = await robotCtx.newPage();
    const robotShot = (n) => robot.screenshot({path: `${OUT}${n}.png`, fullPage: true});
    const chatCount = async () => (await db.collection('ratelimits').findOne({key: `chat:${userId}`}))?.count ?? 0;
    const limitsBefore = await chatCount();
    await robot.goto(`${BASE}/topics`, {waitUntil: 'load'});
    const launcher = robot.locator('button[aria-label="Open Aero-AI Assistant"]');
    await launcher.waitFor({timeout: 30000});
    const box = await launcher.boundingBox();
    check('the launcher is bottom-right at 1440, not in the top bar',
        box.width >= 48 && box.x + box.width >= 1440 - 60 && box.y + box.height >= 900 - 40 && box.y > 64, JSON.stringify(box));
    check('the launcher is the robot: the SVG mascot is inside it', await launcher.locator('svg[data-robot-mascot]').count() === 1);
    await robot.waitForTimeout(1500);
    const bubble = robot.locator('[data-robot-tip]');
    check('no tip bubble in the first seconds', await bubble.count() === 0);
    await robot.clock.fastForward(ROBOT_TIP_FIRST_MS);
    await bubble.waitFor({timeout: 10000});
    const firstId = await bubble.getAttribute('data-robot-tip');
    const sentence = await bubble.locator('p[role="status"]').innerText();
    check("a tip appears on /topics after the first delay, and it is one of the robot's own sentences",
        ROBOT_TIPS.some((t) => t.text === sentence), sentence);
    check('the first tip of a session is the lead tip', firstId === ROBOT_TIPS[0].id, firstId);
    await robotShot('06-robot-tip');
    await robot.getByRole('button', {name: 'Try it'}).click();
    const robotDialog = robot.locator('[role="dialog"][aria-label="AeroTrade assistant"]');
    await robotDialog.waitFor({timeout: 15000});
    const typed = await robotDialog.locator('input[placeholder="Query market data..."]').inputValue();
    check("Try it types the tip's prompt into the composer", typed === ROBOT_TIPS[0].prompt, typed);
    check('…and sends nothing', (await chatCount()) === limitsBefore);
    check('the composer is focused',
        await robot.evaluate(() => document.activeElement?.getAttribute('placeholder')) === 'Query market data...');
    check('the bubble leaves while the panel is open', await bubble.count() === 0);
    await robot.keyboard.press('Escape');
    await robotDialog.waitFor({state: 'detached', timeout: 5000});
    // Real time, so the effect that follows the close has registered its timer before the jump.
    await robot.waitForTimeout(300);
    await robot.clock.fastForward(ROBOT_TIP_GAP_MS);
    await bubble.waitFor({timeout: 10000});
    const secondId = await bubble.getAttribute('data-robot-tip');
    check('the next tip is a different one', !!secondId && secondId !== firstId, `${firstId} -> ${secondId}`);
    await robot.getByRole('button', {name: 'Dismiss tip'}).click();
    await robot.waitForTimeout(300);
    check('dismiss hides the bubble', await bubble.count() === 0);
    const shown = await robot.evaluate((key) => sessionStorage.getItem(key), ROBOT_SHOWN_KEY);
    check("shown tips are remembered for the session, outside the chat's own keys",
        JSON.parse(shown ?? '[]').length === 2 && !ROBOT_SHOWN_KEY.startsWith('aero-chat:'), shown);
    await robot.reload({waitUntil: 'load'});
    await launcher.waitFor({timeout: 30000});
    await robot.waitForTimeout(300);
    await robot.clock.fastForward(ROBOT_TIP_GAP_MS);
    await bubble.waitFor({timeout: 10000});
    const thirdId = await bubble.getAttribute('data-robot-tip');
    check('a tip is not repeated within the session, even across a reload', ![firstId, secondId].includes(thirdId), thirdId);
    // A tip the reader is on stays (ROBOT_TIP_HOLD_MS): the pointer resting on the bubble holds its
    // hide past its time — the jump fires the hide once and it only looks again — and once the
    // pointer has left, the next look takes it away.
    await bubble.hover();
    await robot.clock.fastForward(ROBOT_TIP_VISIBLE_MS * 2);
    await robot.waitForTimeout(300);
    check('a tip under the pointer outlives its time', await bubble.count() === 1);
    await robot.mouse.move(8, 8);
    await robot.clock.fastForward(ROBOT_TIP_HOLD_MS * 2);
    await bubble.waitFor({state: 'detached', timeout: 10000});
    check('…and leaves once the pointer has', await bubble.count() === 0);
    await robot.goto(`${BASE}/news`, {waitUntil: 'load'});
    await launcher.waitFor({timeout: 30000});
    await robot.waitForTimeout(300);
    await robot.clock.fastForward(ROBOT_TIP_FIRST_MS + ROBOT_TIP_GAP_MS);
    await robot.waitForTimeout(500);
    check('the robot keeps quiet off the topics pages', await bubble.count() === 0);
    await robotCtx.close();
} catch (err) {
    check(`threw: ${err.message}`, false);
    await shot('99-error').catch(() => {});
} finally {
    await mongo.close().catch(() => {});
    await browser.close();
}

summary('chat');
