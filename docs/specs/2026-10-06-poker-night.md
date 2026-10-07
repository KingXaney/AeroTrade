# Poker night: a hold'em table you share by link

**Status:** In progress on branch `feat/poker-night`. The pure engine, phase 1 of 8, is written
and tested. The room server and its API, the playable table and lobby, live updates over Ably,
looks and avatars, emotes and the tracker's polish follow, each merged once its checks and browser
QA pass.

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
- **The copy** is `lib/learn/copy/poker-night.ts`: so far, the hand names, the log's lines and the
  refusals.

## Engine rules

No-limit Texas hold'em at 2 to 9 seats, fixed when the table is made, for integer play chips.

**One reducer.** `engine.reduce(state, action)` is the only way a table changes. It is pure: the
time, the deck and the draw that seats the first big blind arrive inside the action, so a step
replays exactly. It clones the state once, never touches its input, and returns the same state for
a step that changes nothing. A refusal names its reason (`stale`, `not-your-turn`,
`below-min-raise`, `rebuys-off` and sixteen more).

**The clock.** Nothing on the server wakes on a timer. Three things fall due: the actor's time
running out (two seconds of grace after the deadline the player sees), the next street of an
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
heaviest table the engine can build, the state takes at most 16,000 bytes and the wire view 4,500.
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
- **server guard:** no client file, and nothing under `components/`, reaches `shuffle.ts` or the
  poker-night server modules still to come by any chain of imports.
- **copy:** every hand name, log line and refusal held to the no-advice list and a currency ban.
