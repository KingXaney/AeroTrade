// A screenshot of every page, signed out and signed in as a fresh user, at a desktop and a phone
// width — the before/after record for a change meant to look identical (a refactor, a styling
// migration). Saves to ./output/sweep/<width>/<name>.png. Run it on the base, copy the folder
// aside, run it on the change, then compare with `node visual-diff.mjs <before> <after>`.
// Run it inside the harness: `npm run qa -- visual-sweep` (README.md).
//
// QA_THEME=<palette>:<style>[,<palette>:<style>…] (say nord:brutalist) sweeps under each theme
// named instead of the default one, into ./output/sweep-<palette>-<style>/ — a change to the
// visual styles is checked style by style in one harness run. QA_SWEEP_PAGES=home,portfolio,…
// limits the sweep to those page names (below), for a quick look at a few screens.
import {chromium} from 'playwright';
import {mkdirSync} from 'node:fs';
import {BASE, outDir, signUp} from './lib.mjs';

// The theme cookie the root layout reads (lib/theme/resolve.ts); a fresh user has no saved theme,
// so nothing overrides it. An empty theme is the default look.
const THEMES = (process.env.QA_THEME || '').split(',').map((t) => t.trim()).filter(Boolean);
for (const theme of THEMES) {
    if (!/^[a-z-]+:[a-z-]+$/.test(theme)) {
        console.error(`QA_THEME must be <palette>:<style>[,…], got "${theme}"`);
        process.exit(2);
    }
}
const ONLY = new Set((process.env.QA_SWEEP_PAGES || '').split(',').map((p) => p.trim()).filter(Boolean));
const wanted = (name) => ONLY.size === 0 || ONLY.has(name);

const setTheme = async (page, theme) => {
    if (theme) await page.context().addCookies([{name: 'aero-theme', value: `v1:${theme}:0`, domain: new URL(BASE).hostname, path: '/'}]);
};
const outFor = (theme) => outDir(theme ? `sweep-${theme.replace(':', '-')}` : 'sweep');

const WIDTHS = [{name: 'desktop', width: 1440, height: 900}, {name: 'phone', width: 390, height: 844}];

const SIGNED_OUT = [
    ['landing', '/'],
    ['sign-in', '/sign-in'],
    ['sign-up', '/sign-up'],
    ['forgot-password', '/forgot-password'],
    ['reset-password-bad-token', '/reset-password?token=not-a-token'],
].filter(([name]) => wanted(name));
const SIGNED_IN = [
    ['home', '/'],
    ['dashboard', '/dashboard'],
    ['topics', '/topics'],
    ['topics-edit', '/topics?edit=1'],
    ['news', '/news'],
    ['brain', '/brain'],
    ['culture', '/culture'],
    ['culture-picks', '/culture?view=picks'],
    ['portfolio', '/portfolio'],
    ['trade', '/trade'],
    ['markets', '/markets'],
    ['watchlist', '/watchlist'],
    ['friends', '/friends'],
    ['history', '/history'],
    ['settings', '/settings'],
    ['learn', '/learn'],
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
    ['strategies', '/strategies'],
    ['strategy-rsi2', '/strategies/rsi2-mean-reversion'],
    ['strategy-buy-and-hold', '/strategies/buy-and-hold-spy'],
    ['stock-spy', '/stocks/SPY'],
    ['not-found', '/this-page-does-not-exist'],
].filter(([name]) => wanted(name));

// Animated and time-dependent pieces would make every run differ; hide them so a diff means markup.
const STILL = `
  *, *::before, *::after { animation: none !important; transition: none !important; caret-color: transparent !important; }
  canvas, iframe, .tradingview-widget-container, [data-testid="market-status"] { visibility: hidden !important; }
`;

const shoot = async (page, out, width, name, path) => {
    await page.goto(`${BASE}${path}`, {waitUntil: 'load'});
    // A page with the momentum terrain draws it a moment after load; wait for its first frame so
    // the layout below it has settled. (Chromium's full-page capture still paints a WebGL canvas
    // black; qa-landing's viewport-sized captures are where the drawing itself is checked.)
    if (await page.locator('[data-terrain]').count() > 0) {
        await page.locator('[data-terrain-state="ready"], [data-terrain-state="flat"], [data-terrain-state="unavailable"]').first().waitFor({timeout: 20000}).catch(() => {});
        await page.waitForTimeout(1500);
    }
    await page.waitForLoadState('networkidle', {timeout: 15000}).catch(() => {});
    await page.addStyleTag({content: STILL}).catch(() => {});
    await page.evaluate(() => document.fonts.ready).catch(() => {});
    await page.waitForTimeout(600);
    await page.screenshot({path: `${out}${width.name}/${name}.png`, fullPage: true});
};

const runs = THEMES.length > 0 ? THEMES : [''];
const browser = await chromium.launch({channel: 'chrome'});
let shots = 0;
try {
    for (const theme of runs) {
        const out = outFor(theme);
        for (const width of WIDTHS) {
            mkdirSync(`${out}${width.name}`, {recursive: true});
            const page = await browser.newPage({viewport: {width: width.width, height: width.height}});
            await setTheme(page, theme);
            for (const [name, path] of SIGNED_OUT) { await shoot(page, out, width, name, path); shots++; }
            await page.close();
        }
    }
    if (SIGNED_IN.length > 0) {
        const page = await browser.newPage({viewport: {width: 1440, height: 900}});
        await signUp(page, 'Sweep');
        for (const theme of runs) {
            const out = outFor(theme);
            await setTheme(page, theme);
            for (const width of WIDTHS) {
                mkdirSync(`${out}${width.name}`, {recursive: true});
                await page.setViewportSize({width: width.width, height: width.height});
                for (const [name, path] of SIGNED_IN) { await shoot(page, out, width, name, path); shots++; }
            }
        }
    }
} finally {
    await browser.close();
}
console.log(`saved ${shots} screenshots to ${runs.map(outFor).join(', ')}`);
