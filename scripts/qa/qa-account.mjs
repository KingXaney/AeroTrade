// Account basics (docs/specs/2026-11-18-account-basics.md): a reader changes their password,
// turns the daily brief off from a signed link without signing in, and deletes their account
// with everything stored for it — and nobody else's.
// Run: npm run qa -- account   (the harness: README.md)
import {chromium} from 'playwright';
import {MongoClient, ObjectId} from 'mongodb';
import {createJiti} from 'jiti';
import {BASE, MONGO, PASSWORD, REPO_ROOT, check, hydrated, outDir, signUp, summary} from './lib.mjs';

const OUT = outDir('account');
// The secret run.sh hands the app: the suite signs its own unsubscribe link with it.
const SECRET = 'local-qa-secret-at-least-32-characters-long';
const NEW_PASSWORD = 'An0ther!Passw0rd-for-QA';

const browser = await chromium.launch({channel: 'chrome'});
const context = await browser.newContext({viewport: {width: 1440, height: 900}});
const page = await context.newPage();
const shot = (n) => page.screenshot({path: `${OUT}${n}.png`, fullPage: true});
const mongo = new MongoClient(MONGO);
const jiti = createJiti(import.meta.url, {alias: {'@': REPO_ROOT.replace(/\/$/, '')}, fsCache: false});
const {unsubscribeLinks} = await jiti.import(`${REPO_ROOT}lib/email/unsubscribe.ts`);
const {USER_DATA} = await jiti.import(`${REPO_ROOT}lib/account/user-data.ts`);
const until = async (fn, ms) => { const end = Date.now() + ms; let v = await fn(); while (!v && Date.now() < end) { await page.waitForTimeout(500); v = await fn(); } return v; };

const signIn = async (target, email, password) => {
    await target.goto(`${BASE}/sign-in`, {waitUntil: 'load'});
    await hydrated(target.locator('input[name="email"]'));
    await target.fill('input[name="email"]', email);
    await target.fill('input[name="password"]', password);
    await target.click('button[type="submit"]');
};

try {
    await mongo.connect();
    const db = mongo.db();
    const userOf = async (email) => db.collection('user').findOne({email});
    const idOf = (user) => String(user?._id ?? user?.id);

    // --- two readers: the one who leaves, and one whose rows must stay ---------------------
    const other = await browser.newContext({viewport: {width: 1280, height: 800}});
    const otherPage = await other.newPage();
    const otherEmail = await signUp(otherPage, 'AccountOther');
    await otherPage.goto(`${BASE}/portfolio`, {waitUntil: 'load'});
    const otherId = idOf(await userOf(otherEmail));
    await until(() => db.collection('paperaccounts').findOne({userId: otherId}), 30000);
    const otherTopics = await db.collection('topics').countDocuments({userId: otherId});
    await other.close();

    const email = await signUp(page, 'Account');
    await page.goto(`${BASE}/portfolio`, {waitUntil: 'load'});
    const userId = idOf(await userOf(email));
    const account = await until(() => db.collection('paperaccounts').findOne({userId}), 30000);
    check('signed up with an account and its seeded topics', !!account && (await db.collection('topics').countDocuments({userId})) > 0);
    // A row in a few more of the collections a reader fills over time.
    await db.collection('papertrades').insertOne({userId, accountId: String(account._id), symbol: 'QACC', company: 'QA Co', side: 'buy', quantity: 1, price: 10, total: 10, source: 'user', createdAt: new Date()});
    await db.collection('accountsnapshots').insertOne({userId, accountId: String(account._id), date: '2026-01-02', totalValue: 100_000, cash: 100_000, holdingsValue: 0, startingBalance: 100_000});
    await db.collection('watchlists').insertOne({userId, symbol: 'QACC', company: 'QA Co', addedAt: new Date()});
    await db.collection('friendships').insertOne({requesterId: otherId, addresseeId: userId, status: 'pending', createdAt: new Date(), updatedAt: new Date()});
    await db.collection('userpreferences').updateOne({userId}, {$set: {userId, emailNotifications: true, updatedAt: new Date()}}, {upsert: true});

    // --- change the password ---------------------------------------------------------------
    // A second device, signed in before the change.
    const second = await browser.newContext({viewport: {width: 1280, height: 800}});
    const secondPage = await second.newPage();
    await signIn(secondPage, email, PASSWORD);
    await secondPage.waitForURL((url) => url.pathname === '/', {timeout: 60000});
    await page.goto(`${BASE}/settings?tab=account`, {waitUntil: 'load'});
    const form = page.locator('[data-account-password]');
    await hydrated(form.locator('#account-current-password'));
    const change = form.getByRole('button', {name: 'Change password'});
    check('the button waits for both fields', await change.isDisabled());
    await form.locator('#account-current-password').fill('not-my-password');
    await form.locator('#account-new-password').fill(NEW_PASSWORD);
    await change.click();
    await page.getByText('The current password is not right.').first().waitFor({timeout: 30000});
    check('a wrong current password is refused', true);
    await form.locator('#account-current-password').fill(PASSWORD);
    await change.click();
    await page.getByText('Password changed. Other devices were signed out.').first().waitFor({timeout: 30000});
    check('the right one changes it, and the fields are cleared', (await form.locator('#account-new-password').inputValue()) === '');
    check('the session that made the change is still signed in', new URL(page.url()).pathname === '/settings');
    await secondPage.goto(`${BASE}/settings`, {waitUntil: 'load'});
    check('the other device was signed out', new URL(secondPage.url()).pathname === '/sign-in', secondPage.url());
    await second.close();
    await shot('01-password');

    const fresh = await browser.newContext({viewport: {width: 1280, height: 800}});
    const freshPage = await fresh.newPage();
    await signIn(freshPage, email, PASSWORD);
    await freshPage.getByText('Sign in failed').first().waitFor({timeout: 30000});
    check('the old password no longer signs in', new URL(freshPage.url()).pathname === '/sign-in');
    await signIn(freshPage, email, NEW_PASSWORD);
    await freshPage.waitForURL((url) => url.pathname === '/', {timeout: 60000});
    check('the new password does', new URL(freshPage.url()).pathname === '/');
    await fresh.close();

    // --- unsubscribe from a signed link, signed out ----------------------------------------
    const links = unsubscribeLinks(BASE, userId, SECRET);
    const prefs = async () => (await db.collection('userpreferences').findOne({userId}))?.emailNotifications;
    const visitor = await browser.newContext({viewport: {width: 1280, height: 800}});
    const mail = await visitor.newPage();
    await mail.goto(links.page, {waitUntil: 'load'});
    check('the link opens signed out, on its own page', new URL(mail.url()).pathname === '/unsubscribe' && (await mail.locator('[data-unsubscribe="confirm"]').count()) === 1, mail.url());
    check('opening it changes nothing: a scanner that follows links cannot unsubscribe anyone', (await prefs()) === true);
    const getApi = await mail.request.get(links.oneClick);
    check('…nor does a GET of the endpoint', getApi.status() === 405 && (await prefs()) === true, String(getApi.status()));
    await mail.locator('[data-unsubscribe="confirm"]').click();
    await mail.locator('[data-unsubscribe="done"]').waitFor({timeout: 30000});
    check('the button turns the daily brief off', (await prefs()) === false);
    await mail.screenshot({path: `${OUT}02-unsubscribed.png`, fullPage: true});

    await db.collection('userpreferences').updateOne({userId}, {$set: {emailNotifications: true}});
    const forged = links.page.replace(/t=[^&]+/, 't=not-the-signature-this-account-was-given-0000');
    await mail.goto(forged, {waitUntil: 'load'});
    check('a link with a wrong signature shows no button', (await mail.locator('[data-unsubscribe="invalid"]').count()) === 1 && (await mail.locator('[data-unsubscribe="confirm"]').count()) === 0);
    const forgedPost = await mail.request.post(forged.replace('/unsubscribe?', '/api/email/unsubscribe?'), {headers: {'Content-Type': 'application/x-www-form-urlencoded'}, data: 'List-Unsubscribe=One-Click'});
    check('…and its post is refused', forgedPost.status() === 400 && (await prefs()) === true, String(forgedPost.status()));
    const crossed = unsubscribeLinks(BASE, otherId, SECRET).oneClick.replace(`u=${otherId}`, `u=${userId}`);
    const crossedPost = await mail.request.post(crossed, {headers: {'Content-Type': 'application/x-www-form-urlencoded'}, data: 'List-Unsubscribe=One-Click'});
    check('one reader\'s signature does not work for another', crossedPost.status() === 400 && (await prefs()) === true, String(crossedPost.status()));
    const oneClick = await mail.request.post(links.oneClick, {headers: {'Content-Type': 'application/x-www-form-urlencoded'}, data: 'List-Unsubscribe=One-Click'});
    check('a mail client\'s one-click post turns it off and is answered plainly', oneClick.status() === 200 && (await prefs()) === false, String(oneClick.status()));
    await visitor.close();

    // --- delete the account ----------------------------------------------------------------
    await page.goto(`${BASE}/settings?tab=account`, {waitUntil: 'load'});
    await hydrated(page.locator('[data-account-delete-open]'));
    await page.locator('[data-account-delete-open]').click();
    const dialog = page.getByRole('dialog');
    await dialog.waitFor({timeout: 15000});
    const said = (await dialog.innerText()).replace(/\s+/g, ' ');
    check('the dialog says what goes and that it cannot be undone', said.includes('cannot be undone') && said.includes('every paper account with its trades') && said.includes(`Type ${email} to confirm`), said);
    const confirm = page.locator('[data-account-delete-confirm]');
    check('the button waits for the address and the password', await confirm.isDisabled());
    await dialog.locator('#account-delete-confirm').fill('someone-else@example.com');
    await dialog.locator('#account-delete-password').fill(NEW_PASSWORD);
    check('…and for the address to be this account\'s', await confirm.isDisabled());
    await dialog.locator('#account-delete-confirm').fill(email.toUpperCase());
    await dialog.locator('#account-delete-password').fill('not-my-password');
    await confirm.click();
    await page.getByText('The password is not right.').first().waitFor({timeout: 30000});
    check('a wrong password deletes nothing', !!(await userOf(email)) && (await db.collection('paperaccounts').countDocuments({userId})) === 1);
    await shot('03-delete');
    await dialog.locator('#account-delete-password').fill(NEW_PASSWORD);
    await confirm.click();
    await page.locator('[data-landing]').waitFor({timeout: 60000});
    check('after the deletion the reader is on the front door, signed out', new URL(page.url()).pathname === '/');

    check('the user is gone', (await userOf(email)) === null);
    const left = {};
    const names = [];
    for (const [model, fields] of Object.entries(USER_DATA)) {
        // Each model's own collection, as Mongoose named it: never a guessed name, which would
        // count nothing in a collection that does not exist and pass.
        const collection = (await jiti.import(`${REPO_ROOT}database/models/${model}.model.ts`)).default.collection.name;
        names.push(collection);
        const count = await db.collection(collection).countDocuments({$or: fields.map((field) => ({[field]: userId}))});
        if (count !== 0) left[collection] = count;
    }
    check('nothing of theirs is left in any collection that holds a reader\'s data', Object.keys(left).length === 0, JSON.stringify(left));
    check('…and those were the collections the suite had filled', ['paperaccounts', 'papertrades', 'accountsnapshots', 'topics', 'watchlists', 'friendships', 'userpreferences'].every((name) => names.includes(name)), names.join(' '));
    const sessions = await db.collection('session').countDocuments({userId: {$in: [userId, ...(ObjectId.isValid(userId) ? [new ObjectId(userId)] : [])]}});
    check('their sessions are gone too', sessions === 0, String(sessions));
    check('the other reader keeps their account and topics', (await db.collection('paperaccounts').countDocuments({userId: otherId})) === 1 && (await db.collection('topics').countDocuments({userId: otherId})) === otherTopics && !!(await userOf(otherEmail)));
    check('the request between them went with the account that was deleted', (await db.collection('friendships').countDocuments({$or: [{requesterId: userId}, {addresseeId: userId}]})) === 0);

    await signIn(page, email, NEW_PASSWORD);
    await page.getByText('Sign in failed').first().waitFor({timeout: 30000});
    check('the deleted account cannot sign in', new URL(page.url()).pathname === '/sign-in');
    await shot('04-gone');
} catch (error) {
    check('suite ran to the end', false, error instanceof Error ? `${error.message}\n${error.stack}` : String(error));
    await shot('99-error').catch(() => undefined);
} finally {
    await mongo.close().catch(() => undefined);
    await browser.close().catch(() => undefined);
}
summary('account');
