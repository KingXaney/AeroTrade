// The owner's alert (lib/jobs/functions/alerts.ts, docs/specs/2026-11-17-job-alerts.md): a job
// that failed leaves its error on the status strip until it next completes a run; the daily
// check names every job overdue on its stamp; a mail that cannot be sent (the harness has no
// mailer) gives its once-a-day claim back.
// Run: npm run qa -- job-alerts   (the harness: README.md)
import {chromium} from 'playwright';
import {MongoClient} from 'mongodb';
import {BASE, INNGEST, MONGO, check, note, outDir, ownerEmail, signUp, summary} from './lib.mjs';

const OUT = outDir('job-alerts');
const browser = await chromium.launch({channel: 'chrome'});
const page = await browser.newPage({viewport: {width: 1440, height: 900}});
const shot = (n) => page.screenshot({path: `${OUT}${n}.png`, fullPage: true});
const mongo = new MongoClient(MONGO);
const inngestUp = await fetch(`${INNGEST}/`).then(() => true).catch(() => false);
console.log(inngestUp ? `Inngest dev server on ${INNGEST} — running the real job` : 'No Inngest dev server — job checks skipped');
const until = async (fn, ms) => { const end = Date.now() + ms; let v = await fn(); while (!v && Date.now() < end) { await page.waitForTimeout(1000); v = await fn(); } return v; };
const fire = (name, data = {}) => fetch(`${INNGEST}/e/qa`, {method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify({name, data})});

const HOUR = 3_600_000;
// The rows this suite writes on, as they were, to put back.
const TOUCHED = ['daily-account-income', 'daily-brain-update', 'daily-account-snapshots', 'job-alerts'];
let db = null;
let saved = [];
try {
    await mongo.connect();
    db = mongo.db();
    const runs = db.collection('jobruns');
    saved = await runs.find({jobId: {$in: TOUCHED}}).toArray();
    await runs.deleteMany({jobId: {$in: TOUCHED}});
    await runs.insertMany([
        // Overdue: daily, last completed five days ago.
        {jobId: 'daily-account-income', lastRunAt: new Date(Date.now() - 120 * HOUR), lastMessage: 'qa: an old run'},
        // Failed since its last completed run.
        {jobId: 'daily-brain-update', lastRunAt: new Date(Date.now() - 2 * HOUR), lastMessage: 'qa: a good run', lastError: 'qa: the model refused', lastErrorAt: new Date(Date.now() - HOUR)},
        // This job's own row carries an old error, which its next completed run clears.
        {jobId: 'job-alerts', lastRunAt: new Date(Date.now() - 3 * HOUR), lastMessage: 'qa: before', lastError: 'qa: an old failure', lastErrorAt: new Date(Date.now() - 2 * HOUR)},
    ]);

    await signUp(page, 'Alerts', {email: ownerEmail('alerts')});
    await page.goto(`${BASE}/brain?view=system`, {waitUntil: 'load'});
    const failed = page.locator('[data-job-error="daily-brain-update"]');
    await failed.waitFor({timeout: 30000});
    check('a failed job shows its error on the strip, with when', /^failed .+: qa: the model refused$/.test((await failed.innerText()).trim()), await failed.innerText());
    check('a job that completed a run since shows none', (await page.locator('[data-job-error="daily-account-income"]').count()) === 0);
    await shot('01-strip');

    if (inngestUp) {
        // --- the daily check --------------------------------------------------------------------
        await fire('app/check.job.health');
        const stamp = await until(async () => {
            const row = await runs.findOne({jobId: 'job-alerts'});
            return row?.lastMessage && row.lastMessage !== 'qa: before' ? row : null;
        }, 90000);
        check('the daily check names the overdue job', /job\(s\) overdue: .*Interest & dividends/.test(stamp?.lastMessage ?? ''), String(stamp?.lastMessage));
        check('…and says no mail went, since the harness has no mailer', /no mail was sent$/.test(stamp?.lastMessage ?? ''), String(stamp?.lastMessage));
        check('a completed run clears the job\'s own old error', stamp && stamp.lastError === undefined && stamp.lastErrorAt === undefined);
        const income = await runs.findOne({jobId: 'daily-account-income'});
        check('a mail that was not sent gives the day\'s claim back', income?.alertedOn === undefined, String(income?.alertedOn));

        // --- the failure trigger is registered -----------------------------------------------------
        // The dev server lists every function it was handed with its triggers.
        const dev = await fetch(`${INNGEST}/dev`).then((r) => r.json()).catch(() => null);
        const listed = (dev?.functions ?? []).find((fn) => String(fn.slug ?? fn.id ?? '').endsWith('job-alerts'));
        if (listed) {
            const events = (listed.triggers ?? []).map((t) => t.event ?? t.EventTrigger?.event).filter(Boolean);
            check('Inngest holds the alert function with the failure event among its triggers', events.includes('inngest/function.failed') && events.includes('app/check.job.health'), JSON.stringify(listed.triggers));
        } else {
            note('the dev server\'s function list was not readable', JSON.stringify(dev ? Object.keys(dev) : null));
        }

        // --- Inngest's failure event --------------------------------------------------------------
        await fire('inngest/function.failed', {
            function_id: 'aerotrade-daily-account-snapshots', run_id: 'qa-run',
            error: {name: 'Error', message: 'qa: the snapshot step\nthrew'}, event: {name: 'app/record.daily.snapshots', data: {}},
        });
        const recorded = await until(async () => (await runs.findOne({jobId: 'daily-account-snapshots'}))?.lastError, 45000);
        if (recorded) {
            check('a failure event writes the job\'s error on its row, as one line', recorded === 'qa: the snapshot step threw', String(recorded));
            await page.goto(`${BASE}/brain?view=system`, {waitUntil: 'load'});
            await page.locator('[data-job-error="daily-account-snapshots"]').waitFor({timeout: 30000});
            check('…and the strip shows it', /qa: the snapshot step threw$/.test((await page.locator('[data-job-error="daily-account-snapshots"]').innerText()).trim()));
            check('…with its claim given back for want of a mailer', (await runs.findOne({jobId: 'daily-account-snapshots'}))?.alertedOn === undefined);
        } else {
            note('the dev server did not deliver a hand-sent inngest/function.failed', 'the failure path is covered by its unit tests');
        }
    } else note('job checks skipped');
} catch (error) {
    check('suite ran to the end', false, error instanceof Error ? `${error.message}\n${error.stack}` : String(error));
    await shot('99-error').catch(() => undefined);
} finally {
    if (db) {
        await db.collection('jobruns').deleteMany({jobId: {$in: TOUCHED}}).catch(() => undefined);
        if (saved.length > 0) await db.collection('jobruns').insertMany(saved).catch(() => undefined);
    }
    await mongo.close().catch(() => undefined);
    await browser.close().catch(() => undefined);
}
summary('job-alerts');
