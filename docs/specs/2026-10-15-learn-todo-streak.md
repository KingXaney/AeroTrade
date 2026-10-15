# Lab › Today as a list, one streak, a quiz under every unit

**Status:** Shipped (2026-10-15), merged from `feat/learn-todo-streak`. Plan in the owner's Claude
plans folder (`snoopy-churning-pixel.md`).

## Why

The owner asked for four things on 2026-10-15: the learning page "almost like a todo list", the
game widgets addable to it (with Codeforces and LeetCode beside Lichess and Monkeytype), a streak
that counts a day when any item on the list is done and looks better than a row of dots, and "a
little quiz under each unit that you must pass to move on to the next unit". A fifth came with
them: the arithmetic sprint's custom mode "keeps on resetting once you end a round".

Decisions taken with the owner: the page is Lab › Today (`/learn`, the owner's lab); the widgets
are the games hub's cards, picked on the page and saved to preferences; a game on the page is a
todo ticked by a kept round that day, the sites the app cannot see by a tick the owner presses;
the one streak replaces the puzzle streak on Home, the hub and the Lab.

## What it is

- **Today's list** (`lib/lab/todo.ts`, pure; `components/lab/TodayList`): one item per thing the
  day holds, its state read from rows — the unit (done when studied today), the review (the queue
  graded; `none` with nothing due), the problem (closed), the papers digest (manual), then one per
  widget: the puzzle (today's row solved), a game (a `GameRound` of that game today), poker night
  and the outside sites (manual). A manual tick is a `LabEvent` of kind `todo` keyed
  `${item}:${day}` (`tickTodo`/`untickTodo`); unticking deletes it. The header counts "n of m
  done" over the items with something to do. The work panels stay below the list.
- **Widgets** (`lib/lab/widgets.ts`): `daily-puzzle`, `arithmetic`, `kelly`, `market-making`,
  `correlation`, `poker-night`, `lichess`, `monkeytype`, `codeforces`, `leetcode`; the stored
  preference is `learn.labWidgets` (absent = the puzzle alone; an empty list = none).
  `components/lab/LabWidgets` draws the games hub's own cards and `WidgetPicker` saves the list
  through `setLabWidgets`. `GAMES_COPY.outside.links` gained Codeforces and LeetCode, so the hub's
  Elsewhere panel lists four.
- **The one streak** (`lib/learn/activity.ts` + `activity-store.ts`): the union of lab session
  days, puzzle solved days, round days and tick days, counted by `streakFrom`; read once per
  request by `readActivityStreak`, which `lib/games/store.readStreak`, Home, the hub, the puzzle
  page, the widget and the Lab all use. `nextMilestone` (3, 7, 14, 30, 60, 100, 365).
  `components/learn/StreakHero`: the flame in a disc (filled once today counts, warning-tinted
  while at risk), the count, the status, the milestone, longest and days active, seven day pills
  with a check inside a day that counted and today ringed (breathing while at risk, under
  `motion-safe` only — no new keyframe), the 12-week grid under month labels. `StreakChip` says
  "Start today" at zero and leads the owner to `/learn`, everyone else to `/games`. A kept round
  now revalidates `/`, `/dashboard` and `/learn` too.
- **The quiz** (`LabUnit.quiz`, 72 questions over the 18 written units, authored from each
  unit's own sections and cards; `lib/lab/quiz.ts`): `quizPublic` strips the answers before the
  page sees a question; `scoreQuiz` passes at most one wrong. `components/lab/QuizCard` collects
  the choices (prompts and options rendered by the unit page through `LabMarkdown`);
  `answerQuiz` scores on the server — a fail says which questions were wrong, a pass stamps a
  `LabEvent` of kind `quiz` (unit id, day, score), counts the day and returns the explanations.
  `markUnitStudied` refuses until the row exists, so `todaysUnit` never moves on past an unpassed
  quiz; `MarkUnitStudied` is disabled with the same sentence.
- **The sprint's custom mode**: the settings and the practice time live in this browser
  (`localStorage`, read through `useSyncExternalStore` with the defaults as the server snapshot),
  and a finished custom or practice round offers "Change settings" back to the lobby. The repro
  showed the done screen survived the round's save; what reset was the settings on every reload or
  tab change, since they lived only in component state.

## Rules kept

- Derived, never stored, but for the manual tick and the widget list; the bank stays server-only
  (the guard test), the answers never reach the page; owner-gated actions with zod on `unknown`
  and the one rate counter; copy under `lib/learn/copy/` at the 'copy' tier, the quiz prose at the
  'lab' tier; no "What these mean" or "Ask in chat" on a widget; no new CSS keyframe.

## Tests and QA

Unit: `widgets.test`, `todo.test`, `quiz.test`, `activity.test`, the streak's milestones, the
curriculum test's quiz rules, the copy tests. Browser: `qa-lab` (the list's states, the hero at
zero and at one, the quiz failed then passed and the gate on the mark, the digest ticked and
unticked, the widgets added from the picker — a seeded round ticks the sprint, Codeforces is
ticked by hand — the saved preference, a phone width), `qa-games` (the hero on the hub, a kept
round starting a streak on Home, the chip's "Start today", the custom settings kept across
"Change settings" and a reload), `qa-home`.

## Not built

- A streak notification or a rail dot. A per-reader order of the list. Quizzes for the twelve
  units not yet written (they come with the units).
