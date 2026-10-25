// The Alpaca broker link (lib/broker, Settings › Broker) end to end against the harness's
// stand-in (start-alpaca-stub.mjs on :8788; run.sh hands the app its keys and address in paper
// mode). A reader who is not the owner has no Broker section; the owner (qa-lab-owner@example.com,
// the broker owner through LAB_OWNER_EMAILS) sees the paper connection with the account number
// masked, links an account the AI Navigator trades, and syncs: a preview while the market is
// closed, then dollar orders for the fractionable holdings, whole shares for BRK.B, the ADR Alpaca
// cannot trade skipped and said; a repeat has nothing to send, a holding the source sells comes
// out whole, the weekday job syncs the link and passes a paused one by, and unlinking keeps
// Alpaca's holdings.
// Run: npm run qa -- broker   (the harness: README.md)
import {chromium} from 'playwright';
import {MongoClient, ObjectId} from 'mongodb';
import {BASE, HOME_URL, INNGEST, MONGO, PASSWORD, check, note, outDir, signUp, summary} from './lib.mjs';

const OUT = outDir('broker');
const OWNER_EMAIL = 'qa-lab-owner@example.com';
const STUB = 'http://localhost:8788';
const stub = (path) => fetch(`${STUB}${path}`).then((r) => r.json());
const etDay = (msAgo = 0) => new Date(Date.now() - msAgo).toLocaleDateString('en-CA', {timeZone: 'America/New_York'});
const PRICES = {NVDA: 200, XLK: 100, 'BRK.B': 500, ADDYY: 120};

const browser = await chromium.launch({channel: 'chrome'});
const page = await browser.newPage({viewport: {width: 1440, height: 900}});
const shot = (n) => page.screenshot({path: `${OUT}${n}.png`, fullPage: true});
const mongo = new MongoClient(MONGO);
let seededBars = false;
let sourceId = null;

try {
    await mongo.connect();
    const db = mongo.db();
    await stub('/__reset');

    // --- not the owner: no Broker section ---
    const other = await browser.newPage({viewport: {width: 1440, height: 900}});
    await signUp(other, 'Broker other');
    await other.goto(`${BASE}/settings?tab=broker`, {waitUntil: 'load'});
    await other.locator('[data-settings-tab]').first().waitFor({timeout: 30000});
    check('a reader who is not the owner has no Broker section, and its address opens the first one',
        await other.locator('[data-settings-tab="broker"]').count() === 0 && await other.locator('[data-broker]').count() === 0
        && await other.locator('[data-settings-tab="topics"][aria-current="page"]').count() === 1);
    await other.close();

    // --- the owner ---
    if (await db.collection('user').findOne({email: OWNER_EMAIL})) {
        await page.goto(`${BASE}/sign-in`, {waitUntil: 'load'});
        await page.fill('#email', OWNER_EMAIL);
        await page.fill('#password', PASSWORD);
        await page.click('button[type="submit"]');
        await page.waitForURL(HOME_URL, {timeout: 60000});
    } else {
        await signUp(page, 'Lab owner', {email: OWNER_EMAIL, stay: true});
    }
    const owner = String((await db.collection('user').findOne({email: OWNER_EMAIL}))._id);
    await db.collection('brokerlinks').deleteMany({userId: owner});

    // The account a brain trades: $100,000 of which NVDA 15%, XLK 10%, BRK.B 5% and ADDYY 6%, priced
    // by stored closes (the harness has no live quotes) at the stand-in's own prices.
    await page.goto(`${BASE}/settings?tab=broker`, {waitUntil: 'load'});   // the first account is made on first read
    const day = etDay();
    await db.collection('pricebars').insertMany(Object.entries(PRICES).map(([symbol, close]) => ({symbol, date: day, close, open: close, high: close, low: close, source: 'yahoo', dividend: 0})));
    seededBars = true;
    const inserted = await db.collection('paperaccounts').insertOne({
        userId: owner, name: 'Broker source', cash: 64_000, startingBalance: 100_000, inceptionAt: new Date(), createdAt: new Date(), updatedAt: new Date(),
        positions: [
            {symbol: 'NVDA', company: 'NVIDIA', quantity: 75, avgCost: 180},
            {symbol: 'XLK', company: 'Technology Select Sector SPDR', quantity: 100, avgCost: 95},
            {symbol: 'BRK.B', company: 'Berkshire Hathaway', quantity: 10, avgCost: 480},
            {symbol: 'ADDYY', company: 'Adidas', quantity: 50, avgCost: 110},
        ],
    });
    sourceId = String(inserted.insertedId);
    await db.collection('ainavigators').insertOne({userId: owner, accountId: sourceId, status: 'active', enrolledAt: new Date()});

    await page.goto(`${BASE}/settings?tab=broker`, {waitUntil: 'load'});
    await page.locator('[data-broker]').waitFor({timeout: 30000});
    check('the owner has a Broker section, connected to the paper account, its number masked to four',
        await page.locator('[data-settings-tab="broker"]').count() === 1 && await page.locator('[data-broker-connection="connected"]').count() === 1
        && await page.locator('[data-broker-mode="paper"]').count() === 1 && (await page.locator('[data-broker-account-line]').innerText()).includes('••••9F2A')
        && !(await page.locator('[data-broker]').innerText()).includes('PA3QAQA') && /\$100,000\.00/.test(await page.locator('[data-broker-connection]').innerText()));
    const options = await page.locator('[data-broker-account] option').allInnerTexts();
    check('the accounts a brain trades are listed first, saying who trades them', /^Broker source — traded by the AI Navigator$/.test(options[0] ?? ''), options.join(' | '));
    check('nothing is linked or synced yet', await page.locator('[data-broker-linked]').count() === 0 && /No sync yet/.test(await page.locator('[data-broker-syncs]').innerText()));
    await shot('01-connected');

    await page.locator('[data-broker-account]').selectOption(sourceId);
    await page.locator('[data-broker-link]').click();
    await page.locator('[data-broker-linked="active"]').waitFor({timeout: 30000});
    const link = await db.collection('brokerlinks').findOne({userId: owner});
    check('linking stores the mirror, active, on the chosen account', link?.sourceAccountId === sourceId && link?.status === 'active' && link?.provider === 'alpaca');
    const weightRow = async (symbol) => page.locator(`[data-broker-weight="${symbol}"]`).innerText().catch(() => '');
    check('the two accounts\' weights stand side by side', /NVDA\s+15\.0%\s+0\.0%/.test(await weightRow('NVDA')) && /ADDYY\s+6\.0%\s+0\.0%/.test(await weightRow('ADDYY')), await weightRow('NVDA'));

    // --- the market closed: a preview, nothing sent ---
    const newestSync = () => page.locator('[data-broker-sync-row]').first();
    await page.locator('[data-broker-sync]').click();
    await page.locator('[data-broker-sync-row="preview"]').waitFor({timeout: 30000});
    const previewText = await newestSync().innerText();
    check('with the market closed a sync previews: the orders it would send, none sent',
        /3 orders planned, none sent \(the market is closed\); 1 symbol left out/.test(previewText) && (await stub('/__stats')).orders.length === 0, previewText.replace(/\s+/g, ' '));
    check('…dollars for a fractionable holding, whole shares for BRK.B, the ADR Alpaca cannot trade said',
        /buy NVDA \$15,000\.00 · enter/.test(previewText) && /buy XLK \$10,000\.00/.test(previewText) && /buy BRK\.B 10 sh/.test(previewText) && /ADDYY: Alpaca cannot trade it/.test(previewText));

    // --- the market open: the orders go ---
    await stub('/__state?open=1');
    await page.locator('[data-broker-sync]').click();
    await page.locator('[data-broker-sync-row="executed"]').waitFor({timeout: 30000});
    const sent = (await stub('/__stats')).orders;
    check('open, the sync sends them: market day orders, dollars or whole shares, each with the day\'s client id',
        sent.length === 3 && sent.every((o) => o.type === 'market' && o.time_in_force === 'day' && o.client_order_id.endsWith(`-${day}-buy-${o.symbol}`))
        && sent.find((o) => o.symbol === 'NVDA')?.notional === '15000' && sent.find((o) => o.symbol === 'BRK.B')?.qty === '10',
        JSON.stringify(sent.map((o) => [o.symbol, o.notional ?? o.qty, o.client_order_id])));
    check('…the sync reads "3 orders sent", and Alpaca\'s weights now match', /3 orders sent; 1 symbol left out/.test(await newestSync().innerText())
        && /NVDA\s+15\.0%\s+15\.0%/.test(await weightRow('NVDA')) && await page.locator('[data-broker-alpaca-order="filled"]').count() === 3);
    const stored = (await db.collection('brokerlinks').findOne({userId: owner})).syncs;
    check('each sync is recorded on the link, newest first', stored.length === 2 && stored[0].kind === 'executed' && stored[1].kind === 'preview' && stored[0].orders.every((o) => o.sent && o.ok));
    await shot('02-synced');

    // --- a repeat: nothing to send ---
    await page.locator('[data-broker-sync]').click();
    await page.waitForFunction(() => document.querySelectorAll('[data-broker-sync-row]').length === 3, null, {timeout: 30000});
    check('a repeat finds Alpaca in line with the paper account and sends nothing',
        /in line with the paper account, nothing to send/.test(await newestSync().innerText()) && (await stub('/__stats')).orders.length === 3);

    // --- the source sells a holding: Alpaca sells it whole ---
    await db.collection('paperaccounts').updateOne({_id: new ObjectId(sourceId)}, {$set: {cash: 74_000}, $pull: {positions: {symbol: 'XLK'}}});
    await page.locator('[data-broker-sync]').click();
    await page.waitForFunction(() => document.querySelectorAll('[data-broker-sync-row]').length === 4, null, {timeout: 30000});
    const exit = (await stub('/__stats')).orders.at(-1);
    check('a holding the paper account no longer has is sold whole at Alpaca', exit?.symbol === 'XLK' && exit?.side === 'sell' && exit?.qty === '100'
        && /sell XLK 100 sh · exit/.test(await newestSync().innerText()), JSON.stringify(exit));

    // --- the weekday job ---
    const inngestUp = await fetch(`${INNGEST}/`).then((r) => r.ok).catch(() => false);
    const jobMessage = async () => (await db.collection('jobruns').findOne({jobId: 'broker-sync'}))?.lastMessage ?? '';
    const pollUntil = async (predicate, timeoutMs) => {
        const until = Date.now() + timeoutMs;
        while (Date.now() < until) {
            const value = await predicate();
            if (value) return value;
            await new Promise((resolve) => setTimeout(resolve, 2000));
        }
        return null;
    };
    const fire = () => fetch(`${INNGEST}/e/qa`, {method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify({name: 'app/sync.broker.mirror', data: {}})});
    if (!inngestUp) {
        note('no Inngest dev server', 'the weekday job checks are skipped');
    } else {
        await db.collection('jobruns').deleteMany({jobId: 'broker-sync'});
        await fire();
        const message = await pollUntil(async () => ((await jobMessage()).startsWith('Broker mirror') ? jobMessage() : null), 120_000);
        check('the weekday job syncs every active link and stamps its line', /^Broker mirror: Alpaca mirror: in line with the paper account/.test(message ?? ''), message);
    }

    // --- pause, then unlink ---
    await page.locator('[data-broker-pause]').click();
    await page.locator('[data-broker-linked="paused"]').waitFor({timeout: 30000});
    check('pausing keeps the link and says the weekday sync passes it by', (await db.collection('brokerlinks').findOne({userId: owner}))?.status === 'paused'
        && /passes this link by/.test(await page.locator('[data-broker-linked]').innerText()));
    if (inngestUp) {
        await db.collection('jobruns').deleteMany({jobId: 'broker-sync'});
        await fire();
        const message = await pollUntil(async () => ((await jobMessage()).startsWith('Broker mirror') ? jobMessage() : null), 120_000);
        check('…and the job passes a paused link by', message === 'Broker mirror: no active link', message);
    }
    await page.locator('[data-broker-unlink]').click();
    await page.locator('[data-broker-link]').waitFor({timeout: 30000});
    check('unlinking removes the link and keeps Alpaca\'s holdings', await db.collection('brokerlinks').countDocuments({userId: owner}) === 0
        && (await stub('/__stats')).positions.some((p) => p.symbol === 'NVDA'));

    await page.setViewportSize({width: 390, height: 844});
    await page.goto(`${BASE}/settings?tab=broker`, {waitUntil: 'load'});
    await page.locator('[data-broker]').waitFor({timeout: 30000});
    check('the Broker section fits a phone without sideways scroll', await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth) <= 1);
    await shot('03-phone');
} catch (err) {
    check(`threw: ${err.message}`, false);
    await shot('99-error').catch(() => {});
} finally {
    const db = mongo.db();
    if (seededBars) await db.collection('pricebars').deleteMany({symbol: {$in: Object.keys(PRICES)}, date: etDay()}).catch(() => {});
    if (sourceId) {
        await db.collection('ainavigators').deleteMany({accountId: sourceId}).catch(() => {});
        await db.collection('paperaccounts').deleteOne({_id: new ObjectId(sourceId)}).catch(() => {});
    }
    await stub('/__reset').catch(() => {});
    await mongo.close().catch(() => {});
    await browser.close();
}

summary('broker');
