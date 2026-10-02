// A screenshot of every page, signed out and signed in as a fresh user, at a desktop and a phone
// width — the before/after record for a change meant to look identical (a refactor, a styling
// migration). Saves to ./output/sweep/<width>/<name>.png. Run it on the base, copy the folder
// aside, run it on the change, then compare with `node visual-diff.mjs <before> <after>`.
// Run it inside the harness: `npm run qa -- visual-sweep` (README.md).
//
// QA_THEME=<palette>:<style> (say nord:brutalist) sweeps under that theme instead of the default
// one, into ./output/sweep-<palette>-<style>/ — a change to a visual style is checked style by style.
import {chromium} from 'playwright';
import {mkdirSync} from 'node:fs';
import {BASE, outDir, signUp} from './lib.mjs';

// The theme cookie the root layout reads (lib/theme/resolve.ts); a fresh user has no saved theme,
// so nothing overrides it.
const THEME = (process.env.QA_THEME || '').trim();
if (THEME && !/^[a-z-]+:[a-z-]+$/.test(THEME)) {
    console.error(`QA_THEME must be <palette>:<style>, got "${THEME}"`);
    process.exit(2);
}
const themed = async (page) => {
    if (THEME) await page.context().addCookies([{name: 'aero-theme', value: `v1:${THEME}:0`, domain: new URL(BASE).hostname, path: '/'}]);
    return page;
};

const OUT = outDir(THEME ? `sweep-${THEME.replace(':', '-')}` : 'sweep');
const WIDTHS = [{name: 'desktop', width: 1440, height: 900}, {name: 'phone', width: 390, height: 844}];

const SIGNED_OUT = [
    ['sign-in', '/sign-in'],
    ['sign-up', '/sign-up'],
    ['forgot-password', '/forgot-password'],
    ['reset-password-bad-token', '/reset-password?token=not-a-token'],
];
const SIGNED_IN = [
    ['dashboard', '/'],
    ['topics', '/topics'],
    ['news', '/news'],
    ['brain', '/brain'],
    ['portfolio', '/portfolio'],
    ['trade', '/trade'],
    ['markets', '/markets'],
    ['watchlist', '/watchlist'],
    ['friends', '/friends'],
    ['history', '/history'],
    ['settings', '/settings'],
    ['learn', '/learn'],
    ['strategies', '/strategies'],
    ['strategy-rsi2', '/strategies/rsi2-mean-reversion'],
    ['strategy-buy-and-hold', '/strategies/buy-and-hold-spy'],
    ['stock-spy', '/stocks/SPY'],
    ['not-found', '/this-page-does-not-exist'],
];

// Animated and time-dependent pieces would make every run differ; hide them so a diff means markup.
const STILL = `
  *, *::before, *::after { animation: none !important; transition: none !important; caret-color: transparent !important; }
  canvas, iframe, .tradingview-widget-container, [data-testid="market-status"] { visibility: hidden !important; }
`;

const shoot = async (page, width, name, path) => {
    await page.goto(`${BASE}${path}`, {waitUntil: 'load'});
    await page.waitForLoadState('networkidle', {timeout: 15000}).catch(() => {});
    await page.addStyleTag({content: STILL}).catch(() => {});
    await page.evaluate(() => document.fonts.ready).catch(() => {});
    await page.waitForTimeout(600);
    await page.screenshot({path: `${OUT}${width.name}/${name}.png`, fullPage: true});
};

const browser = await chromium.launch({channel: 'chrome'});
let shots = 0;
try {
    for (const width of WIDTHS) {
        mkdirSync(`${OUT}${width.name}`, {recursive: true});
        const out = await themed(await browser.newPage({viewport: {width: width.width, height: width.height}}));
        for (const [name, path] of SIGNED_OUT) { await shoot(out, width, name, path); shots++; }
        await out.close();
    }
    const page = await browser.newPage({viewport: {width: 1440, height: 900}});
    await signUp(page, 'Sweep');
    await themed(page);
    for (const width of WIDTHS) {
        await page.setViewportSize({width: width.width, height: width.height});
        for (const [name, path] of SIGNED_IN) { await shoot(page, width, name, path); shots++; }
    }
} finally {
    await browser.close();
}
console.log(`saved ${shots} screenshots to ${OUT}`);
