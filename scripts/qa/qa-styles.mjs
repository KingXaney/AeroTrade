// Styles and the page frame (app/globals.css, lib/theme, the route boundaries): the warning
// token and its utility resolve, six pages carry no phantom scroll below their content, the order
// ticket's hand-rolled input shows a focus ring, and TradingView embeds keep the light scheme their
// documents use under a dark palette, and a theme cookie written before the app kept one look
// (v1, with a style in it) still gives a page that never syncs the cookie its palette and its
// motion choice, and a save sets the palette and the motion choice and leaves a style saved before
// then where it is. Also the not-found pages: an unmatched URL gets the global 404, a notFound()
// inside the app keeps the header, and a symbol no strategy watches renders keyless with no
// stock panels.
// Run: npm run qa -- styles   (the harness: README.md)
import {chromium} from 'playwright';
import {MongoClient} from 'mongodb';
import {BASE, MONGO, check, outDir, ownerEmail, signUp, summary} from './lib.mjs';

const OUT = outDir('styles');

const browser = await chromium.launch({channel: 'chrome'});
const page = await browser.newPage({viewport: {width: 1440, height: 900}});
const shot = (n) => page.screenshot({path: `${OUT}${n}.png`, fullPage: true});

try {
    // --- sign up ---------------------------------------------------------------
    // The owner (lib/lab/owner.ts), so the sweep reaches /brain and /strategies too.
    const email = await signUp(page, 'Foundations', {email: ownerEmail('styles')});
    check('sign-up lands in the app', page.url().endsWith('/dashboard'), page.url());

    // --- the warning token actually resolves (both globals.css edits landed) ----
    const warning = await page.evaluate(() =>
        getComputedStyle(document.documentElement).getPropertyValue('--warning').trim());
    check('--warning is defined', warning.length > 0, warning);

    const warningUtility = await page.evaluate(() => {
        // If the @theme inline mapping is missing, Tailwind never emits text-warning and
        // the probe keeps its inherited colour instead of the token's.
        const el = document.createElement('span');
        el.className = 'text-warning';
        document.body.appendChild(el);
        const c = getComputedStyle(el).color;
        el.remove();
        return c;
    });
    check('text-warning utility is generated', warningUtility === 'rgb(255, 209, 102)', warningUtility);

    // --- no phantom scroll on the pages that carried a doubled min-h-screen -----
    for (const path of ['/', '/dashboard', '/portfolio', '/settings', '/brain', '/strategies', '/trade']) {
        await page.goto(`${BASE}${path}`, {waitUntil: 'networkidle'}).catch(() => {});
        // The bug was a doubled min-h-screen: scrollable space with nothing in it. So
        // measure the gap between the document's scroll height and the bottom of the
        // lowest rendered element, not the scroll height itself — real content can land
        // at any height.
        const phantom = await page.evaluate(() => {
            let bottom = 0;
            for (const el of document.body.querySelectorAll('*')) {
                if (getComputedStyle(el).position === 'fixed') continue;
                const r = el.getBoundingClientRect();
                if (r.height > 0) bottom = Math.max(bottom, r.bottom + window.scrollY);
            }
            return document.documentElement.scrollHeight - bottom;
        });
        check(`${path} has no phantom scroll below its content`, phantom < 100, `${Math.round(phantom)}px of empty scroll`);
    }

    // --- focus ring on a hand-rolled input (the order ticket) ------------------
    // 'networkidle' never settles here — the TradingView advanced chart keeps streaming.
    await page.goto(`${BASE}/trade`, {waitUntil: 'domcontentloaded'});
    const symbolInput = page.locator('input[placeholder="e.g. AAPL"]');
    await symbolInput.waitFor({timeout: 15000});
    await page.keyboard.press('Tab'); // ensure focus-visible, not just :focus
    await symbolInput.focus();
    const ring = await symbolInput.evaluate((el) => getComputedStyle(el).boxShadow);
    check('order ticket symbol input shows a focus ring', ring !== 'none' && ring.length > 0, ring);
    await shot('01-trade-focus');

    // --- 404s ------------------------------------------------------------------
    // An unmatched URL belongs to no route group, so it gets the bare app/not-found.tsx.
    // That is correct — there is no session to render a sidebar from.
    await page.goto(`${BASE}/definitely-not-a-route`, {waitUntil: 'networkidle'});
    check('unmatched URL renders the global 404', await page.getByText('Not found').count() > 0);
    await shot('02-not-found-global');

    // notFound() called from inside (root) — an unpriceable ticker — keeps the chrome.
    // With no FINNHUB_API_KEY every symbol takes this path, which makes it easy to hit.
    // A notFound() thrown after the shell has streamed is drawn by the not-found boundary
    // once the page hydrates, which can land after domcontentloaded: wait for the rendered
    // 404 (or 30s) instead of racing it.
    await page.goto(`${BASE}/stocks/ZZZZNOTREAL`, {waitUntil: 'domcontentloaded'});
    await page.getByText('Not found').first().waitFor({timeout: 30000}).catch(() => {});
    check('in-app 404 renders', await page.getByText('Not found').count() > 0);
    check('in-app 404 keeps the header chrome', await page.locator('header').count() > 0);
    // Keyless, only a symbol some strategy watches gets a stock page (qa-strategies covers those).
    check('a symbol no strategy watches gets no stock panels', await page.locator('#key-numbers, #rules-see').count() === 0);
    await shot('03-not-found-in-app');

    // --- TradingView embeds keep their transparency under a dark palette -----------
    // Chrome paints a cross-origin iframe on an opaque white canvas when the iframe
    // element's color-scheme differs from the embedded document's (TradingView never
    // declares one). Under a dark palette <html> is color-scheme: dark, so every
    // isTransparent widget went white and read as a broken light theme.
    // The cookie as the app writes it today (lib/theme/resolve.ts): v2:<palette>:<0|1>.
    await page.context().addCookies([{name: 'aero-theme', value: 'v2:nord:0', domain: new URL(BASE).hostname, path: '/'}]);
    await page.goto(`${BASE}/trade`, {waitUntil: 'domcontentloaded'});
    await page.waitForSelector('.tradingview-widget-container iframe', {timeout: 30000});
    const schemes = await page.evaluate(() => ({
        html: document.documentElement.style.colorScheme,
        iframes: Array.from(document.querySelectorAll('.tradingview-widget-container iframe')).map((f) => getComputedStyle(f).colorScheme),
    }));
    check('dark palette sets color-scheme: dark on <html>', schemes.html === 'dark', schemes.html);
    check('TradingView iframes stay on the light scheme their documents use',
        schemes.iframes.length > 0 && schemes.iframes.every((c) => c === 'light'), schemes.iframes.join(','));
    await shot('03-tradingview-dark-palette');

    // --- mobile nav gap: the links only the drawer carries (qa-shell opens it) ----------
    // From the dashboard the QuickLinks widget happens to carry a /watchlist link, so
    // measure from a page that has no widgets — that is the real gap.
    await page.setViewportSize({width: 390, height: 844});
    await page.goto(`${BASE}/portfolio`, {waitUntil: 'networkidle'});
    for (const href of ['/watchlist', '/friends', '/history']) {
        const n = await page.locator(`a[href="${href}"]:visible`).count();
        console.log(`NOTE  ${href} visible links at 390px on /portfolio: ${n}  (inside the closed drawer)`);
    }
    await shot('04-mobile-portfolio');

    // --- a theme cookie from before the one look, on a page that never syncs it -------
    // Until the app kept one look the cookie was v1:<palette>:<style>:<0|1>, and a browser can
    // hold one for a year. The root layout is the cookie's only parser (decodeThemeCookie), and
    // it still reads one: the style dropped, the palette and the motion choice kept. Inside the
    // app a reader with a saved theme has the cookie rewritten from it (ThemeSync); the auth
    // pages have no account to ask, so this is where a v1 cookie read as junk would show — a
    // visitor who kept Nord with motion reduced, in whichever style, would sign in from the
    // default theme. A context of its own: the signed-in page above is sent Home from /sign-in.
    const visitor = await browser.newContext({viewport: {width: 1440, height: 900}});
    await visitor.addCookies([{name: 'aero-theme', value: 'v1:nord:brutalist:1', domain: new URL(BASE).hostname, path: '/'}]);
    const signIn = await visitor.newPage();
    await signIn.goto(`${BASE}/sign-in`, {waitUntil: 'load'});
    const kept = await signIn.evaluate(() => {
        const html = document.documentElement;
        return {
            path: location.pathname,
            palette: html.getAttribute('data-palette'),
            motion: html.getAttribute('data-motion'),
            style: html.getAttribute('data-style'),
            // What the attribute is for: the stylesheet zeroes the motion tokens under it. The
            // compiled sheet writes the zero as 0s (the source says 0ms), so either spelling counts.
            motionBase: getComputedStyle(html).getPropertyValue('--motion-base').trim(),
        };
    });
    check('a visitor holding a v1 theme cookie opens /sign-in in its palette with motion reduced, and no style named',
        kept.path === '/sign-in' && kept.palette === 'nord' && kept.motion === 'reduced' && kept.style === null && ['0s', '0ms'].includes(kept.motionBase),
        JSON.stringify(kept));
    await signIn.screenshot({path: `${OUT}05-sign-in-v1-cookie.png`});
    await visitor.close();

    // --- a save sets two fields, and leaves a style saved before the one look alone -----------
    // No migration removes the style a saved theme held until the app kept one look: it is the
    // record of that reader's choice for a rollback, and what a build from before the one look
    // reads while a preview of this one shares its database. So a save sets the palette and the
    // motion choice by path (lib/actions/appearance.actions.ts): the first makes the saved theme,
    // and a later one changes the palette with the stored style still beside it. The account has
    // saved nothing yet and its cookie says Nord (above), so the first click is another palette.
    const mongo = new MongoClient(MONGO, {serverSelectionTimeoutMS: 5000});
    await mongo.connect();
    try {
        const prefs = mongo.db().collection('userpreferences');
        const userId = String((await mongo.db().collection('user').findOne({email}))?._id ?? '');
        const appearance = async () => (await prefs.findOne({userId}))?.appearance ?? null;
        // The save is the click's server action; the document says when it has landed.
        const savedAs = async (palette) => {
            const until = Date.now() + 20000;
            let saved = await appearance();
            while (saved?.palette !== palette && Date.now() < until) {
                await page.waitForTimeout(250);
                saved = await appearance();
            }
            return saved;
        };
        const chip = (name) => page.getByRole('radiogroup', {name: 'Colour palette'}).getByRole('radio', {name});
        await page.setViewportSize({width: 1440, height: 900});
        await page.goto(`${BASE}/settings?tab=appearance`, {waitUntil: 'load'});
        await chip(/^Dracula/).click();
        const first = await savedAs('dracula');
        check('a first save makes the saved theme: the palette and the motion choice, nothing else',
            first?.palette === 'dracula' && first?.reduceMotion === false && Object.keys(first).sort().join(',') === 'palette,reduceMotion', JSON.stringify(first));
        await prefs.updateOne({userId}, {$set: {'appearance.style': 'soft'}});
        await chip(/^Nord/).click();
        const second = await savedAs('nord');
        check('a later save changes the palette and leaves the style stored before the one look where it is',
            second?.palette === 'nord' && second?.reduceMotion === false && second?.style === 'soft', JSON.stringify(second));
    } finally {
        await mongo.close().catch(() => {});
    }
} catch (err) {
    check(`threw: ${err.message}`, false);
    await shot('99-error').catch(() => {});
} finally {
    await browser.close();
}

summary('styles');
