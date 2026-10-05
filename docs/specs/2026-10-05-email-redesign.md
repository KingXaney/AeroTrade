# The daily brief: one copy, one name, a cited summary

Status: Shipped (2026-10-05).

## Why

The owner reported that the daily email still said "algotest" (the product's old name), and asked
for nicer emails and better summaries, with links for anyone who wants to read more.

The code had carried only "AeroTrade" since 2026-09-16. The old name lived on outside it:

- **The links.** Every link in an email was built from `BETTER_AUTH_URL`, a write-only Vercel value
  set on the project's first day alongside its first domain, `algotestlarp.vercel.app`, which now
  redirects to `aerotrading.vercel.app`.
- **The sender.** The Gmail account is `algotestadvisor@gmail.com`. It is kept for now; a new
  sender needs only the two `NODEMAILER_*` values.
- **Hosting.** The Vercel project was named `algo-test`, the GitHub description began "AlgoTest-",
  and three production builds from July 30–31 still served the old `AlgoTest` Inngest app.

Checking the logs at the noon cron turned up a bigger problem: **every cron ran in up to eight
copies.** The Inngest Vercel integration syncs each preview build into a branch environment of
its own. Every preview carried production's database, mailer and model keys, so production plus
seven branches already merged ran every job. On 2026-10-05 all eight digests hit Gemini's and
Finnhub's rate limits, and nobody received one. On a quieter day each reader got several copies,
threaded into one conversation. Other jobs' writes were held by their unique indexes and claims;
the digest had no such guard.

The digest itself had the model write its HTML: about 170 lines of inline styles, three bullets
and a "Bottom Line" per article, Navigator numbers retyped by the model, one link per article and
none into the app.

## What changed

**Operations (2026-10-05).**
- The seven stale preview builds and the three July builds were removed.
- `BETTER_AUTH_URL` now holds the production domain; the unused `NEXT_PUBLIC_BASE_URL` is gone.
- The Vercel project is `aerotrade`, and the GitHub description is new.

**Production-only jobs.** `lib/jobs/registry.triggersOf` drops every cron on a preview build, and
`lib/email/send.mailerReady` refuses to mail from one. Events still reach a preview.

**One brief per reader per day.** The send step claims `(userId, ET day)` in `DigestSend` before
it mails, and releases the claim if the send fails. A retry, a manual trigger or a duplicate
environment cannot mail anyone twice. A test send to one reader (`npm run trigger -- news <email>`)
takes no claim.

**One address, one name.**
- `lib/site.PRODUCTION_URL` is every production link; the sender's name is `SITE_NAME`.
- `lib/__tests__/brand-name.test.ts` fails if an old name appears anywhere in the repo.

**A cited summary.** This is the morning briefing's pattern.
- The model sees numbered articles: headline, the outlet's own summary, the outlet, the kind of
  source and the reader's symbols. It sees no links.
- It answers in JSON with a headline, up to five "In 30 seconds" bullets, and up to eight stories
  (title, two-sentence summary, a one-line "Why it matters"), each citing article numbers.
- A bullet or story with no valid citation is dropped.
- When nothing usable comes back, the leading articles are mailed in their outlets' own words,
  the reader's stocks first.

**A deterministic layout.** `lib/email/digest-view` groups stories by their cited articles: Your
stocks, Markets, From your news feed, Filings and What people are posting, the last two with a
caveat. Ticker chips link to the stock's page in the app, and "Read more" links each cited
article. The AI Navigator's decisions become a table built from the stored set. Topic names link
to their pages, and a button leads to `/news`.

**One light frame for every email** (`lib/email/layout`).
- It uses tables and inline styles, with no images.
- A hidden preheader carries the day's first bullet; dark mode works in Apple Mail.
- It works at phone width, and the brief is about 24 KB against Gmail's 102 KB clip.
- The welcome and reset emails share the frame. A real plain-text part spells out every link.

## Checks

- **Unit:** `digest-summary`, `digest-view`, `digest-render`, `layout`, the section tests,
  `email-copy`, `site`, `brand-name`, `registry` (no crons on preview), `mailer-guard` (no mail on
  preview; production links).
- **Browser:** `qa-email` covers the claim against the harness database, and renders every email
  at 680 and 375 px, light and dark.
