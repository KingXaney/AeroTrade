---
paths:
  - "lib/jobs/**"
  - "lib/limits/**"
  - "components/jobs/**"
  - "components/limits/**"
  - "app/api/inngest/**"
  - "lib/learn/copy/jobs.ts"
  - "lib/learn/copy/limits.ts"
  - "database/models/job-run.model.ts"
  - "database/models/limit-event.model.ts"
  - "scripts/trigger.mjs"
  - "scripts/qa/qa-job-alerts.mjs"
---

# jobs

Contracts of this feature that a map cannot show: a part of `AGENTS.md`, kept in a file of its
own so it loads only beside the files its `paths:` name. A `### name` in the text is that
feature's file in this folder; Shared, owner and the numbered invariants are in `AGENTS.md`;
the map is `docs/MAP.md`.

- `lib/jobs/functions/` is one file of thin wrappers per feature (`lib/jobs/functions/index` the
  list the route serves); the step bodies live with their feature — `lib/trading/snapshots`,
  `lib/income/store`, `lib/brain/ingest`, `lib/navigator/run`, `lib/email/digest` and
  `lib/email/welcome`, `lib/topics/refresh`, `lib/strategies/job`, `lib/lab/papers/job`,
  `lib/trading/splits-store`.
- The owner is told when a job breaks (`lib/jobs/functions/alerts.watchJobs`, the `job-alerts`
  job; rules in `lib/jobs/alerts`, pure). Its wrapper adds Inngest's own `inngest/function.failed`
  to the registry's triggers: a function that has used its retries has its error written on its
  `JobRun` row (`lastError`, `lastErrorAt`, one bounded line; `jobOfFunctionId` reads the job out
  of Inngest's name for it) and the owner list (`LAB_OWNER_EMAILS`) is mailed. The 09:00 ET cron
  is the daily check: every job overdue on its stamp (`overdueJobs`; never-run and on-demand jobs
  are not), in one mail. At most one mail per job per ET day (`JobRun.alertedOn`, claimed by a
  conditional update in `lib/jobs/alerts-store`, given back when the mail could not be sent — the
  alert never throws for a failed send, which would raise the event it listens for). A preview
  build does neither. A completed run clears the error (`recordJobRun`), and until then the status
  strip shows it (`components/jobs/JobStamp`: `jobHealth` is `'failed'` while the failure is newer
  than the last completed run; its line is `JOB_STAMP_COPY`). The mail is `renderJobAlertEmail` on
  the shared frame, its sentences `JOB_ALERT_COPY`, the error escaped as text, its one link the
  system view. The job cannot report itself.
- The brain update folds what it applied: a batch whose model call fails ends the extraction
  loop, never the function, so the batches already applied (their articles are stamped as read
  and would never be queued again) still reach `fold-brain`; the stamp says where it stopped.
- `lib/jobs/registry` is the one list of jobs (id, event, crons, status row); `lib/jobs/health` the
  status strip's read of their stamps; `lib/jobs/steps` holds `stepId` and `chunk`.
- The limits tracker, `lib/limits/`: `registry` (import-free — every outside service the app
  meters, its published cap as a dated sentence, its docs link, its planned use and the jobs that
  call it; `LIMIT_RETENTION_DAYS`), `detect.classifyLimit` (a refusal's kind — quota, rate, auth,
  outage — per provider, or null for an error that is not a limit), `report.reportLimit` (the one
  call a provider module makes on a failed response: no-op without `MONGODB_URI`, the recorder
  loaded on demand so the pure price, news and culture source modules stay light; never throws),
  `record` (the `LimitEvent` insert), `view.limitsView` (one row per provider, the state says only
  what was recorded) and `store.getLimitsView` (the last week, bounded). Hits are filed where a
  failure is caught — `lib/ai/infer.inferText` for every model call, the fetch helpers of
  `lib/prices/finnhub`, `lib/prices/yahoo`, `lib/prices/tiingo` and `lib/prices/stooq`,
  `lib/news/reddit-client`, `lib/news/adapters/sec`, `lib/news/adapters/search`, the culture
  sources, `lib/lab/papers/job`, `lib/email/send` — and `components/limits/LimitsPanel`
  prints them under the jobs strip on `/brain?view=system` (`LIMITS_COPY`). A service that fails
  silently records nothing: the panel never says "within limits".
- Crons run in production (and a local dev server) only: `triggersOf` drops them on a Vercel
  preview build, and wherever `JOB_CRONS=off` (the browser QA harness, so no schedule lands mid-run). The Inngest Vercel integration syncs every preview into a branch environment of
  its own, and a preview carries production's database, mailer and model keys — on 2026-10-05
  eight copies of every job were running against production, and the noon digest failed on the
  shared quotas. Events still reach a preview, so a branch can be tested by hand.
