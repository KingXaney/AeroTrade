---
paths:
  - "lib/broker/**"
  - "components/broker/**"
  - "lib/actions/broker.actions.ts"
  - "lib/jobs/functions/broker.ts"
  - "components/settings/BrokerSettings.tsx"
  - "lib/learn/copy/broker.ts"
  - "database/models/broker-link.model.ts"
  - "scripts/qa/qa-broker.mjs"
---

# broker

Contracts of this feature that a map cannot show: a part of `AGENTS.md`, kept in a file of its
own so it loads only beside the files its `paths:` name. A `### name` in the text is that
feature's file in this folder; Shared, owner and the numbered invariants are in `AGENTS.md`;
the map is `docs/MAP.md`.

- The Alpaca link (`docs/specs/2026-10-24-alpaca-broker-link.md`): the owner mirrors ONE of their
  paper accounts — the AI Navigator's, a culture picker's, any — into ONE Alpaca account, by
  weight, so a strategy carries over to an account of any size. `lib/broker/config` (import-free)
  reads the environment: `ALPACA_API_KEY_ID`/`ALPACA_API_SECRET_KEY` on the server only, paper
  unless BOTH `ALPACA_MODE=live` and `ALPACA_LIVE_ENABLED=yes` (one alone is `live-locked`: nothing
  is sent), `ALPACA_BASE_URL` read in paper mode only (the QA stand-in); the owner is
  `BROKER_OWNER_EMAILS`, else `LAB_OWNER_EMAILS` (`isBrokerOwner`).
- `lib/broker/alpaca` is the one client (v2; zod over Alpaca's string figures; every call an
  answer, never a throw; a rate, auth or outage refusal filed as `alpaca` with the limits
  tracker, a 403 for buying power not). `lib/broker/plan` (pure) is the mirror: `targetWeights`
  of the source, `planMirror` — an exit sold whole, a difference under `MIRROR_MIN_ORDER_DOLLARS`
  or `MIRROR_DRIFT_BAND` of equity left alone, sells first, buys scaled to the cash the sells free
  less `MIRROR_CASH_BUFFER`, dollars where Alpaca says fractionable, whole shares elsewhere, an
  untradable symbol skipped and said, at most `MIRROR_MAX_ORDERS` — and `clientOrderId` (the
  link, the day, the side, the symbol: a retry the same day cannot double an order).
- `lib/broker/sync.syncBrokerLink` is one sync: orders only while Alpaca's clock says open and the
  account may trade, a preview otherwise, `skipped` with its reason when nothing can run; never
  throws. Its line is `BROKER_COPY.summary`. The link (`database/models/broker-link.model.ts`,
  `lib/broker/store`) keeps its last `MIRROR_SYNCS_KEPT` syncs, newest first.
- Runs: the `broker-sync` job, weekdays 11:15 ET (after the Navigator's and the pickers' Monday
  runs; trigger `broker`), and Settings › Broker's Sync now (`lib/actions/broker.actions`, owner
  gate, `broker:<uid>` counter; the page's `maxDuration` 60 covers the action). The section
  (`components/settings/BrokerSettings`, `components/broker/BrokerControls`, read by
  `lib/broker/page-store.getBrokerView`, shaped by the pure `lib/broker/view`) shows the
  connection with the account number's last four only, the link, the two accounts' weights side
  by side, the syncs and Alpaca's own recent orders; it exists only for the owner. Every
  sentence is `lib/learn/copy/broker`. QA: `npm run qa -- broker` against
  `scripts/qa/start-alpaca-stub.mjs`.
