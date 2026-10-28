# agent-world

The Python half of AeroTrade's **Trading agent world** (the Brain section's `/agent-world` tab).
A weekly Inngest job in AeroTrade sends this service a signed request to run
[TradingAgents](https://github.com/TauricResearch/TradingAgents) v0.7.1 — a LangGraph pipeline of
twelve LLM roles (four analysts, a bull/bear debate, a research manager, a trader, three risk
analysts and a portfolio manager) — over a few symbols. [OpenBB](https://github.com/OpenBB-finance/OpenBB)
is its data vendor. The service streams signed, ordered events back to AeroTrade's webhook so the
page can show the run live, and reports costs and decisions to a self-hosted
[Paperclip](https://github.com/paperclipai/paperclip) control plane, best effort.

The TypeScript half lives in `lib/agent-world/` (the event schemas in `lib/agent-world/events.ts`,
the signing in `lib/agent-world/signing.ts`); the two share one HMAC test vector.

## Run it locally

Python 3.13 through [uv](https://docs.astral.sh/uv/) (the system Python is too old):

```sh
cd services/agent-world
uv venv --python 3.13
uv pip install -e '.[test]'
uv run python -c "import openbb; openbb.build()"   # once, after the OpenBB extensions are installed
cp .env.example .env                                  # then fill in AGENT_WORLD_SECRET and a model key
uv run uvicorn agent_world.app:app --port 8789
curl -s localhost:8789/health
```

The service's `.env` must sit **here, in `services/agent-world/`**. TradingAgents loads a `.env`
when it is imported by walking up from the working directory; the service imports it with that
walk confined to this directory (`agent_world/bootstrap.py`), and its own `.env` here shadows any
parent one, so AeroTrade's root `.env` is never read.

Tests: `uv run pytest` (no network, no model). `uv run pytest -m integration` adds
`tests/test_graph_fake_llm.py`, which runs one symbol through TradingAgents' real graph with a
scripted chat model (still no network, no key). `uv run python scripts/smoke_vendors.py AAPL`
calls every OpenBB vendor function against live public data.

Local data — TradingAgents' results, cache and memory log, OpenBB's settings and caches, the
yfinance cache, undelivered events — goes under `.data/` (`/data` in Docker).

### OpenBB packaging

`from openbb import obb` and `openbb.build()` come from **`openbb-core`** itself (it ships the
`openbb` module). The `openbb` 5.0.0 distribution is a code-less bundle that pulls in ~25 extra
extensions (the CLI, charting, TMX, CBOE, IMF…), so it is not installed: the service depends on
`openbb-core` plus `openbb-equity`, `-news`, `-economy`, `-technical`, `-yfinance`, `-sec` and
`-fred`. `openbb-yfinance` 2.0.0 itself still requires `openbb-charting`, `pywry` and `fastmcp`, so
those come along (all pure-Python wheels). `openbb-technical` imports under pandas 3 here; if it
ever does not, `/health` reports its version as `null` — indicators never use it (they are
computed with stockstats, TradingAgents' own maths).

## Environment

Every variable is in `.env.example` with a one-line comment.

| Variable | Default | What it does |
|---|---|---|
| `PORT` | 8789 | Port the Dockerfile serves on. |
| `AGENT_WORLD_SECRET` | — (required) | HMAC secret shared with AeroTrade, both directions. |
| `AEROTRADE_URL` | — (required) | AeroTrade's URL: the only origin events and the relay may go to. |
| `PAPERCLIP_HEARTBEAT_SECRET` | unset | Value of `X-Agent-World-Heartbeat` Paperclip sends; unset disables the route. |
| `PAPERCLIP_URL`, `PAPERCLIP_API_KEY`, `PAPERCLIP_COMPANY_ID` | unset | Paperclip and the Head trader's key; all three or Paperclip is off. |
| `PAPERCLIP_ROLE_KEYS` | `{}` | JSON `{roleId: key}`: each role's own key for its cost events. |
| `AGENT_WORLD_LLM_PROVIDER` | `google` | `google` or `anthropic`. |
| `AGENT_WORLD_QUICK_MODEL` / `AGENT_WORLD_DEEP_MODEL` | `gemini-2.5-flash-lite` / `gemini-2.5-flash` | The two tiers (deep: research and portfolio managers). |
| `GOOGLE_API_KEY` / `ANTHROPIC_API_KEY` | unset | The provider's key (the paid Gemini key). |
| `AGENT_WORLD_MAX_DEBATE_ROUNDS` / `_RISK_ROUNDS` / `_TOOL_ROUNDS` | 1 / 1 / 8 | Rounds per debate, risk desk and analyst tool use. |
| `AGENT_WORLD_RUN_TIMEOUT_S` | 600 | Watchdog per symbol. |
| `AGENT_WORLD_PRICES` | unset | JSON price overrides, USD per 1M tokens. |
| `AGENT_WORLD_DATA_VENDORS` | unset | JSON chain overrides per category. |
| `FRED_API_KEY` | unset | FRED key for the macro tool; without it macro data is skipped. |
| `SEC_EDGAR_USER_AGENT` | unset | Name and email SEC EDGAR asks every client for. |
| `AGENT_WORLD_DATA_DIR` | `./.data` | All local data (`/data` in Docker). |
| `TRADINGAGENTS_RESULTS_DIR` / `_CACHE_DIR` / `_MEMORY_LOG_PATH` | under the data dir | Optional overrides of TradingAgents' three paths. |

## How a run flows

1. AeroTrade's job POSTs `/runs`, signed (`X-Agent-World-Timestamp`, `X-Agent-World-Signature` =
   hex HMAC-SHA256 of `"{timestamp}.{body}"`, ±300 s). A bad signature is 401, a bad body or a
   `callbackUrl` off `AEROTRADE_URL`'s origin 400, a known `sessionId` 200, a busy worker 409
   `{"error":"busy","sessionId":<current>}`, else 202 `{"sessionId", "status":"queued"}`.
2. The single worker thread takes the session. If Paperclip is configured, `GET /api/agents/me`
   (the Head trader): paused, or spent ≥ budget, ends the session with
   `session.failed{outcome:"budget"}` before any model call; unreachable is a `limit` note and the
   run goes on. With an issue and not a dry run, the Head trader asks Paperclip for a heartbeat run
   on it (`POST /api/agents/<self>/heartbeat/invoke {reason: "execution_agent_world_session",
   payload: {issueId}}`): Paperclip refuses an agent's comment or issue update unless
   `X-Paperclip-Run-Id` names one of its own runs on an issue, and the `execution_` prefix keeps it
   from checking the backlog issue out to that short run. Every comment, `done` and `blocked` below
   names that run; there is no checkout.
3. `session.started`, then per symbol: a fresh `TradingAgentsGraph` with the stats handler wired
   into both LLM clients and the run config; `create_run_state` with the book as a
   `PortfolioContext`; TradingAgents' `stream_run` loop replicated with the subgraph namespace kept
   (so an analyst's messages are attributed to it); each step folded by `StageMachine` into events;
   `run_rating` on the merged state (the Portfolio Manager's step sets `final_rating`; the
   decision's own rating line is the fallback; `REVIEW` when neither reads); `record_decision`
   (TradingAgents' state log and memory log); `run.completed`. A run past
   `AGENT_WORLD_RUN_TIMEOUT_S` is `run.failed{reason:"timeout"}` and the session moves on. A model
   refusal (quota, rate, auth, overloaded) is fatal: `limit{fatal:true}`, `run.failed{limit}`,
   `session.failed{outcome:"limit"}`.
4. After each symbol: one Paperclip cost event per role and model, each with the role's own key
   and agent id and no run (idempotency key `<session>:<symbol>:<role>:<n>`, even on a dry run),
   and the decision as an issue comment (≤ 2,000 characters).
5. `session.completed` (or `session.failed` when no symbol completed), then Paperclip `done`
   (or `blocked`, naming the Head trader as the one to unblock it, when stopped) unless it was a
   dry run or there is no issue. Under owner approval `done` hands the issue to the Execution
   desk's approval stage (`in_review`); without one it closes the issue.

Events go out through `EventEmitter`: batches of ≤ 100 events and ≤ 256 KiB, in order, one in
flight, `{"sessionId", "events"}` serialized once and signed like the request. `seq` is given as an
event joins a batch, so the stream is 1, 2, 3… without holes. 2xx is delivered; 400/401/404/413
drop the batch (counted as rejected); anything else retries in place (0.5 s · 2ⁿ, at most 30 s).
The queue holds 2,000; under back-pressure only `cost.tick`, `debate.turn`, `risk.turn` and
`tool.*` are dropped (counted, reported in `session.completed.dropped`). Cost ticks for one
(symbol, role, model) within 2 s are merged. On close, whatever could not be delivered in 60 s is
written to `<data dir>/undelivered/<sessionId>.json`.

## Endpoints

| Route | |
|---|---|
| `GET /health` | Versions, providers importable, keys present (booleans only), the vendor chain per data tool, models, worker state, Paperclip configured/reachable. Never a secret. |
| `POST /runs` | Signed. Body: `sessionId` (`^[A-Za-z0-9-]{1,80}$`), `symbols` (1–10, `^[A-Z][A-Z0-9.-]{0,9}$`), `tradeDate`, `portfolio {cash, currency, positions[{ticker, quantity, averagePrice}]}`, `callbackUrl`, `paperclip {issueId, runId, agentIds} \| null`, `approval` (`owner`/`auto`), `dryRun`. |
| `GET /runs/{id}` | The status of one of the last 50 sessions, or 404. |
| `POST /paperclip/heartbeat` | Paperclip's http adapter (the Head trader's address). Needs `X-Agent-World-Heartbeat`; reads a body up to 2 MiB (a wake carries its issue as markdown). Only a run of the "Weekly session" routine — `context.source: "routine.dispatch"`, `wakeReason: "issue_assigned"` — is relayed: a signed `POST {AEROTRADE_URL}/api/agent-world/sessions` `{source:"paperclip", paperclipRunId, taskId, wakeReason, agentId}` (5 s), then the routine's issue is closed under the wake's own run while the wake is still unanswered (left open, Paperclip parks it in `blocked` and skips the routine's next run), with a comment saying whether AeroTrade took it; the session records itself on an issue of its own. Answers 200 `{"forwarded": bool, "closed": bool \| null}`. Every other wake (the service's own runs, an issue handed back, Paperclip's repair wakes) is 200 `{"forwarded": false, "ignored": true}`. |

## The event contract

JSON, camelCase. Every event has `seq` (≥ 1, per session), `at` (ISO UTC), `type` and
`sessionId`. Texts are cut to their limits, never refused. `lib/agent-world/events.ts` is the
TypeScript reader; `scripts/qa/fixtures/agent-world-events.json` (written by
`scripts/export_fixture.py`) is a whole two-symbol session in this shape.

| type | fields |
|---|---|
| `session.started` | `symbols[]`, `tradeDate`, `approval`, `dryRun`, `models {provider, quick, deep}` |
| `run.started` | `symbol`, `index` (0-based), `total` |
| `role.started` / `role.done` | `symbol`, `role` |
| `tool.called` | `symbol`, `role`, `name`, `args` (≤ 400), `callId` |
| `tool.result` | `symbol`, `role`, `callId`, `name`, `status` (`ok`/`unavailable`/`no-data`), `chars`, `vendor`, `ms`, `attempts[{vendor, ok, error}]` (≤ 6) |
| `role.report` | `symbol`, `role`, `text` (≤ 12,000), `forced` (written after the last tool round) |
| `debate.turn` | `symbol`, `side` (`bull`/`bear`), `round`, `text` (≤ 6,000) |
| `risk.turn` | `symbol`, `role` (`risk-aggressive`/`-conservative`/`-neutral`), `round`, `text` (≤ 6,000) |
| `cost.tick` | `symbol`, `role` (a role id, `memory` or `other`), `model`, `inputTokens`, `outputTokens`, `costCents`, `llmCalls`, `pricing` (`known`/`unknown`) |
| `memory.note` | `symbol`, `text` (≤ 2,000) |
| `limit` | `symbol` or null, `provider` (`gemini`, `anthropic`, `openbb-yfinance`, `sec`, `fred`, `paperclip`), `status`, `message` (≤ 300), `fatal` |
| `run.completed` | `symbol`, `rating` (`Buy`/`Overweight`/`Hold`/`Underweight`/`Sell`/`REVIEW`), `review`, `decision` (≤ 8,000), `stats {llmCalls, toolCalls, tokensIn, tokensOut, costCents}` |
| `run.failed` | `symbol`, `reason` (`timeout`/`error`/`limit`), `message` (≤ 300) |
| `session.completed` | `runs[{symbol, rating, review}]`, `tokensIn`, `tokensOut`, `costCents`, `llmCalls`, `toolCalls`, `dropped` |
| `session.failed` | `outcome` (`error`/`limit`/`budget`/`timeout`), `message` (≤ 300) |

The roles, in run order: `market, sentiment, news, fundamentals, bull, bear, research-manager,
trader, risk-aggressive, risk-conservative, risk-neutral, portfolio-manager`
(`agent_world/roles.py`, with each role's TradingAgents node and state key).

## Data: the chain and the point-in-time rules

`agent_world/vendors/__init__.py` registers OpenBB into TradingAgents' `VENDOR_METHODS` and passes
this chain as `config["data_vendors"]`; each tool walks its category's vendors in order, using only
those that serve it, and moves on when one raises TradingAgents' own errors:

| Category | Chain | Notes |
|---|---|---|
| `core_stock_apis` | openbb, yfinance | |
| `technical_indicators` | openbb, yfinance | OpenBB bars, stockstats maths |
| `fundamental_data` | openbb, sec_edgar, yfinance | SEC serves the statements only |
| `news_data` | openbb, yfinance | `get_global_news` stays on yfinance (OpenBB's yfinance has no world news) |
| `macro_data` | fred, openbb | TradingAgents' FRED pins the vintage; OpenBB's cannot |
| `prediction_markets` | polymarket | TradingAgents' default |

The OpenBB vendor functions (`agent_world/vendors/openbb_vendor.py`; pure formatting in
`vendors/shaping.py`), each with a 20 s budget, returning TradingAgents' own text formats:

| Function | OpenBB route | As of the run date |
|---|---|---|
| `get_stock_data(symbol, start, end)` | `equity.price.historical` (yfinance, split- and dividend-adjusted) | The tool clamps `end` to the run date; a latest bar more than 10 days before it is stale. |
| `get_indicators(symbol, indicator, curr_date, look_back_days)` | five years of the same bars, then stockstats | Bars after `curr_date` are cut; the 13 indicator names TradingAgents supports. |
| `get_fundamentals(ticker, as_of)` | `equity.fundamental.metrics` + `equity.profile` | Served only for a run dated today; a past date gets TradingAgents' own withhold notice (the profile has no history). |
| `get_balance_sheet` / `get_cashflow` / `get_income_statement(ticker, freq, as_of)` | `equity.fundamental.balance` / `cash` / `income` | A period counts as public 45 days after it ends (quarterly) or 90 (annual); later periods are cut. |
| `get_news(ticker, start, end)` | `news.company` (yfinance) | Articles outside `[start, end + 1 day)` are dropped; an empty feed is "unavailable", not "no news". |
| `get_insider_transactions(ticker, as_of)` | `equity.ownership.insider_trading` (SEC) | Form 4 filings cut on `filing_date ≤ as_of` (last 60 days). |
| `get_macro_indicators(indicator, as_of, look_back_days)` | `economy.fred_series` | Today only (OpenBB serves the latest revision); FRED's own vendor runs first. |

A 429 or rate-limit answer becomes `VendorUnavailableError` and a `limit` note
(`openbb-yfinance`, `sec` or `fred`); every vendor call is recorded (`vendors/recorder.py`) so a
`tool.result` names the vendor that served it and what was tried first.

TradingAgents compares the run date with the process's local date (the profile and FRED rules
above): the job runs at 08:30 ET, the same calendar day in UTC, so the container's UTC clock agrees.

## Costs

`agent_world/pricing.py` holds `PRICES`, USD per million input/output tokens, matched on the
model id's longest prefix. **Written 2026-10-27 from list prices as last known and not checked
against the providers' pricing pages** — check every row (and override with `AGENT_WORLD_PRICES`)
before trusting a figure. Gemini 3.x rows are absent: such a model prices as `unknown` (0 cents)
until named. Paperclip's budget stop is the real cap.

Note: TradingAgents v0.7.1's own Google client calls the Gemini 2.5 line "now retired" and its
model catalog lists only Gemini 3.x; if `gemini-2.5-*` is refused, set `AGENT_WORLD_QUICK_MODEL` /
`AGENT_WORLD_DEEP_MODEL` to a current pair and add their prices.

## Paperclip

Point the Head trader's http-adapter agent at the service:

- URL: `http://<service>:8789/paperclip/heartbeat` (in Paperclip's
  `PAPERCLIP_HTTP_ADAPTER_PRIVATE_ENDPOINT_ALLOWLIST` when private)
- headers: `{"X-Agent-World-Heartbeat": "<PAPERCLIP_HEARTBEAT_SECRET>"}`, `timeoutMs` 20000 (the relay
  forwards to AeroTrade and closes the routine's issue inside one wake, up to 5 s each)

`node scripts/agent-world-setup.mjs` (in AeroTrade) makes all of this: the company, the fourteen
agents with their budgets, one key each, and the "Weekly session" routine with an `api` trigger.
A routine run wakes the Head trader; the service relays the wake to AeroTrade, whose job opens the
session (AeroTrade decides; the service never starts a session on its own), and closes the
routine's own issue. Cost events need each role agent's own key (`PAPERCLIP_ROLE_KEYS`), since
Paperclip refuses an `agentId` other than the key's own; a role without one is filed under the Head
trader with `billingCode: "role:<id>"`.

What a running Paperclip v2026.1023.0 showed on 2026-10-27, and `agent_world/paperclip.py` follows:
every comment or issue update by an agent key needs `X-Paperclip-Run-Id` naming one of that agent's
own runs on an issue (403 without); a checkout strands the issue once its short run ends, so there
is none; cost events need no run. Every http wake leaves an unpriced zero-cost event, which under
Paperclip's default budget policy pauses the agent and the whole company: the setup script sets
`unpricedUsagePolicy: "allow"` on every budget. Every agent key can read every agent's adapter
headers, the heartbeat secret included, so it starts sessions only within AeroTrade's own limit of
six an hour.

## Deploying

The image (`Dockerfile`): `python:3.13-slim`, a builder stage with git for the TradingAgents tag,
`uv sync --frozen` from `uv.lock`, `openbb.build()` after the extensions, a non-root user, a
`/data` volume, `uvicorn agent_world.app:app --host 0.0.0.0 --port 8789`.

- **Railway**: a service from this directory's Dockerfile, a volume mounted at `/data`, the
  variables above, and `PORT=8789` so Railway's proxy targets the port the image listens on. Give
  AeroTrade the private or public URL as `AGENT_WORLD_SERVICE_URL`. Paperclip runs beside it from
  its tagged repo (`authenticated` + `public` behind HTTPS) with Postgres.
- **Fly.io**: `fly launch --dockerfile Dockerfile --no-deploy`, `internal_port = 8789`, a volume
  mounted at `/data`, secrets with `fly secrets set`, one machine (the worker holds state in
  memory; do not scale out).

### Containers

`docker-compose.yml` runs the service, Paperclip built from
`https://github.com/paperclipai/paperclip.git#v2026.1023.0` (its root `Dockerfile`, `production`
stage) in `local_trusted` mode with `PAPERCLIP_HTTP_ADAPTER_PRIVATE_ENDPOINT_ALLOWLIST=http://agent-world:8789,http://host.docker.internal:3000`,
and `postgres:17-alpine`. **Neither the Dockerfile nor the compose file has been run** (Docker was
not installed where they were written). Inside Docker the service reaches the host's AeroTrade as
`http://host.docker.internal:3000`, so AeroTrade must send callback URLs on that origin.

## Limitations

- One session at a time; a second request while one runs is 409.
- A symbol past its timeout is reported and skipped, but Python cannot stop its thread: it runs
  until its current model or tool call returns, and the worker stays busy until it does.
- The worker's registry (the last 50 sessions) lives in memory; a restart forgets it (AeroTrade
  keeps the record).
- Sentiment feeds (StockTwits, Reddit) and Yahoo news serve recent items only, so a past-dated
  run's sentiment is not point-in-time (TradingAgents says the same).
- OpenBB's Yahoo company-news feed currently answers empty; news falls through to TradingAgents'
  own Yahoo vendor, which searches instead.
