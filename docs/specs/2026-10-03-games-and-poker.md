# Games and a poker solver: Learn becomes a place to play

**Status:** In progress — the quizzes were removed in `30a6da0` (PR #39, 2026-10-03); the games hub,
the daily puzzle and its streak are the second of six pull requests. The arithmetic sprint, the
Kelly, market-making and correlation games and the poker solver follow, in that order.

## Why

The owner asked to take the quizzes out of Learn but keep the Learn tab, and to add play instead:
a Zetamac-style arithmetic game, a logical quant puzzle that records when each was solved and
keeps a Duolingo-style streak shown on the front page, a poker solver, and other quant games.

Answers to the questions this raised:
- **Which quizzes go:** all three — the Daily quiz, the course's lesson questions and Guess the
  Verdict.
- **What keeps the streak alive:** solving the day's puzzle on its day, one goal a day as in
  Duolingo.
- **The poker scope:** an equity calculator, a heads-up push/fold Nash solver, pot odds and a river
  solver (CFR).
- **The other games:** a Kelly coin game, a market-making game, Guess the correlation, and an
  interview math mode (80 questions in 8 minutes) for the arithmetic game.

## A deliberate change of policy

The learn program said "no streak, no score, no reward". The games keep a score on purpose — a
streak of days and each reader's own records — and only there: the course still counts lessons and
nothing else. The no-advice word list still holds every sentence ("record" and "highest", never
"best"; "equilibrium", never "optimal"; no "beat", "should" or "mistake").

## Where things go

- **The nav:** Games (`/games`) and the poker solver (`/poker`) are pages of the Learn section, so
  the rail stays at eight icons and Learn shows them as tabs.
- **The code:** `games` and `poker` are features in every layer — `app/(root)/games/`,
  `components/games/`, `lib/games/` and `lib/actions/games.actions.ts`, with copy in
  `lib/learn/copy/games.ts` and the puzzle bank in `lib/learn/copy/puzzles/`.
- **Shared randomness:** `lib/random.ts` is import-free and holds `fnv1a` and `mulberry32`, which
  the games and the poker worker share with Luck or skill.

## The daily puzzle and the streak

- **The bank:** sixty original puzzles in six kinds — probability, expected value, counting, logic,
  estimation and strategy — at three difficulties.
  - The bank is server-only. The page holds the prompt and the hints taken, never the answer,
    until the puzzle is solved or revealed.
  - A test fails if a client file imports it.
  - Every answer key is checked another way, by a seeded simulation, an enumeration or a direct
    computation. Changing one key on purpose makes CI fail.
- **The schedule:** one puzzle a day, the same for everyone on an ET day. Day 1 is
  `PUZZLES_START_DATE` (a week before launch, so the archive opens with six puzzles). The
  schedule is append-only and pinned by a hash, and it cycles when it runs out.
- **Answers:** a typed answer is read as a fraction where it can be, so 1/4, 0.25 and 25% are
  one answer.
  - A decimal for a fraction with no short decimal (1/3) counts at three significant figures.
  - An estimate accepts anything within its tolerance.
  - A "close" answer says so.
- **Attempts:** a `PuzzleSolve` row is an attempt in one context — the day's puzzle on its day
  (`day` set), or the archive (`day` null). A row stores its own puzzle id and day, so history
  never depends on the schedule.
  - Answers, hints and reveals are atomic updates filtered on the row still being open, and
    rate-limited per user.
  - An unreadable answer is not a try.
  - A revealed solution closes the puzzle with no solve.
- **The streak** is derived, never stored: the distinct days of solved rows that carry a day.
  - It is alive through yesterday until today ends, and at risk until today's puzzle is solved.
  - A missed day resets it.
  - It shows on Home beside the market status (never as a bare 0), on the hub with this week's
    dots and a 12-week grid, on Learn › Today, and in a library-only `daily-puzzle` widget.

## What follows

- **Arithmetic:** a Zetamac-style sprint, with its default ranges, custom settings and an interview
  mode.
- **Three more quant games:** Kelly coin (the Haghani–Dewey setup), market making on four dice,
  and Guess the correlation. Each records a reader's rounds and their own record.
- **The poker solver:** computed in the browser, in a Web Worker, after a spike proves the worker
  builds and runs under Turbopack.
  - A bitmask 7-card evaluator, tested over every 5- and 7-card hand.
  - Exact or seeded Monte Carlo equity.
  - Push/fold Nash by CFR+ over a precomputed 169×169 equity table.
  - Pot odds.
  - A river solver by discounted CFR, checked against the polarized-versus-bluff-catcher toy game.
