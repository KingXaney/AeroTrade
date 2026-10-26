// The culture brain's data layer (lib/culture/store, ingest, update), loaded from the app's
// TypeScript through jiti and run against the harness database: attention rows land as monthly
// documents and read back as dated series (a corrected day overwrites in place); items dedupe on
// their link, get their alias matches, count per brand and source, and queue co-mentions first;
// the day's attention surprises and the alias fallback fold into brand entities through the
// pure planner — once per run id, attention once per day — with co-mention links; owners roll up;
// a suggested name the catalog already has is dropped and a repeat is counted; evidence reads a
// brand's items with the other brands they name and never an importance. Then the weekly
// pickers through the Inngest dev server, and the /culture page in a browser: the brand board
// with its marks explained once, a brand's evidence with its labels (a stored javascript: link
// never an anchor), the two pickers side by side with every reason read in plain words and a
// strip that colours nothing, the system view, the legend last and collapsed, the two widgets
// from the library, and a phone width without a horizontal scroll. Then enrolling one of the
// reader's own accounts with a picker (lib/culture/follow.ts): the card, the account and row the
// action makes, the enrolment run through the dev server (every fill failing for want of a
// price, as the pickers' own do), the follower's decisions panel, the weekly run skipping a
// claimed week and trading an unclaimed one, the portfolio's traded-by line and delete refusal,
// the widget's line, and unenrolling (the account stays, re-enrolling reuses it). The daily job
// itself is not fired here: its sources are the real Wikipedia, App Store and Google News.
// Run: npm run qa -- culture   (the harness: README.md)
import {chromium} from 'playwright';
import {MongoClient} from 'mongodb';
import {createJiti} from 'jiti';
import {BASE, INNGEST, MONGO, REPO_ROOT, check, note, outDir, signUp, summary} from './lib.mjs';

const OUT = outDir('culture');
const COLLECTIONS = ['cultureentities', 'cultureattentions', 'cultureitems', 'culturesuggestions'];
const WEEKLY_COLLECTIONS = ['culturestates', 'culturedecisions', 'cultureuniverses', 'cultureearnings', 'culturefollows', 'culturefollowdecisions'];
const OWNER = 'system:culture';
const BAR_SYMBOLS = ['CELH', 'PEP', 'SPY', '^IRX'];
const mongo = new MongoClient(MONGO);
const browser = await chromium.launch({channel: 'chrome'});

const etDate = (date) => date.toLocaleDateString('en-CA', {timeZone: 'America/New_York'});
const addDays = (date, days) => {
    const [y, m, d] = date.split('-').map(Number);
    return new Date(Date.UTC(y, m - 1, d + days)).toISOString().slice(0, 10);
};
const near = (a, b, eps = 1e-6) => Math.abs(a - b) <= eps;

// Everything the weekly and page sections seed, removed at the end whatever happened.
const cleanupWeekly = async (db, storedBars, storedMetas) => {
    if (storedBars) {
        await db.collection('pricebars').deleteMany({symbol: {$in: BAR_SYMBOLS}});
        if (storedBars.length > 0) await db.collection('pricebars').insertMany(storedBars);
    }
    if (storedMetas) {
        await db.collection('priceseriesmetas').deleteMany({symbol: {$in: BAR_SYMBOLS}});
        if (storedMetas.length > 0) await db.collection('priceseriesmetas').insertMany(storedMetas);
    }
    await db.collection('culturebacktests').deleteMany({});
    // The reader's own enrolled accounts, by name (the user is signed up afresh each run).
    const enrolled = (await db.collection('paperaccounts').find({name: {$in: ['Culture · Spike', 'Culture · Quiet']}}).project({_id: 1}).toArray()).map((a) => String(a._id));
    if (enrolled.length > 0) {
        await db.collection('paperaccounts').deleteMany({name: {$in: ['Culture · Spike', 'Culture · Quiet']}});
        await db.collection('papertrades').deleteMany({accountId: {$in: enrolled}});
        await db.collection('accountsnapshots').deleteMany({accountId: {$in: enrolled}});
    }
    const ids = (await db.collection('paperaccounts').find({userId: OWNER}).project({_id: 1}).toArray()).map((a) => String(a._id));
    await db.collection('paperaccounts').deleteMany({userId: OWNER});
    await db.collection('papertrades').deleteMany({userId: OWNER});
    await db.collection('accountsnapshots').deleteMany({$or: [{userId: OWNER}, {accountId: {$in: ids}}]});
    for (const name of WEEKLY_COLLECTIONS) await db.collection(name).deleteMany({});
};

let storedBars = null;
let storedMetas = null;
try {
    await mongo.connect();
    const db = mongo.db();
    for (const name of COLLECTIONS) await db.collection(name).deleteMany({});
    await cleanupWeekly(db, null, null);
    await db.collection('jobruns').deleteMany({jobId: {$in: ['culture-brain-weekly', 'culture-follow-bootstrap']}});

    // The app's modules connect through database/mongoose, which reads MONGODB_URI at load.
    process.env.MONGODB_URI = MONGO;
    const jiti = createJiti(import.meta.url, {alias: {'@': REPO_ROOT.replace(/\/$/, '')}, fsCache: false});
    const store = await jiti.import(`${REPO_ROOT}lib/culture/store.ts`);
    const ingest = await jiti.import(`${REPO_ROOT}lib/culture/ingest.ts`);
    const update = await jiti.import(`${REPO_ROOT}lib/culture/update.ts`);
    const {SOURCE_FOLD_WEIGHTS, FALLBACK_IMPORTANCE} = await jiti.import(`${REPO_ROOT}lib/culture/config.ts`);
    const {CULTURE_BRANDS} = await jiti.import(`${REPO_ROOT}lib/culture/catalog.ts`);
    const {getEasternWeekKey: getEasternWeekKeyOf} = await jiti.import(`${REPO_ROOT}lib/dates.ts`);

    const today = etDate(new Date());
    const asOf = addDays(today, -1);
    const nowMs = Date.now();

    // ---- attention: monthly documents, dated series, a corrected day ----
    const rows = [];
    for (let i = 99; i >= 0; i--) rows.push({brand: 'celsius', source: 'wikipedia', date: addDays(asOf, -i), value: i < 7 ? 299 : 99});
    rows.push({brand: 'duolingo', source: 'appstore', date: asOf, value: 96});
    const written = await store.writeAttentionRows(rows);
    const months = new Set(rows.map((r) => `${r.brand}|${r.source}|${r.date.slice(0, 7)}`)).size;
    check('attention rows land as one document per brand, source and month', written === months, `${written} documents for ${months} months`);
    const stored = await db.collection('cultureattentions').find({brand: 'celsius'}).toArray();
    check('a stored month maps days to values, nothing else', stored.every((doc) => Object.keys(doc.days).every((dd) => /^\d{2}$/.test(dd))), `${stored.length} documents`);

    const series = await store.getBrandSeries('celsius', {sources: ['wikipedia'], from: addDays(asOf, -99), to: asOf});
    const wiki = series.get('wikipedia') ?? [];
    check('the series reads back complete and sorted by date', wiki.length === 100 && wiki.every((p, i) => i === 0 || p.date > wiki[i - 1].date), `${wiki.length} points`);
    check('the series stops at the window', wiki[0].date === addDays(asOf, -99) && wiki[wiki.length - 1].date === asOf);

    await store.writeAttentionRows([{brand: 'celsius', source: 'wikipedia', date: asOf, value: 301}]);
    const corrected = (await store.getBrandSeries('celsius', {sources: ['wikipedia'], from: asOf, to: asOf})).get('wikipedia') ?? [];
    check('a day written again overwrites in place', corrected.length === 1 && corrected[0].value === 301, JSON.stringify(corrected));
    await store.writeAttentionRows([{brand: 'celsius', source: 'wikipedia', date: asOf, value: 299}]);

    const freshness = await store.getSourceFreshness();
    check('freshness names the last day each source has', freshness.wikipedia === asOf && freshness.appstore === asOf && freshness.reddit === null, JSON.stringify(freshness));

    // ---- items: dedupe, mentions, counts, the queue ----
    const datetime = Math.floor(nowMs / 1000) - 3600;
    const inserted = await store.insertCultureItems([
        {source: 'reddit', sourceName: 'r/energydrinks', title: 'Switched from Poppi to Celsius this week', body: 'honestly the Celsius flavours win', url: 'https://www.reddit.com/r/energydrinks/comments/qa1/x/', datetime, score: 120},
        {source: 'news', sourceName: 'QA Wire', title: 'Teens are wearing Crocs again', body: 'A survey says so', url: 'https://qa.example/crocs?utm=1', datetime},
        {source: 'news', sourceName: 'QA Wire', title: 'Teens are wearing Crocs again (dupe)', body: '', url: 'https://qa.example/crocs?utm=2', datetime},
        {source: 'youtube', sourceName: 'QA Channel', title: 'My morning routine', body: 'no brands here', url: 'https://www.youtube.com/watch?v=qa1', datetime, score: 5000},
    ], today);
    check('items insert once per link, tracking parameters ignored', inserted === 3, `${inserted} inserted`);

    const {queue, counts} = await ingest.countMentionsAndQueue(today);
    check('every item of the day gets its alias matches', counts.items === 3 && counts.matched === 2 && counts.brands === 3, JSON.stringify(counts));
    const redditItem = await db.collection('cultureitems').findOne({source: 'reddit'});
    check('mentions are stamped on the item', JSON.stringify(redditItem?.mentions) === JSON.stringify(['celsius', 'poppi']), JSON.stringify(redditItem?.mentions));
    const celsiusReddit = (await store.getBrandSeries('celsius', {sources: ['reddit'], from: today, to: today})).get('reddit') ?? [];
    check("a brand's mentions per source become a day of its series", celsiusReddit.length === 1 && celsiusReddit[0].value === 1, JSON.stringify(celsiusReddit));
    check('the queue puts the co-mention first and keeps the unmatched item last', queue.length === 3 && queue[0].source === 'reddit' && queue[2].source === 'youtube', queue.map((q) => `${q.source}:${q.mentions.length}`).join(','));
    check('a queued body is cut short for the prompt', queue.every((q) => q.body.length <= 600));

    const batch = ingest.buildCultureBatchPrompt(queue);
    check('a batch lists only the brands the matcher found', JSON.stringify(batch.allowedIds) === JSON.stringify(['celsius', 'poppi', 'crocs']), JSON.stringify(batch.allowedIds));

    // ---- a model answer, read and stamped ----
    const applied = await ingest.applyCultureBatch({
        index: 0,
        batch: queue.slice(0, 1),
        text: JSON.stringify({items: [{n: 1, importance: 0.9, signal: 'substitution', brands: [{id: 'celsius', sentiment: 0.6, relevance: 1}, {id: 'poppi', sentiment: -0.4, relevance: 0.8}, {id: 'nike', sentiment: 1, relevance: 1}], newBrands: ['Cirkul', 'Celsius']}]}),
        model: 'qa-model',
        now: new Date(nowMs),
    });
    const labelled = await db.collection('cultureitems').findOne({source: 'reddit'});
    check('the answer is stamped with the model, the signal and the capped Reddit importance', labelled?.extraction?.model === 'qa-model' && labelled?.extraction?.signal === 'substitution' && near(labelled?.extraction?.importance, 0.4), JSON.stringify(labelled?.extraction));
    check('a brand the batch never listed is dropped', labelled?.extraction?.entities.length === 2);
    check('the fold and the suggested names come back through the return value, a catalog brand dropped', applied.folds.length === 1 && applied.newBrands.length === 1 && applied.newBrands[0].name === 'Cirkul', JSON.stringify(applied.newBrands));

    // ---- the alias fallback and the attention surprises ----
    const fallback = await ingest.foldUnextractedItems(today, new Date(nowMs));
    check('the item the model never read folds by alias, the unmatched one is left alone', fallback.stamped === 1 && fallback.folds[0].entities[0].key === 'crocs', JSON.stringify(fallback.folds));
    const attention = await ingest.computeAttentionFolds(asOf);
    const wikiFold = attention.folds.find((f) => f.source === 'wikipedia');
    const appFold = attention.folds.find((f) => f.source === 'appstore');
    check("yesterday's tripled views are a full surprise, the newcomer app another", wikiFold?.entities[0].key === 'celsius' && near(wikiFold?.importance, 1) && appFold?.entities[0].key === 'duolingo' && appFold?.importance === 1, JSON.stringify(attention.folds));

    // ---- the fold: once per run, attention once a day, links ----
    const folds = [...applied.folds, ...fallback.folds, ...attention.folds];
    const first = await update.foldCultureIntoBrain(folds, {today, nowMs, runId: 'qa-run-1'});
    check('the fold creates an entity per brand it touched', first.entitiesTouched === 4 && first.attentionFolded === 2, JSON.stringify(first));
    const celsius = await db.collection('cultureentities').findOne({key: 'celsius'});
    const expectedCelsius = 1 * SOURCE_FOLD_WEIGHTS.wikipedia + 0.4 * SOURCE_FOLD_WEIGHTS.reddit * 1;
    check('celsius weighs its surprise plus its labelled item, by source', near(celsius?.weightSlow, expectedCelsius, 1e-9) && celsius?.ticker === 'CELH' && celsius?.category === 'drinks' && celsius?.attentionDay === today, `${celsius?.weightSlow} vs ${expectedCelsius}`);
    check('a co-mention draws a symmetric link', celsius?.links?.some((l) => l.key === 'poppi') && (await db.collection('cultureentities').findOne({key: 'poppi'}))?.links?.some((l) => l.key === 'celsius'));
    const crocs = await db.collection('cultureentities').findOne({key: 'crocs'});
    check('the alias fallback folds at its flat importance and the news weight', near(crocs?.weightSlow, FALLBACK_IMPORTANCE * SOURCE_FOLD_WEIGHTS.news, 1e-9), String(crocs?.weightSlow));

    const again = await update.foldCultureIntoBrain(folds, {today, nowMs, runId: 'qa-run-1'});
    const celsiusAgain = await db.collection('cultureentities').findOne({key: 'celsius'});
    check('the same run id folds nothing twice', again.entitiesTouched === 4 && near(celsiusAgain?.weightSlow, celsius?.weightSlow, 1e-12));
    await update.foldCultureIntoBrain(folds, {today, nowMs, runId: 'qa-run-2'});
    const celsiusRun2 = await db.collection('cultureentities').findOne({key: 'celsius'});
    check('a new run folds the items again but the attention only once a day', near(celsiusRun2?.weightSlow, celsius?.weightSlow + 0.4 * SOURCE_FOLD_WEIGHTS.reddit, 1e-9), `${celsiusRun2?.weightSlow}`);

    // ---- reads ----
    const rollup = await store.getTickerRollup();
    const celh = rollup.find((r) => r.ticker === 'CELH');
    const pep = rollup.find((r) => r.ticker === 'PEP');
    check('owners roll up their brands', celh?.weightSlowSum > 0 && celh?.brands[0].id === 'celsius' && pep?.brands.some((b) => b.id === 'poppi' && b.weightSlow > 0), JSON.stringify({celh: celh?.weightSlowSum, pep: pep?.weightSlowSum}));
    const theses = await store.getCultureTheses();
    check('no thesis yet at these weights', theses.length === 0);
    const top = await store.getTopCultureEntities(2);
    check('the top entities come heaviest first', top.length === 2 && top[0].key === 'celsius' && top[0].sentimentSlow > 0, JSON.stringify(top.map((t) => [t.key, t.weightSlow])));

    const evidence = await store.getBrandEvidence('celsius', 30, 10);
    check("evidence lists the brand's items with the other brands they name, the label and the sentiment, never an importance",
        evidence.length === 1 && JSON.stringify(evidence[0].brands) === JSON.stringify(['poppi']) && evidence[0].signal === 'substitution' && near(evidence[0].sentiment, 0.6) && !('importance' in evidence[0]),
        JSON.stringify(evidence));
    const crocsEvidence = await store.getBrandEvidence('crocs', 30, 10);
    check('an alias-matched item carries no label', crocsEvidence.length === 1 && crocsEvidence[0].signal === null && crocsEvidence[0].sentiment === 0);

    const suggested = await store.recordSuggestions([{name: 'Cirkul', itemHash: 1}, {name: 'cirkul', itemHash: 2}, {name: 'Celsius', itemHash: 3}, {name: 'Lemon Perfect', itemHash: 4}], new Date(nowMs));
    check('a new name is queued once, a catalog brand never', suggested.added === 2 && suggested.counted === 0, JSON.stringify(suggested));
    const repeat = await store.recordSuggestions([{name: 'CIRKUL', itemHash: 9}], new Date(nowMs));
    const queueRows = await store.getSuggestions(10);
    check('a repeat is counted, not added', repeat.counted === 1 && repeat.added === 0 && queueRows[0].name === 'Cirkul' && queueRows[0].count === 3 && queueRows[0].sampleItemHashes === undefined, JSON.stringify(queueRows));

    const totals = await store.getCultureCounts();
    check('the counts say what the brain holds', totals.brands === CULTURE_BRANDS.length && totals.entities === 4 && totals.itemsTotal === 3 && totals.itemsLabelled === 1 && totals.suggestions === 2, JSON.stringify(totals));
    const quiet = await store.brandsWithoutRecentViews(10, today);
    check('the drift alarm names every brand without recent views, not the one with them', !quiet.includes('celsius') && quiet.length === CULTURE_BRANDS.length - 1, `${quiet.length} brands`);

    note('the daily job is not fired here', 'its sources are the real Wikipedia, App Store and Google News; run `npm run trigger -- culture` against a dev server with a .env to see a full run');

    // ---- the weekly pickers, through the Inngest dev server ----
    // The week's quote check is pre-seeded (two owners quoted, the rest not), the bars are
    // stored through the previous session (so no provider is asked), and the harness has no
    // Finnhub key: every fill answers "no live price", which is the outcome under test. What
    // the run leaves — the accounts, the decisions, the universe rows — the page section reads.
    const inngestUp = await fetch(`${INNGEST}/`).then((r) => r.ok).catch(() => false);
    const fireEvent = (name, data) => fetch(`${INNGEST}/e/qa`, {method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify({name, data})});
    const pollUntil = async (predicate, timeoutMs) => {
        const until = Date.now() + timeoutMs;
        while (Date.now() < until) {
            const value = await predicate();
            if (value) return value;
            await new Promise((resolve) => setTimeout(resolve, 2000));
        }
        return null;
    };
    const jobMessageOf = async (jobId) => (await db.collection('jobruns').findOne({jobId}))?.lastMessage ?? '';
    let decisions = null;
    if (!inngestUp) {
        note('no Inngest dev server', 'the weekly picker checks are skipped; the page is checked before any run');
    } else {
        const {catalogTickers} = await jiti.import(`${REPO_ROOT}lib/culture/catalog.ts`);
        const {previousTradingDay} = await jiti.import(`${REPO_ROOT}lib/prices/market-hours.ts`);
        const {getEasternWeekKey} = await jiti.import(`${REPO_ROOT}lib/dates.ts`);
        const {glossCultureReasons} = await jiti.import(`${REPO_ROOT}lib/learn/culture-reasons.ts`);
        const weekKey = getEasternWeekKey(today);
        const prices = {CELH: 40, PEP: 150};
        await db.collection('cultureuniverses').insertMany(catalogTickers().map((t) => ({
            weekKey, symbol: t.ticker, quoted: t.ticker in prices, price: prices[t.ticker] ?? null, reason: t.ticker in prices ? 'ok' : 'no quote', checkedAt: new Date(),
        })));

        // Sessions through the previous one, deep enough that the bars step reads them as a
        // current ten-year history and asks no provider (a shallower fixture is backfilled from
        // the real Yahoo, whose real prices decide the picks), with highs for the OHLC check.
        const lastSession = previousTradingDay(today);
        const sessions = [];
        for (let d = lastSession, n = 0; n < 1650; d = addDays(d, -1)) {
            const dow = new Date(`${d}T12:00:00Z`).getUTCDay();
            if (dow === 0 || dow === 6) continue;
            sessions.unshift(d);
            n++;
        }
        const bars = [];
        for (const [symbol, base] of [['CELH', 30], ['PEP', 140], ['SPY', 500], ['^IRX', 4]]) {
            sessions.forEach((date, i) => {
                const close = symbol === '^IRX' ? base : base * (1 + i / 600);
                bars.push({symbol, date, close, open: close * 0.995, high: close * 1.01, low: close * 0.99, volume: 1000, source: 'yahoo'});
            });
        }
        storedBars = await db.collection('pricebars').find({symbol: {$in: BAR_SYMBOLS}}).toArray();
        await db.collection('pricebars').deleteMany({symbol: {$in: BAR_SYMBOLS}});
        await db.collection('pricebars').insertMany(bars);
        // The backtest's readiness guard: every simulated owner's dividends vouched for across
        // the window, and the T-bill series spanning it (the bars above reach six years back).
        storedMetas = await db.collection('priceseriesmetas').find({symbol: {$in: BAR_SYMBOLS}}).toArray();
        await db.collection('priceseriesmetas').deleteMany({symbol: {$in: BAR_SYMBOLS}});
        await db.collection('priceseriesmetas').insertMany(['CELH', 'PEP', 'SPY'].map((symbol) => ({symbol, dividendsFrom: '2015-01-01', dividendsThrough: lastSession, updatedAt: new Date()})));

        // Four hundred days of pageviews, so the picker features can be measured: Celsius
        // surging, Pepsi and Poppi flat.
        const views = [];
        for (let i = 419; i >= 0; i--) {
            const date = addDays(asOf, -i);
            views.push({brand: 'celsius', source: 'wikipedia', date, value: i < 28 ? 299 : 99});
            views.push({brand: 'pepsi', source: 'wikipedia', date, value: 500});
            views.push({brand: 'poppi', source: 'wikipedia', date, value: 50});
        }
        await store.writeAttentionRows(views);

        // The daily run's Wikipedia plan reads each brand's first stored month: the three seeded
        // brands reach back past the baseline and are asked only the lookback; every other brand
        // (nothing stored) is asked its whole history, listed owners first.
        const {planWikipediaFetch} = await jiti.import(`${REPO_ROOT}lib/culture/history.ts`);
        const firstMonths = await store.wikipediaFirstMonths();
        const wikiPlan = planWikipediaFetch(CULTURE_BRANDS, firstMonths, asOf);
        check('the daily plan asks the lookback for brands with history, the whole history for the rest',
            firstMonths.get('pepsi') === addDays(asOf, -419).slice(0, 7)
            && ['celsius', 'pepsi', 'poppi'].every((id) => wikiPlan.recent.includes(id) && !wikiPlan.history.includes(id))
            && wikiPlan.history.length + wikiPlan.recent.length === CULTURE_BRANDS.length
            && CULTURE_BRANDS.find((b) => b.id === wikiPlan.history[0])?.owner !== null,
            JSON.stringify({first: firstMonths.get('pepsi'), history: wikiPlan.history.length, recent: wikiPlan.recent.length}));

        const fire = (data) => fireEvent('app/run.culture.brain', data);
        const jobMessage = () => jobMessageOf('culture-brain-weekly');

        const firstRun = await fire({force: true});
        check('the weekly event is accepted by the dev server', firstRun.ok, `status ${firstRun.status}`);
        decisions = await pollUntil(async () => {
            const docs = await db.collection('culturedecisions').find({date: today}).toArray();
            return docs.length === 2 && (await jobMessage()).includes('Culture pickers') ? docs : null;
        }, 240_000);
        check('the run saves a decision for each picker and stamps the job', decisions !== null, await jobMessage());
        if (decisions) {
            const accounts = await db.collection('paperaccounts').find({userId: OWNER}).toArray();
            check('two shared accounts exist, one per picker, at the starting balance', accounts.length === 2 && accounts.every((a) => a.startingBalance === 100000) && accounts.map((a) => a.name).sort().join('|') === 'Culture Brain · Quiet|Culture Brain · Spike', accounts.map((a) => a.name).join(', '));
            const snapshots = await db.collection('accountsnapshots').countDocuments({userId: OWNER});
            check('each account has its day-zero snapshot', snapshots === 2, `${snapshots} snapshots`);
            const states = await db.collection('culturestates').find({}).toArray();
            check('both pickers claimed the week', states.length === 2 && states.every((s) => s.lastRunWeek === weekKey), JSON.stringify(states.map((s) => [s.key, s.lastRunWeek])));
            for (const decision of decisions) {
                const orders = decision.items.filter((i) => i.action !== 'hold');
                check(`${decision.profile}: the decision is executed, planned an order, and every fill failed for want of a price`, decision.kind === 'executed' && orders.length > 0 && orders.every((i) => i.executed === false && /live price/.test(i.error ?? '')), `${orders.length} orders: ${orders.map((i) => i.error).join('; ')}`);
                check(`${decision.profile}: every item names the picker and carries its brands and a readable reason`, decision.items.every((i) => i.reasons.some((r) => r === `picker ${decision.profile === 'spike' ? 'Spike' : 'Quiet'}`) && i.brands.length > 0 && glossCultureReasons(i.reasons).length > 0), JSON.stringify(decision.items.map((i) => i.reasons)));
                check(`${decision.profile}: the universe audit counts the quoted owners`, decision.universe.quoted === 2 && decision.universe.tickers > 50 && decision.feeds.includes('wikipedia'), JSON.stringify({...decision.universe, unquoted: decision.universe.unquoted.length, feeds: decision.feeds}));
                // The two quoted owners carry seeded views and bars: both may be bought.
                check(`${decision.profile}: the decision stores the week's eligibility`, decision.eligibility?.total === 2 && decision.eligibility?.eligible === 2
                    && decision.eligibility?.noAttention === 0, JSON.stringify(decision.eligibility));
            }
            check('cash is untouched when nothing filled', accounts.every((a) => a.cash === 100000 && a.positions.length === 0));
            const trades = await db.collection('papertrades').countDocuments({userId: OWNER});
            check('no trade row was written', trades === 0, `${trades} trades`);

            // The simulated record, built in the same run once the data was vouched for.
            const backtest = await db.collection('culturebacktests').findOne({key: 'culture'});
            check('the run builds the backtest: three variants over the stored bars and pageviews, ending before launch',
                backtest !== null && backtest.variants.length === 3 && backtest.variants.map((v) => v.profile).sort().join(',') === 'price,quiet,spike'
                && backtest.to < today && backtest.variants.every((v) => v.weeks > 200 && v.points.length > 1000) && /Backtest: rebuilt/.test(await jobMessage()),
                backtest ? `${backtest.from} → ${backtest.to}, ${backtest.variants.map((v) => `${v.profile}:${v.weeks}w/${v.trades.length}t`).join(' ')}; ${await jobMessage()}` : await jobMessage());
            check('…stamped with the engine version and the catalog, its feeds price, pageviews and the replayed entities',
                backtest?.version === '1' && typeof backtest?.catalogHash === 'string' && ['price', 'wikipedia', 'mentions'].every((f) => backtest?.feeds.includes(f)), JSON.stringify(backtest?.feeds));

            await fire({force: true});
            const againRun = await pollUntil(async () => ((await jobMessage()).includes('already ran') ? await jobMessage() : null), 60_000);
            check('a second run in the same week claims nothing and says so', againRun !== null, againRun ?? await jobMessage());

            await fire({dryRun: true});
            const preview = await pollUntil(async () => ((await jobMessage()).includes('preview') ? await jobMessage() : null), 120_000);
            check('a preview run plans without claiming', preview !== null, preview ?? await jobMessage());
            const kinds = (await db.collection('culturedecisions').find({date: today}).toArray()).map((d) => d.kind);
            check('a preview never overwrites the executed decisions', kinds.every((k) => k === 'executed'), kinds.join(','));
        }
    }

    // ---- the page, in a browser ----
    // Beside what the sections above left: a thesis on Celsius (the ● mark), a private brand
    // (the ○ mark), and a news item stored with a javascript: link (never an anchor).
    await db.collection('cultureentities').updateOne({key: 'celsius'}, {$set: {thesisSince: new Date(nowMs - 21 * 24 * 3600 * 1000), peakSlowWeight: 9}});
    await db.collection('cultureentities').insertOne({
        key: 'liquid-death', displayName: 'Liquid Death', category: 'drinks', ticker: null, listing: null,
        weightFast: 0.3, sentimentSumFast: 0, weightSlow: 0.8, sentimentSumSlow: 0.1, decayedTo: today, lastSeenAt: new Date(nowMs),
        thesisSince: null, peakSlowWeight: 0.8, links: [], attentionDay: today,
    });
    await db.collection('cultureitems').insertOne({
        contentHash: 900_000_000 + Math.floor(Math.random() * 1_000_000), source: 'news', sourceName: 'QA Wire', title: 'Celsius sponsors a festival (bad link)',
        body: '', url: 'javascript:alert(1)', datetime: datetime - 7200, publishedDate: today, day: today, mentions: ['celsius'], createdAt: new Date(nowMs),
    });

    const page = await browser.newPage({viewport: {width: 1440, height: 900}});
    const shot = (n) => page.screenshot({path: `${OUT}${n}.png`, fullPage: true});
    const email = await signUp(page, 'culture');
    const userDoc = await db.collection('user').findOne({email});
    const userId = String(userDoc?._id ?? userDoc?.id ?? '');
    check('signed up', userId.length > 0);
    const mechanismFree = (text) => !/\b(works?|fails?|beat|outperform)\b/i.test(text);

    // --- the brands view: the shell around it, the board, the rising list, the legend ---
    await page.goto(`${BASE}/culture`, {waitUntil: 'domcontentloaded'});
    await page.locator('#brand-board').waitFor({timeout: 60000});
    const viewTabs = await page.locator('[role="tab"]').evaluateAll((tabs) => tabs.map((t) => `${t.getAttribute('data-tab')}${t.getAttribute('aria-selected') === 'true' ? '*' : ''}`));
    check('/culture opens on its brands, one view of three', viewTabs.join(',') === 'brands*,picks,system', viewTabs.join(','));
    const sectionTabs = await page.$$eval('[data-section-tabs="brain"] a', (as) => as.map((a) => `${a.getAttribute('href')}${a.getAttribute('aria-current') === 'page' ? '*' : ''}`));
    check('the Brain section shows both brains as tabs, the culture brain current', sectionTabs.join(',') === '/brain,/culture*', sectionTabs.join(','));
    check('the rail still has seven icons, Brain lit', await page.locator('aside.rail nav a').count() === 7
        && await page.locator('aside.rail nav a[aria-current="page"]').getAttribute('data-rail') === 'brain');

    const board = page.locator('#brand-board');
    const boardBrands = await board.locator('[data-brand-board] [data-brand]').evaluateAll((els) => els.map((el) => el.getAttribute('data-brand')));
    check('the board lists every brand with attention', boardBrands.length === 5 && ['celsius', 'poppi', 'crocs', 'duolingo', 'liquid-death'].every((id) => boardBrands.includes(id)), boardBrands.join(','));
    const categories = await board.locator('[data-category]').evaluateAll((els) => els.map((el) => el.getAttribute('data-category')));
    check('…one column per category in the catalog\'s order, empty ones not drawn', categories.join(',') === 'drinks,footwear,apps', categories.join(','));
    check('…heaviest brand first within a category', boardBrands[0] === 'celsius');
    const celsiusRow = board.locator('[data-brand-board] [data-brand="celsius"]');
    check('a thesis is a dot on the name, an owner a link to its stock page and a ticket', /●/.test(await celsiusRow.innerText())
        && await celsiusRow.locator('a[href="/stocks/CELH"]').count() === 1 && await celsiusRow.locator('a[href="/trade?symbol=CELH"]').count() === 1
        && await celsiusRow.locator('a[href="/culture?brand=celsius#evidence"]').count() === 1);
    check('a private brand carries the ○ and no ticket', /○/.test(await board.locator('[data-brand-board] [data-brand="liquid-death"]').innerText())
        && await board.locator('[data-brand-board] [data-brand="liquid-death"] a[href^="/trade"]').count() === 0);
    const marks = await board.locator('[data-board-marks] li').allInnerTexts();
    check('the marks are explained once under the grid, only those some row carries', marks.length === (decisions ? 3 : 2)
        && /● thesis: .*reached 5/.test(marks[0]) && /○ private/.test(marks[1]) && (decisions ? /\* no live quote/.test(marks[2]) : true), marks.join(' | '));
    if (decisions) {
        check('an owner without a quote this week is starred', /CROX\*/.test(await board.locator('[data-brand-board] [data-brand="crocs"]').innerText()));
    }
    check('the board labels attention and sentiment with their definitions', await board.locator('[data-term="attention"][title]').count() >= 1
        && await board.locator('[data-term="brand-sentiment"][title]').count() >= 1);
    const boardTerms = board.locator('[data-what-these-mean]');
    check('…with one "How to read the board" for the panel, led by its own paragraph', await boardTerms.count() === 1
        && (await boardTerms.locator('summary').innerText()).includes('How to read the board') && !(await boardTerms.evaluate((d) => d.open)));
    await boardTerms.evaluate((d) => { d.open = true; });
    const boardTermsText = await boardTerms.innerText();
    check('…which says attention is not demand, then defines the four terms it shows', /Attention is not demand/.test(boardTermsText)
        && /Listed owner/.test(boardTermsText) && /Brand thesis/.test(boardTermsText) && /Brand sentiment/.test(boardTermsText) && !/Picker profile/.test(boardTermsText));

    const linksPanel = page.locator('#brand-links');
    check('the brands named together are drawn: the co-mention of Celsius and Poppi, each name a link to its evidence, nothing unlinked',
        await linksPanel.count() === 1 && await linksPanel.locator('line[data-edge="celsius|poppi"]').count() === 1
        && await linksPanel.locator('a[href="/culture?brand=celsius#evidence"]').count() === 1 && await linksPanel.locator('a[href="/culture?brand=poppi#evidence"]').count() === 1
        && await linksPanel.locator('[data-brand-links] a').count() === 2 && await linksPanel.locator('[data-what-these-mean]').count() === 1);

    const rising = page.locator('#rising-brands');
    const risingBrands = await rising.locator('[data-brand]').evaluateAll((els) => els.map((el) => el.getAttribute('data-brand')));
    check('the rising list ranks the fast layer and links each name to its evidence', risingBrands.length >= 4 && risingBrands[0] === 'celsius'
        && await rising.locator('a[href="/culture?brand=celsius#evidence"]').count() === 1, risingBrands.join(','));
    check('…with one "What these mean" of its own', await rising.locator('[data-what-these-mean]').count() === 1);

    const legend = page.locator('#culture-legend');
    check('the legend sits collapsed at the foot of the view', await legend.count() === 1
        && await legend.evaluate((el) => el.nextElementSibling === null) && !(await legend.locator('details').evaluate((d) => d.open)));
    await legend.locator('details').evaluate((d) => { d.open = true; });
    const legendText = await legend.innerText();
    check('…and opens to the constants: the 60-day half-life, both pickers, the rails', /halves every 60 days/.test(legendText) && /The Spike picker/.test(legendText)
        && /The Quiet picker/.test(legendText) && /at most 15% of its account/.test(legendText) && /opened with \$100,000/.test(legendText), legendText.replace(/\s+/g, ' ').slice(0, 160));
    check('…describing mechanism, never a result', mechanismFree(legendText));
    await shot('01-brands');

    // --- a brand's evidence: the labels, the links, the caveat once ---
    await page.goto(`${BASE}/culture?brand=celsius#evidence`, {waitUntil: 'domcontentloaded'});
    const evidencePanel = page.locator('#evidence');
    await evidencePanel.waitFor({timeout: 60000});
    check('an evidence link lands on the brands view with the evidence panel', await page.locator('[role="tab"][data-tab="brands"][aria-selected="true"]').count() === 1);
    const evidenceText = await evidencePanel.innerText();
    check('the evidence lists both items, names the owner and offers its ticket', /Switched from Poppi to Celsius/.test(evidenceText) && /bad link/.test(evidenceText)
        && await evidencePanel.locator('a[href="/stocks/CELH"]').count() === 1 && await evidencePanel.locator('a[href="/trade?symbol=CELH"]').count() === 1);
    check('one badge, for the labelled item, its definition as the title', await evidencePanel.locator('[data-term^="signal-"]').count() === 1
        && await evidencePanel.locator('[data-term="signal-substitution"][title]').count() === 1);
    check('a stored javascript: link is never an anchor', await page.locator('a[href^="javascript"]').count() === 0
        && await evidencePanel.locator('a[href="https://www.reddit.com/r/energydrinks/comments/qa1/x/"]').count() === 1);
    check('the item\'s other brand is a chip to its own evidence', await evidencePanel.locator('[data-brand-chips] a[href="/culture?brand=poppi#evidence"]').count() === 1);
    check('the AI caveat is stated once, and an importance never', await evidencePanel.locator('[data-evidence-caveat]').count() === 1 && !/importance/i.test(evidenceText));
    const labels = evidencePanel.locator('[data-what-these-mean]');
    check('…and one "What these labels mean", listing only that label', await labels.count() === 1 && (await labels.locator('summary').innerText()).includes('What these labels mean'));
    await labels.evaluate((d) => { d.open = true; });
    const labelText = await labels.innerText();
    check('…which defines substitution and nothing else', /Substitution/.test(labelText) && !/Backlash/.test(labelText) && !/Hype/.test(labelText));
    await shot('02-evidence');

    // --- the pickers view: two columns in profile order, a strip that colours nothing ---
    await page.goto(`${BASE}/culture?view=picks`, {waitUntil: 'domcontentloaded'});
    await page.locator('#picker-comparison').waitFor({timeout: 60000});
    const pickers = await page.locator('[data-picker]').evaluateAll((els) => els.map((el) => el.getAttribute('data-picker')));
    check('the two pickers stand side by side in the registry\'s order', pickers.join(',') === 'spike,quiet', pickers.join(','));
    const strip = await page.locator('[data-comparison]').evaluateAll((els) => els.map((el) => el.getAttribute('data-comparison')));
    check('the strip prints Spike, Quiet and SPY, never sorted by return', strip.join(',') === 'spike,quiet,spy', strip.join(','));
    check('…and colours no figure', await page.locator('#picker-comparison [data-comparison] .text-positive, #picker-comparison [data-comparison] .text-negative').count() === 0);
    if (decisions) {
        const simulatedTiles = await page.locator('[data-simulated]').evaluateAll((els) => els.map((el) => el.getAttribute('data-simulated')));
        check('the simulated strip prints the three variants and SPY, in the registry\'s order, neutral', simulatedTiles.join(',') === 'spike,quiet,price,spy'
            && await page.locator('[data-simulated-strip] .text-positive, [data-simulated-strip] .text-negative').count() === 0
            && /Simulated — attention and price only/.test(await page.locator('[data-simulated-strip]').innerText())
            && await page.locator('[data-backtest-pending]').count() === 0, simulatedTiles.join(','));
        check('…its tiles carrying the backtest\'s definition', await page.locator('[data-simulated] [data-term="attention-backtest"][title]').count() === 3);
    } else {
        check('…saying the backtest is not computed yet', await page.locator('[data-backtest-pending]').count() === 1);
    }
    check('the lead says what each picker follows, once', await page.locator('[data-picks-lead]').count() === 1 && await page.locator('[data-picker-lead]').count() === 2);
    const spikeColumn = page.locator('[data-picker="spike"]');
    const quietColumn = page.locator('[data-picker="quiet"]');
    if (decisions) {
        const stripText = await page.locator('#picker-comparison').innerText();
        check('both accounts have a record since today', (stripText.match(new RegExp(`since ${today}`, 'g')) ?? []).length === 3, stripText.replace(/\s+/g, ' ').slice(0, 200));
        // A record whose live curve has fewer than two points opens on its Simulated tab once a
        // backtest is stored (the strategies' rule), so switch to Live before reading it.
        check('a record with a one-point live curve opens on the simulated tab once a backtest exists',
            await spikeColumn.locator('#record-simulated-spike[aria-pressed="true"]').count() === 1 && await spikeColumn.locator('[data-record-pending]').count() === 0);
        await page.locator('#record-live-spike').click();
        await page.locator('#record-live-quiet').click();
        await page.getByText('Live since').first().waitFor({timeout: 10000});
        check('each record says it is live since today', /Live since/.test(await spikeColumn.locator('[data-culture-record="spike"]').innerText()) && /Live since/.test(await quietColumn.locator('[data-culture-record="quiet"]').innerText()));
        const spikeDecision = spikeColumn.locator('[data-culture-decision="spike"]');
        check('each column shows its own latest decision, with the universe audit and the feeds', await spikeDecision.count() === 1 && /owners quoted/.test(await spikeDecision.innerText()) && /feeds: /.test(await spikeDecision.innerText())
            && await quietColumn.locator('[data-culture-decision="quiet"]').count() === 1);
        check('…its raw reasons naming the picker', /picker Spike/.test(await spikeDecision.innerText()) && /picker Quiet/.test(await quietColumn.locator('[data-culture-decision="quiet"]').innerText()));
        check('…how many owners were eligible to buy, and no "none eligible" sentence', /\d+ eligible to buy/.test(await spikeDecision.innerText())
            && await spikeDecision.locator('[data-culture-none-eligible]').count() === 0);
        // A week in which nothing could be bought says why, once.
        const storedEligibility = (await db.collection('culturedecisions').findOne({date: today, profile: 'spike'}))?.eligibility;
        await db.collection('culturedecisions').updateOne({date: today, profile: 'spike'}, {$set: {eligibility: {total: 130, eligible: 0, noAttention: 130, fewBars: 2, unquoted: 0}}});
        await page.reload({waitUntil: 'domcontentloaded'});
        await page.locator('[data-culture-decision="spike"]').waitFor({timeout: 30000});
        const noneLine = await page.locator('[data-culture-decision="spike"] [data-culture-none-eligible]').innerText().catch(() => '');
        check('a week with no owner eligible says what kept them out', /^No owner could be bought this week: 130 of 130 had no Wikipedia baseline yet/.test(noneLine), noneLine);
        await db.collection('culturedecisions').updateOne({date: today, profile: 'spike'}, storedEligibility ? {$set: {eligibility: storedEligibility}} : {$unset: {eligibility: ''}});
        await page.reload({waitUntil: 'domcontentloaded'});
        await page.locator('[data-culture-decision="spike"]').waitFor({timeout: 30000});
        const glosses = page.locator('[data-culture-gloss]');
        const glossCount = await glosses.count();
        check('each decision item has one closed "What the picker saw"', glossCount === decisions.reduce((sum, d) => sum + d.items.length, 0)
            && (await glosses.evaluateAll((all) => all.every((d) => !d.open))), String(glossCount));
        await glosses.first().evaluate((d) => { d.open = true; });
        const glossText = await glosses.first().innerText();
        check('…reading the picker and its weights from the config', /The Spike picker scored it/.test(glossText) && /price momentum 0\.40/.test(glossText), glossText.replace(/\s+/g, ' ').slice(0, 200));
        check('…and no "Apply" anywhere: a record, not a list to act on', await page.locator('button', {hasText: 'Apply'}).count() === 0);
        check('the brands behind a symbol are chips to their evidence', await spikeDecision.locator('[data-item-brands] a[href^="/culture?brand="]').count() >= 1);
        check('nothing held and no fill, said plainly', (await page.locator('#culture-holdings-spike').innerText()).includes('Nothing held') && (await page.locator('#culture-trades-spike').innerText()).includes('No fill yet'));
        // Each record's simulated half is its own profile's variant, labelled as such.
        await page.locator('#record-simulated-spike').click();
        await page.locator('#simulated-stats-spike').waitFor({timeout: 10000});
        const simulatedRecord = await spikeColumn.locator('[data-culture-record="spike"]').innerText();
        check('the Simulated tab shows the variant with its badge, window, feeds note and survivorship caveat', /Simulated — attention and price only, not live/.test(simulatedRecord)
            && /weekly decisions/.test(simulatedRecord) && /reads stored pageviews and prices only/.test(simulatedRecord) && /chosen in 2026/.test(simulatedRecord)
            && await page.locator('#simulated-stats-spike [data-term="attention-backtest"]').count() === 0 && await page.locator('#simulated-stats-spike [data-what-these-mean]').count() === 1,
            simulatedRecord.replace(/\s+/g, ' ').slice(0, 240));
        await page.locator('#simulated-stats-spike [data-what-these-mean]').evaluate((d) => { d.open = true; });
        check('…whose definitions name the attention backtest, not a strategy backtest', /Attention backtest/.test(await page.locator('#simulated-stats-spike').innerText())
            && !/Simulated record/.test(await page.locator('#simulated-stats-spike').innerText()));
        await page.locator('#record-live-spike').click();
    } else {
        check('before the first run the strip shows dashes and "not started"', (await page.locator('#picker-comparison').innerText()).includes('not started'));
        check('…and each column its empty decision', await page.locator('[data-culture-decision]').count() === 0 && await page.getByText('No decision yet').count() === 2);
    }
    check('the legend closes the pickers view too', await page.locator('#culture-legend').count() === 1);
    await shot('03-picks');

    // --- the system view ---
    await page.goto(`${BASE}/culture?view=system`, {waitUntil: 'domcontentloaded'});
    await page.locator('#culture-system').waitFor({timeout: 60000});
    const system = page.locator('#culture-system');
    check('the system view holds the counters, the freshness line and the three job stamps', /Brands/i.test(await system.locator('[data-culture-counters]').innerText())
        && /Wikipedia/.test(await system.locator('[data-culture-lines]').innerText()) && await system.locator('[data-culture-jobs] > *').count() === 3);
    // Celsius has views from the data-layer section; the weekly section adds Pepsi and Poppi.
    const brandsWithViews = inngestUp ? 3 : 1;
    const drift = await system.locator('[data-drift-alarm]').getAttribute('data-drift-alarm');
    check('the drift alarm names the brands without recent views', Number(drift) === CULTURE_BRANDS.length - brandsWithViews, `${drift} of ${CULTURE_BRANDS.length}`);
    check('the suggestions queue lists the name the model met', /Cirkul/.test(await page.locator('#suggested-brands').innerText()));
    check('…and nothing else of the other views', await page.locator('#brand-board').count() === 0 && await page.locator('#picker-comparison').count() === 0);
    if (decisions) {
        check('the accounts are listed with their launch', /Spike · live since/.test(await system.locator('[data-culture-accounts]').innerText()));
    }
    await shot('04-system');

    // --- the two widgets, from the library ---
    await db.collection('userpreferences').updateOne({userId}, {$set: {dashboardLayout: {version: 1, widgets: [{id: 'culture-picks', span: 12}, {id: 'brand-attention', span: 6}]}, updatedAt: new Date()}}, {upsert: true});
    await page.goto(`${BASE}/dashboard`, {waitUntil: 'load'});
    await page.locator('[data-widget-id="brand-attention"] [data-brand]').first().waitFor({timeout: 60000});
    const tile = page.locator('[data-widget-id="culture-picks"]');
    check('the Culture Brain tile links to the pickers and prints the records or the schedule', await tile.locator('a[href="/culture?view=picks"]').count() === 1
        && (decisions ? /Spike .*Quiet /.test(await tile.innerText()) : /Mondays 10:45 ET/.test(await tile.innerText())), (await tile.innerText()).replace(/\s+/g, ' '));
    const attentionWidget = page.locator('[data-widget-id="brand-attention"]');
    check('the Brand attention widget lists the brands with their titles and no disclosure', await attentionWidget.locator('[data-brand="celsius"]').count() === 1
        && await attentionWidget.locator('[data-term="attention"][title]').count() >= 1 && await page.locator('[data-widget-id] [data-what-these-mean]').count() === 0);
    await shot('05-widgets');

    // --- a phone width: nothing scrolls sideways ---
    await page.setViewportSize({width: 375, height: 812});
    for (const path of ['/culture', '/culture?view=picks', '/culture?view=system']) {
        await page.goto(`${BASE}${path}`, {waitUntil: 'domcontentloaded'});
        await page.locator('#culture-legend').waitFor({timeout: 60000});
        const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
        check(`${path} has no horizontal scroll at 375px`, overflow <= 1, `${overflow}px`);
    }
    await shot('06-phone');
    await page.setViewportSize({width: 1440, height: 900});

    // ---- enrolling one of the reader's own accounts with a picker ----
    // The card offers Enroll; the action makes a "Culture · Spike" account at the typed balance
    // and an active row, and queues the bootstrap. The harness has no Finnhub key, so a fill
    // fails for want of a price — the outcome under test, as for the pickers' own accounts.
    await page.goto(`${BASE}/culture?view=picks`, {waitUntil: 'domcontentloaded'});
    const spikeCard = page.locator('[data-follow-card="spike"]');
    await spikeCard.waitFor({timeout: 60000});
    check('each picker carries an enrolment card offering Enroll, none enrolled', await page.locator('[data-follow-card]').count() === 2
        && await page.locator('[data-follow-enroll]').count() === 2 && await page.locator('[data-follow-status]').count() === 0 && await page.locator('[data-follow-decisions]').count() === 0);
    const cardText = await spikeCard.innerText();
    check('the card says what the picker does with the account and that it is an experiment', /sized to this account/.test(cardText) && /not financial advice/.test(cardText) && mechanismFree(cardText), cardText.replace(/\s+/g, ' ').slice(0, 200));
    await spikeCard.locator('#follow-balance-spike').fill('50000');
    check('the button names the picker and the balance typed', /Enroll — Spike trades \$50,000/.test(await spikeCard.locator('[data-follow-enroll]').innerText()));
    await spikeCard.locator('[data-follow-enroll]').click();
    await spikeCard.locator('[data-follow-status="active"]').waitFor({timeout: 30000});
    const followRow = await db.collection('culturefollows').findOne({userId, profile: 'spike'});
    const followAccount = followRow ? await db.collection('paperaccounts').findOne({_id: new (await import('mongodb')).ObjectId(followRow.accountId)}) : null;
    check('enrolling makes an active row and a "Culture · Spike" account of the reader\'s at the typed balance', followRow?.status === 'active' && followAccount?.userId === userId
        && followAccount?.name === 'Culture · Spike' && followAccount?.startingBalance === 50000 && followAccount?.cash === 50000, JSON.stringify({row: followRow?.status, account: followAccount?.name, balance: followAccount?.startingBalance}));
    check('the card now shows Active, Trade now, Pause, the link to the account and Unenroll', await spikeCard.locator('[data-follow-run]').count() === 1 && await spikeCard.locator('[data-follow-pause]').count() === 1
        && await spikeCard.locator(`a[href="/portfolio?account=${followRow?.accountId}"]`).count() === 1 && await spikeCard.locator('[data-follow-unenroll]').count() === 1);
    check('…and the column gains the account\'s decisions panel, empty until the first run', await page.locator('[data-follow-decisions="spike"]').count() === 1
        && /No decision for this account yet/.test(await page.locator('[data-follow-decisions="spike"]').innerText()));
    check('the Quiet card still offers Enroll', await page.locator('[data-follow-card="quiet"] [data-follow-enroll]').count() === 1);

    const accountId = followRow?.accountId ?? '';
    if (inngestUp && decisions) {
        // The enrolment run (the action queued one too; a forced one here settles the session).
        const followMessage = () => jobMessageOf('culture-follow-bootstrap');
        await fireEvent('app/bootstrap.culture.follow', {userId, profile: 'spike', force: true});
        const followDecision = await pollUntil(async () => {
            const doc = await db.collection('culturefollowdecisions').findOne({userId, profile: 'spike', kind: 'executed'});
            return doc && /Culture enrolment/.test(await followMessage()) ? doc : null;
        }, 240_000);
        check('the enrolment run writes an executed decision for the account and stamps its job', followDecision !== null, await followMessage());
        if (followDecision) {
            const pickerDecision = decisions.find((d) => d.profile === 'spike');
            const orders = followDecision.items.filter((i) => i.action !== 'hold');
            check('…its orders are the picker\'s targets, every fill failing for want of a price', orders.length > 0 && orders.every((i) => i.executed === false && /live price/.test(i.error ?? ''))
                && orders.every((i) => pickerDecision.items.some((p) => p.symbol === i.symbol)), `${orders.length} orders: ${orders.map((i) => `${i.action} ${i.symbol}`).join(', ')}`);
            check('…the week is claimed on the row and the failures noted', (await db.collection('culturefollows').findOne({userId, profile: 'spike'}))?.lastRunWeek === getEasternWeekKeyOf(today)
                && /failed/.test((await db.collection('culturefollows').findOne({userId, profile: 'spike'}))?.lastError ?? ''));
            check('the account itself is untouched when nothing filled', (await db.collection('paperaccounts').findOne({_id: followAccount._id}))?.cash === 50000);

            await page.goto(`${BASE}/culture?view=picks`, {waitUntil: 'domcontentloaded'});
            const followPanel = page.locator('[data-follow-decisions="spike"]');
            await followPanel.waitFor({timeout: 60000});
            const followGlosses = await followPanel.locator('[data-culture-gloss]').count();
            check('the account\'s decisions panel prints the items, each with one closed "What the picker saw"', await followPanel.locator('[data-culture-follow-decision="spike"]').count() === 1
                && followGlosses === followDecision.items.length && await followPanel.locator('[data-culture-gloss][open]').count() === 0, `${followGlosses} glosses`);
            check('…and names the picker\'s targets, not a universe of its own', /sized to this account/.test(await followPanel.innerText()) && !/owners quoted/.test(await followPanel.innerText()));
            check('the picker\'s own decision panel is unchanged beside it', await page.locator('[data-picker="spike"] [data-culture-decision="spike"]').count() === 1);
            await shot('07-enrolled');

            // The weekly run, with the pickers' own claims backdated so it runs past its early
            // return: it passes over the enrolment the bootstrap already claimed this week; with
            // that claim backdated too, it trades the account.
            await db.collection('culturestates').updateMany({}, {$set: {lastRunWeek: '2020-W01'}});
            await fireEvent('app/run.culture.brain', {force: true});
            const skipped = await pollUntil(async () => (/enrolled accounts: 0 traded, 1 skipped/.test(await jobMessageOf('culture-brain-weekly')) ? await jobMessageOf('culture-brain-weekly') : null), 240_000);
            check('the weekly run passes over an enrolment that already ran this week', skipped !== null, await jobMessageOf('culture-brain-weekly'));
            await db.collection('culturefollows').updateOne({userId, profile: 'spike'}, {$set: {lastRunWeek: '2020-W01'}});
            await db.collection('culturestates').updateMany({}, {$set: {lastRunWeek: '2020-W01'}});
            await fireEvent('app/run.culture.brain', {force: true});
            const traded = await pollUntil(async () => (/enrolled accounts: 1 traded/.test(await jobMessageOf('culture-brain-weekly')) ? await jobMessageOf('culture-brain-weekly') : null), 240_000);
            check('…and trades it once the week is unclaimed, this week\'s decision written again', traded !== null
                && (await db.collection('culturefollows').findOne({userId, profile: 'spike'}))?.lastRunWeek === getEasternWeekKeyOf(today), await jobMessageOf('culture-brain-weekly'));
        }
    } else {
        note('enrolment run skipped', 'no Inngest dev server or no picker decision; the card, the row, the portfolio line and the delete refusal are still checked');
    }

    // The portfolio names the picker and refuses the delete.
    await page.goto(`${BASE}/portfolio?account=${accountId}`, {waitUntil: 'load'});
    await page.getByText('Holdings', {exact: true}).waitFor({timeout: 30000});
    const tradedBy = page.locator('[data-traded-by="culture:spike"]');
    check('/portfolio says the Spike picker trades the account, with the way to its decisions', await tradedBy.count() === 1 && /Traded by the Spike culture picker/.test(await tradedBy.innerText())
        && await tradedBy.locator('a[href="/culture?view=picks"]').count() === 1);
    const {deletePaperAccount} = await jiti.import(`${REPO_ROOT}lib/trading/lifecycle.ts`).then(() => ({deletePaperAccount: null}));
    void deletePaperAccount;
    const lifecycle = await jiti.import(`${REPO_ROOT}lib/trading/lifecycle.ts`);
    const refusal = await lifecycle.deleteOwnedAccount(userId, accountId);
    check('deleting the account is refused while the picker trades in it, and nothing is removed', refusal.success === false && /culture picker/.test(refusal.message) && /unenroll/i.test(refusal.message)
        && (await db.collection('paperaccounts').countDocuments({_id: followAccount._id})) === 1, refusal.message);
    await shot('08-portfolio-enrolled');

    // The widget prints the reader's own line.
    await page.goto(`${BASE}/dashboard`, {waitUntil: 'load'});
    await page.locator('[data-widget-id="culture-picks"]').waitFor({timeout: 60000});
    check('the Culture Brain tile prints the reader\'s own enrolled account', /Yours: Spike/.test(await page.locator('[data-widget-id="culture-picks"] [data-culture-yours]').innerText()));

    // Pause, resume, then unenroll: the row goes, the account stays; enrolling again reuses it.
    await page.goto(`${BASE}/culture?view=picks`, {waitUntil: 'domcontentloaded'});
    await spikeCard.locator('[data-follow-pause]').waitFor({timeout: 60000});
    await spikeCard.locator('[data-follow-pause]').click();
    await spikeCard.locator('[data-follow-status="paused"]').waitFor({timeout: 30000});
    check('Pause marks the row paused and takes Trade now away', (await db.collection('culturefollows').findOne({userId, profile: 'spike'}))?.status === 'paused' && await spikeCard.locator('[data-follow-run]').count() === 0);
    await spikeCard.locator('[data-follow-resume]').click();
    await spikeCard.locator('[data-follow-status="active"]').waitFor({timeout: 30000});
    await spikeCard.locator('[data-follow-unenroll]').click();
    check('Unenroll asks once', /Confirm unenroll/.test(await spikeCard.locator('[data-follow-unenroll]').innerText()));
    await spikeCard.locator('[data-follow-unenroll]').click();
    await spikeCard.locator('[data-follow-enroll]').waitFor({timeout: 30000});
    check('unenrolling removes the row and keeps the account', (await db.collection('culturefollows').countDocuments({userId})) === 0
        && (await db.collection('paperaccounts').countDocuments({_id: followAccount._id})) === 1 && await page.locator('[data-follow-decisions]').count() === 0);
    await spikeCard.locator('#follow-balance-spike').fill('60000');
    await spikeCard.locator('[data-follow-enroll]').click();
    await spikeCard.locator('[data-follow-status="active"]').waitFor({timeout: 30000});
    const reused = await db.collection('paperaccounts').find({userId, name: 'Culture · Spike'}).toArray();
    check('enrolling again reuses the empty account at the new balance, never a second one', reused.length === 1 && String(reused[0]._id) === accountId && reused[0].startingBalance === 60000 && reused[0].cash === 60000,
        JSON.stringify(reused.map((a) => [a.startingBalance, a.cash])));
    for (const path of ['/culture?view=picks', `/portfolio?account=${accountId}`]) {
        await page.goto(`${BASE}${path}`, {waitUntil: 'domcontentloaded'});
        await page.locator('[data-follow-card], [data-traded-by]').first().waitFor({timeout: 60000});
        const text = await page.locator('main').innerText().catch(() => page.locator('body').innerText());
        check(`${path} keeps to the descriptive voice`, !/\b(should|recommend|best|optimal)\b/i.test(text), text.match(/.{0,40}\b(should|recommend|best|optimal)\b.{0,40}/i)?.[0] ?? '');
    }
    await page.close();
} catch (err) {
    check(`threw: ${err.message}`, false, err.stack);
} finally {
    try {
        const db = mongo.db();
        await cleanupWeekly(db, storedBars, storedMetas);
        for (const name of COLLECTIONS) await db.collection(name).deleteMany({});
    } catch {}
    await mongo.close().catch(() => {});
    await browser.close().catch(() => {});
}

summary('culture');
