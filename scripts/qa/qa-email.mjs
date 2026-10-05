// The emails, end to end without a mail server. Two parts:
//
//   1. The daily brief's once-a-day claim (lib/email/digest-store.ts) against the harness's
//      MongoDB: a second send the same day finds the day taken, a test send to one reader takes
//      no claim, and a summary the model could not write still mails the fallback. Skipped, with
//      a note, when no harness database answers (`npm run email:preview` on its own).
//   2. Every email the app sends — the brief (as written and as the fallback), the welcome and the
//      reset — rendered from the shared fixtures (lib/email/__fixtures__/digest.ts) into
//      ./output/email/ and opened in Chrome at a desktop and a phone width, light and dark: no
//      sideways scroll, every link absolute http(s), no placeholder left, and a size under
//      Gmail's clipping point.
import {writeFileSync} from 'node:fs';
import {createJiti} from 'jiti';
import {chromium} from 'playwright';
import {MONGO, REPO_ROOT, check, note, outDir, summary} from './lib.mjs';

// The app's stores read MONGODB_URI when they are first loaded.
process.env.MONGODB_URI = MONGO;

const jiti = createJiti(import.meta.url, {alias: {'@': REPO_ROOT.replace(/\/$/, '')}, fsCache: false});
const load = (path) => jiti.import(`${REPO_ROOT}${path}`);

const fx = await load('lib/email/__fixtures__/digest.ts');

// --- 1. The once-a-day claim -------------------------------------------------------------------

const {claimDigestDay, releaseDigestDay} = await load('lib/email/digest-store.ts');
const {sendUserDigest} = await load('lib/email/digest.ts');
let mongoose = null;
try {
    mongoose = (await load('database/mongoose.ts')).default ?? null;
    const tag = `qa${Date.now()}`;
    const day = fx.FIXTURE_DAY;
    check('claim: the first send of the day takes it', await claimDigestDay(`${tag}-a`, day) === true);
    check('claim: a second send the same day finds it taken', await claimDigestDay(`${tag}-a`, day) === false);
    check('claim: the next day is a new claim', await claimDigestDay(`${tag}-a`, '2026-10-06') === true);
    await releaseDigestDay(`${tag}-a`, day);
    check('claim: a released day can be claimed again (a failed send retries)', await claimDigestDay(`${tag}-a`, day) === true);

    const input = (over = {}) => ({
        user: {id: `${tag}-b`, email: `${tag}-b@example.com`}, day, test: false,
        news: {articles: fx.FIXTURE_ARTICLES, symbols: fx.FIXTURE_SYMBOLS}, navigator: fx.FIXTURE_NAVIGATOR,
        sections: {topicsSection: '', lessonSection: ''}, modelText: fx.FIXTURE_MODEL_ANSWER, ...over,
    });
    check('send: the day\'s brief goes out once', await sendUserDigest(input()) === 'sent');
    check('send: a second run the same day sends nothing', await sendUserDigest(input()) === 'already-sent');
    check('send: a test send to one reader takes no claim', await sendUserDigest(input({test: true})) === 'sent');
    check('send: no written summary still sends the fallback',
        await sendUserDigest(input({user: {id: `${tag}-c`, email: `${tag}-c@example.com`}, modelText: ''})) === 'sent-fallback');
} catch (error) {
    note('claim checks skipped', `no harness database at ${MONGO} (${String(error?.message ?? error).split('\n')[0]})`);
} finally {
    await mongoose?.disconnect?.().catch(() => undefined);
}

// --- 2. Every email, rendered ------------------------------------------------------------------

const {parseDigestSummary, fallbackDigestSummary} = await load('lib/email/digest-summary.ts');
const {buildDigestView} = await load('lib/email/digest-view.ts');
const {renderDigestHtml, renderDigestText} = await load('lib/email/digest-render.ts');
const {buildTopicsSectionHtml, topicsSectionLinks} = await load('lib/email/sections/topics.ts');
const {buildLessonSectionHtml, lessonSectionLinks} = await load('lib/email/sections/lesson.ts');
const {sanitizeDigestHtml, sanitizeWelcomeIntroHtml} = await load('lib/news/sanitize.ts');
const {renderWelcomeEmail, renderPasswordResetEmail} = await load('lib/email/templates.ts');

const dir = outDir('email');
const manageUrl = `${fx.FIXTURE_APP}/topics`;
const topicsHtml = sanitizeDigestHtml(buildTopicsSectionHtml(fx.FIXTURE_TOPICS, manageUrl), topicsSectionLinks(fx.FIXTURE_TOPICS, manageUrl));
const lessonInput = {moment: null, term: {mode: 'day', key: 'fomc', count: 0, headlines: []}};
const lessonHtml = sanitizeDigestHtml(buildLessonSectionHtml(lessonInput, fx.FIXTURE_APP), lessonSectionLinks(lessonInput, fx.FIXTURE_APP));

const digestView = (summaryValue) => buildDigestView({
    day: fx.FIXTURE_DAY, appUrl: fx.FIXTURE_APP, summary: summaryValue, readerSymbols: fx.FIXTURE_SYMBOLS,
    navigator: fx.FIXTURE_NAVIGATOR, topicsHtml, lessonHtml,
});
const written = digestView(parseDigestSummary(fx.FIXTURE_MODEL_ANSWER, fx.FIXTURE_ARTICLES, fx.FIXTURE_SYMBOLS));
const fallback = digestView(fallbackDigestSummary(fx.FIXTURE_ARTICLES, fx.FIXTURE_SYMBOLS));

const emails = {
    'digest': renderDigestHtml(written),
    'digest-fallback': renderDigestHtml(fallback),
    'welcome': renderWelcomeEmail({
        appUrl: fx.FIXTURE_APP, name: 'Ada',
        introHtml: sanitizeWelcomeIntroHtml('Thanks for joining AeroTrade! As someone focused on <strong>technology growth stocks</strong>, follow a topic like AI chips and the daily brief will tell you what changed. Paper-trade your ideas with practice money and see how they hold up.'),
    }),
    'reset': renderPasswordResetEmail({appUrl: fx.FIXTURE_APP, name: 'Ada', resetUrl: `${fx.FIXTURE_APP}/reset-password?token=abc123`, minutes: 30}),
};
writeFileSync(`${dir}digest.txt`, renderDigestText(written));
console.log(`Subject: ${written.subject}\nPreview: ${written.preheader}\n`);

const browser = await chromium.launch({channel: 'chrome'});
try {
    for (const [name, html] of Object.entries(emails)) {
        const file = `${dir}${name}.html`;
        writeFileSync(file, html);
        const bytes = Buffer.byteLength(html, 'utf8');
        check(`${name}: under Gmail's clipping size`, bytes < 100_000, `${(bytes / 1024).toFixed(1)} KB`);
        check(`${name}: no placeholder left`, !/\{\{\w+\}\}/.test(html));
        const hrefs = [...html.matchAll(/href="([^"]*)"/g)].map((m) => m[1]);
        check(`${name}: every link absolute http(s)`, hrefs.length > 0 && hrefs.every((h) => /^https?:\/\//.test(h)), `${hrefs.length} links`);

        for (const [label, width, scheme] of [['desktop', 680, 'light'], ['phone', 375, 'light'], ['phone-dark', 375, 'dark']]) {
            const page = await browser.newPage({viewport: {width, height: 900}, colorScheme: scheme});
            await page.goto(`file://${file}`);
            const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
            check(`${name} @${label}: no sideways scroll`, overflow <= 0, `${overflow}px`);
            await page.screenshot({path: `${dir}${name}-${label}.png`, fullPage: true});
            await page.close();
        }
    }
} finally {
    await browser.close();
}
console.log(`\nWritten to ${dir}`);
summary('email preview');
