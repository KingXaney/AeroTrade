# A new account's first ten minutes, five small abuse fixes, and a lighter first load

Status: implemented 2026-11-18

## Why

The audit of main on 2026-11-17 (see `docs/specs/2026-11-17-books-integrity.md` for how it was
run) left three groups of small findings beside the larger ones. Each is a change of a file or
three; they are recorded together here so the reasons stay with the code.

## 1. What a new account meets first

| What happened | What it does now | Where |
|---|---|---|
| The landing page and the column beside the sign-in forms described the strategies, the AI Navigator and the brain's "narratives". Those pages are the owner's alone, so a new account was promised three things it cannot open. The glossary count was the whole registry's. | The three lines say what every account has: the account measured against the S&P 500, interest on cash and real dividends, the morning briefing, the daily puzzle, the games and poker night. The count is the one a reader's own glossary shows, and ⌘K offers only those terms. | `lib/learn/copy/landing.ts`, `lib/learn/where.ts` |
| The first-week step "Add a stock to your watchlist" opened `/watchlist`, which had no way to add one. | The page has its own "Add a stock": a dialog with a stock search over suggestions. It is not a second ⌘K (no key listener, stocks only), and the reader stays on the page. | `components/stocks/AddToWatchlist.tsx`, `lib/stocks/watchlist-add.ts` |
| A ticker typed into ⌘K and Enter followed a topic of that name: the "Follow topic" row stood before the stocks and before the search had answered. | The rows are Pages, Learn, Stocks, then the topic row, which is pinned to the foot of the list so it stays in sight. While the search for the text in the box is out, no stock row is drawn and the topic row waits; an Enter pressed then is kept, and opens the first stock when the search answers. | `lib/shell/palette.ts`, `components/shell/SearchCommand.tsx` |
| Below 1280 px the order ticket sat under a 560 px chart, so Home's first step opened on a screen of chart. | The ticket comes first in the document; from 1280 px the chart is placed on its left. The chart is 360 px tall below that width. | `components/trading/desk/TradeDesk.tsx` |

Changing the password, leaving the daily brief and deleting the account are their own spec:
`docs/specs/2026-11-18-account-basics.md`.

## 2. Five small abuse fixes

The audit found ownership checks, the exports and the injection surfaces sound. What it found
open was counting and input shape:

| Action | Before | Now | Where |
|---|---|---|---|
| The stock search | No session, no length, no counter; each new query is a Finnhub call on the plan's one shared minute. | A signed-in reader's, a query of at most 40 characters, counted twice: 60 a minute, which typing does not reach, and 300 an hour, which a loop meets in five minutes. A search that did not answer is said as that, never as "No stocks found". | `lib/prices/action-limits.ts`, `lib/actions/stocks.actions.ts` |
| An order | No counter; every order asks Finnhub for a fresh quote and a profile. | 20 a minute per reader, before the order is read. The jobs are not counted. | `lib/prices/action-limits.ts`, `lib/actions/trading.actions.ts` |
| A password-reset request | Counted only by the address it was handed, of any length. | The address is read first (a string of at most 254 characters), then the client is counted (10 in 15 minutes), then the address (3). | `lib/auth/validation.ts`, `lib/auth/limits.ts` |
| The sign-up name | Passed as posted into the welcome email's headline. | 2 to 60 characters of what a name is written with (letters in any script, spaces, apostrophes, hyphens, commas, brackets, full stops, up to four digits), and nothing that spells a web address. Sign-in reads no address or password longer than an account can have. | `lib/auth/validation.ts`, `lib/auth/limits.ts` |
| The chat route | Took any role and any part; its size rule counted text parts only. | Reads only what the panel sends (`user` and `assistant`, text and the settled reads of the caller's own tools), counts everything it keeps, and checks the origin. | `lib/chat/request.ts`, `app/api/chat/route.ts` |
| A friend request | Looked any address up with no counter and answered a hit with the registered name. | 10 an hour, refused while 20 of the reader's own wait, and the answer names nobody. | `lib/friends/limits.ts`, `lib/actions/friends.actions.ts` |

Known limits:

- A name with a full stop run into the next word in Latin letters ("J.Smith") is refused, because
  it cannot be told from a web address ("x.com"); the sentence says to put a space after the full
  stop. Initials run together in other scripts are taken.
- A friend request still answers a hit and a miss differently, and the Sent list shows who was
  reached. The hourly counter bounds the lookups; it does not end them. Ending them means a
  request that looks the same whether or not the address has an account, which changes how
  friends are added and is not decided here.
- Email verification stays off, so the daily brief can still go to an address its owner never
  confirmed. Each brief now carries a one-click way out (`docs/specs/2026-11-18-account-basics.md`).

## 3. A lighter first load

Measured on production on 2026-11-17, every signed-in page sent about 470 KB of compressed
JavaScript before it could be used. Three things in it are needed only when asked for:

- **The chat panel and its markdown stack** load when the launcher is pressed
  (`components/chat/ChatWidget.tsx`; done with the page-read work).
- **The glossary** (120 KB of definitions) came in by two routes: ⌘K's Learn rows, and one robot
  tip that counted the terms. The palette now fetches it at its trigger's first hover, focus or
  touch and when it opens; the tip no longer counts.
- `lib/shell/__tests__/first-load.test.ts` walks the layouts' static imports into the client
  files and fails when the glossary, the chat panel, the markdown stack or three.js is reached
  without being asked for.

Not measured after the change: the figure on production. The test holds the imports; the size
is read off the next deploy.

## 4. AGENTS.md by feature

`AGENTS.md` had grown to 181 KB, and `CLAUDE.md` imports it whole into every session and every
subagent. Its feature sections now live one file each in `.claude/rules/`, under a `paths:` list,
and Claude Code loads a file the first time one of the files it names is opened. `AGENTS.md`
keeps the commands, the shared contracts, the owner's surfaces, the invariants and an index
(17 KB). `lib/__tests__/docs-map.test.ts` reads the rule files too, and holds each under the
40,000 characters that load on demand.

Three things were checked by experiment in a live session, because the documentation does not
say: a rule added to the project is found without a restart; a glob matches the same path inside
a worktree of the checkout the session started in; and `app/(play)/**` matches with its
parentheses written as they are. One limit follows from the second: the rules that apply are the
starting checkout's, so a session started in a stale checkout reads stale contracts.

## Review

One reviewer read the nine small fixes as a branch: eleven findings, four of them worth fixing
before anyone used it. All four came from two fixes meeting each other or from a rule drawn too
tight, and each was changed:

- The new search count answered a refused search as an empty list, which the palette read as
  "No stocks found" and which made the topic row Enter's again: the very thing the palette fix
  closed. A search that did not answer is now `null`, the boxes say so, and the topic row goes on
  waiting. The count itself was reachable by typing one long query slowly; it became a generous
  minute and a tight hour.
- The topic row, moved below the stocks, was out of sight after six of them in a list with no
  scrollbar. It is pinned to the list's foot.
- The name rule refused real names: a comma, brackets, a numeral, an en dash, the joiners Persian
  and Sinhala are typed with, and initials in scripts where an initial is a syllable.
- Smaller ones taken with them: an Enter pressed before the search answered was dropped; the
  order counter could throw past both tickets; a searched stock was saved under Finnhub's
  capitals; the chart's place had no height until the embed's frame arrived, so the panels under
  the desk jumped (the height is now on the embed's container, where the stylesheet lets it hold);
  sign-in still wrote an address of any length into a counter's key.

Found while checking those, and fixed with them: the Markets page moved for a second after it
loaded. The ticker tape had no height until its frame came and then pushed the desk down by 58
or 84 px; the chart's place was not held either, because the stylesheet overrode the height it was
given. Both are held from the first paint now. Two browser suites had been pressing a tab and a
menu row in that second; they press when the page is still, and until it answers.

Not changed: a page or a glossary term that matches the text stands before the stocks, as it did
before this work, so SPY and Enter opens the glossary's benchmark entry, and T opens Home. Putting
an exact ticker first would send "act" to a stock instead of the Activity page. It is a choice
between two readings of a short word, and it is left as it was.

## Verification

- `npm run check`: lint, `tsc --noEmit` and 4,479 unit tests; `npm run build:check` compiles.
- Every browser suite on the final code (`integrate/first-ten@8e1ee4a`, 2026-11-18): 29 suites,
  2,260 checks passed and one failed. The one was in the poker night modes suite, which this work
  does not touch: a menu was read a moment before the page's view caught up with the document.
  That check now waits for the view, and the suite passed alone afterwards (325 checks).
- Run more than once, because presses made in a page's first second proved unreliable:
  `qa-steady-prices` five times in a row (53 checks each, one press each), `qa-trading` five
  times (105 each), `qa-auth` three.
- Not exercised: the first-load size on production (the test holds the imports; the figure is
  read off the next deploy), and a real welcome email under the new name rule.
