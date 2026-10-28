# Trading agent world

**Status:** Built on `feat/agent-world` (2026-10-27). Not deployed: it needs the Python service and a
Paperclip company running somewhere (below, "To run it for real").

## Why

The owner asked for a third brain, a tab called "Trading agent world", that integrates three
open-source projects and is built like the other brains: a reader learns how it works and sees it
working in real time.

- **TradingAgents** (TauricResearch/TradingAgents, Apache-2.0): a LangGraph desk of twelve model
  roles that turns a symbol and a date into a five-tier rating.
- **OpenBB** (OpenBB-finance/OpenBB, Apache-2.0): the data layer, as TradingAgents' data vendor.
- **Paperclip** (paperclipai/paperclip, MIT): a control plane that runs agents as a company, with an
  org chart, budgets, issues, approval stages and an audit trail.

None of the three ships an integration with the others; the glue is this feature.

## What it is

- **The service** (`services/agent-world`, Python, FastAPI): runs TradingAgents v0.7.1 once per
  symbol with OpenBB registered as the first link of most data chains, streams every step back to
  the app as signed, ordered events, reports each role's model cost to its Paperclip agent, and
  comments the decisions on the session's issue. One session at a time. It is never part of the
  Next.js app: Vercel caps a request at 60 seconds and runs no Python.
- **The job** (`agent-world-weekly`, Mondays 08:30 ET, a Tuesday run for a holiday Monday; or by hand):
  opens the session and its Paperclip issue, asks the service to run, waits for it in rounds with a
  Mongo read between them, turns the ratings into orders by code, waits for the owner's decision (or
  approves automatically), and fills at the open through the path every account trades on.
- **The company**: one Paperclip agent per role, plus the Head trader (the issue's assignee, whose
  address is the service) and the Execution desk (the approval stage's participant, whose hand is the
  owner's Approve on the page). Budgets pause an agent at 100% of its cap; a session that meets a
  paused agent stops.
- **The page** (`/agent-world`): the floor (the newest session live, or played back; the account
  against SPY; the sessions), the company (org chart, budgets, the session's issue, activity, cost by
  agent), the data (each tool's provider chain, the service's health, what the last session fetched,
  the job's stamp, the limits rows), and a legend of every constant.

## Rules kept

- The model never names a quantity. A rating maps to a target share by a fixed table (Buy 20%,
  Overweight 12%, Hold keeps, Underweight trims to 5% and opens nothing, Sell closes, REVIEW changes
  nothing); targets are capped at 25% a name and scaled to keep 5% in cash; the Navigator's allocator
  sizes the orders in whole shares.
- Everything the service sends is untrusted: signed (HMAC-SHA256 over `timestamp.body`, five-minute
  window, one shared secret both ways), capped at 256 KiB, read with zod and cut to clamps, stored
  under a seq guard so a retried batch changes nothing. Model text renders through SafeMarkdown under
  a caveat; the ratings' words are data labels in neutral badges, never the start of a sentence.
- Mongo is the truth; Paperclip and Inngest are told, best effort. A lost wake-up costs one round of
  waiting; Paperclip down leaves a note and nothing else.
- Every session row, index and the desk's account name carry the deployment: a preview sharing
  production's database never touches production's sessions or account.
- One session at a time; a weekly session's id is its week, which makes the week's claim; Run now is
  refused while a session holds the desk.
- Invariants 4, 5, 7, 8 and 12 as everywhere: zod over model output, tokens only, framed surfaces are
  Panels, reference prose collapsed, every sentence in `lib/learn/copy/agent-world.ts` held to the
  no-advice list, every term in the glossary's `agent-world` group.

## Surfaces

`/agent-world` (`?view=floor|company|data`), the Brain section's third tab; the job and its stamp on
the system views; four limits providers (`agent-world`, `openbb-yfinance`, `fred`, `paperclip`); the
trade log's "Agent world" source. Not on Home, the dashboard or the chat yet. Like the whole Brain
section, the owner's alone since 2026-10-28 (`LAB_OWNER_EMAILS`, AGENTS.md ### owner): anyone else
is sent Home and its live poll answers them 401.

## To run it for real

1. Run the service (`services/agent-world/README.md`): `uv` locally, or its Dockerfile on a container
   host, with the billed Gemini key as `GOOGLE_API_KEY` (one symbol is dozens of model calls; the free
   key's daily cap does not cover one).
2. Run Paperclip (Node 24.11+, `npx paperclipai`, or its Docker compose), then
   `node scripts/agent-world-setup.mjs` to create the company, its agents, keys and routine; it prints
   the env lines for the app and the service.
3. Set the app's env (`.env.example`, the trading agent world block) and the service's; then
   `npm run trigger -- agent-world-preview` and watch `/agent-world`.

## Verification

What ran on 2026-10-27, on `feat/agent-world`:

- Unit: `npm run check` — lint and typecheck clean, 3,906 tests in 337 files (signing with the
  service's shared vector, the event schemas and folds against the service's own exported stream,
  orders, the job's day, id, lapse and stamp, the live reducer, the replay, the views, the page's
  shaping, the env, the legend with every constant swapped for a sentinel, the copy, the glossary
  group, the order-reason grammar, the Paperclip client and its texts, the import guard). The
  service's `uv run pytest`: 151 passed, the TradingAgents graph driven end to end by a fake model.
- Build: `npm run build:check` compiles the page and its four routes.
- Browser: `npm run qa -- shell styles culture agent-world` — 276 checks, none failed. The
  agent world's 73: the routes' gates (unsigned, forged, stale, oversized, replayed, unknown); Run now
  watched live, the stages lighting team by team, the reports and the debate arriving, the ratings in
  neutral badges, one order sized by the table; the sessions list following the session with no
  reload; Approve, the fill refused for want of a live price and said so; the issue on the Paperclip
  stand-in closed on the Execution desk's decision naming the owner, every role's cost filed under its
  own agent, the Head trader's comments made under a run of its own with nothing checked out; a
  declined session, a preview that trades nothing and opens no issue, a refused run; the replay with
  motion and without; the company and data views, Paperclip down included; the voice; 375 px; a
  reader who is not the owner (sent Home since the Brain section became the owner's); a "Weekly session" routine run relayed through the service to a manual
  session on an issue of its own, the routine's issue closed.
- Paperclip v2026.1023.0, run locally (Node 24.22.1, `local_trusted`, embedded Postgres): the
  roles it accepts (`general`, `researcher`, `qa`, `pm`; `manager` is refused), the key's `token`,
  run ids on every agent write, issues opened in backlog, the approval stage decided by the
  Execution desk, cost events, budgets and their pause, routines and their wakes. The setup script
  created the company, its fourteen agents, their keys and the routine, and re-ran with nothing to
  create; the app's client ran the same decide, comment and status flows against the real server and
  the stand-in with the same outcomes.
- Not verified here: a real TradingAgents run against a real model (it spends the owner's key);
  whether `gemini-2.5-*` still answers (TradingAgents v0.7.1 calls the 2.5 line retired) and the
  service's price table; the Docker images (no Docker on the build machine); a hosted Paperclip in
  authenticated mode; a Paperclip version other than the pinned tag.

## Not built

- Enrolling a reader's own account with the desk; decisions taken inside Paperclip's own UI (the
  page decides; Paperclip is told); a chat tool and a dashboard widget; the desk's simulated record.
