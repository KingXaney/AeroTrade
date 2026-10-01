// The chat tutor's guard rails, keyless: the three rate-limit windows refuse in order
// with honest copy and no retry, an "Ask in chat" link prefills the composer without
// sending, and explainTerm's chip renders from a stubbed stream. The tutor's actual
// answers need a Gemini key and are checked by hand. Run against the harness in README.md.
import {chromium} from 'playwright';
import {MongoClient} from 'mongodb';
import {mkdirSync} from 'node:fs';

const BASE = 'http://localhost:3000';
const MONGO = 'mongodb://127.0.0.1:27117/aerotrade';
const OUT = new URL('./output/tutor/', import.meta.url).pathname;
mkdirSync(OUT, {recursive: true});

const CHAT_DIALOG = '[role="dialog"][aria-label="AeroTrade assistant"]';
const LIMITED = /a lot of messages/i;
const CAPACITY = /shared budget/i;

let failures = 0;
const check = (name, ok, detail = '') => {
    if (!ok) failures++;
    console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? `  — ${detail}` : ''}`);
};

const browser = await chromium.launch({channel: 'chrome'});
const page = await browser.newPage({viewport: {width: 1440, height: 900}});
const shot = (n) => page.screenshot({path: `${OUT}${n}.png`, fullPage: true});
const mongo = new MongoClient(MONGO);

try {
    await mongo.connect();
    const db = mongo.db('aerotrade');
    const email = `qatutor${Date.now()}@example.com`;
    await page.goto(`${BASE}/sign-up`, {waitUntil: 'load'});
    await page.fill('#fullName', 'QA Tutor');
    await page.fill('#email', email);
    await page.fill('#password', 'Passw0rd!Passw0rd!');
    await page.click('button[type="submit"]');
    await page.waitForURL(new RegExp(`^${BASE}/(\\?.*)?$`), {timeout: 90000});
    const userDoc = await db.collection('user').findOne({email});
    const userId = String(userDoc?._id ?? userDoc?.id ?? '');
    check('signed up', userId.length > 0);

    const limits = db.collection('ratelimits');
    const windowRow = (key, count, ms) => ({key, count, windowStartedAt: new Date(), expiresAt: new Date(Date.now() + ms)});
    const dialog = page.locator(CHAT_DIALOG);
    const composer = () => dialog.locator('input[placeholder="Query market data..."]');
    const openChat = async () => {
        if (await dialog.count() === 0) {
            await page.locator('button[aria-label="Open Aero-AI Assistant"]').click();
            await dialog.waitFor({timeout: 15000});
        }
    };
    const send = async (text) => {
        await openChat();
        await composer().fill(text);
        await composer().press('Enter');
    };
    const errorBox = () => dialog.locator('p').filter({hasText: /assistant|messages|budget|connection|finish/i}).last();

    // --- the user's hour --------------------------------------------------------------------
    await limits.deleteMany({key: {$in: [`chat:${userId}`, `chat:${userId}:day`, 'chat:global']}});
    await limits.insertOne(windowRow(`chat:${userId}`, 30, 3_600_000));
    await send('hello');
    await dialog.locator('p').filter({hasText: LIMITED}).waitFor({timeout: 30000});
    check('the 31st message in an hour is refused with the hour copy', true);
    check('no retry is offered for a refused request', await dialog.getByRole('button', {name: /try again/i}).count() === 0);
    check('the refused request still counted', (await limits.findOne({key: `chat:${userId}`}))?.count === 31);
    await shot('01-hour-limit');

    // --- the user's day, then everyone's --------------------------------------------------
    await limits.deleteMany({key: `chat:${userId}`});
    await limits.insertOne(windowRow(`chat:${userId}:day`, 60, 86_400_000));
    await dialog.getByRole('button', {name: 'Dismiss'}).click().catch(() => {});
    await send('hello again');
    await dialog.locator('p').filter({hasText: LIMITED}).waitFor({timeout: 30000});
    check('the daily window refuses too, before the shared budget is touched', (await limits.findOne({key: 'chat:global'})) === null);

    await limits.deleteMany({key: `chat:${userId}:day`});
    await limits.insertOne(windowRow('chat:global', 200, 86_400_000));
    await dialog.getByRole('button', {name: 'Dismiss'}).click().catch(() => {});
    await send('and again');
    await dialog.locator('p').filter({hasText: CAPACITY}).waitFor({timeout: 30000});
    check('the shared budget refuses with its own copy', true);

    // --- with no window in the way, the request reaches the (keyless) provider ------------
    await limits.deleteMany({key: {$in: [`chat:${userId}`, `chat:${userId}:day`, 'chat:global']}});
    await dialog.getByRole('button', {name: 'Dismiss'}).click().catch(() => {});
    await send('last one');
    await errorBox().waitFor({timeout: 30000});
    const finalCopy = await errorBox().innerText();
    check('an unlimited request falls through to the provider (no key here), not the limiter', !LIMITED.test(finalCopy) && !CAPACITY.test(finalCopy), finalCopy);
    check('every window counted the request once', (await limits.findOne({key: `chat:${userId}`}))?.count === 1 && (await limits.findOne({key: 'chat:global'}))?.count === 1);
    await shot('02-fallthrough');

    // --- Ask in chat prefills and never sends ----------------------------------------------
    await page.goto(`${BASE}/portfolio`, {waitUntil: 'load'});
    // The analytics panel's disclosure: full width and on the left, so its links stay clear of the
    // open chat dialog (the Risk lens, first on the page since slice 2.3b, sits beneath it).
    const terms = page.locator('[data-what-these-mean]').filter({hasText: 'Win rate'}).first();
    await terms.waitFor({timeout: 30000});
    await terms.locator('summary').click();
    await terms.locator('[data-ask="term"]').first().click();
    await dialog.waitFor({timeout: 15000});
    const typed = await composer().inputValue();
    check('the link opens the chat with the question typed', /^What does ".+" mean here\?$/.test(typed), typed);
    check('nothing was sent', !/mean here/.test(await dialog.innerText()));
    check('the composer is focused', await page.evaluate(() => document.activeElement?.getAttribute('placeholder')) === 'Query market data...');
    await terms.locator('[data-ask="term"]').nth(2).click();
    await page.waitForTimeout(200);
    check('a second link while open replaces the draft', (await composer().inputValue()) !== typed);
    await shot('03-ask');

    // --- explainTerm's chip, from a stubbed stream ------------------------------------------
    // The real answer needs a Gemini key; the stream is stubbed in the AI SDK's UI-message
    // format with an output in lib/ai/explain.ts's shape, so what is checked here is the
    // chip: its label, the glossary name as summary, the quoted term when there is no entry,
    // and nothing repeated for a reason.
    const STANCE = "These are the app's own definitions, and the learner's own paper-account figures where the app computes them.";
    const explainStream = (id, input, output, reply) => [
        {type: 'start', messageId: `qa-explain-${id}`},
        {type: 'start-step'},
        {type: 'tool-input-start', toolCallId: `call-${id}`, toolName: 'explainTerm'},
        {type: 'tool-input-available', toolCallId: `call-${id}`, toolName: 'explainTerm', input},
        {type: 'tool-output-available', toolCallId: `call-${id}`, output},
        {type: 'finish-step'},
        {type: 'start-step'},
        {type: 'text-start', id: `text-${id}`},
        {type: 'text-delta', id: `text-${id}`, delta: reply},
        {type: 'text-end', id: `text-${id}`},
        {type: 'finish-step'},
        {type: 'finish', finishReason: 'stop'},
    ].map((chunk) => `data: ${JSON.stringify(chunk)}\n\n`).join('') + 'data: [DONE]\n\n';
    const sentBodies = [];
    const stubOnce = async (body) => {
        await page.unroute('**/api/chat').catch(() => {});
        await page.route('**/api/chat', async (route) => {
            sentBodies.push(route.request().postDataJSON());
            await route.fulfill({
                status: 200,
                headers: {'content-type': 'text/event-stream', 'cache-control': 'no-cache', 'x-vercel-ai-ui-message-stream': 'v1'},
                body,
            });
        });
    };
    const explainChips = () => dialog.locator('div.rounded-full').filter({hasText: 'Looking up the definition'});
    const windowCounts = async () => JSON.stringify(
        (await limits.find({key: {$in: [`chat:${userId}`, `chat:${userId}:day`, 'chat:global']}}).sort({key: 1}).toArray())
            .map((row) => [row.key, row.count]));
    const countsBefore = await windowCounts();

    await stubOnce(explainStream('1', {term: 'my max drawdown'}, {
        stance: STANCE,
        entry: {key: 'max-drawdown', kind: 'metric', term: 'Max drawdown', short: 'The largest fall from a previous peak to a later low.', long: '…', seeAlso: ['Recovery', 'Volatility']},
        reason: null,
        yours: {paper: true, accounts: [{account: 'Main Strategy', figures: {maxDrawdownPct: 5.88, peakDate: '2026-09-19', troughDate: '2026-09-23', recovered: false}}]},
        notes: [],
    }, 'Stubbed answer one.'));
    await dialog.getByRole('button', {name: 'Dismiss'}).click().catch(() => {});
    await send('What is my max drawdown?');
    await dialog.getByText('Stubbed answer one.').waitFor({timeout: 30000});
    const chip = explainChips().last();
    check('the explainTerm chip reads "Looking up the definition"', await explainChips().count() === 1);
    check('its summary is the glossary name', (await chip.locator('span.text-fg-muted').innerText()).trim() === '— Max drawdown',
        await chip.innerText());
    check('a finished lookup shows as done, not pending or failed', /text-positive/.test(await chip.getAttribute('class') ?? ''));
    check('the question went out as typed', JSON.stringify(sentBodies.at(-1) ?? {}).includes('What is my max drawdown?'));
    await shot('04-explain-chip');

    await stubOnce(explainStream('2', {term: 'zorblax ratio'}, {
        stance: STANCE, entry: null, reason: null, yours: null, notes: ['The app has no glossary entry for this term.'],
    }, 'Stubbed answer two.'));
    await send('What is a zorblax ratio?');
    await dialog.getByText('Stubbed answer two.').waitFor({timeout: 30000});
    check('with no entry the chip quotes the term as asked',
        (await explainChips().last().locator('span.text-fg-muted').innerText()).trim() === '— "zorblax ratio"');

    await stubOnce(explainStream('3', {reason: 'enter: SMA50 42.10 > SMA200 40.00 (+5.3%)'}, {
        stance: STANCE, entry: null,
        reason: {clauses: [{text: 'enter', gloss: 'The trend condition held.'}], unrecognised: []},
        yours: null, notes: [],
    }, 'Stubbed answer three.'));
    await send('Explain this reason: enter: SMA50 42.10 > SMA200 40.00 (+5.3%)');
    await dialog.getByText('Stubbed answer three.').waitFor({timeout: 30000});
    check('a reason lookup shows the label alone',
        await explainChips().count() === 3 && await explainChips().last().locator('span.text-fg-muted').count() === 0);
    check('a stubbed stream never reached the server (no window counted it)', await windowCounts() === countsBefore, countsBefore);
    await page.unroute('**/api/chat');
    await shot('05-explain-chips');
} catch (err) {
    failures++;
    console.log(`FAIL  threw: ${err.message}`);
    await shot('99-error').catch(() => {});
} finally {
    await mongo.close().catch(() => {});
    await browser.close();
}

console.log(failures === 0 ? '\nAll tutor checks passed.' : `\n${failures} check(s) failed.`);
process.exit(failures === 0 ? 0 : 1);
