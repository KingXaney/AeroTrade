# The limits tracker

**Status:** Shipped (2026-10-15), merged from `feat/limits-tracker`. Part B of the plan that also
produced the culture enrolment (`docs/specs/2026-10-14-culture-follow.md`).

## Why

The owner asked for "a cron limit tracker so i can see when it hits limits. also track any other
application i call with limits". The app runs about fifteen model calls a weekday against Gemini's
free tier of twenty, quotes a few hundred symbols a week from Finnhub's sixty a minute, reads
Wikipedia, the App Store, YouTube, Reddit, Google News, SEC EDGAR, arXiv and Hugging Face, mails
through Gmail and schedules everything on Inngest's free plan. Until now a limit showed only as a
line in a job's stamp or a log, and only for the model's daily quota. The 2026-10-05 incident
(eight preview copies of every cron spending production's quota) was found from the email that
did not arrive.

## What it is

- **The registry** (`lib/limits/registry.ts`, import-free): one entry per service the app meters —
  Gemini, Anthropic, Finnhub, Yahoo, Stooq, Tiingo, Wikipedia, the App Store, Reddit, YouTube,
  Google News, SEC EDGAR, arXiv, Hugging Face, the mailer, Inngest — with what the app uses it for,
  the cap as the provider publishes it (a sentence with its window and the day it was read), the
  docs link, the app's planned use from the jobs' own constants, the jobs that call it, and the
  provider's dashboard where the app cannot read a counter. `LIMIT_RETENTION_DAYS` (45).
- **The classifier** (`detect.classifyLimit`): a provider's refusal — an `Error`, or `{status,
  message}` from a failed response — read into `quota`, `rate`, `auth` or `outage`, or null for an
  error that is not a limit. Gemini's daily quota is the only quota it names from text
  (`isDailyQuotaExhausted`'s rule); YouTube's `quotaExceeded`, Stooq's "daily hits limit" body and
  Gmail's "sending limit exceeded" are quotas too; a 429 is a rate, a 401 or 403 the key, a 5xx an
  outage.
- **Filing a hit** (`report.reportLimit` → `record.recordLimitIf`): one `LimitEvent` row
  (`limitevents`: provider, kind, jobId?, message ≤200 chars, at, ET day; TTL 45 days). The
  reporter is a no-op without `MONGODB_URI` and loads the recorder on demand, so the provider
  modules — unit-tested with a stubbed fetch — stay import-light; it never throws.
- **Where hits are filed:** `lib/ai/infer.inferText` (every model call, the task and model in the
  message), `lib/prices/finnhub.fetchJSON`, the Yahoo, Tiingo and Stooq fetchers (Stooq's 200 with
  "Exceeded the daily hits limit" too), `lib/news/reddit-client` (the token and the listing),
  `lib/news/adapters/sec`, `lib/news/adapters/search` (Google News), the culture sources
  (`youtube`, `appstore`, `wikipedia` on a non-404 failure), `lib/lab/papers/job` (arXiv, Hugging
  Face) and `lib/email/send` (every `sendMail`). Inngest has no refusal the app sees; its row
  carries the plan's figures and a link to its dashboard.
- **The panel** (`components/limits/LimitsPanel`, on `/brain?view=system` under the jobs strip):
  one row per registered service, the rows with a hit first and newest first — the service and its
  use, the published cap "as published <date>", the planned use and the jobs, "n hits today · m
  hits in 7 days", and the last hit's kind, time, job and words; a clear row says "no hit
  recorded", never "within limits"; the summary line counts the services hit today and this week;
  a note links Inngest's and Vercel's dashboards. Copy `LIMITS_COPY` (`lib/learn/copy/limits.ts`)
  at the 'copy' tier. No dot on the rail (invariant 8: the strip is where this lives).

## Tests and QA

Unit: `lib/limits/__tests__/limits.test.ts` (the registry's shape, every job id real; the
classifier over Gemini's quota and rate messages, a Finnhub 429 and a quote miss, YouTube's
reasons, Stooq's body, Gmail's limit and login refusals, statuses for every HTTP provider; the
view's counts, states, the week window and the ordering), `lib/learn/__tests__/limits-copy.test.ts`.
Browser: `qa-learn` seeds three hits and checks the panel's rows, order, a hit row's words, a clear
row's, the summary and the dashboard links.

## Not built

- Reading a provider's own counter (Gemini's usage, Inngest's run count): the panel links the
  dashboards instead.
- A planned-use ledger that counts calls before they are made (a reservation): the registry states
  the plan in words from the constants; a drift between plan and spend shows as hits.
- A rail dot or an email on a hit.
