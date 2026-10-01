// PR 1 (Foundations) checks: no phantom scroll, focus rings on the hand-rolled inputs,
// the warning token resolving, route boundaries, and the in-app 404 keeping its chrome.
// Run against the harness in README.md (in-memory Mongo on :27117 + `npm run dev`).
import {chromium} from 'playwright';
import {BASE, DASHBOARD_URL, check, outDir, signUp, summary} from './lib.mjs';

const OUT = outDir('foundations');

const browser = await chromium.launch({channel: 'chrome'});
const page = await browser.newPage({viewport: {width: 1440, height: 900}});
const shot = (n) => page.screenshot({path: `${OUT}${n}.png`, fullPage: true});

try {
    // --- sign up ---------------------------------------------------------------
    await signUp(page, 'Foundations');
    check('sign-up lands on the dashboard', DASHBOARD_URL.test(page.url()), page.url());

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
    for (const path of ['/', '/portfolio', '/settings', '/brain', '/strategies', '/markets']) {
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
    await page.context().addCookies([{name: 'aero-theme', value: 'v1:nord:minimal:0', domain: 'localhost', path: '/'}]);
    await page.goto(`${BASE}/markets`, {waitUntil: 'domcontentloaded'});
    await page.waitForSelector('.tradingview-widget-container iframe', {timeout: 30000});
    const schemes = await page.evaluate(() => ({
        html: document.documentElement.style.colorScheme,
        iframes: Array.from(document.querySelectorAll('.tradingview-widget-container iframe')).map((f) => getComputedStyle(f).colorScheme),
    }));
    check('dark palette sets color-scheme: dark on <html>', schemes.html === 'dark', schemes.html);
    check('TradingView iframes stay on the light scheme their documents use',
        schemes.iframes.length > 0 && schemes.iframes.every((c) => c === 'light'), schemes.iframes.join(','));
    await shot('03-tradingview-dark-palette');

    // --- mobile nav gap: baseline for PR 2 --------------------------------------
    // From the dashboard the QuickLinks widget happens to carry a /watchlist link, so
    // measure from a page that has no widgets — that is the real gap.
    await page.setViewportSize({width: 390, height: 844});
    await page.goto(`${BASE}/portfolio`, {waitUntil: 'networkidle'});
    for (const href of ['/watchlist', '/friends', '/history']) {
        const n = await page.locator(`a[href="${href}"]:visible`).count();
        console.log(`NOTE  ${href} visible links at 390px on /portfolio: ${n}  (PR 2 makes this > 0)`);
    }
    await shot('04-mobile-portfolio');
} catch (err) {
    check(`threw: ${err.message}`, false);
    await shot('99-error').catch(() => {});
} finally {
    await browser.close();
}

summary('foundations');
