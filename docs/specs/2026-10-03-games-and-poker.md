# Games and a poker solver: Learn becomes a place to play

**Status:** In progress — the quizzes were removed in `30a6da0` (PR #39, 2026-10-03), and the games
hub, the daily puzzle and its streak shipped in `989e0ff` (PR #40), the arithmetic sprint and its
interview mode in `639ef94` (PR #41), and the Kelly, market-making and correlation games in
`30acbd8` (PR #42). The poker solver's equity, push/fold and pot odds are the fifth of six pull
requests; the river solver follows.

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

## The arithmetic sprint and interview mode

- **The sprint** is Zetamac's game: sums of 2–100 and 2–100, products of 2–12 and 2–100, both in
  reverse, for two minutes. Each problem moves on the moment the typed answer is right.
- **Custom** chooses the operations, ranges and time (30 s to 10 min). A record is kept per
  settings key ("zetamac" for the defaults), so a round on easier settings never stands beside one
  on the defaults.
- **Interview** is eighty multiple-choice problems in eight minutes, in the style of trading
  firms' mental-maths tests. The four wrong options sit where a slip would land — a digit, a place,
  a near fraction — and keys 1–5 choose.
- **The round** is a pure reducer: the seed and the clock arrive in its actions, and each problem
  is drawn from the seed and its place, so a round replays exactly.
- **Records:** the browser counts the round and reports it when it ends. The server keeps it only
  if a person could have played it — at most four answers a second, a real duration, known
  settings. A record is the top score read back from the rows.

## Kelly coin, market making, Guess the correlation

- **Kelly coin** is the Haghani–Dewey experiment. A coin lands heads 60% of the time; you start
  with $25, winnings are capped at $250, and you get at most 300 flips with any bet you like.
  - When the game ends, the same flips are run under three fixed rules: the Kelly fraction (20% on
    heads), half of it, and everything on heads.
  - Each rule shows its expected log growth a flip; it is highest at the Kelly fraction.
- **Market making** settles on the sum of four hidden dice, over four rounds.
  - Each round you quote a bid and an ask, 1–4 apart, and three traders come by. One knows the
    sum to within one; the other two know only the dice shown, give or take.
  - A die is shown after each round. The end splits your profit and loss by trader, so adverse
    selection shows in numbers.
  - A test checks that quoting at the fair value loses to the informed trader on average.
- **Guess the correlation** is ten scatter plots of fifty points each.
  - The truth is each plot's own sample r. The score is the average miss, and the lowest score is
    the record.
- **Scoring:** each of these games draws everything random from one seed before the first move.
  The page reports the seed and the moves, and the server replays them for the score; a reported
  score is never taken on trust.

## The poker solver

Everything is worked out in the browser and nothing is stored: the page reads only the session.

- **The engine.** A Web Worker when it starts and answers within four seconds, else the page
  thread running the same jobs; `?engine=main` forces the page thread for QA. A spike proved the
  worker builds and runs under Turbopack in dev and in a production build before anything else
  was written. A job is a generator that yields progress: the worker drives it in 50 ms slices,
  the page thread in 12 ms slices, so a stop or a newer job is heard between them and the latest
  job wins. A stop the worker does not answer within a second ends the worker.
- **The evaluator** reads 5 to 7 cards as four 13-bit suit masks and five small tables, and is
  tested over every 5- and 7-card hand and against a slow best-of-21 reference.
- **Equity** picks one of three methods:
  - **Preflop table:** for whole-class ranges, exact and instant.
  - **Exact enumeration:** used within 40 million hand values. A sorted showdown sweep makes each
    board linear in the hands.
  - **Seeded Monte Carlo:** fixed blocks of 65,536 deals, run until the standard error is under
    0.05 points.

  AsAh against KsKh reproduces the known 1,410,336 wins and 9,308 ties over 1,712,304 boards on
  both engines. An enumeration yields at least every 50,000 hand values, which brought Stop under
  a second (227 ms in QA) for two full ranges.
- **The preflop table:** every class against every class, exact. Every combo pair is reduced to
  its suit pattern under the 24 relabelings of the suits, leaving 46,683 patterns, and each pattern
  is played over every board on every core. That took about seven minutes. The table reproduces
  the published figures: AA against KK is 81.946%, and against a random hand AA scores 85.20%, KK
  82.40%, AKs 67.04%, 72o 34.58% and 32o 32.30%.
- **Push or fold:** solved by discounted CFR rather than the CFR+ first planned.
  - **Why:** across 241 spots, at a tolerance of 10⁻⁵, it took 47 iterations on average against
    CFR+'s 345, and its averages carry less early noise. The solver also takes the current strategies when
    they already meet the tolerance, and they carry none.
  - **Clean charts:** every hand whose gain is clearly signed is then set to its pure action, but
    only when that profile still measures within the tolerance. The tolerance is 10⁻⁶ bb a hand,
    which keeps any wrong-signed gain on a pure hand under 0.001 bb.
  - **Speed:** at that tolerance a solve takes about 130 iterations, 12 ms on average and under
    50 ms at most in Node, so the stack slider re-solves live.
  - **Figures:** 10 bb gives 58.3% pushed and 37.4% called; 20 bb gives 40.2% and 21.7%. The
    shares are not monotone at fine steps — a seat can widen by a fraction of a point when the
    other tightens — so the tests pin a coarse ladder.
- **Pot odds:** the break-even equity, the odds, the minimum defense frequency, the folds a bluff
  needs, and a call's expected result.

## What follows

- **The river solver:** discounted CFR over a betting tree, checked against the polarized
  range-versus-bluff-catcher toy game.
