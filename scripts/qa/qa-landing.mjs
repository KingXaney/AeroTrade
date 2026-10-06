// The front door's momentum terrain (components/landing/MomentumTerrain, lib/landing,
// lib/prices/tiingo, app/api/landing/surface). The harness stands a server in for Tiingo
// (start-tiingo-stub.mjs), down until this suite switches it on. With it down and no SPY history
// the route is a 404 and the hero says why; on 560 seeded SPY sessions the route draws from the
// stored bars — the plan's shape, its cells matching a recomputation here, cached five minutes;
// with the stand-in up the route prefers it: the surface equals the one the app's own modules build
// from its rows (through jiti), the token travels in a header, and a second request asks it
// nothing. Then the page: the 3D canvas named for a screen reader, the tooltip on hover, the camera
// presets and the flatten toggle, the legend and the 20-day slice, one "What these mean" with its
// three terms and no Ask links, the Tiingo credit, a theme repaint, reduced motion stopping the
// rotation, and a phone.
// Run: npm run qa -- landing   (the harness: README.md)
import {chromium} from 'playwright';
import {MongoClient} from 'mongodb';
import {createJiti} from 'jiti';
import {BASE, MONGO, REPO_ROOT, check, note, outDir, summary} from './lib.mjs';
import {STUB_PORT, STUB_TOKEN, tiingoRows} from './tiingo-series.mjs';

const STUB = `http://localhost:${STUB_PORT}`;
const jiti = createJiti(import.meta.url, {alias: {'@': REPO_ROOT.replace(/\/$/, '')}, fsCache: false});
const {parseTiingoDaily, tiingoCutoff} = await jiti.import(`${REPO_ROOT}lib/prices/tiingo.ts`);
const {buildMomentumSurface} = await jiti.import(`${REPO_ROOT}lib/landing/momentum-surface.ts`);

const OUT = outDir('landing');
const SURFACE = `${BASE}/api/landing/surface`;
const SESSIONS = 560;
const LOOKBACKS = [5, 10, 20, 40, 80, 160, 250];
const VOL_WINDOW = 60;
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

const browser = await chromium.launch({channel: 'chrome'});
const page = await browser.newPage({viewport: {width: 1440, height: 900}});
const shot = (n, p = page) => p.screenshot({path: `${OUT}${n}.png`, fullPage: false});
const mongo = new MongoClient(MONGO);

// --- the seeded year: a random walk with no dividends, so the total-return index is the close
// itself and this script can recompute a cell exactly the way lib/landing/momentum-surface does.
const lcg = (seed) => () => {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    return seed / 4294967296;
};
const random = lcg(20261006);
const gaussian = () => Math.sqrt(-2 * Math.log(1 - random())) * Math.cos(2 * Math.PI * random());
const weekdaysEnding = (count) => {
    const out = [];
    const d = new Date();
    d.setUTCHours(0, 0, 0, 0);
    while (out.length < count) {
        const day = d.getUTCDay();
        if (day !== 0 && day !== 6) out.unshift(d.toISOString().slice(0, 10));
        d.setUTCDate(d.getUTCDate() - 1);
    }
    return out;
};
const dates = weekdaysEnding(SESSIONS);
const closes = [];
let close = 480;
for (let k = 0; k < SESSIONS; k += 1) {
    if (k > 0) close *= Math.exp(0.0004 + 0.011 * gaussian());
    closes.push(Math.round(close * 100) / 100);
}
const logp = closes.map((c) => Math.log(c));
const expectedZ = (t, n) => {
    const returns = [];
    for (let k = t - VOL_WINDOW + 1; k <= t; k += 1) returns.push(logp[k] - logp[k - 1]);
    const mean = returns.reduce((a, b) => a + b, 0) / VOL_WINDOW;
    const sd = Math.sqrt(returns.reduce((a, r) => a + (r - mean) ** 2, 0) / (VOL_WINDOW - 1));
    return (logp[t] - logp[t - n]) / (sd * Math.sqrt(n));
};
const shortDate = (date) => `${MONTHS[Number(date.slice(5, 7)) - 1]} ${Number(date.slice(8, 10))}, ${date.slice(0, 4)}`;
const bar = (date, c) => ({symbol: 'SPY', date, close: c, open: c, high: c, low: c, source: 'yahoo'});

let pricebars;
let savedSpy = [];
let seeded = false;
try {
    await mongo.connect();
    pricebars = mongo.db().collection('pricebars');
    savedSpy = await pricebars.find({symbol: 'SPY'}).toArray();
    const stubMode = async (mode) => (await (await page.request.get(`${STUB}/__mode?set=${mode}`)).json()).mode;
    const stubStats = async () => (await page.request.get(`${STUB}/__stats`)).json();
    check('the Tiingo stand-in answers, and starts down', (await stubMode('down')) === 'down');

    // --- nothing to draw: the route says so, and so does the hero ---------------------------
    if (savedSpy.length === 0) {
        const empty = await page.request.get(SURFACE);
        check('with no SPY history the route is a 404 that no browser keeps',
            empty.status() === 404 && (await empty.json()).error === 'unavailable' && /no-store/.test(empty.headers()['cache-control'] ?? ''),
            `${empty.status()} ${empty.headers()['cache-control']}`);
        await page.goto(`${BASE}/`, {waitUntil: 'load'});
        await page.locator('[data-terrain-state="unavailable"]').waitFor({timeout: 20000}).catch(() => {});
        const box = page.locator('[data-landing-terrain]');
        check('…and the hero shows its unavailable state, with no controls, legend or slice',
            await page.locator('[data-terrain-state="unavailable"]').count() === 1
            && /stored a year of SPY closes/.test(await box.innerText())
            && await box.locator('[data-terrain-preset], [data-terrain-legend], [data-terrain-slice], [data-what-these-mean]').count() === 0);
        await shot('00-unavailable');
    } else {
        note('SPY bars already stored; the empty-state checks are skipped', `${savedSpy.length} rows`);
    }

    // --- the seeded year ---------------------------------------------------------------------
    await pricebars.deleteMany({symbol: 'SPY'});
    await pricebars.insertMany(dates.map((d, i) => bar(d, closes[i])));
    seeded = true;

    const response = await page.request.get(SURFACE);
    check('the route answers 200, cached five minutes and served stale while it refreshes',
        response.status() === 200 && /max-age=300/.test(response.headers()['cache-control'] ?? '') && /stale-while-revalidate/.test(response.headers()['cache-control'] ?? ''),
        `${response.status()} ${response.headers()['cache-control']}`);
    const surface = await response.json();
    const last = SESSIONS - 1;
    const first = SESSIONS - 250;
    check('…with the plan\'s shape: 7 lookbacks × 250 sessions, dated by the last close',
        JSON.stringify(surface.lookbacks) === JSON.stringify(LOOKBACKS) && surface.ticker === 'SPY'
        && surface.dates.length === 250 && surface.z.length === 7 && surface.z.every((row) => row.length === 250)
        && surface.price.length === 250 && surface.updated === dates[last] && surface.dates[0] === dates[first] && surface.dates[249] === dates[last],
        `${surface.dates?.length} days, ${surface.z?.length} rows, updated ${surface.updated}`);
    check('…the plain close as the price', surface.price[249] === closes[last] && surface.price[0] === closes[first], `${surface.price?.[249]} vs ${closes[last]}`);
    const cells = [[2, 249, expectedZ(last, 20)], [6, 0, expectedZ(first, 250)], [0, 120, expectedZ(first + 120, 5)], [4, 200, expectedZ(first + 200, 80)]];
    const offBy = cells.map(([row, day, expected]) => Math.abs(surface.z[row][day] - expected));
    check('…every sampled cell equal to ln(P_t/P_t−n) / (σ_t√n) recomputed here, to three decimals',
        offBy.every((d) => d <= 0.0015), offBy.map((d) => d.toFixed(4)).join(', '));
    const absMax = Math.max(...surface.z.flat().map(Math.abs));
    check('…and the colour scale is the largest |z| on the grid', surface.zAbsMax === absMax && absMax > 0 && absMax < 20, `${surface.zAbsMax} vs ${absMax}`);
    check('…the notable cells, if any, are beyond 3σ, one per day, at most three',
        Array.isArray(surface.notable) && surface.notable.length <= 3
        && surface.notable.every((c) => Math.abs(c.z) > 3 && surface.z[c.lookback][c.day] === c.z)
        && new Set(surface.notable.map((c) => c.day)).size === surface.notable.length, `${surface.notable?.length} notable`);
    check('…and says it drew from the stored bars, Tiingo being down', surface.source === 'stored', String(surface.source));

    // --- Tiingo up: the route prefers it ------------------------------------------------------
    await stubMode('up');
    const before = await stubStats();
    const viaTiingo = await page.request.get(SURFACE);
    const tiingoSurface = await viaTiingo.json();
    const rows = tiingoRows();
    const stubBars = parseTiingoDaily(rows, {excludeFrom: tiingoCutoff(new Date())});
    const expectedTiingo = buildMomentumSurface(stubBars.map((bar) => ({date: bar.date, value: bar.adjClose, close: bar.close})), {source: 'tiingo'});
    check('with Tiingo answering, the route serves exactly the surface the app\'s own modules build from its rows',
        viaTiingo.status() === 200 && tiingoSurface.source === 'tiingo' && expectedTiingo !== null
        && JSON.stringify(tiingoSurface) === JSON.stringify(expectedTiingo), `${tiingoSurface.source} updated ${tiingoSurface.updated}`);
    const lastRow = rows[rows.length - 1];
    check('…dated by its last session, the plain close as the price, the adjusted close under the surface',
        tiingoSurface.updated === lastRow.date.slice(0, 10) && tiingoSurface.price[249] === lastRow.close && lastRow.adjClose !== lastRow.close
        && tiingoSurface.price[249] !== surface.price[249], `${tiingoSurface.updated} $${tiingoSurface.price?.[249]}`);
    const after = await stubStats();
    check('…the token went in the Authorization header, never in the URL, and only SPY was asked for',
        after.served === before.served + 1 && after.lastAuthorization === `Token ${STUB_TOKEN}`
        && /^\/tiingo\/daily\/spy\/prices\?startDate=\d{4}-\d{2}-\d{2}&resampleFreq=daily$/.test(after.lastUrl ?? '') && !/token/i.test(after.lastUrl ?? ''), after.lastUrl);
    await page.request.get(SURFACE);
    check('…and a second request asks Tiingo nothing', (await stubStats()).served === after.served);
    const shown = tiingoSurface;

    // --- the hero ----------------------------------------------------------------------------
    await page.goto(`${BASE}/`, {waitUntil: 'load'});
    const terrain = page.locator('[data-terrain]');
    await page.locator('[data-terrain-state="ready"], [data-terrain-state="flat"]').waitFor({timeout: 45000}).catch(() => {});
    const state = await terrain.getAttribute('data-terrain-state');
    check('the hero draws the terrain', state === 'ready' || state === 'flat', String(state));
    await page.waitForTimeout(1200);   // the intro rise
    await shot('01-hero');
    if (state === 'flat') note('this browser gave no WebGL: the 2D heatmap stands in, so the 3D-only checks are skipped');
    const canvas = terrain.locator('canvas[role="img"]');
    const ariaLabel = (await canvas.getAttribute('aria-label')) ?? '';
    check('…as an image named for a screen reader: what, when, and the 20-day figure',
        await canvas.count() === 1 && ariaLabel.startsWith('SPY momentum surface over the last 250 sessions')
        && ariaLabel.includes(`updated ${shortDate(shown.updated)}`) && /20-day momentum [-+]?\d\.\d\dσ\.$/.test(ariaLabel), ariaLabel);
    const box = page.locator('[data-landing-terrain]');
    const text = (await box.innerText()).replace(/\n/g, ' ');
    check('…under the eyebrow, with the legend, the 20-day slice and the dated source line',
        /S&P 500 momentum/i.test(text) && await box.locator('[data-terrain-legend]').count() === 1
        && /[-+]\d\.\dσ/.test(await box.locator('[data-terrain-legend]').innerText())
        && await box.locator('[data-terrain-slice="20"]').count() === 1 && /The 20-day row/.test(text)
        && new RegExp(`Updated ${shortDate(shown.updated)}`).test(text) && /Not a forecast/.test(text), text.slice(0, 200));
    const credit = box.locator('[data-terrain-source="tiingo"]');
    check('…naming Tiingo as the source, with its credit linked',
        await credit.count() === 1 && /from Tiingo/.test(await credit.innerText())
        && await credit.locator('a[href="https://www.tiingo.com"][target="_blank"][rel~="noopener"]').count() === 1
        && /Data via Tiingo/.test(await credit.locator('a').innerText()));
    check('…the page keeps its one h1, its sign-up button and the preview beside the steps',
        await page.locator('h1').count() === 1 && await page.locator('a[data-landing-cta][href="/sign-up"]').count() === 1
        && await page.locator('[data-landing-preview]').count() === 1 && await page.locator('#landing-steps').count() === 1);

    // one "What these mean", three terms, no Ask links on a page without the chat
    const wtm = box.locator('[data-what-these-mean]');
    check('…one "What these mean" for the panel', await wtm.count() === 1 && await page.locator('[data-what-these-mean]').count() === 1);
    await wtm.locator('summary').click();
    await page.waitForTimeout(200);
    const terms = await wtm.locator('dt').allInnerTexts();
    check('…listing normalised momentum, lookback and volatility, led by how the surface is laid out, with no Ask in chat',
        terms.map((t) => t.trim()).join('|') === 'Normalised momentum|Lookback|Volatility'
        && await wtm.locator('[data-ask]').count() === 0 && /Each row is one lookback/.test(await wtm.locator('[data-terrain-method]').innerText()), terms.join('|'));
    await wtm.locator('summary').click();

    if (state === 'ready') {
        check('…the surface turns on its own at first', (await terrain.getAttribute('data-terrain-rotating')) === 'true' && (await terrain.getAttribute('data-terrain-motion')) === 'auto');
        const presets = box.locator('[data-terrain-preset]');
        check('…three camera presets, Angle pressed', await presets.count() === 3 && (await box.locator('[data-terrain-preset="angle"]').getAttribute('aria-pressed')) === 'true');
        await box.locator('[data-terrain-preset="top"]').click();
        await page.waitForTimeout(700);
        check('…Top takes the press from Angle',
            (await box.locator('[data-terrain-preset="top"]').getAttribute('aria-pressed')) === 'true'
            && (await box.locator('[data-terrain-preset="angle"]').getAttribute('aria-pressed')) === 'false');
        await page.evaluate(() => window.scrollTo(0, 0));
        await page.waitForTimeout(300);
        await shot('02-top');
        await box.locator('[data-terrain-preset="angle"]').click();
        await page.waitForTimeout(700);
        const flatten = box.locator('[data-terrain-flatten]');
        check('…Flatten is off', (await flatten.getAttribute('aria-pressed')) === 'false' && /Flatten/.test(await flatten.innerText()));
        await flatten.click();
        await page.waitForTimeout(900);
        check('…and becomes Raise once pressed', (await flatten.getAttribute('aria-pressed')) === 'true' && /Raise/.test(await flatten.innerText()));
        await page.evaluate(() => window.scrollTo(0, 0));
        await page.waitForTimeout(300);
        await shot('03-flat');
        await flatten.click();
        await page.waitForTimeout(900);

        // hover: the tooltip, the marker and the slice follow the pointer. The clicks above
        // scrolled the page; the canvas has to be in the viewport for the pointer to reach it.
        await page.evaluate(() => window.scrollTo(0, 0));
        await page.waitForTimeout(300);
        const rect = await canvas.boundingBox();
        await page.mouse.move(rect.x + rect.width / 2, rect.y + rect.height / 2);
        await page.mouse.move(rect.x + rect.width / 2 + 4, rect.y + rect.height / 2 + 2);
        const tip = page.locator('[data-terrain-tip]');
        await tip.waitFor({timeout: 5000}).catch(() => {});
        const tipText = (await tip.innerText().catch(() => '')).replace(/\n/g, ' ');
        check('…hovering the surface names the session, the lookback, its σ and the close',
            /\w{3} \d{1,2}, \d{4}/.test(tipText) && /\d+-day lookback/.test(tipText) && /[-+]?\d\.\d\dσ/.test(tipText) && /SPY close \$\d/.test(tipText), tipText);
        const hoveredRow = await box.locator('[data-terrain-slice]').getAttribute('data-terrain-slice');
        check('…and the slice shows the hovered row with a dot on the session',
            LOOKBACKS.includes(Number(hoveredRow)) && await box.locator('[data-terrain-slice] circle').count() === 1, String(hoveredRow));
        check('…the tooltip is not for the screen reader', (await tip.getAttribute('aria-hidden')) === 'true');
        await shot('04-hover');
        await page.mouse.move(rect.x - 40, rect.y - 40);
        await page.waitForTimeout(300);
        check('…and leaves with the pointer', await tip.count() === 0 && await box.locator('[data-terrain-slice] circle').count() === 0);
        check('…the marker labels, one per notable cell',
            await box.locator('[data-terrain-marker]').count() === shown.notable.length);

        // a theme repaint from the page's own switcher keeps the terrain drawn
        await page.locator('[data-theme-demo="paper"]').click();
        await page.waitForFunction(() => document.documentElement.dataset.palette === 'paper', null, {timeout: 5000}).catch(() => {});
        await page.waitForTimeout(400);
        check('…a theme preview repaints the page with the terrain still drawn',
            (await page.evaluate(() => document.documentElement.dataset.palette)) === 'paper' && (await terrain.getAttribute('data-terrain-state')) === 'ready');
        await page.evaluate(() => window.scrollTo(0, 0));
        await page.waitForTimeout(300);
        await shot('05-paper');
    }

    // --- reduced motion: no rotation, no intro, still drawn ---------------------------------
    const still = await browser.newContext({viewport: {width: 1440, height: 900}, reducedMotion: 'reduce'});
    const stillPage = await still.newPage();
    await stillPage.goto(`${BASE}/`, {waitUntil: 'load'});
    await stillPage.locator('[data-terrain-state="ready"], [data-terrain-state="flat"]').waitFor({timeout: 45000}).catch(() => {});
    const stillTerrain = stillPage.locator('[data-terrain]');
    check('under reduced motion the terrain is drawn and does not turn',
        /^(ready|flat)$/.test((await stillTerrain.getAttribute('data-terrain-state')) ?? '')
        && (await stillTerrain.getAttribute('data-terrain-motion')) === 'reduced'
        && (await stillTerrain.getAttribute('data-terrain-rotating')) === 'false');
    await still.close();

    // --- a phone: scrolls past the hero, a tap hint, no sideways scroll ----------------------
    const phone = await browser.newContext({viewport: {width: 390, height: 844}, isMobile: true, hasTouch: true, deviceScaleFactor: 2});
    const phonePage = await phone.newPage();
    await phonePage.goto(`${BASE}/`, {waitUntil: 'load'});
    await phonePage.locator('[data-terrain-state="ready"], [data-terrain-state="flat"]').waitFor({timeout: 45000}).catch(() => {});
    const host = phonePage.locator('[data-terrain] canvas[role="img"]');
    const hostBox = await host.boundingBox();
    check('on a phone the landing page has no sideways scroll',
        (await phonePage.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)) <= 1);
    check('…the canvas is 4:3 and lets a finger scroll past it',
        hostBox !== null && Math.abs(hostBox.width / hostBox.height - 4 / 3) < 0.05 && hostBox.width <= 390
        && (await host.evaluate((el) => getComputedStyle(el).touchAction)) === 'pan-y'
        && (await host.evaluate((el) => getComputedStyle(el.parentElement).touchAction)) === 'pan-y', JSON.stringify(hostBox));
    const phoneText = (await phonePage.locator('[data-landing-terrain]').innerText()).replace(/\n/g, ' ');
    check('…with the tap hint, and the headline above the canvas',
        /Tap a point for its date/.test(phoneText)
        && (await phonePage.locator('h1').boundingBox()).y < hostBox.y, phoneText.slice(0, 120));
    await shot('06-phone', phonePage);
    await phone.close();
} catch (err) {
    check(`threw: ${err.message}`, false);
    await shot('99-error').catch(() => {});
} finally {
    await page.request.get(`${STUB}/__mode?set=down`).catch(() => {});
    if (seeded && pricebars) {
        await pricebars.deleteMany({symbol: 'SPY'}).catch(() => {});
        if (savedSpy.length > 0) await pricebars.insertMany(savedSpy).catch(() => {});
    }
    await mongo.close().catch(() => {});
    await browser.close();
}

summary('landing');
