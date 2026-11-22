---
paths:
  - "lib/agent-world/**"
  - "components/agent-world/**"
  - "app/(root)/agent-world/**"
  - "app/(office)/**"
  - "app/api/agent-world/**"
  - "lib/actions/agent-world.actions.ts"
  - "lib/jobs/functions/agent-world.ts"
  - "lib/learn/copy/agent-world*.ts"
  - "database/models/agent-world-*.model.ts"
  - "services/**"
  - "scripts/agent-world-setup.mjs"
  - "scripts/qa/qa-agent-*.mjs"
---

# agent world

Contracts of this feature that a map cannot show: a part of `AGENTS.md`, kept in a file of its
own so it loads only beside the files its `paths:` name. A `### name` in the text is that
feature's file in this folder; Shared, owner and the numbered invariants are in `AGENTS.md`;
the map is `docs/MAP.md`.

- The trading agent world (`/agent-world`, the Brain section's third page; `docs/specs/2026-10-27-trading-agent-world.md`)
  joins three outside projects: TradingAgents (a LangGraph desk of twelve model roles) and OpenBB
  (its data vendor) run in a separate Python service, `services/agent-world`, never in this app;
  Paperclip is the company around the desk. Mongo is this app's truth; Paperclip is told
  everything best effort (`lib/agent-world/company`) and never stops a session. Everything is read
  through `lib/agent-world/env` (the only reader of the feature's secrets; never `NEXT_PUBLIC`), and
  `agentWorldOff` (`disabled`, `unconfigured`, `no-approver`) is what the page and the job say when
  nothing may run.
- One session at a time per deployment (`lib/agent-world/store.openSession` refuses while one is
  queued, running, awaiting a decision or approved), every row and index carrying `env` and the
  desk's paper account named per deployment (`agentWorldAccountName`), since a preview shares
  production's database. A weekly session's id is its week (`aw-<Monday>`), so the unique
  `{env, sessionId}` index is the week's claim; a manual session or a preview is a second session
  of the week, named by the second it was asked for (`lib/agent-world/job.agentWorldDay`).
- The job, `lib/jobs/functions/agent-world.runAgentWorldWeekly` (Mondays 08:30 ET, a Tuesday cron for a
  holiday Monday): open the session, load the book, open the Paperclip issue, a signed POST /runs
  (the service answers at once and works in the background — Vercel caps a request at 60 s), then
  wait in `SESSION_WAIT_ROUNDS` rounds of `step.waitForEvent` (`AGENT_WORLD_EVENTS.finished`, matched
  with an `if` on the session id, since a cron's own event carries none) with a Mongo read between
  them, so a lost wake-up costs one round. Then the ratings become orders by code
  (`lib/agent-world/orders`: `RATING_TARGET_WEIGHTS`, capped and scaled under `AGENT_WORLD_RAILS`,
  sized by the Navigator's `diffToOrders`; a rating the model wrote never names a quantity), the
  owner decides (`AGENT_WORLD_EVENTS.decided`, timing out at `lapseDeadline`, Mongo read whatever
  woke it) or `auto` approves, and fills go through `executeOrder` during the session
  (`step.sleepUntil` the open; a manual run fills at once) with `source: 'agent-world'` and the key
  `agent-world:<session>:<side>:<symbol>`. Every exit is a sentence on the job's stamp
  (`describeRun`), a failure included.
- The service's events (`app/api/agent-world/events/route.ts`): signed both ways with one secret
  (`lib/agent-world/signing`, HMAC-SHA256 over `timestamp.body`, a five-minute window; the service's
  test holds the same vector), capped at `EVENT_BODY_BYTES`, read with zod and cut to `CLAMPS`
  (`lib/agent-world/events`). A batch is applied as one guarded update per run-level event to its
  run's document (`runUpdateFor`, filtered on the run's seq below the event's) and one
  compare-and-set of the session's head on its seq (`foldHead`), so a retried batch changes nothing;
  every head write moves `version`, the live poll's "nothing new" test. A refusal the service met
  (`limit`) is filed on the limits tracker under the job; `finished` wakes the job after the write.
- The floor (`components/agent-world/LiveFloor`) polls `GET /api/agent-world/live` through the pure
  `lib/agent-world/live` (3 s while a session holds the desk, 30 s otherwise, nothing while the tab
  is hidden), naming the session, version and seq it holds, so an answer is `unchanged` from one
  head read or carries only the runs that moved. A finished session plays back from its stored times
  (`lib/agent-world/replay`; none with motion reduced). The stage strip's working dot is
  `.aw-working`, in both motion guards and stopped by name in brutalist. The ratings' words are data
  labels (`RATING_LABELS`, `ORDER_SIDE_LABELS` in `lib/agent-world/config`), drawn in neutral badges
  and table cells, never opening a sentence; every model text goes through `SafeMarkdown` under the
  caveat. Components reach no store, no Paperclip client, no env reader
  (`lib/agent-world/__tests__/guard.test.ts`); the glossary arrives as slots from the page.
- Paperclip (`lib/agent-world/paperclip`, `lib/agent-world/paperclip-view`, every call with a
  timeout, `PaperclipResult`, never a throw): one agent per role plus the Head trader (the issue's
  assignee; its address is the service) and the Execution desk (the approval stage's participant;
  its address is `app/api/agent-world/paperclip/heartbeat/route.ts`, which only logs). The owner's
  decision is Mongo's first (`lib/actions/agent-world.actions`), then the job is woken, then the issue
  is told as the Execution desk's (`mirrorDecision`; whether it landed is on the session). A
  routine fired in Paperclip reaches the service, which relays it signed to
  `app/api/agent-world/sessions/route.ts` (a manual session, a few an hour at most) and closes the
  routine's own issue; the session keeps an issue of its own.
  `scripts/agent-world-setup.mjs` creates the company, its agents, keys and routine idempotently.
- What a running Paperclip v2026.1023.0 showed (2026-10-27), which both sides follow: an agent key's
  comment or issue update needs `X-Paperclip-Run-Id` naming one of that agent's own runs on an issue
  (`paperclip.runFor` finds the desk's; the service invokes the Head trader on the session's issue
  with a reason beginning `execution_`); nothing is checked out (a checkout strands the issue once its
  short run ends); the session's issue opens in backlog with `allowDuplicate` and the session id as
  its idempotency key (in todo Paperclip wakes and checks it out at once; by title it dedupes); cost
  events need no run; `blocked` names its unblocker; the roles are `general`, `researcher`, `qa` and
  `pm` (`manager` is refused); an issue's board page sits under its identifier's prefix
  (`paperclip-view.issueBoardUrl`). Every http wake leaves an unpriced cost event, which pauses the
  company under Paperclip's default policy, so the setup script allows unpriced usage. Under automatic
  approval the desk has no run of its own, so its comments land only once it has had one.
- The office (`/agent-world/office`, `docs/specs/2026-10-27-agent-office.md`) is the same session as a
  3D floor on a page of its own: the route group `app/(office)/agent-world/office` has none of the app's shell,
  and the floor's title links to it in a new tab. `lib/agent-world/office.officeState` (pure) reads the live view into fourteen workers
  (`WORKER_IDS`: the Head trader, the twelve roles in the run's order, the Execution desk), each with
  a status (`WORKER_STATUSES`; "Busy" for working, the legend's mechanism-only rule), a task line, a
  bubble and this session's figures, plus the flows in flight, the shelves, the tickets, the issue,
  the approval lamp, the focus, the wall and the ticker. A window (`OFFICE_WINDOWS`) opens when the
  browser first saw the event while live (`seenAfter`, at the arriving view's own `serverNow`) and on
  the stored stamp in a replay (`OFFICE_REPLAY_MS`, the windows scaled by `replayWindowScale`), so a
  replay scrubbed to any point twice gives the same office. `lib/agent-world/office-store.getOfficeView`
  adds the career (`careerStats` over the last 40 finished sessions, projected, memoised per ET day on
  the newest) and Paperclip's budgets (best effort).
- The scene (`components/agent-world/office/office-scene`, three.js loaded on demand, its set built by
  `components/agent-world/office/office-build`; seats, furniture, paths, camera presets, idle gestures
  and the sky's mix by the New York clock are the pure `lib/agent-world/office-layout`) takes only
  `OfficeState` and diffs it, drawing on demand. Everything a reader acts on is HTML placed over the
  canvas: each seat's plate is a button, stacked in screen space on a stem in the seat's colour when
  neighbours crowd; a bubble slides aside or climbs rather than cover another; the shelves', issue's,
  corkboard's, lamp's and chute's chips. The roster (`components/agent-world/office/OfficeSidebar`)
  is every seat as a button in the run's order whatever the camera shows; a seat's file
  (`components/agent-world/office/OfficeDossier`, a sheet that leaves the floor live) is the
  Execution desk's `DecisionPanel` too, so an owner decides from the office; `?engine=2d` or no WebGL
  draws `components/agent-world/office/OfficeMap2D`. Colours are the `--office-*` tokens in
  `app/globals.css`; the `.ao-*` motion classes are in both guards and stopped by name in brutalist.
  Keys: `lib/agent-world/office-keys`; sound, off until turned on and kept in this browser, is the
  pure recipes of `lib/agent-world/office-sounds` (cued by the ticker's new event keys) played by
  `components/agent-world/office/office-sound`. Its sentences are `lib/learn/copy/agent-world-office`,
  its legend `lib/agent-world/office-legend`.
- Its sentences are `lib/learn/copy/agent-world` (and the issue's own, `lib/learn/copy/agent-world-paperclip`);
  its terms the glossary's `agent-world` group, homed on `/agent-world`; the legend
  `lib/agent-world/legend` (every figure from config). QA: `npm run qa -- agent-world` (and
  `agent-office` for the office), against
  `scripts/qa/start-agent-world-stub.mjs` (the service's own exported events,
  `scripts/qa/fixtures/agent-world-events.json`) and `scripts/qa/start-paperclip-stub.mjs`.
