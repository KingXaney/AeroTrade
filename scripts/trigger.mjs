// Fire a background job by hand against the local Inngest dev server
// (`npx inngest-cli@latest dev -u http://localhost:3000/api/inngest` next to `npm run dev`).
//
//   npm run trigger -- brain                       daily news-brain update
//   npm run trigger -- navigator                   weekly AI Navigator run
//   npm run trigger -- news                        today's digest emails
//   npm run trigger -- news <email>                a test brief to that one opted-in reader
//   npm run trigger -- snapshots                   daily account + benchmark snapshots
//   npm run trigger -- income                      credit interest + dividends through yesterday (back-credits new accounts)
//   npm run trigger -- topics                      refresh every followed keyword set
//   npm run trigger -- briefs                      generate today's topic briefs
//   npm run trigger -- strategies                  run the quant strategies (fills only during the session)
//   npm run trigger -- strategies-preview          decide and record without filling anything
//   npm run trigger -- strategies-resimulate       rebuild every strategy's backtest from a fresh backfill
//   npm run trigger -- topic <userId> <keywordSetHash>   one on-demand topic refresh
import { Inngest } from "inngest";

// Each job's event as lib/jobs/registry.ts names it; lib/jobs/__tests__/registry.test.ts holds
// this table to the registry, so a renamed event fails there instead of firing nothing.
const EVENTS = {
    brain: 'app/update.news.brain',
    navigator: 'app/run.ai.navigator',
    news: 'app/send.daily.news',
    snapshots: 'app/record.daily.snapshots',
    income: 'app/credit.account.income',
    topics: 'app/refresh.topic.feeds',
    briefs: 'app/generate.topic.briefs',
    briefing: 'app/generate.market.briefing',
    topic: 'topic/refresh.requested',
    strategies: 'app/run.strategies',
    'strategies-preview': 'app/run.strategies',
    'strategies-resimulate': 'app/run.strategies',
};

const STRATEGY_DATA = {
    'strategies-preview': { dryRun: true },
    'strategies-resimulate': { resimulate: true },
};

const [job, first, second] = process.argv.slice(2);
const name = EVENTS[job];
if (!name || (job === 'topic' && (!first || !Number.isFinite(Number(second))))) {
    console.error(`Usage: npm run trigger -- <${Object.keys(EVENTS).join('|')}> [userId keywordSetHash | email]`);
    process.exit(1);
}
const data = job === 'topic'
    ? { userId: first, keywordSetHash: Number(second) }
    : job === 'news' && first ? { email: first } : (STRATEGY_DATA[job] ?? {});

// The id must match lib/jobs/client.ts so the event lands in the same app.
const inngest = new Inngest({ id: 'aerotrade' });
inngest.send({ name, data })
    .then(() => console.log(`Triggered '${name}' locally.`))
    .catch((error) => { console.error(error); process.exit(1); });
