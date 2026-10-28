# The office — a 3D floor for the trading agent world

**Status:** Built on `feat/agent-world` (2026-10-27), local commits, not pushed. It draws whatever the
trading agent world stores, so it runs wherever `/agent-world` does
(`docs/specs/2026-10-27-trading-agent-world.md`).

## Why

The owner asked for every agent of the team as a worker in a 3D office they can walk around and
click to learn about each one, on a tab of its own, separate from the site but reachable from it,
with animations for working and done and the thing each one is on, lively and fun but professional,
keeping track of the stats.

## What it is

- **The page**: `/agent-world/office`, in the route group `app/(office)/agent-world/office` — no rail,
  no header, no chat, no theme backdrop. "Open the office" in the floor's title opens it in a new
  tab; its own top bar links back. Every signed-in reader watches; an owner also runs a session,
  previews one, and approves or declines from inside it.
- **Fourteen workers** in the order a run reaches them: the Head trader at the front desk, the four
  analysts in the bullpen, the bull and bear researchers and their manager at the round table, the
  trader, the three risk analysts on one bench, the portfolio manager in the corner office, the
  Execution desk at the front. Each has a status (Idle, Waiting, Fetching, Busy, Talking, Filed,
  Done, Did not finish), a task line ("Reading AAPL's technical indicators through OpenBB.",
  "Arguing the bear case, round 1.", "Rated AAPL Buy."), a lamp, a prop and a nameplate.
- **What moves**, each a stored event: a data fetch is a paper plane to the provider's shelf and
  back, and a shelf that refused wears its code ("429") while the plane goes on to the next one; a
  filed report is carried by the courier robot to the seats that read it next; a debate or risk
  turn is a speech bubble with the turn's first sentence, labelled model text; a rating is a card
  pinned to the corkboard; the Execution desk's lamp breathes while the session waits for the owner,
  the stamp comes down on Approve (with confetti) or Decline, and the tickets go down the chute to
  the exchange, a refused one back to the Returned tray with its reason. Idle seats sip, swivel and
  stretch; a busy one types.
- **The clock it keeps**: the sky, the city's lights, the wall clock and the exchange's lamp follow
  New York's own time and the market's hours, never the session's. A finished session plays back
  over 60 seconds when the office opens on it (not with motion reduced).
- **The stats**: the wall (the session's status, elapsed time, symbols and ratings, model calls,
  data fetches, tokens, model cost, refusals, sessions and cost to date, the account beside SPY over
  the same days, never ranked), the ticker of the newest twelve events with their ET times, and each
  seat's file: what it is doing now, this session's calls, tokens, cost, fetches by provider, time
  busy and its latest text under the caveat, its career over the last forty finished sessions, its
  Paperclip budget this month when the company is configured, and the terms it uses.
- **Getting around**: presets 0–7 (the floor, the front desk, the bullpen, the table, the trader,
  the risk desk, the corner office, the Execution desk), Follow the run (the camera glides to the
  newest seat, paused by a drag), zoom, the floor plan (`?engine=2d`, also drawn without WebGL), the
  keys (`[`/`]` walk the seats, R replays, F follows, Esc clears).

## Rules kept

- Nothing is invented: `lib/agent-world/office.officeState` is pure, reads only the live view and the
  clock, and the same input gives the same office — a replay scrubbed to any point twice, forwards or
  back, gives equal states (tested). A live window opens when the browser first saw the event, so a
  3-second poll never hides a bubble that was over before it arrived.
- Words are HTML from `lib/learn/copy/agent-world-office.ts`, held to the no-advice list at the copy
  tier; ratings stay data labels in the neutral `RatingBadge`; nothing ranks a seat; the legend is
  mechanism only, every figure from the constants.
- Colours are the `--office-*` tokens (invariant 5); `.ao-*` motion classes sit in both reduced-motion
  guards and stop by name in brutalist. With motion reduced nothing loops, flies or walks; statuses,
  bubbles, tags, cards and the stamp still appear at their end states.
- The scene draws on demand and sleeps when nothing moves; it only reads the state it is handed
  (components reach no store, client or env — the feature's guard test).
- Reads are bounded: the career is the last forty finished sessions, projected, memoised for the
  ET day on the newest; Paperclip's budgets are one best-effort call.

## Surfaces

`/agent-world/office` (its own tab) and the "Open the office" link in `/agent-world`'s title. Not in
the nav registry, on Home, the dashboard or the chat.

## Verification

What ran on 2026-10-27, on `feat/agent-world`:

- Unit: `npm run check` — lint and typecheck clean; the office's state (statuses, task lines,
  bubbles, flows, shelves, desks, focus, wall, ticker, live windows, replay idempotence, career), its
  layout (seats apart and on the floor, every anchor and path, presets above the floor, the sky's
  mix), keys, legend and copy, the motion guards.
- Build: `npm run build:check` lists `/agent-world/office`.
- By eye in the QA harness (`npm run qa -- --up`, the stand-in service in slow mode): the overview
  fits the whole floor at 1440 × 900 at dusk and at night; a live session watched seat by seat — the
  planes, the 429 and 503 tags, the bubbles at the table and the risk desk, the robot, the follow
  camera; the session waiting for the owner, approved from the Execution desk's file, the stamp, the
  ticket returned for want of a live price; the replay; a 390 px phone.

## Not built

- Sound cues, the robot's coffee for the seat busy longest, a plant that grows a leaf a session, a
  budget rack.
- Decisions inside Paperclip's own UI, a chat tool, Home or dashboard surfaces, a filing-cabinet
  archive of past sessions, orbiting by touch (a phone uses the presets and zoom).
- A second "Open the office" link in the floor's empty state: the one in the title is always there.
