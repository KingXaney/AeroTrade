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
INNGEST_DEV=1 npm run dev --prefix ../..   # 2. the app, from the repo root

node qa-topics.mjs                         # 3. the checks (screenshots land in ./output)
node screenshots.mjs                       # or: capture the README screenshots
```

The other scripts follow the same shape, one per change set: `qa-foundations.mjs`,
`qa-navigation.mjs`, `qa-ai-surfaces.mjs`, `qa-truthful-data.mjs`, `qa-trade-desk.mjs` (the ticket,
the CSV export and the note; for the "earning ≈$x/month" clause it answers the page's `getQuote`
server action with a fixed price, since the harness has no quote provider, and removes the ^IRX
row it seeds),
`qa-news-feed.mjs`, `qa-strategies.mjs` (seeds the system-owned strategy accounts directly — the
daily job never runs in this harness), `qa-income.mjs` (interest and dividends: runs the REAL nightly
income job through the Inngest dev server, scoped to its own account; without the dev server on :8288
it runs only the page checks),
`qa-learn.mjs` (the First-week checklist, /learn, the ⌘K glossary rows, Guess the Verdict,
"What the rule saw" with the decoded reason and "Read this board" on a seeded strategy page, an
"Ask in chat" prefill, and Today's lesson added from the library), `qa-learn-account.mjs` (the
portfolio surfaces on a seeded account: a fresh account's empty states first, then seeded
snapshots, a sell, an unpriced holding and income totals for the dated drawdown and its shaded
band, the return bridge's guess and lines that add up to the Total Return tile to the cent, the
risk lens, buy notes under the sell, fill receipts, `/trade`'s Last fill and a receipt per
income month), `qa-tutor.mjs` (the
chat's three rate-limit windows via seeded `ratelimits` rows, the prefill, then the `explainTerm`
chip from a stubbed UI-message stream — the tutor's answers themselves need a Gemini key and are
checked by hand)
and `qa-auth.mjs` (password reset end to end — it reads the token out of the
throwaway Mongo, since the harness has no SMTP). They share one database, so each
scopes its assertions to the user it signs up.

`qa-topics.mjs` signs up a fresh user, follows a starter topic, waits for the
first live Google News fetch, then walks the dashboard, widget library,
settings, theme picker (including the hover-sweep regression check), the ⌘K
palette, topic editing and deletion, and the chat suggestions. It exits non-zero
if any check fails and prints one `PASS`/`FAIL` line per check.

Without a Finnhub key the trade and markets pages show empty quotes, which is
fine for these checks — `qa-truthful-data.mjs` relies on it to assert that unpriced
holdings are labelled rather than shown as a flat P&L. The Inngest jobs are not part
of this recipe; fire them with `npx inngest-cli dev` and `npm run trigger -- <job>`.
`qa-truthful-data.mjs` detects a dev server on :8288 and, when one is running,
exercises the queued path (the first-run fill lands every starter, "Refresh now"
runs the on-demand job) instead of the dead-queue path (honest failure, cooldown
rolled back). Run it both ways before shipping a topics change.
