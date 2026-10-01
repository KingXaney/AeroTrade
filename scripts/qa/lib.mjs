// What every browser suite shares: where the harness is, where screenshots go, one PASS/FAIL
// line per check with the exit code that follows from them, and a fresh user signed up through
// the real form. The harness itself (in-memory Mongo, `next dev`, the Inngest dev server) is
// started by run.sh; see README.md.
import {mkdirSync} from 'node:fs';

// The app under test. Override with QA_BASE_URL to point the suites at another server.
export const BASE = (process.env.QA_BASE_URL || 'http://localhost:3000').replace(/\/+$/, '');
// The harness database. `mongo.db()` reads the database name from this URL.
export const MONGO = process.env.QA_MONGO_URL || 'mongodb://127.0.0.1:27117/aerotrade';
// The Inngest dev server; suites that need it check whether it answers and say what they skip.
export const INNGEST = (process.env.QA_INNGEST_URL || 'http://localhost:8288').replace(/\/+$/, '');

export const PASSWORD = 'Passw0rd!Passw0rd!';
// Where sign-up and sign-in land: the dashboard, with or without a query string.
export const DASHBOARD_URL = new RegExp(`^${BASE.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}/(\\?.*)?$`);

// ./output/<name>/, created, with a trailing slash: `${outDir('learn')}01-checklist.png`.
export const outDir = (name) => {
    const dir = new URL(`./output/${name}/`, import.meta.url).pathname;
    mkdirSync(dir, {recursive: true});
    return dir;
};

let failures = 0;
export const check = (name, ok, detail = '') => {
    if (!ok) failures++;
    console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? `  — ${detail}` : ''}`);
};
// Context worth printing that is not a check (a skipped section, a count that depends on the network).
export const note = (name, detail = '') => console.log(`NOTE  ${name}${detail ? `  — ${detail}` : ''}`);

// The last line of a suite: says how it went and exits 1 when any check failed.
export const summary = (suite) => {
    console.log(failures === 0 ? `\nAll ${suite} checks passed.` : `\n${failures} check(s) failed.`);
    process.exit(failures === 0 ? 0 : 1);
};

// Signs a fresh user up through the form and waits for the dashboard. The tag names the user
// ("QA <tag>") and its address (qa<tag><ms>@example.com), so a suite's users are easy to find.
export const signUp = async (page, tag, {name = `QA ${tag}`} = {}) => {
    const email = `qa${tag.toLowerCase().replace(/[^a-z0-9]/g, '')}${Date.now()}@example.com`;
    await page.goto(`${BASE}/sign-up`, {waitUntil: 'load'});
    await page.fill('#fullName', name);
    await page.fill('#email', email);
    await page.fill('#password', PASSWORD);
    await page.click('button[type="submit"]');
    await page.waitForURL(DASHBOARD_URL, {timeout: 90000});
    return email;
};
