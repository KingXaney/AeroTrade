---
paths:
  - "lib/navigator/**"
  - "components/navigator/**"
  - "lib/actions/navigator.actions.ts"
  - "lib/jobs/functions/navigator.ts"
  - "lib/learn/copy/navigator.ts"
  - "database/models/ai-navigator.model.ts"
  - "database/models/navigator-signal-week.model.ts"
---

# navigator

Contracts of this feature that a map cannot show: a part of `AGENTS.md`, kept in a file of its
own so it loads only beside the files its `paths:` name. A `### name` in the text is that
feature's file in this folder; Shared, owner and the numbered invariants are in `AGENTS.md`;
the map is `docs/MAP.md`.

- `lib/navigator/run` is the one run the weekly job and the bootstrap share — claim, plan, orders,
  rationale (`lib/navigator/prompts` the rationale prompt).
- The weekly run trades only while the market is open, as the strategies and the pickers do
  (`lib/jobs/functions/navigator`, read off the event's own time; `force: true` trades at any
  hour): otherwise it scores, saves the week's targets and claims nothing. A claim taken on a
  morning when a quote the plan needed was refused is given back before any order is sent
  (`AccountPlan.unpriced`, `refusedQuotes`, `releaseNavigatorWeek`): a HOLDING without a quote
  holds the run back unless its symbol is gone; an unheld TARGET without one holds it back on the
  week's first run only, so a symbol Finnhub never prices cannot keep an account from trading at
  all. A run that throws before any order was sent gives its claim back too. The Tuesday 10:00 ET cron is the retry and does nothing when no enrolment is
  still waiting for its week (`lib/navigator/weekly.isRetryRun`, `countWaitingNavigators`). The
  stamp is `describeWeeklyRun` (pure): an enrolment held back or one whose run threw is named,
  never folded into "ran for 1/1". The on-demand run (enrolment, "Run AI now") is unchanged.
- `lib/navigator/allocator.HOLDING_REASON` is the kept-position fallback reason.
- The weekly job's scoring step also keeps the week's whole scored universe, one
  `NavigatorSignalWeek` per ET week (`lib/navigator/store.computeNavigatorScores` with `record`; the
  bootstrap records nothing), for the Navigator's signal check (### research).
- `/brain` decodes its reasons on the server with `lib/learn/reasons.glossNavigatorReasons`, for
  `SuggestionPanel`'s one "What the Navigator saw" per decision, which the weekly-decisions widget
  never gets.
