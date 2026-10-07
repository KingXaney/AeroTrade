// The culture brain's data layer (lib/culture/store, ingest, update), loaded from the app's
// TypeScript through jiti and run against the harness database: attention rows land as monthly
// documents and read back as dated series (a corrected day overwrites in place); items dedupe on
// their link, get their alias matches, count per brand and source, and queue co-mentions first;
// the day's attention surprises and the alias fallback fold into brand entities through the
// pure planner — once per run id, attention once per day — with co-mention links; owners roll up;
// a suggested name the catalog already has is dropped and a repeat is counted; evidence reads a
// brand's items with the other brands they name and never an importance. The daily job itself
// is not fired here: its sources are the real Wikipedia, App Store and Google News.
// Run: npm run qa -- culture   (the harness: README.md)
import {MongoClient} from 'mongodb';
import {createJiti} from 'jiti';
import {MONGO, REPO_ROOT, check, note, summary} from './lib.mjs';

const COLLECTIONS = ['cultureentities', 'cultureattentions', 'cultureitems', 'culturesuggestions'];
const mongo = new MongoClient(MONGO);

const etDate = (date) => date.toLocaleDateString('en-CA', {timeZone: 'America/New_York'});
const addDays = (date, days) => {
    const [y, m, d] = date.split('-').map(Number);
    return new Date(Date.UTC(y, m - 1, d + days)).toISOString().slice(0, 10);
};
const near = (a, b, eps = 1e-6) => Math.abs(a - b) <= eps;

try {
    await mongo.connect();
    const db = mongo.db();
    for (const name of COLLECTIONS) await db.collection(name).deleteMany({});

    // The app's modules connect through database/mongoose, which reads MONGODB_URI at load.
    process.env.MONGODB_URI = MONGO;
    const jiti = createJiti(import.meta.url, {alias: {'@': REPO_ROOT.replace(/\/$/, '')}, fsCache: false});
    const store = await jiti.import(`${REPO_ROOT}lib/culture/store.ts`);
    const ingest = await jiti.import(`${REPO_ROOT}lib/culture/ingest.ts`);
    const update = await jiti.import(`${REPO_ROOT}lib/culture/update.ts`);
    const {SOURCE_FOLD_WEIGHTS, FALLBACK_IMPORTANCE} = await jiti.import(`${REPO_ROOT}lib/culture/config.ts`);
    const {CULTURE_BRANDS} = await jiti.import(`${REPO_ROOT}lib/culture/catalog.ts`);

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
} catch (err) {
    check(`threw: ${err.message}`, false, err.stack);
} finally {
    try {
        const db = mongo.db();
        for (const name of COLLECTIONS) await db.collection(name).deleteMany({});
    } catch {}
    await mongo.close().catch(() => {});
}

summary('culture');
