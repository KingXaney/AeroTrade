# Browser QA

End-to-end checks against a throwaway database. Nothing here needs a `.env`, an
API key, or a real MongoDB: the recipe starts an in-memory MongoDB, runs the dev
server with inline environment variables, and drives Google Chrome with Playwright.

Unit tests (`npm test`) cover the pure modules. This is how the database-bound
parts — server actions, Mongoose reads, the pages themselves — get exercised.

## One-time setup

```bash
cd scripts/qa
npm install            # mongodb-memory-server + playwright (kept out of the root package.json on purpose)
```

Google Chrome must be installed; the scripts use `channel: 'chrome'` so no
browser download is needed.

## Run

Three terminals from `scripts/qa`:

```bash
node start-mongo.mjs                       # 1. throwaway MongoDB on :27117 (prints READY)

MONGODB_URI='mongodb://127.0.0.1:27117/aerotrade' \
BETTER_AUTH_SECRET='local-qa-secret-at-least-32-characters-long' \
BETTER_AUTH_URL='http://localhost:3000' \
SIGN_UP_CLIENT_LIMIT=1000 \
INNGEST_DEV=1 npm run dev --prefix ../..   # 2. the app, from the repo root

node qa-topics.mjs                         # 3. the checks (screenshots land in ./output)
node screenshots.mjs                       # or: capture the README screenshots
```

`SIGN_UP_CLIENT_LIMIT` lifts the per-client sign-up limit (10 an hour) for the run: every suite
signs up its own user, all from localhost.

The other scripts follow the same shape, one per change set: `qa-styles.mjs` (its in-app
404 waits for the rendered page, and a symbol no strategy watches still 404s keyless with no
stock panels),
`qa-shell.mjs`, `qa-chat.mjs`, `qa-topics-refresh.mjs`, `qa-trading.mjs` (the ticket,
the CSV export, the account wording — "Main account", Account Comparison, the library's Accounts and
Quant Strategies groups, a layout saved with the old `strategy-comparison` id read as the account
comparison — the comparison table and `/history`'s trade feed — none counts a row from before
the account's inception — and the note, read back from `placeOrder`'s own request; for the "earning ≈$x/month" clause it answers the page's `getQuote`
server action with a fixed price, since the harness has no quote provider, and removes the ^IRX
row it seeds; `/stocks/AAPL` renders keyless because a strategy watches it),
`qa-news-feed.mjs`, `qa-strategies.mjs` (seeds the system-owned strategy accounts directly — the
daily job never runs in this harness; the what-if lab from a seeded grid — two knobs on golden
cross, a slider on 60/40, "computed overnight" before a grid exists, none on buy-and-hold — then
the job's own what-if store, `saveVariants` / `variantStamps` / `saveBacktest`, called through
Mongoose on the harness database: the app's TypeScript is loaded with `jiti`, resolved from the
repo's `node_modules`, with `MONGODB_URI` pointed at the harness; and the stock page: keyless
empty key numbers, each rule's newest seeded row under "What the rules see" on `/stocks/NVDA`,
three watchers on `/stocks/SPY`, none on `/stocks/ZZZ`; the live trade log's CSV export — this
epoch's fills only, 404 for an unknown slug, 401 signed out), `qa-income.mjs` (interest and dividends: runs the REAL nightly
income job through the Inngest dev server, scoped to its own account; without the dev server on :8288
it runs only the page checks),
`qa-learn.mjs` (the First-week checklist, /learn, the ⌘K glossary rows, Guess the Verdict,
"What the rule saw" with the decoded reason and "Read this board" on a seeded strategy page, an
"Ask in chat" prefill, Today's lesson added from the library, the Daily quiz — one board inside
its ten-day window, the reveal and its gloss, a day counted once (two tabs answering at once
included), each kind of question forced from a board only it can use, the empty state; it wipes
`strategyruns` and seeds its own, so it runs late — Time in the market on a seeded V-shaped SPY
from the earlier of two accounts' current records, every way and each of the table's eight starts
checked against values computed in the script (it snapshots and restores the SPY and ^IRX bars
it replaces), and `/brain`: the legend's
constants, one event badge, "since thesis" once bars are stored, each Navigator decision
decoded, titles only on the widgets), `qa-learn-account.mjs` (the
portfolio surfaces on a seeded account: a fresh account's empty states first, then seeded
snapshots, a sell, an unpriced holding and income totals for the dated drawdown and its shaded
band, the return bridge's guess and lines that add up to the Total Return tile to the cent, the
risk lens, buy notes under the sell, fill receipts, `/trade`'s Last fill, a receipt per
income month, Luck or skill — edge closes seeded for the 40 large caps, dividends on SPY and on
them over a flat ^IRX of its own, and the seeded sample replayed in the script with the income
convention and the app's NYSE calendar (loaded with `jiti`), so the printed window, rank, SPY, the
median and each marker's place on the axis are checked against numbers computed outside the app;
the marker withheld with an unpriced holding, placed from a snapshot on the last session, and
ended on a stale snapshot's date — and Trading habits over four closed lots with a strategy round
trip and a sale before its 30-day window left out; it removes the large-cap bars it seeded and
puts back the ^IRX points and any other suite's large-cap dividends it set aside), `qa-chat-tutor.mjs` (the
chat's three rate-limit windows via seeded `ratelimits` rows, the prefill, then the `explainTerm`
and `getQuantStrategies` chips from stubbed UI-message streams — the tutor's answers themselves need
a Gemini key and are checked by hand)
and `qa-auth.mjs` (password reset end to end — it reads the token out of the
throwaway Mongo, since the harness has no SMTP — and the sign-in limits: eleven attempts on one
address, the per-client counter seeded to its limit, every `signin:*` row removed at the end). They share one database, so each
scopes its assertions to the user it signs up.

`qa-topics.mjs` signs up a fresh user, follows a starter topic, waits for the
first live Google News fetch, then walks the dashboard, widget library,
settings, theme picker (including the hover-sweep regression check), the ⌘K
palette, topic editing and deletion, and the chat suggestions. It exits non-zero
if any check fails and prints one `PASS`/`FAIL` line per check.

Without a Finnhub key the trade and markets pages show empty quotes, which is
fine for these checks — `qa-topics-refresh.mjs` relies on it to assert that unpriced
holdings are labelled rather than shown as a flat P&L. The Inngest jobs are not part
of this recipe; fire them with `npx inngest-cli dev` and `npm run trigger -- <job>`. The daily
digest has no suite: it sends only after a news pull, a model's summary and SMTP, so its topics
and lesson sections are pure builders covered by unit tests instead.
`qa-topics-refresh.mjs` detects a dev server on :8288 and, when one is running,
exercises the queued path (the first-run fill lands every starter, "Refresh now"
runs the on-demand job) instead of the dead-queue path (honest failure, cooldown
rolled back). Run it both ways before shipping a topics change.
