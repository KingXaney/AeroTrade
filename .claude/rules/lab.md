---
paths:
  - "lib/lab/**"
  - "components/lab/**"
  - "app/(root)/learn/**"
  - "lib/learn/copy/lab/**"
  - "lib/learn/copy/lab.ts"
  - "lib/actions/lab.actions.ts"
  - "lib/jobs/functions/lab.ts"
  - "database/models/lab-*.model.ts"
  - "scripts/qa/qa-lab.mjs"
---

# lab

Contracts of this feature that a map cannot show: a part of `AGENTS.md`, kept in a file of its
own so it loads only beside the files its `paths:` name. A `### name` in the text is that
feature's file in this folder; Shared, owner and the numbered invariants are in `AGENTS.md`;
the map is `docs/MAP.md`.

- The owner's lab is `/learn` for the accounts `LAB_OWNER_EMAILS` names (`lib/lab/owner`:
  `labOwnerEmails`, `isLabOwner`, `labEnabled` — import-free, unset means nobody). The page reads
  the session through `getSessionUser` and renders `components/learn/LearnRedirect` for anyone
  else, which keeps a `#term` on its way to `/glossary` and otherwise goes to `/games`; a unit page
  (`/learn/units/[unit]`) redirects them on the server. One view at a time in the URL (`?view=`):
  Today, the Papers and the Library; `?arrange=1` is Today being arranged (below).
- Today is a list. `lib/lab/todo.buildTodayList` (pure) turns the day's parts into items, each in
  a group — study (the unit, the review, the problem, the papers), play (the puzzle, the games,
  poker night), elsewhere (the outside sites); `groupItems`, drawn as eyebrows only when more
  than one group has items — with a state read from rows: `done` (the unit studied today, the
  queue graded, the problem closed, the puzzle solved, a `GameRound` of that game today, a manual
  tick), `started` (the quiz passed but the unit not yet marked, a review partly graded today, a
  puzzle attempted), `overdue` (a review with cards past their day), `todo`, and `none` (nothing
  to do today — no cards due, a revealed puzzle — counted neither way). The manual ones — the
  papers digest, poker night and the sites outside the app — are ticked by the owner's own press
  (`tickTodo`/`untickTodo`, a `LabEvent` of kind `todo` keyed `${item}:${day}`).
  `components/lab/TodayList` draws it; the work panels below are where the items are done.
- Today is a HUD. `lib/lab/layout.ts` (pure, client-safe) is its catalog and layout: every part of
  the day (`LAB_PANEL_IDS`: the list, the streak, the unit, the review, the problem, the papers,
  the progress) and every game card (`lib/lab/widgets.ts`:
  import-free ids, never renamed, each with its `icon`) as `{id, span}` rows on the dashboard's
  twelve-column grid, a span one of `LAB_SPANS` (4, 6, 8 or 12 — S to XL on the width picker)
  among those the card allows (`LAB_HUD`, each with its `defaultSpan`; the list is `tall`, two
  rows from a desktop's width so two cards a third wide stack beside it); the preference
  `learn.labLayout`, version 3. `DEFAULT_LAB_LAYOUT` is the day on one screen: the list
  two-thirds wide, the streak (compact) at its top right and the unit under it, the problem a bar
  folded to its title, the review beside the progress, the papers, the games last at a third.
  `readLabLayout` reads a version-3 layout as saved; a version-1 or version-2 layout, or the older
  `learn.labWidgets` list, keeps only which games were on Today, at the default width, at the end
  (`layoutWithGames`); else the default. A save writes the layout and unsets the list. `moveLabWidget`, `addLabWidget`,
  `removeLabWidget`, `setLabSpan`, `setGameOn`, `labLayoutsEqual`, `labLayoutFingerprint`,
  `missingLabWidgets` and `gamesOf`, each the same reference for a no-op.
  `components/lab/LabHud` (client) draws it: the page renders every card's body on the server
  (`bodiesOf` in `app/(root)/learn/page.tsx`: each part of the day that has something to show,
  each game as `components/lab/LabGameCard` over `components/lab/LabWidgetBody`, the hub's
  `GameCardBody`) and hands them to the HUD by id, which lays them out viewing and arranges them
  in place with the dashboard's own pieces — `WidgetShell` over a structural `ShellDef` (chrome
  'bare': each body is its own Panel, un-framed inside the editing shell by one rule in
  `app/globals.css`), `DragGhost`, `WidgetPlaceholder` (a card added, or a part with nothing to
  show today, which viewing is skipped), `DashboardToolbar` and `WidgetLibrary`, which take their
  words as props. Arrange is the page title's link on Today, `/learn?arrange=1` (the account
  menu's "Lab layout" for the owner too — `components/shell/UserDropdown`, `owner` handed down
  from the `(root)` layout; not an `ACCOUNT_PAGES` entry, since the registry holds page files
  only); viewing, the HUD draws no toolbar of its own. Arranging: Add to Today (the parts of
  the day, the games in the app, elsewhere), Reset, Cancel, Save (`saveLabLayout`: the strict
  zod schema, then the lenient reader; no revalidation — the HUD refreshes the page itself, as the
  dashboard grid does). The HUD is keyed on the mode, never the layout: it follows a new layout
  from the page unless a draft is open, so the list's own dialog stays open across its toggles.
  The problem is folded to its title (`components/primitives/Disclosure` 'row', `#lab-problem-fold`),
  opened by its title or by the list's Open → — a plain anchor to `#lab-problem`, as every in-page
  link on the list is, so the browser's fragment navigation fires `hashchange` and the fold's
  `openOnHash` (`components/primitives/OpenOnHash`) opens it; `components/learn/LearnRedirect`
  leaves the lab's own anchors (`#lab-*`, `#paper-*`) on the page. The streak card is
  `components/learn/StreakMini` — the flame, the count, the milestone and the week's pills from the
  hero's own exported pieces, without its tiles, status line or grid — and the puzzle card's own
  strip is off while the streak card is on the page.
- Games join the list from the list: "Games" in its header (`components/lab/GamesOnToday`) is one
  switch per game — on is a card at the end of Today and an item on the list, off takes both away
  — each saved at once by `setGameOnToday` (`setGameOn` over the stored layout, then `/learn`
  revalidated), so the switch shows the page's own answer. Every sentence is `LAB_COPY`
  (`list`, `layout`, `games`), `LAB_PANEL_WORDS`, `LAB_WIDGET_TITLES`
  and `LAB_WIDGET_BLURBS` (`labHudWords` by id).
- Every written unit carries a quiz (`LabUnit.quiz`: 3–5 questions, four options, one answer, a
  `why`; the curriculum test holds the shape and varies the answer positions). `lib/lab/quiz` is
  pure: `quizPublic` strips the answers before the page sees a question, `scoreQuiz` passes at
  most one wrong (`QUIZ_MAX_WRONG`). `components/lab/QuizCard` collects the choices from prompts
  and options the unit page rendered (`LabMarkdown`, so the maths renders) and
  `lib/actions/lab.actions.answerQuiz` scores on the server: a fail says which questions were
  wrong and nothing else, a pass stamps a `LabEvent` of kind `quiz` (the unit id, the day, the
  score), counts the day and hands back the explanations. `markUnitStudied` refuses until that row
  exists (`LAB_COPY.quiz.quizFirst`), so the next unit waits on the quiz; `MarkUnitStudied` is
  disabled with the same sentence until then.
- The bank is `lib/learn/copy/lab/` — `types`, the `md` tag (String.raw, so a formula is written
  as in a .tex file), `plan` (the thirty syllabus rows, ten a track, never reordered; append past
  thirty), `units/<track>` (the authored units, in the plan's order) and `bank` (the index). It is
  server-only: `lib/lab/__tests__/guard.test.ts` fails if a client file, or anything under
  `components/`, imports the bank, the units, `lib/lab/registry`, `schedule`, `store` or
  `page-store`. A problem's solution reaches the page only once the owner has closed it (an
  answer checked on the server, or a reveal). The page's own sentences are `LAB_COPY` in
  `lib/learn/copy/lab` (client-safe, 'copy' tier).
- Copy tiers: the units' prose — sections, cards, problems, solutions — is held to the `'lab'`
  tier of `lib/learn/banned` (trading-directed phrases only, since the fields say "optimal" and
  "cheap to compute" as terms of art) with code and maths stripped first (`lib/lab/prose`);
  titles and one-liners to `'copy'`. `lib/lab/__tests__/curriculum.test.ts` also renders every
  formula with KaTeX, requires one python fence per unit, 5–8 cards and 1–2 problems, https
  sources, and no five-word run shared with a listed glossary entry (a unit's `glossaryTerms`
  are quoted beside it in one `WhatTheseMean`, never paraphrased).
- Pure: `lib/lab/schedule` — `todaysUnit` is owner-paced (the first unstudied unit of the
  least-advanced track, ties cv → ml → quant; a unit stamped today stays today's; a revisit once
  every written unit is studied; never a calendar, so a missed day skips no prerequisite),
  `problemPool` and `dailyProblem` (the day's problem: today's unit's problems first, then every
  studied unit's — the one closed today stays today's, closed; else the first unopened; else the
  one closed longest ago, open again, so a closure from an earlier day never reads as "closed for
  today" — `closeProblem` moves a re-closure's `lastDay`, keeping `day`, the first),
  `dueCards` (overdue, due today, then a studied unit's new cards from the day
  after), `reviewSummary`; `lib/lab/srs` — the SM-2 variant (`grade`, deterministic, no fuzz);
  `lib/lab/view.shapeLabView` — what the page shows, fed by `lib/lab/page-store.getLabView`, the
  one cached read. `lib/lab/registry` indexes the bank for the actions' id checks.
- Rows, never stamps on the preference: `database/models/lab-event.model.ts` (`labevents`: kind
  `unit` | `problem` | `session`, unique per owner, kind and key; a `session` row per ET day the
  owner graded a card, marked a unit or answered a problem — the lab's streak is `streakFrom`
  over those days, derived, never stored) and `lab-card-state.model.ts` (one row per graded card;
  a grade is an update filtered on the state the client saw). Writes are `lib/lab/store`; the
  actions `lib/actions/lab.actions` (`markUnitStudied`, `gradeReviewCard`, `revealProblem`,
  `answerProblem` through `lib/games/answer.checkAnswer`) gate on the owner through
  `getCurrentUser`, rate-limit per owner, check every id against the registry, and revalidate
  `/learn` as a layout — never `/`.
- `components/lab/LabMarkdown` is the one renderer of the bank's markdown (react-markdown with
  remark-math, remark-gfm and rehype-katex, on the server; KaTeX's stylesheet imported there;
  `.lab-prose` in `app/globals.css`). It is never given a model's text — that stays
  `SafeMarkdown`. `ReviewDeck` and `ProblemCard` take the faces, the statement and the solution
  as rendered nodes and only flip, grade, hint and answer.
- The papers feed, `lib/lab/papers/`: `lib/jobs/functions/lab.refreshLabPapers` runs weekdays
  at 06:20 ET (`lab-daily-papers`, trigger `lab`) — the previous weekday's and today's Hugging
  Face daily lists (`hf`), one arXiv listing per track (`config.LISTING_CATEGORIES`, `arxiv`),
  one id-list lookup for the Hugging Face papers the listings did not carry, three seconds apart
  — and the pure `day.assembleDay` keeps the new papers (not stored in the last week, published
  within one) of each track, at most twelve, upvotes first, in one `LabDay` document per ET day
  (`database/models/lab-day.model.ts`, `store`). A stored day holds no URL: a paper is its
  arXiv id and `links.paperLinks` builds its addresses at render time. Then one model call
  (`labDigest`, `prompts.buildLabDigestPrompt`: numbered papers, no ids or links) for a digest
  `digest.parseLabDigest` keeps only where a bullet cites a paper it was shown and no bullet
  reads as a trading instruction ('lab' tier); a spent daily quota skips the digest, never the
  papers. `view.shapePapersView` is the Papers view (`?view=papers`, `components/lab/PapersPanel`
  and `DigestPanel`, the digest as text nodes with "[n]" links to the rows); Today carries the
  digest, or three papers a field without one. The job skips when `labEnabled()` is false.
