# Browser QA

End-to-end checks against a throwaway database. Nothing here needs a `.env`, an API key or a
real MongoDB: the harness starts an in-memory MongoDB, runs the dev server with inline
environment variables beside the Inngest dev server, and drives Google Chrome with Playwright.

Unit tests (`npm test`) cover the pure modules. This is how the database-bound parts — server
actions, Mongoose reads, the pages themselves — get exercised.

## One-time setup

```bash
cd scripts/qa
npm ci                 # mongodb-memory-server, playwright, jiti … (kept out of the root package.json on purpose)
```

Google Chrome must be installed; the suites use `channel: 'chrome'`, so no browser download is
needed.

## Run

From the repo root, with ports 3000, 27117 and 8288 free:

```bash
npm run qa                         # every suite, in run.sh's order (about 5 minutes)
npm run qa -- learn income         # just these; "qa-" and ".mjs" are optional
npm run qa -- --up                 # start the harness and keep it up until Ctrl-C
npm run qa -- --up topics          # run a suite, then keep the harness up to poke at what it left
```

`run.sh` starts the harness — MongoDB on :27117, `next dev` on :3000 (with
`SIGN_UP_CLIENT_LIMIT=1000`, since every suite signs up its own users from localhost), the
Inngest dev server on :8288 — runs the suites one after another, stops everything it started and
prints one line per suite. Each suite prints one `PASS`/`FAIL` line per check and exits non-zero
when any fails. Logs land in `output/logs/` (`<suite>.log`, the harness's `_dev.log`,
`_mongo.log`, `_inngest.log`, and `SUMMARY`); screenshots in one folder per suite
(`output/topics/` for `qa-topics`).

With the harness up (`--up`), a single suite also runs on its own: `node qa-topics.mjs` from
`scripts/qa`. `QA_BASE_URL`, `QA_MONGO_URL` and `QA_INNGEST_URL` point the suites elsewhere.

## Suites

All suites share one database, so each scopes its assertions to the users it signs up; the shared
setup (where the harness is, `check`/`summary`, `signUp`) is `lib.mjs`. A full run takes them in
`run.sh`'s order, which matters where a suite says so below.

| Suite | Feature | What it seeds | Needs |
|---|---|---|---|
| `qa-auth` | Sign-up, sign-in and password reset: the reset link opens logged out, the token is single-use and revokes old sessions, the per-address and per-client sign-in limits, the per-client sign-up limit, no session token handed to the page. Also the market-status badge on /trade and /watchlist, the /markets tab in the URL, /history's headings | `ratelimits` counters past their limits; removes every `signin:*`/`signup:*` row at the end | reads the reset token out of Mongo (no SMTP); runs first, so no later sign-in starts inside its window |
| `qa-styles` | Styles and the page frame: the warning token and its utility, no phantom scroll on six pages, a focus ring on the order ticket, TradingView embeds under a dark palette. Also the global and in-app 404s and a keyless symbol no strategy watches | a theme cookie | the TradingView embed script (network) |
| `qa-shell` | The app shell: the icon rail (eight sections, tooltips, the Portfolio and News hover cards), a section's tabs, ⌘K by keyboard and by page name, the mobile drawer and its Logout, and the signed-out landing page at `/` (its sign-up button, its theme preview). Also friends: "sent 3 days ago", the friend-request dot on the avatar | a second user; a friend request backdated three days | — |
| `qa-home` | Home: a new account's greeting, account total, topics and first-week step; the step moving on as rows appear and following the market once the list is hidden; My dashboard as a tab; the old `/?customize=1` link; a phone width | one user trade; the checklist's dismissal stamp | — |
| `qa-chat` | The chat panel: error recovery, a conversation that survives closing, the read-only portfolio tool, model markdown rendered safely (on /brain's rationale). Also the confirm dialogs of Reset Account and Reset to default. Also the robot launcher: bottom-right at 1440 with its SVG mascot, no tip in the first seconds, then — in a browser context of its own under Playwright's fake clock — a tip on /topics whose Try it prefills the composer without sending, a different second tip, dismiss, no repeat across a reload, a tip under the pointer outliving its time and leaving once the pointer has, and silence off the topics pages | today's global Navigator rationale as markdown (`suggestionsets`, upserted) | no Gemini key: a failure is forced by aborting `/api/chat`; installs Playwright's clock in a second context (so the chat checks above run on real time) |
| `qa-topics-refresh` | When topics fetch: the six defaults seeded once and unfollowing sticking, /topics fetching at most once per view, Refresh now and its cooldown. Also unpriced holdings labelled on /portfolio, /trade, the sidebar and the dashboard | holdings with no quote | the Inngest dev server for the queued path; without it, the dead-queue path |
| `qa-trading` | Paper trading: the ticket (presets, checks, note, the cash interest line), deep links, the `source` chip, the CSV export, "Main account" and the account comparison (a layout with the old `strategy-comparison` id), the Activity page's (/history) trades from inception. Also the brain's rows drilling into their evidence | trades before and after inception, a watchlist, a brain entity, a ^IRX row (removed at the end) | answers the ticket's `getQuote` with a fixed price (no quote provider) |
| `qa-topics` | Followed topics: six preinstalled, a topic page's live fetch, the rail's News card (a seeded headline, "since you last looked", the capped "99+", the dot that lights for an article the reader has not looked at and clears on opening the topics index or /news without a reload, on the rail and in the mobile drawer), ⌘K follow, refresh, edit and delete; the manage view (`/topics?edit=1`): an immediate remove and its Undo, two starters followed at once, Add your own staying on the page, the 16-topic cap. Also the topics-first dashboard and widget library, the settings Topics section, the chat's topic suggestion, the theme picker's hover sweep | topic articles from "QA Feed Wire" (a hundred into a default topic for the News card; removed before and after); seven cap-filler topics (removed after) | Google News reachable for the live fetch |
| `qa-news-feed` | The personal news feed: default top stories, every control saved and reloaded, the four surfaces that follow it, a followed topic in the feed, reset; the morning briefing rendered as text with its citations, on /news, Home and in the rail's News card, and through the outlet filter (every cited outlet hidden: absent on the page and in the card) | a topic article from "QA Topic Wire"; one `marketbriefings` document (removed at the end) | Google News for the headline counts (NOTEs, not checks) |
| `qa-strategies` | The quant strategies: leaderboard and detail pages empty then seeded, the signal board, trade reasons, simulated record, follow, the what-if lab, the job's own what-if store, the stock page's "What the rules see", the CSV export | the system-owned strategy accounts, states, runs, a backtest and its grid (the daily job never runs here) | `jiti`, to call the job's store through Mongoose on the harness database |
| `qa-income` | Brokerage income: interest on idle cash, dividends, the back-credit; the panel's receipts held to the stored rows to the cent; reset | an account with trades across two ex-dates, ^IRX/SPY/AAPL bars with coverage, legacy snapshots | the Inngest dev server — it fires the real nightly job, scoped to its account; without it the job checks are skipped and noted |
| `qa-learn` | The learn surfaces: First-week checklist, the /learn hub (the beginner course: a lesson quoting the glossary, its "Mark as done" stamp; the glossary, today and strategies tabs; an old `/learn#term` link) and ⌘K glossary, "What the rule saw", "Read this board", Ask in chat, Today's lesson, Time in the market, /brain's legend, badges, "since thesis" and decoded Navigator decisions | wipes and reseeds `strategyruns`; accounts, trades, snapshots, topics, news, a thesis, Navigator decisions; snapshots and restores the SPY and ^IRX bars it replaces | runs after `qa-strategies` |
| `qa-learn-account` | Learning from your own account on /portfolio: empty states, the dated drawdown, the return bridge, the risk lens, buy notes, fill receipts, /trade's Last fill, income receipts, Luck or skill against numbers computed in the script, Trading habits | snapshots, trades and income on its account; edge closes for the 40 large caps (removed at the end, ^IRX points and other suites' dividends put back) | `jiti`, for the app's NYSE calendar |
| `qa-games` | The games: today's puzzle answered wrong, unreadably, with a hint and right (the answer read from the bank through jiti — the page never holds it); the streak on Home, the hub, Learn › Today and the `daily-puzzle` widget; a streak carried from yesterday and reset after a missed day; an archive solve and a revealed solution counting nothing; the phone width; the arithmetic sprint on Playwright's fake clock (a record, then a lower round), a custom round under its own key, the interview mode by keys 1–5 with ⌘K still opening search; Kelly coin, market making and Guess the correlation, each kept at the score the server replays | `puzzlesolves` rows for its users (yesterday's and older solves); a dashboard layout; `gamerounds` from its rounds | `jiti`, for the puzzle schedule and its answers |
| `qa-poker` | The poker solver, worked out in the browser: the Web Worker and the page-thread engine (`?engine=main`) each giving AsAh against KsKh exactly (1,410,336 wins and 9,308 ties over 1,712,304 boards); a flop spot and a seeded Monte Carlo run equal to the same modules in Node; Stop within a second; the range editor by text, click, keyboard and Top x%; a tab's result kept across a switch; push or fold at 10 bb equal to a Node solve, 1 bb playing everything, an ante widening both seats; pot odds; the river's polarized example bluffing and calling at its closed form on both engines, its tree browsed by breadcrumb, a realistic spot under 0.3% of the pot; a phone's width and the no-advice list over each tab | nothing: the solver stores nothing | `jiti`, for the solvers and the preflop table in Node |
| `qa-poker-night` | Poker night in two parts. The table's API: the gates (426 without `X-PN-Protocol`, 401 with no identity, 403 from another origin, 400 for a body that is not JSON, over 2 KiB or off its schema), `/play/CODE` open to a browser with no session while `/players` is not; guests joining by the link with the app's own `aero-pn-guest` cookie (httpOnly, Lax, path /) and never a better-auth user or session, a blank name sitting as the avatar's face, a return answered as it was; a hand to a showdown whose winners `evaluateCards` confirms from the stored holes, and every response on every street free of the deck, an identity and any other seat's unshown hole; an all-in run-out dealt by ticks alone 1.5 s a street and the next deal on time; a timeout a tick applies only past the grace and the slack; a repeated `actionId`; a double rebuy; a removal and "let back in", the removed player's poll and move refused; a seat race; a double-tapped and a retried cookie-less join making one guest and one row; history, log and bank; a state a newer deploy wrote answered 426 reload by a poll, a drawer and a move, the table left open; a preview room not found here, every counter and index keyed by env; an unknown code on a move and a seat-passed tick each spending a miss; a burst with no identity draining an address's bucket while a seated player there still acts; 200 tight polls answered 429 by the in-memory bucket with no Mongo write; the night's end and the host's result row; the no-advice list over the copy behind every code the API answered with. Then the table in a browser (P3): `/poker-night` lighting Learn's tab and `/games` showing its card; Quick start landing on `/play/CODE` with the invite open, the link `${BASE}/play/CODE` on the clipboard, a QR of `currentColor` rects, none of the app's shell, `[data-pn-mode="polling"]`; the lower-case code redirected and an unknown one answered 404 with the not-found copy; guests sitting in one tap from the join card (a typed name at 1440 px, a blank one on a 390 × 844 touch phone, a third under reduced motion), a reload and a second tab coming back as the same seat, and that tab, hidden for certain and closed, leaving the player here; two hands played by clicking the action bar of whoever's turn it is — on every street no page answer, page HTML or RSC payload carrying the deck or another seat's unshown hole and the other seats' cards backs, at the showdown the shown cards Mongo's, the winners, the five cards that play and the banner's hand name worked out again, the animation hooks (deal, chips out, fold, sweep, board, reveal, win) firing and no chip flight moving under reduced motion; an open Bank (hand 1) and the Leave dialog (hand 2) closing when the phone's turn arrives, the focus on the action bar; the phone layout at 390 and 320 px (plates on screen and apart, names of up to nine characters whole, flags at least 10 px, the action bar shown, every button 44 px, no sideways scroll), the raise panel there never over the phone's cards or seconds, Enter on its Back sending nothing and "F" in the top bar folding nothing; the host's fold turning their cards face down (the card's pixels at the turn's end are its back); the top bar saying a pause set mid-hand waits for the hand; shown hands, the banner and bottom seats' tags covering no name, stack or line under the board; My look's shortcuts switch; a double-clicked raise and a double-clicked rebuy each landing once, every bank's nets and footer within 5 s; the host's removal (a tap doing nothing, a 2.2 s press removing at the hand's end, the dialog's words matching a player in the hand, the removed guest told with "Check again" and the way to the lobby, their screen finding "Let back in" by itself and letting them sit again); the night's end seen as the summary by every context; the no-advice list over every screen and drawer; screenshots `ui-*-1440.png` and `ui-*-390.png` | a signed-up host's room through the app's own `insertRoom` (and one under `preview`); a past deadline and, when nobody lost the all-in, a stack moved in Mongo, each moving `seq` on; the UI's table through Quick start, with one stack moved in Mongo for the rebuy; removes every `poker-night:*` counter before and after | `jiti`, for the room store, the betting rules and the evaluator |
| `qa-chat-tutor` | The chat as tutor: the three rate-limit windows, the usage caption read from the same `ratelimits` rows without spending one, Ask in chat's prefill, the `explainTerm` and `getQuantStrategies` chips from stubbed streams | `ratelimits` rows for its user and the shared budget | no Gemini key (the tutor's answers are checked by hand) |
| `qa-email` | Every email, without a mail server: the daily brief's once-a-day claim (a second send the same day finds the day taken, a released day is claimed again, a test send to one reader takes none, a brief the model could not write goes out as the fallback); then the brief as written and as the fallback, the welcome and the password reset rendered from `lib/email/__fixtures__/digest.ts` into `output/email/` and opened at 680 px and 375 px, light and dark — no sideways scroll, every link absolute http(s), no placeholder, each under Gmail's 102 KB clip. `npm run email:preview` runs it alone, skipping the claim checks with a note when no harness database answers | `digestsends` rows for its users | `jiti`, for the email modules |

The daily digest has no suite: it sends only after a news pull, a model's summary and SMTP, so
its topics and lesson sections are pure builders covered by unit tests instead.

## Screenshots

- **README images** — `npm run qa -- screenshots` writes `output/screenshots/*.png`; copy the
  ones the README uses into `docs/screenshots/`.
- **Visual sweep** — `npm run qa -- visual-sweep` screenshots every page, signed out and signed
  in, at 1440 px and 390 px into `output/sweep/`. For a change meant to look identical: run it on
  the base, move `output/sweep` aside, run it on the change, then compare:

  ```bash
  node scripts/qa/visual-diff.mjs before/ scripts/qa/output/sweep/ [--out diffs/] [--max 0.1]
  ```

  It prints the share of changed pixels per image, worst first, writes a diff image beside each
  changed one and exits 1 when any image differs by more than `--max` percent or changed size.

  The sweep runs under the default theme. `QA_THEME=<palette>:<style> npm run qa -- visual-sweep`
  (say `nord:brutalist`) runs it under that one instead, into `output/sweep-<palette>-<style>/` —
  a change to a visual style is checked one style at a time.

## Windows

`npm run qa` runs from Git Bash. Git Bash has no `pgrep`, and its `kill` does not reach the node,
mongod and inngest processes the harness starts, so on Windows `run.sh` stops whatever listens on
its three ports with `taskkill` when it exits.
