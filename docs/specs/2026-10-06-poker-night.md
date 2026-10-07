# Poker night: a hold'em table you share by link

**Status:** In progress on branch `feat/poker-night`. Phase 1 (the pure engine) and phase 2 (the
room server and its API) of 8 are written and tested. The playable table and lobby, live updates
over Ably, looks and avatars, emotes and the tracker's polish follow, each merged once its checks
and browser QA pass.

## Why

The owner asked for a poker game to play online with friends: start a table, get a link, and
friends open it and play. It should feel like a game night — quick to join and deeply
customizable, with backgrounds, avatars and emotes — and it should keep track of buy-ins.

Answers to the questions this raised:
- **Who can join:** anyone with the link. A guest types a name, or leaves it blank, gets an avatar
  already rolled and sits down without signing up. Players with an account also keep their
  history and looks. Only signed-in users start tables.
- **Live updates:** Ably on its free tier, with token auth. The server holds the rules, the deck
  and the hole cards. Without a key — local development, the QA harness, CI, preview builds or an
  Ably failure — the table polls a no-store route instead, so nothing depends on the service.
- **Chips:** play chips only, with no cash value. A tracker records every buy-in, rebuy, top-up and
  cash-out, each stack and each player's net for the night.
- **Looks:** built-in sets only: scenes, felts, card backs, an emoji avatar builder and emotes. No
  uploads and no file storage, so display names are the only thing to moderate.
- **Removing a player:** the host can, deliberately. Host drawer, the player's row, More, Remove
  from table, then a dialog whose Remove button is pressed and held for about two seconds; a tap
  does nothing and no name is typed. It takes effect when the hand ends: the player's chips are
  cashed out, the tracker says "Removed by host", and they cannot come back unless the host lets
  them in again.
- **Animations:** the winning hand revealed with the five cards that play lifted, chips flying to
  the winner or winners, a fold, chips going out to the bet line, and the street's bets sweeping
  into the pot. All are CSS keyframes, and reduced motion shows each final state in place.
- **Shipping:** every phase merges into `main` and deploys once its checks and browser QA pass;
  anything failing stops the line.

Where the design left a choice, these are the defaults, and the owner can change any of them:
- The host presses Deal for the first hand; after that, hands deal by themselves.
- Every live hand is shown at a showdown, with no mucking, and any dealt player may show their
  cards during the pause.
- Rebuys are automatic unless the host turns them off or approves each one.
- A player who checked and then faces an opening all-in below the minimum bet may raise.
- A seated account holder may take over as host once the host has been away ten minutes.
- A table closes after 12 hours idle and is kept for seven days. Preview builds never get the Ably
  key.

## Where things go

- **The feature:** poker night is its own feature in every layer, beside poker (the solver). It
  reuses the solver's cards and hand evaluator, `lib/poker/cards.ts` and `lib/poker/evaluator.ts`,
  and changes neither.
- **The pages (later phases):** the lobby at /poker-night, a fourth page of the Learn section, and
  the table at /play/CODE, in a route group of its own: full screen, no app shell, open to guests.
  Table traffic goes through route handlers, not server actions, which run one at a time per
  client and change their ids on every deploy.
- **The engine (this phase)** is `lib/poker-night/`, pure except `shuffle.ts`:
  - `types.ts` and `config.ts`: the state, the limits, defaults and timing, and the zod schemas
    the host's settings are checked against;
  - `deck.ts` and `shuffle.ts`: the deal's layout and a shuffle that takes its randomness as an
    argument; the server's crypto source;
  - `seats.ts`, `betting.ts`, `pots.ts`, `showdown.ts` and `hand-name.ts`: the rules of a hand;
  - `ledger.ts`: the bank;
  - `engine.ts` and `clock.ts`: the reducer and the lazy clock;
  - `migrate.ts`: reading a stored state back;
  - `views.ts` and `view-types.ts`: what a browser is sent.
- **The room (phase 2)**, pure and in `lib/poker-night/` too:
  - `room.ts`: the table plus who is at it — one row per account or guest, each with a random
    11-character pid, the only handle a browser sees — and its steps: joining, the room's own
    actions (a new name or look, "Let back in", handing over or claiming the host role), the engine's
    actions with the removal's ban, the clock, the idle close; and the views of a room;
  - `mutation.ts`: what one attempt of the store's write loop does with a room it has read;
  - `room-doc.ts`: the room document both ways, and the cheap head every request reads first;
  - `input.ts`, `http.ts`, `limits.ts`, `bucket.ts`, `env.ts`, `code.ts`, `names.ts`, `avatar.ts`,
    `links.ts` and `results.ts`: the request bodies, the error codes and request checks, every limit,
    the in-memory rate limit, the deployment and the kill switch, the share code, display names,
    avatars, the share link and what an account's result row holds.
- **The server (phase 2)**, server-only: `store.ts` (every room read and write, and `mutateRoom`,
  the one way a table moves), `hands-store.ts` (history), `results-store.ts` (accounts' nights),
  `identity.ts` (who is asking), `guest-token.ts` (the guest cookie), `pass.ts` (the seat pass) and
  `route-kit.ts` (the checks every route runs). The models are `database/models/poker-room.model.ts`,
  `poker-hand.model.ts` and `poker-result.model.ts`. The routes are `state`, `detail`, `join`,
  `action` and `tick` under `app/api/poker-night/[code]/`, and `proxy.ts` leaves `/play/CODE` open
  to guests (the slash keeps `/play` and `/players` gated).
- **The copy** is `lib/learn/copy/poker-night.ts`: the hand names, the log's lines, the refusals,
  every error code and the join card's words so far.

## The room server

**Who is asking.** An account, when the request carries a session; otherwise a guest, by the app's
own signed cookie (`aero-pn-guest`, `__Host-` over HTTPS, httpOnly, SameSite=Lax so a tap on the
link in a chat app still carries it, 180 days, re-signed after 30). Guests are never accounts: an
anonymous better-auth user would open every page of the app and the daily email to them. Only a
join mints the cookie. A session read that fails is a 503, never a quiet guest. A ten-minute seat
pass, signed by the server and sent back in `X-PN-Pass`, lets the polls, the ticks and the detail
reads skip the session's database read (past half its life it is answered with a fresh one); a
join or a move always reads the identity in full. A join carries an id the client makes once and
reuses on a retry, and a browser with no identity is given the guest that id names (an HMAC of it),
so a double tap or a retry after a lost answer is one guest and one row.

**Every request**, cheapest refusal first: the kill switch (`POKER_NIGHT_ENABLED=false`); the
`X-PN-Protocol` header (a custom header, so a cross-site page's request fails its preflight, and a
mismatch tells an old page to reload); for a POST, the same origin, JSON and at most 2 KiB, read
from the stream and given up past the cap; an in-memory token bucket per player (the one a valid
seat pass names, on every route, so nobody sharing the address can spend a seated player's budget;
else per address) ahead of any database call; the code; the pass or the identity; the room's head,
one projected read; the player's row. Mongo counters are spent only on a join (per address, per
room) and on unknown codes, on every route, so no route checks codes faster than the miss counter
allows.

**One way a table moves.** `mutateRoom` reads the room, plans one attempt and writes it behind a
compare-and-set on `seq`, five attempts with a jittered backoff before answering busy. A request
names its action with an id the client reuses on a retry; the room keeps the last 64 it applied,
so a double tap or a retried request is one action. The clock runs to the moment the request
arrived, then the step, then the clock to now, so a move made in time is never beaten by a timeout
that fell due while it waited in the loop. Only the actor's own request times their turn out at the
turn's own time; any other request (the leader's tick, another player's move, a join) waits a
second's slack longer, so it cannot reach the compare-and-set first and time out a move that
arrived in time and is still on its way. A refused step still lets the clock's own changes commit.
A room idle twelve hours closes on its next write. A stored state this deploy cannot read closes
the room — unless a newer deploy wrote it, when every route, a read included, tells the page to
reload instead. Presence
beats and, later, emotes and realtime failures are written beside the game, never through it, so
they never cost a move its race. After the response, the completed hands go to history and the
accounts' totals to their result rows.

**Nothing on a read writes.** The clock moves only on a POST: a move, a join, or the tick the clock
leader's page sends when something falls due. A poll, a detail read and the page's render never
write, so a link preview, a prefetch or a loop of polls cannot deal a hand.

**Removal.** The host's removal is the engine's `kick` and the room's ban: the removed identity
(an account, or a guest cookie — and an account still carrying that guest's cookie) is refused on
every join and request — a move is checked against the room it is applied to, so a removal that
lands while the move is on its way still stops it — and its row is kept and marked removed. "Let
back in" lifts both, and the player returns as the row they were.

**People who are gone never fill a room.** A room keeps at most 30 rows. A join first prunes
watchers not heard from in two minutes and, at the bound, lets go of departed guests' rows that hold
nothing: no seat, no request, no place in the hand, not heard from in two minutes, and a ledger row
that is settled (never dealt a hand, every chip bought cashed out again), which goes with it. A
removed guest's row may go too; its key stays on the room's list (the newest 32 removals are kept),
so the removal holds. Account rows, and guests who played, stay for the night.

**Every query carries the deployment.** A Vercel preview shares production's database, so every
room, hand and result query and index, every rate-limit key and, later, every realtime channel
names the env; a preview can never open a production table.

**Names and looks travel apart.** The people part — every row's name and look, and who was removed —
rides beside the table in responses, versioned by `peopleV`, which moves only when one of them
does; the realtime message leaves it out and stays within its budget.

## The lobby (phase 3)

**Where.** /poker-night is a page of the Learn section (`app/(root)/poker-night/page.tsx`), for
signed-in readers only: only an account starts a table. It makes one read,
`lib/poker-night/lobby-store.getLobbyView`, shaped by the pure `lib/poker-night/lobby.ts`, and a
section with nothing in it is not drawn. The /games hub carries a card for it, with no records:
poker night keeps no score.

**What it shows**, phone first, in this order:
- **Host a table.** "Start a table" opens one with the defaults in one tap and takes the host to
  /play/CODE?invite=1, where the invite is open. "Set it up first" holds a form: the table's name
  ("Ana's poker night" to start), the blinds, the starting chips (both ends of the range; the host
  can widen it at the table), the seats (fixed once the table opens), the rebuy policy, the turn
  timer and whether friends see the table, off by default. Every choice the form offers is within
  the config's limits, and the config is checked before it is sent and again by the action. At
  three open tables the button gives way to the sentence that says so.
- **Join with a code**, typed in any case, with spaces or dashes, opened as /play/CODE.
- **Your open tables**, with the way back in, Copy link and "End the night" after a confirmation.
- **Friends' tables**: open tables an accepted friend chose to show.
- **Recent nights**: the account's results, hands and net chips, a night still running marked so,
  and a link to the table while the room is kept (a closed table shows its summary there).
- **My look**: the name and the rolled look the account sits down with from now on. A browser
  that played as a guest keeps its name and look; when they differ from the account's, "Save to my
  account" takes them over.

**Open, idle, closed.** A table counts as open while it is not closed and something was written in
the last twelve hours. One that went idle closes on its next write, so the lobby already counts it
as closed: it is neither listed nor counted under the three-table cap, which reads by the same
filter. Two creates at the same moment may both pass the cap: one table over, accepted. A night is
finished once its table closed or went idle (a room the week's expiry deletes before it closes
never writes "closed").

**The lobby's writes** are server actions, used by the lobby only (the table talks to its routes):
`createPokerNight` (a rate limit of ten an hour, the cap, then the room with the host at seat 0
with the chip cap, under their saved name and look, else their first name and the look their
account id rolls), `closePokerNight` (the host's "end", through the same compare-and-set as every
move) and `savePokerNightProfile` (`user-preferences.pokerNight`, a sub-document with no defaults).

## Engine rules

No-limit Texas hold'em at 2 to 9 seats, fixed when the table is made, for integer play chips.

**One reducer.** `engine.reduce(state, action)` is the only way a table changes. It is pure: the
time, the deck and the draw that seats the first big blind arrive inside the action, so a step
replays exactly. It clones the state once, never touches its input, and returns the same state for
a step that changes nothing. A refusal names its reason (`stale`, `not-your-turn`,
`below-min-raise`, `rebuys-off` and sixteen more).

**The clock.** Nothing on the server wakes on a timer. Three things fall due: the actor's time
running out (two seconds of grace after the deadline the player sees, and a second's slack more for any
request but the actor's own), the next street of an
all-in run-out (every 1.5 seconds), and the next deal. Every request runs the clock up to the
moment it arrived, and the client chosen as clock leader posts a tick when something falls due.
Each event is applied at the moment it runs, so a table nobody watched picks up in real time
instead of playing hands no one saw. A new hand takes one deck and one draw from a `DeckSource`:
`shuffle.ts`'s `node:crypto` source in play, a seeded or stacked one in tests.

**Positions.** The big blind always moves on to the next eligible seat; the first one is drawn.
The small blind is the eligible seat before it and the button the one before that. Heads-up, the
button posts the small blind, acts first before the flop and last after it. Nobody skips the big
blind by sitting out at the right moment. The known cost: when the last big blind leaves, the seat
before it can post the small blind twice running, half a big blind.

**Posting.** Antes are paid first, as dead money; then the blinds, live. The bet to call is the big
blind even when the big blind is short. A seat that sat down or missed hands posts one big blind
when next dealt in — in the small blind it posts a full big blind instead, in the big blind just the
blind — and keeps its option. A table starting fresh posts nothing extra.

**Betting.**
- A player owes the current bet less their street bet, capped at what a live opponent can still
  match: the small blind facing a short all-in big blind calls only the difference.
- The minimum bet is the big blind, and the minimum raise is to the current bet plus the last full
  increment; only a full raise grows the increment.
- A short all-in reopens the betting for nobody who has acted, unless the short all-ins since their
  move add up to a full raise (the TDA rule). The one exception is the friendlier reading: a player
  who checked and then faces an opening all-in below the minimum bet may raise.
- No raise is offered when every opponent is all in.
- Pre-actions (check/fold, check, call this amount, call any) are kept on the server, resolved when
  their owner's turn comes, and cleared at every street.
- When time runs out the player checks if that is free and folds otherwise. Enough timeouts in a
  row (the host's choice, 2 by default) make the player away: an away player checks or folds at
  once and is sat out at the next deal, until they say they are back.
- A move is refused as stale when the turn has moved on, or when it arrives after the deadline's
  grace.

**The end of a hand.** The uncalled bet goes back to its owner, even a folded one. One player left
wins without showing. With two or more all in short of the river, every live hand is turned face up
and the board runs out a street at a time. Pots are built by contribution level: folded chips count,
folded seats cannot win. Each pot goes to the strongest eligible hands, the odd chip to the first
winner left of the button. Every live hand shows at a showdown, and the next deal waits for the
longer of the host's pause and the reveal: three seconds plus 1.2 for each side pot after a
showdown, 1.5 seconds otherwise.

**Leaving and removal.** A player who leaves, or is removed, while facing a bet folds at once.
Otherwise they stay in the hand, away, so the clock checks or folds for them, and are cashed out
when it completes; a buy that was waiting is dropped. Between hands they are cashed out at once.
Their row in the bank stays for the night.

**Buy-ins and the bank.** The first seat of the night takes a buy-in between the table's minimum
and its cap. Sitting down again after leaving is a rebuy, under the table's policy: off refuses it,
approve seats the player with no chips and a request for the host. A rebuy at zero or a top-up
above it must leave the stack between the minimum and the cap, within the rebuy limit if there is
one. Chips that arrive during a hand wait and land when it completes. Chips are recorded as bought
only when they land, so one sum always holds:

    Σ stacks + Σ committed to a live hand + Σ cashed out = Σ bought

A player's net is their chips plus what they cashed out less what they bought, where chips count
what they have in a live pot, so the net stays steady while they bet.

**The host.** Deal (the first hand), pause (the hand in play finishes, no new one starts), resume,
end (the table closes after the live hand), config (checked whole, from the next hand), settings
such as the scene and the lock (at once), approve or decline a rebuy, and remove a player. An idle
table is closed by force: a live hand is called off and every chip in it goes back.

**Limits and defaults.** Small blind at least 1, big blind at most 100,000, an ante up to the big
blind; buy-ins between one big blind and the lower of 500 big blinds and 10 million; a turn of 15
to 120 seconds; a pause of 3 to 15 seconds. The defaults: 8 seats, blinds 10/20, 2,000 chips each,
a 30-second turn, rebuys automatic.

**What leaves the server.** Only the projections in `views.ts`, copied field by field: the deck,
other players' hole cards and pre-actions, and unshown cards in history never leave. The client's
types in `view-types.ts` are declared on their own and have no deck. The client offers moves with
the server's own `legalFor`, over a snapshot rebuilt from the view.

**Storage.** One state per table, plain JSON throughout: no undefined, no Map or Set, every chip a
safe integer. To keep the room document small, a hand's log and a ledger row's events are stored as
number tuples, and the log keeps its latest 200 lines. The wire view is slimmer than first drawn: a
seat's number is its place in the list, the bank sends what each player bought and cashed out and
the client derives the rest, and a paid pot carries its amount, winners and shares but not who
could have won it. Measured on the
heaviest table the engine can build, the state takes at most 16,000 bytes and the wire view 4,500;
the room document around it, with thirty rows of the longest names, at most 27,000 bytes for what
each write reads and 30,000 with the emotes.
A stored field never changes meaning without bumping `STATE_VERSION` and adding a step to
`migrate.ts`.

## Checks

Every engine module is unit-tested in `lib/poker-night/__tests__/`:
- **deck, shuffle:** the deal's layout; every random path of a four-card shuffle gives a different
  order; the crypto source deals permutations.
- **seats, betting:** positions as the big blind moves, heads-up, three players down to two, the
  double small blind; minimum raises, short all-ins reopening and not, capped calls, the big
  blind's option, every pre-action, the deadline's grace.
- **pots, hand-name:** named side-pot cases and 10,000 seeded inputs against a chip-by-chip
  reference; every hand name, and 200,000 seeded hands read back losslessly with their five cards
  that play.
- **engine, ledger, clock:** stacked decks through walks, check-downs, odd chips, side pots,
  run-outs, leaving and removal mid-hand, posting to play, timeouts, every rebuy policy and the
  host's operations; the bank's figures, including a player who leaves and sits down again; one
  clock event at a time.
- **views, migrate, budget:** nothing private in any projection, and the client's legal moves equal
  the server's; a stored state read back; the byte budgets.
- **simulate:** 100 seeded nights of up to 60 hands at random tables, with random legal moves among
  players sitting down, leaving, being removed, buying, pausing, changing the config, pre-acting
  and showing. After every step the chips add up, no card is dealt twice, the player on the clock
  has to act and is offered exactly what a replay of the street's log allows; at every completed
  hand the pots match the chip-by-chip reference and go to the strongest hands, and the state
  survives JSON. The big blind never lands on one player twice running, and each night replays to
  the same state. `PN_SIM_SEEDS=1000` runs a thousand nights (about three minutes).
- **room, mutation, room-doc:** joining (new, returning, moved on, watching, locked, full, removed),
  the caps with stale watchers pruned, names deduped, removal and letting back in, renames between
  hands, the host role, `peopleV` moving exactly when the people do; every branch of one write
  attempt with a stacked deck (a repeat, the idle close, a move in time against a timeout, a refusal
  whose clock still moves, nothing to write); the document read back as the room it was made from,
  and a commit writing nothing out of band.
- **input, http, limits, bucket, env, code, names, avatar, links, results, guest-token, pass:** strict
  bodies; every error code with its status and sentence; the same-origin matrix and the capped body
  read; the buckets on an injected clock; the guest cookie and the seat pass refusing every
  tampered, expired or foreign token.
- **lobby:** empty sections hidden; closed and idle tables never listed and never under the cap;
  friends' tables without the reader's own; a night finished once closed or idle, and linked while
  its room is kept; no account id in what the page gets; every choice of the start form a config
  `checkConfig` accepts; the name and look an account starts from, and what is read of the look a
  browser kept. The navigation test keeps /poker-night under Learn and /play/CODE in no section.
- **server guard and route guard:** no client file, and nothing under `components/`, reaches
  `shuffle.ts` or the poker-night server modules by any chain of imports; every route runs
  `playerRequest` on Node within ten seconds; no GET, page or the shared checks reaches
  `mutateRoom`; no route grants a cross-origin request; and no server module logs a room, a state
  or a document. The proxy matcher test pins `/play/CODE` open and `/play`, `/players`,
  `/playground`, `/poker-night` and `/poker` gated.
- **copy:** every hand name, log line and refusal held to the no-advice list and a currency ban.
