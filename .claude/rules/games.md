---
paths:
  - "lib/games/**"
  - "components/games/**"
  - "app/(root)/games/**"
  - "lib/actions/games.actions.ts"
  - "lib/learn/copy/games.ts"
  - "lib/learn/copy/puzzles/**"
  - "lib/learn/activity*.ts"
  - "components/learn/Streak*.tsx"
  - "database/models/game-round.model.ts"
  - "database/models/puzzle-solve.model.ts"
  - "database/models/arithmetic-skill.model.ts"
  - "scripts/qa/qa-games.mjs"
---

# games

Contracts of this feature that a map cannot show: a part of `AGENTS.md`, kept in a file of its
own so it loads only beside the files its `paths:` name. A `### name` in the text is that
feature's file in this folder; Shared, owner and the numbered invariants are in `AGENTS.md`;
the map is `docs/MAP.md`.

- The games are the one place the app keeps a score: the streak counts days, and a record is a
  reader's own top score. The learn surfaces stay count-only (a course's progress is a count,
  never a bar or a score). Every games sentence is still held to the no-advice list
  (invariant 12): "record" and "highest", never "best"; nothing says what to do with money.
- There is one streak, and it counts a day when anything on the reader's Learn list was done:
  the daily puzzle solved on its day, a kept round of any game, a lab session (a card graded, a
  unit marked, a problem answered, a quiz passed) or a manual tick. `lib/learn/activity.activityDays`
  (pure) joins the four sources' days and `lib/games/streak.streakFrom` counts them;
  `lib/learn/activity-store.readActivityStreak` is the one read (the models directly, so
  `lib/games/store` and `lib/lab/store` may both import it), cached per request, behind
  `lib/games/store.readStreak`, Home's chip, the hub, the puzzle page, the daily-puzzle widget and
  the Lab. `nextMilestone` names the mark the hero counts toward (3, 7, 14, 30, 60, 100, 365).
  `components/learn/StreakHero` draws it whole on the hub (the hub's `StreakPanel` adds the
  puzzles solved on their day) and `components/learn/StreakMini` compact on Lab › Today — the
  flame, the count, the milestone and the week's pills, from the hero's exported pieces (`toneOf`,
  `DISC_CLASS`, `DayPill`); Home's `StreakChip` says "Start today" at zero and leads the
  owner to `/learn`, everyone else to `/games`. A write that may move the day's count
  revalidates `/`, `/dashboard`, `/games` (layout) and `/learn`.
- The puzzle bank `lib/learn/copy/puzzles` is server-only: an answer reaches the page only once
  the puzzle is solved or revealed, every answer is checked in `lib/actions/games.actions`, and
  `lib/games/__tests__/puzzle-guard.test.ts` fails if a client file — or anything under
  `components/` — imports the bank, `lib/games/puzzles` or `lib/games/store`. Every answer key has
  an independent check in `lib/games/__tests__/puzzle-checks.ts` (a simulation, an enumeration or
  a direct computation), so a wrong key fails CI.
- `lib/games/puzzles.dailyPuzzleFor`: day 1 is `PUZZLES_START_DATE`, the days walk
  `PUZZLE_SCHEDULE` — append-only, its first sixty pinned by a hash — and cycle. A `PuzzleSolve`
  row stores its own puzzle id and ET `day` (null in the archive), one per puzzle per context, so
  no streak depends on the schedule. The streak is the distinct days of solved rows
  (`lib/games/streak.streakFrom`), never stored; a revealed solution or an archive solve counts
  nothing toward it.
- Each write is one atomic update filtered on the row still being open — a double click or a
  second tab cannot count twice — and every games action is counted per user by
  `lib/rate-limit.takeRateLimit`. A solve or a reveal revalidates `/`, `/dashboard`, the `/games`
  subtree and `/learn`.
- The streak shows on Home (`components/games/StreakChip`, beside the market status), on the
  hub's `components/games/StreakPanel` (`components/learn/StreakHero`) and Lab › Today
  (`components/learn/StreakMini`), and in `components/games/DailyPuzzleCard` on the library-only
  `daily-puzzle` widget (its strip off on Lab › Today while the streak card is on the page) — all from
  `lib/learn/activity-store.readActivityStreak`.
- The arithmetic sprint's custom settings and the practice time are kept in this browser
  (`components/games/ArithmeticGame`: localStorage `aero-arithmetic:custom` and
  `aero-arithmetic:practice-duration`, read through `useSyncExternalStore` with the defaults as the
  server snapshot), so a reload, a tab change or the page's refresh after a round's save never
  hands the sprint back its defaults; a finished custom or practice round offers "Change settings"
  back to the lobby with them as they were.
- A scored game's round is counted in the browser and reported when it ends;
  `lib/games/rounds.keptRound` keeps only what a person could have played (bounded counts, a real
  duration, known settings). These are one reader's practice records, not a leaderboard. A record
  is the top score per game and settings key, read from `GameRound` rows
  (`lib/games/store.readGameSummary`); `lib/games/arithmetic.settingsKey` names Zetamac's defaults
  "zetamac".
- The Kelly coin, market-making and correlation games (`lib/games/kelly`, `market-making`,
  `correlation`) draw everything random from one seed before the first move, so a game is its seed
  and its moves. The page reports those, and `lib/games/rounds.keptRound` replays them for the
  score — a reported score is never taken on trust, and a move the game would have refused voids
  the report. Their terms (`kelly-criterion`, `fair-value`, `bid-ask-spread`, `adverse-selection`,
  `correlation`) are the glossary's `games` group, homed at `/games`.
- The arithmetic round is the pure reducer `lib/games/arithmetic-round`: the seed and the clock
  arrive in its actions, a problem is drawn from the seed and its place
  (`lib/games/arithmetic.problemAt`), and `components/games/ArithmeticGame` owns only the
  interval, the 1–5 keys (never with ⌘, Ctrl or Alt) and the one report a round sends. Restart
  (the reducer's `restart`, the button after the answer box, so Tab then Enter reaches it) drops
  the round in play for a fresh one on the same settings; the dropped round never reaches 'done',
  so it is never reported, kept, counted for the streak or folded into the skill aggregate. Every
  sprint answer is timed by the reducer (`shownAt`, `solved`; a full wrong entry is a slip), and
  the report carries the seed and one `{ms, slips}` per answer: `keptRound` replays the seed to
  recover every problem, requires the per-operation counts to agree with the replay, and hands
  the action what the round says about the reader's kinds of problem (`KeptRound.skill`) — derived,
  never trusted, never written to the row.
- The sprint learns: a problem's kind is its cell (`lib/games/arithmetic-cells`: the size of the
  total and its units carry or borrow, or the times table on the schema's small factor; every
  cell generates its own problems), and `ArithmeticSkill` (`database/models/arithmetic-skill.model`)
  is one aggregate per reader of `{n, ms, slips}` per cell, `$inc`-ed by `lib/games/store.foldArithmeticSkill`
  on every kept round and deleted by "Start over" (`resetArithmeticSkill`, rate-limited). The pure
  `lib/games/arithmetic-skill.weakCells` names the slow kinds — at least `MIN_ATTEMPTS` answers,
  at least `WEAK_RATIO` times the reader's own mean, `WEAK_TOP` of them — for
  `components/games/SkillPanel` (server-rendered, fresh after the action's revalidation) and the
  hub card; Practice (`?mode=practice&focus=<cells>`, `parseFocus`) is a round drawn from those
  kinds alone, kept under `practice:<cells>;t=<s>`. Never a score: the records stay on the rounds.
