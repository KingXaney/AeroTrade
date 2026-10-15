# Enrol an account with a culture picker

**Status:** Shipped (2026-10-15), merged from `feat/culture-follow`. Plan in the owner's Claude plans
folder (`snoopy-churning-pixel.md`); the limits tracker it also describes is the next PR.

## Why

The owner asked to follow the culture brain's trades the way the AI Navigator can trade in their own
paper account: "make them similar and trackable from my portfolio accounts like the news one". The
culture pickers, Spike and Quiet, traded only their own shared accounts (`system:culture`) and the
Pickers view printed their records as "not a list to follow". Now each picker offers an enrolment: a
dedicated paper account of the reader's, named for the picker, that the picker trades with its own
weekly targets sized to that account.

Answers to the questions this raised (2026-10-14):
- **First trades:** only while the market is open, the culture brain's own session rule. An
  enrolment made outside the session is previewed — its orders planned, none placed — and the
  account trades at the next open run (the Monday weekly run, or "Trade now").
- **Scope:** the Pickers view, `/portfolio`, the dashboard's Culture Brain tile, the daily email and
  the chat tool all know the reader's enrolled accounts.
- **Word:** "follow" already means *pin* for strategies and "follows attention" in the culture copy,
  so the UI says **enroll**, the Navigator's word; the modules are `lib/culture/follow*`.
- **Both pickers** can be enrolled at once, each in its own account.

## What it is

- **Models.** `CultureFollow` (`culturefollows`): one row per user and profile — `accountId`,
  `status` active or paused, `enrolledAt`, `lastRunWeek` (the ET week key, the atomic claim),
  `lastError`. `CultureFollowDecision` (`culturefollowdecisions`): what the picker decided for that
  account on a day — the picker's item schema, `kind` executed or preview, unique per user, profile
  and day; a preview never overwrites an executed one.
- **Pure.** `lib/culture/follow.ts`: `followAccountName` ("Culture · Spike"), `FollowProfileSchema`
  (zod over the live profiles), `targetsFromDecisionItems` and `scoredFromItems` (a stored decision
  read back as the week's targets and scores), `followStatusView` (the card's shape),
  `describeFollowRun`. `lib/culture/engine.decideForBook` lays a picker's `scored` and `targets` over
  any book under `CULTURE_RAILS`; `decideWeek` calls it, so an enrolled account and the picker's own
  are decided by one function.
- **Store.** `lib/culture/follow-store.ts`: the rows, `claimFollowWeek` (one `findOneAndUpdate` on
  status active and a different week), `completeFollowRun`, `saveFollowDecision`, the reads for the
  page, `/portfolio` (`getFollowDecisionsForDates`), the email (`getLatestFollowDecisions`) and the
  chat. `picker-store.loadBook` takes the owner first.
- **The weekly run** (`lib/jobs/functions/culture.ts`): after `held-symbols`, `load-followers` reads
  each live profile's active enrolments and their accounts' held symbols, which join the quote sweep
  so a holding can exit. After each picker's own decision the followers run one by one —
  plan (the account's book, `decideForBook`, `firstWeekTrades`), claim (live only; a claimed week is
  skipped), exec (`executeOrder(userId, cultureOrderRequest(...))`: `source: 'culture-brain'`, the
  same `culture:<profile>:<week>:<side>:<symbol>` key, unique per account), save, complete. The
  summary line says "enrolled accounts: n traded, x/y filled, m skipped". No model call per follower.
- **The bootstrap** (`bootstrapCultureFollow`, `culture-follow-bootstrap`, event
  `app/bootstrap.culture.follow`, trigger `culture-follow <userId> <profile>`): the enrolment's first
  trades, and "Trade now". It reads the picker's latest executed decision as targets, prices the
  week's universe plus any held symbol the week lacks, plans against the account, claims the week
  (not outside the session unless forced), fills, saves the decision and stamps the row. No
  re-scoring, no Finnhub sweep.
- **Actions** (`lib/actions/culture.actions.ts`): `enrollCulturePicker({profile, startingBalance?})`
  — session, zod on `unknown`, `takeRateLimit('culture:follow:<uid>', 10, 60s)`, refuse if enrolled,
  reuse an empty account named for the picker through `restartAccount` (refuse if it holds
  positions), else `createPaperAccount` (the ten-account cap applies), create the row, queue the
  bootstrap (a failed send never fails the enrolment), revalidate `/culture`, `/portfolio`, `/`,
  `/dashboard`. `pauseCultureFollow`, `resumeCultureFollow`, `runCultureFollowNow` (refuses while
  paused), `unenrollCulturePicker` (the account stays). `deleteOwnedAccount` refuses an account a
  picker trades in.
- **Surfaces.** `/culture?view=picks`: `components/culture/FollowPickerCard` under each picker's lead
  (Enroll with a balance; enrolled: Active or Paused, Trade now, Pause or Resume, the link to the
  account, a two-click Unenroll, the last error, a note when the picker itself is paused) and "Your
  Spike account's decisions" (`PicksPanel` with scope `follow`: the items with one "What the picker
  saw" each, a note that these are the picker's targets sized to the account, the previewed-outside-
  session line). `/portfolio`: `components/trading/portfolio/TradedBy` under the account's name
  (`lib/trading/traded-by`; the Navigator's account gets the same line) and each culture fill's
  `FillReplay` from the enrolment's own decisions. The Culture Brain tile prints "Yours: Spike +1.2%".
  The daily email gains a "Culture pickers" block per enrolled picker, rows built from the stored
  decision (never from model text), its links allow-listed. The chat's `getCultureBrain` returns
  `yours` with notes for a paused enrolment or a preview.
- **Copy.** `CULTURE_FOLLOW_COPY` and `CULTURE_WIDGET_COPY.yours` (`lib/learn/copy/culture.ts`),
  `TRADED_BY_COPY` (`copy/portfolio.ts`), `DIGEST_COPY.culture` (`copy/email.ts`), all at the 'copy'
  tier.

## Rules kept

- Invariant 3 (extended): nothing under `lib/culture` imports the news brain's models or store.
- Invariant 12: one "What the picker saw" per culture fill, on its trade-log row; the email's
  decisions are a table from stored rows; every sentence under `lib/learn/copy/`.
- Tests never import `lib/actions/*`; the actions are covered by `qa-culture`.
- The picker's own weekly claim stays per profile; an enrolment's claim is its own row.

## Tests and QA

Unit: `lib/culture/__tests__/follow.test.ts` (the schema equals the live profiles, names, targets
from items, the status view, the summary line, `decideForBook` against `decideWeek` and against a
hand-bought holding), `lifecycle.test.ts` (the third refusal), `registry.test.ts`, the email view and
render (the culture block, its allow-list), the chat shaping (`yours`, the notes), every copy test.
Browser: `qa-culture` (enrol, the bootstrap through the dev server, the decisions panel, the weekly
skip and the backdated claim, `/portfolio`'s line and the delete refusal, the widget, pause, resume,
unenroll, re-enrol) and `qa-trading` (the Navigator's line). `npm run email:preview` renders the
culture block.

## Not built

- A follower never gets its own rationale (no model call per reader); the picker's own is quoted
  on its decision above.
- An enrolment with the backtest-only `price` profile is refused by the schema.
- The limits tracker the same plan describes is the next PR.
