// A screenshot of every page at a desktop and a phone width — the before/after record for a change
// meant to look identical (a refactor, a styling migration). Three passes, since no one reader
// has every page:
//   signed out   the front door and the auth pages;
//   an account   one that is not the owner, as most are — every page such an account has;
//   the owner    the address this harness admits as the owner (owners.mjs, tag 'sweep') — the
//                pages that are the owner's alone (the lab, both brains, the strategies, the
//                trading agent world) and the ones drawn differently for them (Home, the settings
//                sections, a topic, a stock).
// Saves to ./output/sweep/<width>/<name>.png, the owner's pictures as owner-<name>.png, so the two
// signed-in passes sit side by side in one folder. Run it on the base, copy the folder aside, run
// it on the change, then compare with `node visual-diff.mjs <before> <after>`.
// Run it inside the harness: `npm run qa -- visual-sweep` (README.md).
//
// QA_THEME=<palette>[,<palette>…] (say nord,paper) sweeps under each palette named instead of the
// default one, into ./output/sweep-<palette>/ — a change to the look is checked palette by palette
// in one harness run. The app has one look, so a palette is all there is to name.
// QA_SWEEP_PAGES=home,owner-brain,… limits the sweep to those pictures (the names below, the
// owner's with their owner- prefix), for a quick look at a few screens.
//
// It records and asserts nothing. What would make a picture a poor record — another page than the
// one asked for, the 404, a route's error boundary, a skeleton still showing, the wrong palette,
// icons drawn as their names — is said in a NOTE line naming the picture, and the run exits 1
// only when a picture could not be taken at all.
import {chromium} from 'playwright';
import {MongoClient} from 'mongodb';
import {createJiti} from 'jiti';
import {mkdirSync} from 'node:fs';
import {BASE, HOME_URL, MONGO, PASSWORD, REPO_ROOT, hydrated, note, outDir, ownerEmail} from './lib.mjs';
import {STUB_PORT as TIINGO_PORT} from './tiingo-series.mjs';

// A sweep's theme is a palette, set through the cookie the root layout reads — written here by
// the app's own encoder (lib/theme/resolve.ts), so the sweep follows the cookie's shape. Neither
// of the sweep's accounts ever saves a theme, so nothing overrides it; with no palette named,
// no cookie is set and the pictures are the default theme's. The names are held to the app's
// registry (lib/theme/palettes.ts) before anything starts: a cookie the app cannot read is the
// default theme, so a mistyped palette — or the <palette>:<style> pair a theme was while the app
// had five styles — would otherwise fill its folder with the default's pictures.
const jiti = createJiti(import.meta.url, {alias: {'@': REPO_ROOT.replace(/\/$/, '')}, fsCache: false});
const {PALETTE_IDS} = await jiti.import(`${REPO_ROOT}lib/theme/palettes.ts`);
const {THEME_COOKIE, encodeThemeCookie} = await jiti.import(`${REPO_ROOT}lib/theme/resolve.ts`);
const THEMES = (process.env.QA_THEME || '').split(',').map((t) => t.trim()).filter(Boolean);
const notPalettes = THEMES.filter((theme) => !PALETTE_IDS.includes(theme));
if (notPalettes.length > 0) {
    console.error(`QA_THEME is a list of palettes, <palette>[,<palette>…], and names no palette called ${notPalettes.map((t) => `"${t}"`).join(', ')}. The palettes: ${PALETTE_IDS.join(', ')}`);
    process.exit(2);
}

const setTheme = async (context, palette) => {
    if (!palette) return;
    await context.addCookies([{name: THEME_COOKIE, value: encodeThemeCookie({palette, reduceMotion: false}), domain: new URL(BASE).hostname, path: '/'}]);
};
const folderOf = (palette) => (palette ? `sweep-${palette}` : 'sweep');

const WIDTHS = [{name: 'desktop', width: 1440, height: 900}, {name: 'phone', width: 390, height: 844}];

// One followed topic's page. Which topic is read off the account's own rail once it is signed in
// (followedTopic below), so the address is always one the account really follows.
const TOPIC = '/topics/<a followed topic>';
// The address that is meant to answer 404.
const NOT_FOUND = '/this-page-does-not-exist';

// /settings shows one section at a time: the first (Topics) is the plain address, the rest are these.
const SETTINGS_SECTIONS = [
    ['settings-news', '/settings?tab=news'],
    ['settings-appearance', '/settings?tab=appearance'],
    ['settings-dashboard', '/settings?tab=dashboard'],
    ['settings-notifications', '/settings?tab=notifications'],
    ['settings-account', '/settings?tab=account'],
];

const SIGNED_OUT = [
    ['landing', '/'],
    ['sign-in', '/sign-in'],
    ['sign-up', '/sign-up'],
    ['forgot-password', '/forgot-password'],
    ['reset-password-bad-token', '/reset-password?token=not-a-token'],
];
// What an account that is not the owner has. The lab, the brains, the strategies and the agent
// world send it Home (lib/auth/session.requireOwner), so those are in the owner's pass alone.
const SIGNED_IN = [
    ['home', '/'],
    ['dashboard', '/dashboard'],
    ['topics', '/topics'],
    ['topics-edit', '/topics?edit=1'],
    ['topic', TOPIC],
    ['news', '/news'],
    ['portfolio', '/portfolio'],
    ['trade', '/trade'],
    ['trade-heatmap', '/trade?view=heatmap'],
    ['watchlist', '/watchlist'],
    ['friends', '/friends'],
    ['history', '/history'],
    ['settings', '/settings'],
    ...SETTINGS_SECTIONS,
    ['glossary', '/glossary'],
    ['games', '/games'],
    ['games-puzzle', '/games/puzzle'],
    ['games-archive', '/games/puzzles'],
    ['games-arithmetic', '/games/arithmetic'],
    ['games-kelly', '/games/kelly'],
    ['games-market', '/games/market-making'],
    ['games-correlation', '/games/correlation'],
    ['poker', '/poker'],
    ['poker-push-fold', '/poker?tab=push-fold'],
    ['poker-pot-odds', '/poker?tab=pot-odds'],
    ['poker-night', '/poker-night'],
    ['stock-spy', '/stocks/SPY'],
    ['not-found', NOT_FOUND],
];
// The owner's own pages, and the shared ones that are drawn differently for them: Home, a topic,
// a stock's page (with what the strategies see of it) and the settings sections — Broker is
// theirs alone, and their Dashboard section lists the owner's widgets.
const OWNER = [
    ['home', '/'],
    ['brain', '/brain'],
    ['culture', '/culture'],
    ['culture-picks', '/culture?view=picks'],
    ['strategies', '/strategies'],
    ['strategy-rsi2', '/strategies/rsi2-mean-reversion'],
    ['strategy-buy-and-hold', '/strategies/buy-and-hold-spy'],
    ['learn', '/learn'],
    ['agent-world', '/agent-world'],
    ['topic', TOPIC],
    ['stock-spy', '/stocks/SPY'],
    ['settings', '/settings'],
    ...SETTINGS_SECTIONS,
    ['settings-broker', '/settings?tab=broker'],
];

// The first request for a route waits for `next dev` to compile it, which can outlast Playwright's
// thirty seconds on a busy machine.
const NAV_TIMEOUT = 120000;

// A form's fields are reset when hydration lands, so it is opened once and React waited for
// before anything is typed into it.
const warmForm = async (page, path) => {
    await page.goto(`${BASE}${path}`, {waitUntil: 'load', timeout: NAV_TIMEOUT});
    await hydrated(page.locator('#email'));
};

// Each account keeps one address from run to run: the Account section prints it, and a before and
// an after sweep must not differ by the timestamp signUp would put in it. The account's is no
// owner's (owners.mjs lists those); the owner's is the 'sweep' tag there.
const ACCOUNT = {tag: 'Sweep', email: 'qa-sweep@example.com'};
const OWNER_ACCOUNT = {tag: 'Sweep owner', email: ownerEmail('sweep')};

// Signs the account up — or in, when a sweep earlier in this harness already made it, as the
// suites that share the lab's owner do. Either way the fields are filled on the form warmForm
// opened and React hydrated, never on a fresh load of it (lib.mjs's signUp loads the page again
// and types at once). The name is the one signUp gives an account ("QA <tag>").
const enter = ({tag, email}) => async (page) => {
    const mongo = new MongoClient(MONGO, {serverSelectionTimeoutMS: 5000});
    const known = await mongo.connect()
        .then(() => mongo.db().collection('user').findOne({email}))
        .catch(() => null)   // no database to ask (QA_BASE_URL points elsewhere): try the sign-up
        .finally(() => mongo.close().catch(() => {}));
    await warmForm(page, known ? '/sign-in' : '/sign-up');
    if (!known) await page.fill('#fullName', `QA ${tag}`);
    await page.fill('#email', email);
    await page.fill('#password', PASSWORD);
    await page.click('button[type="submit"]');
    await page.waitForURL(HOME_URL, {timeout: 90000});
};

const PASSES = [
    {label: 'signed out', prefix: '', pages: SIGNED_OUT, enter: null},
    {label: 'as an account', prefix: '', pages: SIGNED_IN, enter: enter(ACCOUNT)},
    {label: 'as the owner', prefix: 'owner-', pages: OWNER, enter: enter(OWNER_ACCOUNT)},
].map((pass) => ({...pass, pages: pass.pages.map(([name, path]) => ({file: `${pass.prefix}${name}`, path}))}));

const KNOWN = PASSES.flatMap((pass) => pass.pages.map((p) => p.file));
const ONLY = new Set((process.env.QA_SWEEP_PAGES || '').split(',').map((p) => p.trim()).filter(Boolean));
const unknown = [...ONLY].filter((name) => !KNOWN.includes(name));
if (unknown.length > 0) {
    console.error(`QA_SWEEP_PAGES names no picture called ${unknown.map((n) => `"${n}"`).join(', ')}. The pictures: ${KNOWN.join(', ')}`);
    process.exit(2);
}
for (const pass of PASSES) pass.pages = pass.pages.filter((p) => ONLY.size === 0 || ONLY.has(p.file));

// A new account follows the six default topics (lib/topics/starters). The first by slug, so every
// run opens the same one.
const followedTopic = async (page) => {
    await page.goto(`${BASE}/topics`, {waitUntil: 'load', timeout: NAV_TIMEOUT});
    const hrefs = await page.locator('nav[aria-label="Your topics"] a[href^="/topics/"]')
        .evaluateAll((links) => links.map((a) => a.getAttribute('href')));
    return hrefs.sort()[0] ?? null;
};

// Animated and time-dependent pieces would make every run differ; hide them so a diff means markup.
// The robot's tip is one (it speaks fifteen seconds into a topics page, and a busy page can take
// that long to go quiet); nextjs-portal is `next dev`'s own indicator, in no production page.
// What stays in the picture and still moves with the clock is words, not layout: a headline and
// its age, the market status and the order ticket's line about it, the day's puzzle and lab unit.
const STILL = `
  *, *::before, *::after { animation: none !important; transition: none !important; caret-color: transparent !important; }
  canvas, iframe, .tradingview-widget-container { visibility: hidden !important; }
  [data-robot-tip], nextjs-portal { display: none !important; }
`;

// A route's loading skeleton, a streamed widget's placeholder and a 3D scene's pending layer are
// all a pulsing div hidden from a screen reader (components/primitives/Skeleton).
const SKELETON = 'div.animate-pulse[aria-hidden="true"]';

// Opens a page and waits until it has stopped changing: the terrain's first frame, the solver's
// answer, the network quiet, no skeleton left, the fonts in.
const open = async (page, path) => {
    const response = await page.goto(`${BASE}${path}`, {waitUntil: 'load', timeout: NAV_TIMEOUT});
    // A page with the momentum terrain draws it a moment after load; wait for its first frame so
    // the layout below it has settled. (Chromium's full-page capture still paints a WebGL canvas
    // black; qa-landing's viewport-sized captures are where the drawing itself is checked.)
    if (await page.locator('[data-terrain]').count() > 0) {
        await page.locator('[data-terrain-state="ready"], [data-terrain-state="flat"], [data-terrain-state="unavailable"]').first().waitFor({timeout: 20000}).catch(() => {});
        await page.waitForTimeout(1500);
    }
    // The poker solver's push-or-fold tab solves its default spot as it arrives, in a worker.
    if (await page.locator('[data-push-fold-status]').count() > 0) {
        await page.locator('[data-push-fold-status="solved"]').waitFor({timeout: 30000}).catch(() => {});
    }
    await page.waitForLoadState('networkidle', {timeout: 15000}).catch(() => {});
    await page.waitForFunction((selector) => ![...document.querySelectorAll(selector)].some((el) => el.getClientRects().length > 0), SKELETON, {timeout: 15000}).catch(() => {});
    await page.evaluate(() => document.fonts.ready).catch(() => {});
    return response;
};

// What makes the picture about to be taken a poor record of its page, in words; empty when nothing does.
const doubts = async (page, response, path, theme) => {
    const found = [];
    const landed = new URL(page.url()).pathname;
    if (landed !== new URL(path, BASE).pathname) found.push(`it landed on ${landed}`);
    const status = response?.status() ?? 0;
    if (status >= 400 && path !== NOT_FOUND) found.push(`the page answered ${status}`);
    const seen = await page.evaluate((selector) => ({
        palette: document.documentElement.dataset.palette,
        // components/shell/RouteError, which every route's error.tsx renders.
        failed: [...document.querySelectorAll('h3')].some((h) => h.textContent === "This page couldn't load"),
        // Both 404s (app/not-found.tsx, app/(root)/not-found.tsx); a streamed one still answers 200.
        missing: [...document.querySelectorAll('h1')].some((h) => h.textContent.trim() === 'Not found'),
        skeleton: [...document.querySelectorAll(selector)].some((el) => el.getClientRects().length > 0),
        // The icon font comes from Google Fonts; without it every icon is drawn as its name.
        icons: document.querySelector('.material-symbols-outlined') === null || document.fonts.check('24px "Material Symbols Outlined"'),
    }), SKELETON);
    if (theme && seen.palette !== theme) found.push(`it is drawn in ${seen.palette}`);
    if (seen.failed) found.push("it shows the route's error boundary");
    if (seen.missing && path !== NOT_FOUND) found.push('it shows the not-found page');
    if (seen.skeleton) found.push('a skeleton is still showing');
    if (!seen.icons) found.push('the icon font had not loaded');
    return found;
};

const firstLine = (error) => String(error?.message ?? error).split('\n')[0];

// The harness's stand-ins for Tiingo and Finnhub start silent, since most suites check what the
// app does without them: the front door's terrain says it is unavailable, Home has none, the order
// ticket has no price, and a stock's page is the 404 for anyone but the owner. For the pictures
// they answer as the services do — Tiingo up (start-tiingo-stub.mjs), Finnhub pricing the two
// symbols the swept pages ask about (start-finnhub-stub.mjs), at prices that never move — and they
// are put back at the end. (The app keeps what it read from them, a surface and two quotes, so in
// a run that names suites too the sweep goes last.)
const FINNHUB = `http://localhost:${process.env.QA_FINNHUB_PORT ?? 8791}`;
const standIns = async (on) => {
    const get = (url) => fetch(url).catch(() => null);   // not this harness (QA_BASE_URL elsewhere): nothing to switch
    await get(`http://localhost:${TIINGO_PORT}/__mode?set=${on ? 'up' : 'down'}`);
    await get(`${FINNHUB}/__prices${on ? '?SPY=600&AAPL=230' : ''}`);
    await get(`${FINNHUB}/__mode?set=${on ? 'prices' : 'empty'}`);
};

const runs = THEMES.length > 0 ? THEMES : [''];
const wanted = PASSES.reduce((sum, pass) => sum + pass.pages.length, 0) * runs.length * WIDTHS.length;
const browser = await chromium.launch({channel: 'chrome'});
const taken = [];
let total = 0;
let doubted = 0;
try {
    await standIns(true);
    for (const pass of PASSES) {
        if (pass.pages.length === 0) continue;
        if (!browser.isConnected()) break;   // Chrome went during the pass before: nothing more can be taken
        const started = Date.now();
        const context = await browser.newContext({viewport: {width: WIDTHS[0].width, height: WIDTHS[0].height}});
        const page = await context.newPage();
        let shots = 0;
        try {
            if (pass.enter) await pass.enter(page);
            const pages = [];
            for (const entry of pass.pages) {
                if (entry.path !== TOPIC) { pages.push(entry); continue; }
                const topic = await followedTopic(page);
                if (topic) pages.push({...entry, path: topic});
                else note(entry.file, 'not taken: the account follows no topic');
            }

            // Once through before any picture. `next dev` compiles a route on its first request,
            // and a first visit changes what later ones show — the topics' first fetch, the News
            // dot, the first-week step that opening a topic ticks — so without this the first
            // theme's pictures would differ from the later ones' for reasons that are not the theme.
            for (const {file, path} of pages) await open(page, path).catch((error) => note(file, `its first visit failed: ${firstLine(error)}`));

            for (const theme of runs) {
                const folder = folderOf(theme);
                const out = outDir(folder);
                await setTheme(context, theme);
                for (const width of WIDTHS) {
                    mkdirSync(`${out}${width.name}`, {recursive: true});
                    await page.setViewportSize({width: width.width, height: width.height});
                    for (const {file, path} of pages) {
                        const picture = `${folder}/${width.name}/${file}.png`;
                        const began = Date.now();
                        try {
                            const response = await open(page, path);
                            const found = await doubts(page, response, path, theme);
                            await page.addStyleTag({content: STILL}).catch(() => {});
                            await page.waitForTimeout(600);
                            await page.screenshot({path: `${out}${width.name}/${file}.png`, fullPage: true});
                            shots++;
                            console.log(`shot  ${picture}  ${((Date.now() - began) / 1000).toFixed(1)}s`);
                            if (found.length > 0) { doubted++; note(picture, found.join('; ')); }
                        } catch (error) {
                            if (!browser.isConnected()) throw error;   // Chrome is gone: every later picture would say the same
                            note(picture, `not taken: ${firstLine(error)}`);
                        }
                    }
                }
            }
        } catch (error) {
            // The pass could not go on (its account did not sign in, say): the rest of its pictures are missing.
            note(pass.label, `stopped: ${firstLine(error)}`);
        } finally {
            await context.close().catch(() => {});
        }
        total += shots;
        taken.push(`${shots} ${pass.label}`);
        console.log(`${pass.label}: ${shots} screenshots in ${Math.round((Date.now() - started) / 1000)}s`);
    }
} finally {
    await standIns(false);
    await browser.close().catch(() => {});
}
console.log(`saved ${total} screenshots (${taken.join(', ')}) to ${runs.map((theme) => `output/${folderOf(theme)}/`).join(', ')}`
    + ` — ${doubted} with a NOTE above, ${wanted - total} not taken`);
process.exit(total === wanted ? 0 : 1);
