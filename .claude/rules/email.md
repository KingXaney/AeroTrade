---
paths:
  - "lib/email/**"
  - "lib/site.ts"
  - "lib/jobs/functions/email.ts"
  - "app/api/email/**"
  - "app/(reset)/unsubscribe/**"
  - "lib/learn/copy/email.ts"
  - "database/models/digest-send.model.ts"
  - "scripts/qa/qa-email.mjs"
---

# email

Contracts of this feature that a map cannot show: a part of `AGENTS.md`, kept in a file of its
own so it loads only beside the files its `paths:` name. A `### name` in the text is that
feature's file in this folder; Shared, owner and the numbered invariants are in `AGENTS.md`;
the map is `docs/MAP.md`.

- `lib/site` is the product's name and its one public address: email links are `PRODUCTION_URL` in
  production and the app's own `BETTER_AUTH_URL` elsewhere (`siteUrl`). The sender is
  `"AeroTrade" <NODEMAILER_EMAIL>`; `lib/__tests__/brand-name.test.ts` fails if an old product
  name comes back anywhere in the repo.
- Every email is one light frame, `lib/email/layout` (pure): nested tables, inline styles, no
  images, a hidden preheader, a dark-mode block for Apple Mail. Its blocks escape every text
  argument, and `lib/email/layout.linkOrText` is the only way an email makes an anchor — http(s)
  only. Every fixed sentence is `lib/learn/copy/email`; the welcome and reset emails are
  `lib/email/templates`.
- The daily brief takes the morning briefing's pattern. `lib/email/prompts.buildDigestPrompt` shows
  the model numbered articles — headline, the outlet's own summary, the outlet, the kind of source,
  which of the reader's symbols it is about — and no URLs; `lib/email/digest-summary` keeps only
  the bullets and stories that cite an article it was shown, and when the model wrote nothing
  usable (a refusal, a 429 that outlasted Inngest's retries) `fallbackDigestSummary` mails the
  leading articles in their outlets' own words instead of skipping the reader.
- `lib/email/digest-view` decides everything the brief shows: a story's section comes from its
  cited articles (the reader's own symbols first, then wire/RSS, their news feed, SEC filings and
  Reddit, the last two with a caveat); ticker chips name only the reader's symbols and link to
  their stock pages; the AI Navigator's decisions are a table built from the stored set, never
  shown to the model. `allowedUrls` is every link it holds — `lib/email/digest-render` sanitises
  the HTML it builds against it, then adds the topics and lesson sections, each already sanitised
  against its own (`topicsSectionLinks`, `lessonSectionLinks`). The plain-text part spells out
  every link.
- One brief per reader per ET day: the send step claims the day in `DigestSend`
  (`lib/email/digest-store`, unique on user and day) before it sends and releases it if the send
  throws, so a retry, a manual trigger or a duplicate environment cannot mail anyone twice. A test
  send (`event.data.email`) names one opted-in reader and takes no claim.
- A preview build never sends mail (`lib/email/send.mailerReady`): it shares production's mailer
  and readers.
- The daily brief carries the reader's own signed unsubscribe link (`lib/email/unsubscribe`: an
  HMAC of the user id under `BETTER_AUTH_SECRET` and a purpose label; it does one thing, names one
  account and does not expire): the footer's link to the public page
  `app/(reset)/unsubscribe` (`proxy.ts` lets the path through; it reads the link and changes
  nothing), and the `List-Unsubscribe` and `List-Unsubscribe-Post` headers a mail client turns
  into its own button. Only `POST app/api/email/unsubscribe` changes anything — a mail scanner
  follows every GET in a message — with no session and no same-origin check: the token is the
  authority. Its sentences are `UNSUBSCRIBE_COPY`.
- Today's lesson in the daily email, `lib/email/sections/lesson`: a moment dated exactly
  yesterday — the noon run must not mail a morning fill twice — else the day's concept, in the
  widget's own copy. Every string is escaped; `lessonSectionFor` sanitises it with
  `lessonSectionLinks`, exactly the links it builds.
- The daily-news step reads the facts through `lib/learn/facts-store.readLearnFacts` (accounts and
  preferences once) and the concept once per keyword set per run
  (`lib/learn/lesson-store.readLessonForDigest`).
