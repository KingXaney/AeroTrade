// Fire a background job by hand against the local Inngest dev server
// (`npx inngest-cli@latest dev -u http://localhost:3000/api/inngest` next to `npm run dev`).
//
//   npm run trigger -- brain                       daily news-brain update
//   npm run trigger -- navigator                   weekly AI Navigator run
//   npm run trigger -- news                        today's digest emails
//   npm run trigger -- snapshots                   daily account + benchmark snapshots
//   npm run trigger -- topics                      refresh every followed keyword set
//   npm run trigger -- briefs                      generate today's topic briefs
//   npm run trigger -- topic <userId> <keywordSetHash>   one on-demand topic refresh
import { Inngest } from "inngest";

const EVENTS = {
    brain: 'app/update.news.brain',
    navigator: 'app/run.ai.navigator',
    news: 'app/send.daily.news',
    snapshots: 'app/record.daily.snapshots',
    topics: 'app/refresh.topic.feeds',
    briefs: 'app/generate.topic.briefs',
    topic: 'topic/refresh.requested',
};

const [job, userId, hash] = process.argv.slice(2);
const name = EVENTS[job];
if (!name || (job === 'topic' && (!userId || !Number.isFinite(Number(hash))))) {
    console.error(`Usage: npm run trigger -- <${Object.keys(EVENTS).join('|')}> [userId keywordSetHash]`);
    process.exit(1);
}
const data = job === 'topic' ? { userId, keywordSetHash: Number(hash) } : {};

// The id must match lib/inngest/client.ts so the event lands in the same app.
const inngest = new Inngest({ id: 'aerotrade' });
inngest.send({ name, data })
    .then(() => console.log(`Triggered '${name}' locally.`))
    .catch((error) => { console.error(error); process.exit(1); });
