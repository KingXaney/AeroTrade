// Home (app/(root)/page.tsx, lib/home): the signed-in front page. A new account is greeted by
// first name, sees its account's value, its topics and the first first-week step as the one
// thing to do next; the step moves on as soon as the row behind it exists; the widget dashboard
// is its own page under the same rail section; an old /?customize=1 link still opens the
// dashboard's edit mode; and the momentum terrain has no panel until there is a surface to draw
// (qa-landing checks the panel once there is one). Then poker night on Home: the chip always, the
// panel only once there is a table to go back to (Rejoin while seated, Open after leaving the seat)
// or a friend's to join, at three phone sizes and on the side, and the lobby's "You are seated at …".
// Run: npm run qa -- home   (the harness: README.md)
import {chromium} from 'playwright';
import {MongoClient} from 'mongodb';
import {BASE, MONGO, check, outDir, signUp, summary} from './lib.mjs';

const OUT = outDir('home');
const browser = await chromium.launch({channel: 'chrome'});
const page = await browser.newPage({viewport: {width: 1440, height: 900}});
const mongo = new MongoClient(MONGO);
const shot = (name) => page.screenshot({path: `${OUT}${name}.png`, fullPage: true});

try {
    await mongo.connect();
    const db = mongo.db();
    const email = await signUp(page, 'home', {name: 'Ada Lovelace', stay: true});
    const user = await db.collection('user').findOne({email});
    const userId = String(user?._id ?? '');

    // --- a new account's Home -------------------------------------------------------
    check('sign-up lands on Home', new URL(page.url()).pathname === '/' && await page.locator('[data-home]').count() === 1, page.url());
    check('…greeted by first name', (await page.locator('h1').innerText()) === 'Welcome back, Ada', await page.locator('h1').innerText());
    check('…with the market status beside it', await page.locator('[data-home] span[title*="NYSE"]').count() === 1);
    check('the account total is the starting balance', (await page.locator('[data-home-total]').innerText()) === '$100,000.00', await page.locator('[data-home-total]').innerText());
    check('…with one row for the account, linking into /portfolio',
        await page.locator('#home-accounts ul a[href^="/portfolio?account="]').count() === 1);
    // The momentum terrain is a panel only when there is a surface to draw: no SPY history yet
    // (and the Tiingo stand-in down), so Home shows no box for it (invariant 8). qa-landing, which
    // runs after this suite, checks the panel once there is one.
    check('no terrain panel before there is a surface to draw',
        await page.locator('[data-home-terrain]').count() === 0 && await page.locator('[data-terrain]').count() === 0);
    const stepText = (await page.locator('#home-next-step').innerText()).replace(/\s+/g, ' ');
    check('the next step is the first first-week step', /Place your first paper trade/.test(stepText) && /0 of 5 first-week steps done/i.test(stepText), stepText.slice(0, 160));
    check('…and it opens the order ticket', await page.locator('[data-home-step]').getAttribute('href') === '/trade?symbol=SPY');
    check('the six seeded topics are listed', await page.locator('#home-topics a[href^="/topics/"]').count() === 6);
    check('the first-week list is on the page', await page.locator('#home-first-week li[data-done]').count() === 5);
    check('a box with nothing to say is not drawn', await page.locator('#home-briefing').count() === 0);
    check('numbers come before prose: the total sits above the fold',
        ((await page.locator('[data-home-total]').boundingBox())?.y ?? 9999) < 400);
    await shot('01-new-account');

    // --- the rail section and the dashboard ------------------------------------------
    const tabs = await page.$$eval('[data-section-tabs="home"] a', (as) => as.map((a) => `${a.getAttribute('href')}${a.getAttribute('aria-current') === 'page' ? '*' : ''}`));
    check('Home and My dashboard are tabs of one section', tabs.join(',') === '/*,/dashboard', tabs.join(','));
    await page.click('[data-section-tabs="home"] a[href="/dashboard"]');
    await page.waitForURL(/\/dashboard$/, {timeout: 15000});
    await page.waitForSelector('[data-widget-id]', {timeout: 15000}).catch(() => {});
    check('the widget grid is at /dashboard', await page.locator('[data-widget-id]').count() >= 5 && (await page.locator('h1').innerText()) === 'Dashboard');
    await page.goto(`${BASE}/?customize=1`, {waitUntil: 'load'});
    // The redirect arrives after the route's loading state has streamed, so wait for it.
    await page.waitForURL(/\/dashboard\?customize=1/, {timeout: 15000}).catch(() => {});
    await page.getByRole('button', {name: /Add widget/i}).waitFor({timeout: 15000}).catch(() => {});
    check('an old /?customize=1 link opens the dashboard in edit mode',
        /\/dashboard\?customize=1$/.test(page.url()) && await page.getByRole('button', {name: /Add widget/i}).count() === 1, page.url());

    // --- the step follows the rows ----------------------------------------------------
    const account = await db.collection('paperaccounts').findOne({userId});
    await db.collection('papertrades').insertOne({
        userId, accountId: String(account?._id), symbol: 'SPY', side: 'buy', quantity: 1, price: 500, total: 500,
        source: 'user', executedAt: new Date(), createdAt: new Date(),
    });
    await page.goto(`${BASE}/`, {waitUntil: 'load'});
    const moved = (await page.locator('#home-next-step').innerText()).replace(/\s+/g, ' ');
    check('with a trade on the ledger, the step moves to the next one', /Follow a quant strategy/.test(moved) && /1 of 5 first-week steps done/i.test(moved), moved.slice(0, 160));

    // Hidden once, the list leaves Home, and the step follows the session instead.
    await db.collection('userpreferences').updateOne({userId}, {$set: {'learn.missionsDismissedAt': new Date()}}, {upsert: true});
    await page.goto(`${BASE}/`, {waitUntil: 'load'});
    const after = (await page.locator('#home-next-step').innerText()).replace(/\s+/g, ' ');
    check('with the list hidden, the step follows the market', /The market is (open|closed)/.test(after) && !/first-week/i.test(after), after.slice(0, 160));
    check('…the list is gone and the lesson takes its place',
        await page.locator('#home-first-week').count() === 0 && await page.locator('#home-learn').count() === 1);
    await shot('02-after-first-week');

    // --- a phone ----------------------------------------------------------------------
    await page.setViewportSize({width: 390, height: 844});
    await page.goto(`${BASE}/`, {waitUntil: 'load'});
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    check('Home fits a phone without sideways scroll', overflow <= 1, String(overflow));
    await shot('03-phone');

    // --- poker night on Home, and the lobby's resume card (poker night modes P3) -----------
    // The chip is always there while poker night is on; the panel only once it has a row: the
    // reader's own table (seated: Rejoin; after leaving the seat: Open), then a friend's shown
    // table (Join). The lobby opens on "You are seated at …" exactly while a seat is held.
    await page.setViewportSize({width: 1440, height: 900});
    // 'load' can come before Home's streamed boxes have landed: an absence is read once the network
    // is quiet, the streamed document included.
    await page.goto(`${BASE}/`, {waitUntil: 'networkidle'});
    const chipHref = await page.locator('[data-home] [data-poker-night-chip]').getAttribute('href', {timeout: 5000}).catch(() => null);
    check('poker night: a chip beside the streak links to the lobby', chipHref === '/poker-night', String(chipHref));
    await page.waitForSelector('#home-learn [data-home-course], #home-learn [data-lesson], #home-first-week', {timeout: 30000}).catch(() => {});
    check('…and with no table to go back to or join, Home draws no poker night box', await page.locator('[data-home-poker-night]').count() === 0);
    await page.goto(`${BASE}/poker-night`, {waitUntil: 'load'});
    await page.waitForSelector('[data-quick-start="holdem"]', {timeout: 60000});
    check('…nor does the lobby offer a table to go back to', await page.locator('[data-lobby-resume]').count() === 0);

    const TABLE_URL = /\/play\/[A-HJ-NP-Z2-9]{6}(\?.*)?$/;
    const startTable = async (p) => {
        await p.click('[data-quick-start="holdem"]');
        await p.waitForURL(TABLE_URL, {timeout: 120000});
        return new URL(p.url()).pathname.split('/').pop();
    };
    const code = await startTable(page);
    const panelOf = (c) => page.evaluate(({c}) => {
        const panel = document.querySelector('[data-home-poker-night]');
        const read = (row) => {
            const go = row.querySelector('[data-home-pn-go]');
            return {code: row.getAttribute('data-home-pn-table'), go: go?.getAttribute('data-home-pn-go') ?? null, href: go?.getAttribute('href') ?? null,
                text: row.textContent.replace(/[⁨⁩]/g, '')};
        };
        return panel && {
            yours: [...panel.querySelectorAll('[data-home-pn-list="yours"] [data-home-pn-table]')].map(read),
            friends: [...panel.querySelectorAll('[data-home-pn-list="friends"] [data-home-pn-table]')].map(read),
            hands: panel.querySelector('[data-home-pn-hands]')?.getAttribute('href') ?? null,
            lobby: panel.querySelector('a[href="/poker-night"]') !== null,
            mine: c,
        };
    }, {c});
    const homePanel = async () => {
        await page.goto(`${BASE}/`, {waitUntil: 'load'});
        await page.waitForSelector('[data-home-poker-night]', {timeout: 30000}).catch(() => {});
        return panelOf(code);
    };
    const seatedView = await homePanel();
    check('with a table started (the host seated at seat 0), Home\'s poker night panel lists it under "Your tables": Seated, Rejoin to /play/CODE',
        seatedView?.yours.length === 1 && seatedView.yours[0].code === code && seatedView.yours[0].go === 'rejoin' && seatedView.yours[0].href === `/play/${code}`
        && /Seated/.test(seatedView.yours[0].text) && /Rejoin/.test(seatedView.yours[0].text) && /1 of \d+ seats taken/.test(seatedView.yours[0].text),
        JSON.stringify(seatedView));
    check('…with the lobby and "Learn the hands" (the Hands tab) a link away, and no friends\' list drawn empty',
        seatedView?.lobby === true && seatedView.hands === '/poker-night?tab=hands' && seatedView.friends.length === 0);
    // The chip at the top is the way straight back while the reader holds a seat, one tap from the
    // top of the page (the panel is at its foot).
    const chipOf = () => page.evaluate(() => {
        const chip = document.querySelector('[data-home] [data-poker-night-chip]');
        // Its words, less the icon's ligature and the dot (aria-hidden).
        const words = chip?.cloneNode(true);
        words?.querySelectorAll('[aria-hidden="true"]').forEach((n) => n.remove());
        return chip && {kind: chip.getAttribute('data-poker-night-chip'), href: chip.getAttribute('href'), text: words.textContent.trim(),
            top: Math.round(chip.getBoundingClientRect().top + scrollY)};
    });
    await page.waitForSelector('[data-home] [data-poker-night-chip="rejoin"]', {timeout: 15000}).catch(() => {});
    const seatedChip = await chipOf();
    check('…and while the reader holds that seat, the chip beside the streak is "Rejoin your table", straight to /play/CODE',
        seatedChip?.kind === 'rejoin' && seatedChip.href === `/play/${code}` && seatedChip.text === 'Rejoin your table', JSON.stringify(seatedChip));
    await page.goto(`${BASE}/poker-night`, {waitUntil: 'load'});
    await page.waitForSelector('[data-lobby-resume]', {timeout: 30000}).catch(() => {});
    const resume = await page.evaluate(() => {
        const card = document.querySelector('[data-lobby-resume]');
        return card && {
            code: card.getAttribute('data-lobby-resume'), title: card.querySelector('h2')?.textContent.replace(/[⁨⁩]/g, '') ?? '',
            href: card.querySelector('[data-lobby-rejoin]')?.getAttribute('href') ?? null, rejoin: card.querySelector('[data-lobby-rejoin]')?.textContent ?? '',
            first: card.parentElement?.firstElementChild === card,
        };
    });
    check('the lobby opens on "You are seated at …" with Rejoin to the table, above everything else',
        resume?.code === code && resume.title === "You are seated at Ada's poker night" && resume.href === `/play/${code}` && resume.rejoin === 'Rejoin' && resume.first,
        JSON.stringify(resume));
    await page.setViewportSize({width: 320, height: 568});
    await page.goto(`${BASE}/poker-night`, {waitUntil: 'load'});
    await page.waitForSelector('[data-lobby-resume] [data-lobby-rejoin]', {timeout: 30000}).catch(() => {});
    const resumeFit = await page.evaluate(() => {
        const card = document.querySelector('[data-lobby-resume]')?.getBoundingClientRect();
        const rejoin = document.querySelector('[data-lobby-rejoin]')?.getBoundingClientRect();
        return {overflow: document.documentElement.scrollWidth - window.innerWidth, card: card ? Math.round(card.right) : null, rejoin: rejoin ? Math.round(rejoin.height) : 0};
    });
    check('…on a 320 px phone too: nothing sideways, the card inside, Rejoin a 44 px target',
        resumeFit.overflow <= 1 && resumeFit.card !== null && resumeFit.card <= 320 && resumeFit.rejoin >= 44, JSON.stringify(resumeFit));
    await page.addStyleTag({content: 'nextjs-portal{display:none!important}'}).catch(() => {});
    await page.screenshot({path: `${OUT}24-lobby-resume-320.png`});
    await page.setViewportSize({width: 1440, height: 900});

    // A friend's table, shown to friends: Ben (a second account) starts one, turns on showToFriends
    // (the state's setting and its mirror) and is Ada's friend.
    const other = await browser.newContext({viewport: {width: 1440, height: 900}});
    const bp = await other.newPage();
    const emailB = await signUp(bp, 'homefriend', {name: 'Ben Friend', stay: true});
    const idB = String((await db.collection('user').findOne({email: emailB}))?._id ?? '');
    await bp.goto(`${BASE}/poker-night`, {waitUntil: 'load'});
    await bp.waitForSelector('[data-quick-start="holdem"]', {timeout: 60000});
    const codeB = await startTable(bp);
    await other.close();
    await db.collection('pokerrooms').updateOne({code: codeB}, {$set: {showToFriends: true, 'state.settings.showToFriends': true}});
    await db.collection('friendships').insertOne({requesterId: userId, addresseeId: idB, status: 'accepted', createdAt: new Date(), updatedAt: new Date()});
    const both = await homePanel();
    check('a friend\'s shown table joins the panel under "Friends\' tables": "Hosted by Ben", Join to /play/CODE',
        both?.yours.length === 1 && both.friends.length === 1 && both.friends[0].code === codeB && both.friends[0].go === 'join'
        && both.friends[0].href === `/play/${codeB}` && /Hosted by Ben/.test(both.friends[0].text) && !/Seated/.test(both.friends[0].text),
        JSON.stringify(both));
    await page.addStyleTag({content: 'nextjs-portal{display:none!important}'}).catch(() => {});
    await page.locator('[data-home-poker-night]').scrollIntoViewIfNeeded().catch(() => {});
    await shot('24-home-panel-1440');

    // Phones, upright and on the side: nothing sideways, every row inside the page, every button of
    // the panel a 44 px target below the small breakpoint.
    for (const [width, height] of [[390, 844], [375, 667], [320, 568], [844, 390]]) {
        await page.setViewportSize({width, height});
        await page.goto(`${BASE}/`, {waitUntil: 'load'});
        await page.waitForSelector('[data-home-poker-night]', {timeout: 30000}).catch(() => {});
        const fit = await page.evaluate(() => {
            const panel = document.querySelector('[data-home-poker-night]');
            const rows = [...document.querySelectorAll('[data-home-pn-table]')].map((r) => r.getBoundingClientRect());
            const buttons = [...document.querySelectorAll('[data-home-pn-go], [data-home-pn-hands]')].map((b) => b.getBoundingClientRect());
            return {
                panel: panel !== null, overflow: document.documentElement.scrollWidth - window.innerWidth,
                inside: rows.length > 0 && rows.every((r) => r.left >= 0 && r.right <= window.innerWidth + 0.5),
                minButton: buttons.length ? Math.min(...buttons.map((b) => Math.round(b.height))) : 0,
                chip: document.querySelector('[data-poker-night-chip]')?.getBoundingClientRect().right ?? Infinity,
                chipKind: document.querySelector('[data-poker-night-chip]')?.getAttribute('data-poker-night-chip') ?? null,
                chipTop: Math.round((document.querySelector('[data-poker-night-chip]')?.getBoundingClientRect().top ?? Infinity) + scrollY),
                chipHeight: Math.round(document.querySelector('[data-poker-night-chip]')?.getBoundingClientRect().height ?? 0),
            };
        });
        check(`Home's poker night at ${width}×${height}: no sideways scroll, every row inside, the chip on screen${width < 640 ? ', every button 44 px' : ''}`,
            fit.panel && fit.overflow <= 1 && fit.inside && fit.chip <= width + 0.5 && (width >= 640 || fit.minButton >= 44), JSON.stringify(fit));
        // The way back to the seat is on the first screen, not two screens down.
        if (width < 640) {
            await page.waitForSelector('[data-poker-night-chip="rejoin"]', {timeout: 15000}).catch(() => {});
            const top = await page.evaluate(() => {
                const chip = document.querySelector('[data-poker-night-chip]');
                return chip && {kind: chip.getAttribute('data-poker-night-chip'), top: Math.round(chip.getBoundingClientRect().top + scrollY), h: Math.round(chip.getBoundingClientRect().height)};
            });
            check(`…the chip's Rejoin within the first screen at ${width}×${height}, a 44 px target`, top?.kind === 'rejoin' && top.top + top.h <= height && top.h >= 44, JSON.stringify(top));
        }
        if (width === 390) {
            await page.addStyleTag({content: 'nextjs-portal{display:none!important}'}).catch(() => {});
            await page.locator('[data-home-poker-night]').scrollIntoViewIfNeeded().catch(() => {});
            await page.screenshot({path: `${OUT}24-home-panel-390.png`});
        }
    }

    // Rejoin takes the reader to the table; leaving the seat there turns the row into Open (the
    // table is still theirs to host) and takes the lobby's card away.
    await page.setViewportSize({width: 1440, height: 900});
    await page.goto(`${BASE}/`, {waitUntil: 'load'});
    await page.waitForSelector(`[data-home-pn-table="${code}"] [data-home-pn-go]`, {timeout: 30000});
    await page.click(`[data-home-pn-table="${code}"] [data-home-pn-go]`);
    const rejoined = await page.waitForURL(new RegExp(`/play/${code}$`), {timeout: 120000}).then(() => true, () => false);
    check('Rejoin on Home opens the table', rejoined, page.url());
    await page.waitForSelector('[data-pn-ready="true"]', {timeout: 60000}).catch(() => {});
    await page.waitForSelector('[data-pn-seat-controls][data-pn-armed] [data-pn-control="leave"]', {timeout: 30000});
    await page.click('[data-pn-control="leave"]');
    const left = await page.waitForSelector('[data-pn-left]', {timeout: 20000}).then(() => true, () => false);
    const hosted = await homePanel();
    check('after leaving the seat, Home still lists the table the reader hosts, now with Open and no Seated badge',
        left && hosted?.yours.length === 1 && hosted.yours[0].code === code && hosted.yours[0].go === 'open' && !/Seated/.test(hosted.yours[0].text),
        JSON.stringify(hosted));
    await page.waitForLoadState('networkidle').catch(() => {});
    const hostedChip = await chipOf();
    check('…and the chip is the lobby\'s again (no seat to go back to)', hostedChip?.kind === 'lobby' && hostedChip.href === '/poker-night', JSON.stringify(hostedChip));
    await page.goto(`${BASE}/poker-night`, {waitUntil: 'load'});
    await page.waitForSelector('[data-quick-start="holdem"]', {timeout: 60000});
    check('…and the lobby offers no "You are seated at …" card', await page.locator('[data-lobby-resume]').count() === 0);
} catch (err) {
    check(`threw: ${err.message}`, false);
} finally {
    await mongo.close().catch(() => {});
    await browser.close();
}
summary('home');
