---
paths:
  - "lib/poker-night/**"
  - "components/poker-night/**"
  - "components/home/PokerNightChip.tsx"
  - "components/home/HomePokerNight.tsx"
  - "app/api/poker-night/**"
  - "app/(root)/poker-night/**"
  - "lib/actions/poker-night.actions.ts"
  - "lib/learn/copy/poker-night.ts"
  - "database/models/poker-*.model.ts"
  - "scripts/qa/qa-poker-night*.mjs"
---

# poker night — the game, the room and the lobby

Contracts of this feature that a map cannot show: a part of `AGENTS.md`, kept in a file of its
own so it loads only beside the files its `paths:` name. A `### name` in the text is that
feature's file in this folder; Shared, owner and the numbered invariants are in `AGENTS.md`;
the map is `docs/MAP.md`.
Part 1 of 3: the rest is `.claude/rules/poker-night-table.md` and `.claude/rules/poker-night-extras.md`.

- A Texas hold'em table friends share by link, a feature apart from poker (the solver); it reuses
  `lib/poker/cards` and `lib/poker/evaluator` and changes neither. So far it is the pure engine and
  room layer in `lib/poker-night/`, the three models, the stores, the table's API under
  `app/api/poker-night/[code]/`, the lobby and the playable table (`/play/CODE`), live over Ably
  where a key is set and polling everywhere else, with its looks, emotes and the night's awards;
  the design and the phase still to come are `docs/specs/2026-10-06-poker-night.md`. State version 2
  (the modes work's P4) holds every stored field PLO, multi-board and Triple T need, so a later phase
  only switches them on: `lib/poker-night/config.ENABLED` (every game now: Texas hold'em, PLO on one
  to three boards, Triple T; the tests hand `checkConfig`/`dealable` a narrower list) gates
  the input paths (`checkConfig`: 'not-open') and the deal (`dealable`: a table set to a game this
  deploy does not deal waits between hands, its config intact), never the stored shape;
  `lib/poker-night/variants` (pure) is each game's evaluation (`handValue`, `bestHand`, Omaha's
  `hand-name.bestOmaha`), `readShown` (a shown hand read on every board, client and server alike),
  `limitOf`, `autoDiscard`; a hand keeps its own `variant`, one five-card run per board in `deck`
  and what is out of each in `boards`, and a pot pays board by board (`winners`/`shares` are
  `number[][]`, split by `pots.splitBoards`, the odd chips to the first boards).
- PLO (P5, one board): four cards each (`config.HOLE_CARDS`), a hand exactly two of them with exactly
  three from the board (`variants.handValue`/`bestHand` over `hand-name.bestOmaha`; never "plays the
  board", `playsBoardFor`), high only. Pot limit is `betting.legalFor`'s, on `BettingSnapshot.limit`
  and `pot` (the server's Σ committed; the client's Σ `SeatView.inPot`): at most to the current bet
  plus the pot after the call, never below the minimum, never past all in; the all-in move is a raise
  only within the cap (`betting.allInOpen`), the call facing the whole stack, else 'illegal' — so the
  raise panel's top is Pot (`bet-sizing.Sizing.cap`, `quickSizes`, `confirmLabel`) and its confirm
  sends a raise to it (`bet-sizing.moveFor`), never an all-in over the cap. The game is the host's,
  from the next hand: the lobby's one-tap buttons (`QuickStart`, `data-quick-start="holdem|plo|triple-t"`,
  Texas hold'em still the one tap) and `components/poker-night/GameChoice` in the start form and the
  host drawer (`lobby.GAME_CHOICES`/`boardChoices`, `overlays.GameForm.variant`); `variants.modeOf`,
  `nextModeOf` and `modeChanged` name the game in play and the next — the top bar's second line
  (`data-pn-mode-label`, the code from 400 px), the felt before the first hand, the countdown when it
  changes, a toast and an announcement at its first deal (the deal event's `changed`), the join
  card's terms with "How it plays" (the Hands drawer opened on that game, before the rankings —
  `overlay-requests.openOverlay('hands', {lead: true})`, `HandsGuide`'s `lead` — for a visitor too), the invite
  sheet, the link preview and every lobby and Home row (`LOBBY_PROJECTION` reads
  `state.config.variant`/`boards`; `lobby.modeLine`); every name is `MODE_COPY`. The dock fans four
  cards (`.pn-hole[data-count="4"]`, the night's width held by `data-slots`, at 0.8 of the card in the
  column of a phone on its side so the emote button keeps its row) and names nothing
  before the flop (`dock.handStrength(variant, …)`); a seat's four backs keep the two's footprint and
  a turned-up four overlap by `stage.SHOWN_STEP` (`shownHandRect(…, count)` via
  `BannerSeen.handSize`, which the banner and the pots keep clear of); the deal event carries its
  card count, which the choreography deals round in the time two take. `budget.test` holds PLO's
  heaviest table (pot raises to all in) to every budget too.
- Triple T (P7): three cards each (`config.HOLE_CARDS`); once the antes and blinds are posted the hand
  opens its throw-away — `Hand.phase` 'discard', nobody on the clock (`actor` null), `state.turn`
  moved on once and one deadline for everyone, `config.discardMs` (the turn's seconds, never above
  `DISCARD_MAX_SECONDS`, 20) — in which every player still in with three, all in from posting
  included, throws one away at the same time (`engine.discard`, the action `{type: 'discard', turn,
  card}`: refused 'not-seated', 'stale' for another throw-away's turn or past the deadline's grace,
  'not-now' out of it or thrown already, 'illegal' for a card not held); the last throw opens the
  betting as Texas hold'em does (`settleTurn` from the big blind), and from there the hand is Texas
  hold'em with the two kept (`PLAYING_CARDS`). At the deadline (`clock.nextDue`, every writer giving
  it the slack, there being no actor) `engine.timeout` throws for everyone still to
  (`variants.autoDiscard`, data-free: the odd one out when two match, else the lowest; flagged the
  clock's) and counts no timeout and makes nobody away, so a slow throw never folds a blind. A leaver
  who owes chips folds; one who owes none (the big blind, all in) has a card thrown for them at once,
  flagged 'auto'; a hand won in the throw-away ends with its winner's three, never shown. A card
  thrown away lives in `Hand.discards` (PRIVATE), its log line names no card (`'discard'`, amount 0):
  the public view says only how many a seat holds face down (`CardsView`, 3 then 2) and who is still
  to throw (`HandView.toDiscard`); the thrower alone gets it, `MeView.discard` and their history's
  `players[].discard` (`historyView`), and a show turns up the two kept. A throw is visible (the seat's
  count moves); `feed.nearTurn` counts everyone dealt in as near through it, and `feed.needsPrivate`
  reads the whole view when the seat's count no longer matches the cards held (the deadline threw for
  the viewer). At the table: `components/poker-night/DiscardPicker` in the dock (a radio group of
  three cards of 44 px or more, the one picked lifted 10 px, dimmed by filter and marked with an ✕;
  arrows move the pick, Enter on the card picked throws it; 1–3, Enter and Escape with the focus on the
  table, `keys.discardIntentForKey`, the digits held to the player's switch; Peek keeps them face down
  until pressed and never names the card; both it and its full-width confirm behind the tap shield),
  the throw-away's seconds and then what the two kept make beside it (`dock.DockView.discard`), the
  wait for the others with "Leave after this hand" once thrown, the card thrown flying off
  (`HoleCards`' `thrown`, `.pn-hole[data-slots="3"]` holding three's width the whole hand); the plates
  "Discarding…" (`TABLE_COPY.discarding`, `data-discarding`) over three backs, a third back flying to the
  middle as each throws (the log's `discard` event, `choreography` `BEAT.DISCARD_GAP`, the fold's
  swish); the felt's count (`dock.throwAwayCount`, "Everyone throws away one card · 3 of 5 done" with
  the seconds, inside the board's empty place: the count alone where it is narrow, nothing narrower); `overlays.attentionKey` (`turn:n` or `discard:handNo`, in place of the old turn key)
  closes the drawers, chimes and buzzes for the throw-away as for a turn; the screen reader hears the
  three cards at once, the viewer's own throw (or the clock's) with its card, the others' without, and
  the throw-away over (the `discarded` event); the hand log and history say the reader's own card
  thrown away to them alone (`LOG_COPY.youThrew`). Every sentence is `DISCARD_COPY`; the game's
  glossary entry is `triple-t`, its Hands section the guide's third game. `simulate.test` plays Triple
  T nights (throws, refused throws, deadlines, leavers in the throw-away), `views.test` scans them for
  another player's card thrown away, and `budget.test` holds its heaviest table to every budget.
- `lib/poker-night/engine.reduce` is the one way a table's state (`lib/poker-night/types`) changes:
  a pure reducer that clones once, never mutates its input and hands back the same reference for a
  no-op. Time, the deck and the first big blind's draw arrive inside the action, so a step replays
  exactly. `lib/poker-night/clock.advance` applies whatever has fallen due — a timeout once
  `TIMING.TURN_GRACE_MS` is past the deadline, a run-out street, the next deal — each at the moment
  it runs, so every new deadline counts from then; nothing wakes on a timer.
- `lib/poker-night/shuffle` is the engine's only server-only file and its only use of
  `node:crypto` (`SECURE_SOURCE`). The clock takes any `DeckSource` (`lib/poker-night/deck`), so
  tests deal from a stacked or seeded one. `lib/poker-night/__tests__/server-guard.test.ts` follows
  imports transitively: no 'use client' file (in `app/`, `components/`, `hooks/` or `lib/`) and
  nothing under `components/` may reach `shuffle`, the poker-night stores, identity, guest-token,
  pass, route-kit or realtime, and no 'use client' file, nor any of poker night's components, may
  reach crypto, mongoose, `database/` or the session. Ably is split the same way: the browser reaches
  only `ably/modular`, through a dynamic `import()`, and no server module does. A server page is
  not held to it.
- `lib/poker-night/views` is the only way state leaves the server: `publicView`, `wireView`,
  `playerView` and `historyView` copy field by field from a whitelist. `lib/poker-night/view-types`
  is the client contract (version 2: `TableView.v`), declared on its own, never an `Omit<>` of a
  server type, and it has no deck. The client offers moves with
  `legalFor(snapshotFromView(view), seat)`, the very function the server checks them with
  (`lib/poker-night/betting.legalFor`). To keep the wire to its budget a seat's face-down cards are
  their count (`CardsView` is `'none' | number | Card[]`), a paid pot carries its winners alone
  (`PaidPotView`; the shares are `pots.paidParts`/`seatShares`, the server's own split), a shown
  hand its cards alone (`variants.readShown`), and the ledger rows are tuples (`LedgerView`;
  `views.ledgerRows`/`ledgerRowOf` read them). Only the viewer's own `me` carries their cards, their
  thrown-away card, their pre-action, `next` ('leave' once they left now, 'leave-after' while they
  play out a hand they chose to leave after, 'sit-out' while a sit-out waits), the hand's asks they
  made or were asked, the hands shown to them alone (`shownToMe`), who they may ask (`canAsk`) and
  why not the rest they could (`askBlocked`, `asks.askChoices`: asks off, a cooldown, one waiting,
  the limit — the one thing a view says of another player's asks setting, what the engine's refusal
  would say), and their own `allowAsks`; `PlayerView.nudge` is their nudge count (below).
- Conservation: Σ stacks + Σ committed to a live hand + Σ cashed out = Σ bought
  (`lib/poker-night/ledger.conservation`), checked after every step of
  `lib/poker-night/__tests__/simulate.test.ts` (100 seeded nights; `PN_SIM_SEEDS=1000` runs more).
  Chips are bought only when they land (`recordBuy`), so a pending buy is not yet bought; net is
  chips + cashed out − bought, with chips counting what is in a live pot, steady mid-hand.
- A stored state field never changes meaning without bumping `STATE_VERSION`
  (`lib/poker-night/config`, now 2) and adding a step to `lib/poker-night/migrate`: `migrateState`
  hands a valid version 2 state back as it is, checks a version 1 one against its own frozen shape
  and steps it (`v1ToV2`: the config's game last, rebuys 'auto' read as 'approve', `leaveAfter` off,
  ledger times to seconds, a request's time kept, the hand's one board as a run and a
  board, pots paid on that board, shown hands as their cards), and refuses anything else;
  `migrateSummary` reads a PokerHand row written before version 2 as today's
  (`hands-store.readHand`/`readHands`). The version 1 fixtures (`state-v1-corpus.json`,
  `state-v1-showdown.json`, `summary-v1.json`) are each stepped, held to their invariants and
  played on in `fixtures-v1.test.ts`. A hand's log, a ledger row's events and a hand's asks are
  stored as number tuples whose kinds index `ENTRY_KINDS`, `LEDGER_KINDS` and `ASK_ANSWERS`,
  append-only lists; `lib/poker-night/__tests__/budget.test.ts` holds the state to 16,000 bytes,
  the room document to 27,200 for what each write reads (30,000 with the emotes) and the wire view
  to 4,500 on the heaviest table the engine builds, every private list at its longest on top
  (`PN_BUDGET_PRINT=1` prints the bytes: 14,798, 26,806, 29,457 and 3,787 when version 2 landed;
  each request's time, kept since, took the read past 27,000).
- The rules a change most often meets (the spec has the rest): the big blind always moves one
  eligible seat on (`lib/poker-night/seats.positions`); a short all-in reopens nobody who has acted
  unless the short all-ins since add up to a full raise, but a checker facing an opening all-in
  below the minimum bet may raise; the uncalled bet goes back even to a folded seat; every live hand
  shows at a showdown; a player who leaves or is removed while facing a bet folds at once, otherwise
  stays in, away, and is cashed out when the hand completes. "Leave after this hand"
  (`leave-after`, `Seat.leaveAfter`, private) plays the hand out as usual — not away, moves and
  pre-actions as ever — and cashes out once as it completes, a buy waiting for it dropped; it can be
  taken back until then, takes the place of a sit-out asked for (and of a request), a buy or an
  approval is `not-now` while it is set, and between hands (or not dealt in) it is leaving now — the
  one leave a page that stays open sends, so a deal that lands first never costs a blind
  (`seats.isEligible` leaves it out).
- Buys: before the first hand is dealt every seat and buy lands at once; after it, every buy but the
  host's — a newcomer's first chips, a re-sit, a rebuy, a top-up — is a request the host approves or
  declines (`ledger.needsHost`; one per player, the newest in its place, until decided, withdrawn
  with `withdraw`, or the player leaves). A newcomer waiting sits with nothing, is dealt nothing and
  has no ledger row until the chips land (as a buy-in: `ledger.hasBought`); the rebuy policy is off
  or on (`REBUY_POLICIES`: 'off' | 'approve'), and off stops rebuys and re-sits, never a first
  buy-in, nor cashes out a newcomer still waiting. Every buy waits however long the host is gone —
  nothing lands without their yes; a host unheard from for `LIMITS.hostTakeoverMs` is replaced by
  claim-host (an account holder at the table), and the requests wait for whoever holds the role. A
  request keeps its time (`TableState.requests[].at`): the same request again changes nothing, and
  its player may change its amount or take it back only `REQUESTS.CHANGE_MS` after the last change
  ('request-wait'), so a request comes and goes at most once every few seconds; a leave is never held.
  The host's approve names the amount it says yes to (`HostOp` approve's `amount`, sent by the toast
  and the bank's row): one the request no longer says is refused `stale`, and nothing lands. The
  break's one-tap Leave asks first only when there is no way back (`overlays.leaveTapAsks`).
- Asks to see a hand (`lib/poker-night/asks`, pure, read by the engine and the views alike; the
  engine's `ask`, `reply`, `allow-asks`): once a hand completes, a player dealt into it who folded
  may ask a player whose cards were not shown; the player asked answers with their cards to the one
  who asked alone ('one': in that player's `shownToMe` and history, `HandSummary.players[].seenBy`),
  to everyone ('all': a show), or no. Kept from spam on the server: one ask waiting per player,
  `ASKS.PER_HAND` a hand; one unanswered for `ASKS.WAIT_MS` is a no; after a no the same pair waits
  `ASKS.COOLDOWN_HANDS` hands; a player who turned asks off (`TableState.noAsks`, kept while seated
  or dealt into the hand asks are about — `ledger.cashOut` drops anyone else's, so it never names
  more than the seats and the hand's players) cannot be asked. Asks live in the hand, so the next
  deal ends every one, and one still waiting is a no, with its cooldown, even with seconds left (the
  results pause is never longer than `ASKS.WAIT_MS`, so an ask its player lets go by never comes back
  every hand). A cooldown is never dropped before its hands are up: the table holds
  at most `ASKS.COOLDOWNS_KEPT` cooldowns and waiting asks together, and at that cap a new ask is
  refused `asks-full` until some run out (`asks.asksFull`, in `askChoices` too). A Triple T card
  thrown away is never shown. Refusals `asks-off`, `ask-waiting`, `ask-limit`, `ask-cooldown`,
  `asks-full`, each with its sentence.
- Wording (invariant 12 applies): every sentence is in `lib/learn/copy/poker-night.ts`, held by
  `lib/learn/__tests__/poker-night-copy.test.ts` to the 'copy' tier and to a currency ban (play
  chips have no cash value). A hand wins against another and is "stronger"; its five cards are
  "the five cards that play"; no sentence or label opens on "Hold", "Hold'em" or "Buy" ("Press and
  hold", "Texas hold'em", "Chips in", "Rebuy"). `ACTION_COPY.does` is keyed on every `EntryKind`
  and `REFUSAL_COPY` on every `Refusal`, so a new kind or refusal does not compile without words.
- The room (`lib/poker-night/room`, pure) is the engine's state plus `players` — one row per
  account or guest, whose `pid` (11 random characters) is the only handle that leaves the server;
  `userId` and `guestId` never do — `bannedKeys` and `peopleV`. Its steps (`joinStep`, `actionStep`,
  `clockStep`, …) hand back the same core for a no-op. Removal is the engine's host op `kick` plus
  the room's ban: the removed pid's identity key (`u:<userId>` or `g:<guestId>`) joins `bannedKeys`
  and the row is marked banned, so that identity — or a signed-in browser still carrying the removed
  guest's cookie — is refused `banned` on join and on every request; `unbanStep` (the host only,
  "Let back in") lifts both, and the player returns as the row they were. `actionStep` checks the
  player's row on the core the compare-and-set read, so a removal that commits while a move is on its
  way still refuses it. The room keeps at most `LIMITS.players` rows: a join prunes stale watchers
  and, at the bound, lets go of departed guests' rows that hold nothing (no seat, request or place in
  the hand, unheard from in the active window, a settled ledger row, which `engine.forgetSettled`
  drops with it) — removed ones last, their keys kept in `bannedKeys` (bounded by
  `LIMITS.bannedKeys`) so the removal holds; account rows stay. `peopleV` moves exactly when a
  name, a look, a join, a pruned or let-go row, a removal or a let-back-in does, so the realtime
  message can leave the people out and a client refetches them when it moves.
- Identity (`lib/poker-night/identity`): the better-auth session wins, read only when a session
  cookie is present; else the app's own HMAC guest cookie (`lib/poker-night/guest-token`:
  `aero-pn-guest`, `__Host-` over HTTPS, httpOnly, Lax, 180 days, re-signed after 30 or after a
  rotation through `POKER_NIGHT_GUEST_SECRET_PREVIOUS`), minted only by POST join — for a browser
  with no identity, the guest its body's `joinId` names (`guestIdForJoin`), so a double tap or a
  retried join is one row; else nobody. A session read that throws is a 503, never a guest, and a
  guest is never a better-auth user. The seat pass (`lib/poker-night/pass`, `X-PN-Pass`, ten
  minutes, renewed past half its life) stands in for the identity on GET state, GET detail, GET
  token, tick and POST emote; join and action always read it in full.
- Every table request goes through `lib/poker-night/route-kit.playerRequest`, cheapest refusal
  first: the kill switch (`POKER_NIGHT_ENABLED`), `X-PN-Protocol` (426 reload), a POST's same
  origin, JSON and 2 KiB (read capped, `lib/poker-night/http.readCappedText`), the in-memory bucket
  (`lib/poker-night/bucket`; by the player a valid pass names on every route, else the address)
  before any database call, the code, the pass or the identity, the room's head (one projected
  read), the player. Mongo counters only on join (per address for every new identity; per room, read
  first and spent only for a row the join made, so turned-down joins never use it up) and on an
  unknown code, on every route and on the table's page. Its `json()` takes only `ResponseBody`
  (`lib/poker-night/view-types`), so a server room or a state does not compile into a response.
- `lib/poker-night/store.mutateRoom` is the one way the game moves: read, plan with the pure
  `lib/poker-night/mutation.planMutation`, write behind a compare-and-set on `seq` (five attempts,
  jittered backoff, then 503 busy). The plan: an action id already in the `applied` ring (36,
  `KEEP.APPLIED`) is answered as a duplicate; a room idle 12 hours closes; the clock runs to the request's
  `receivedAt`, then the step, then the clock to now — a turn's timeout at the turn's own time for
  the actor's own request, `TIMING.TIMEOUT_SLACK_MS` later for any other writer (`clock.dueFor`;
  the `nextDueAt` mirror the leader's tick is armed by includes it), so an in-time move still on its
  way is not beaten to the compare-and-set; a refused step still commits the clock's own changes,
  without its action id; nothing changed, no write. Every write moves `seq`; one only its author can
  see — a pre-action, a plan to leave after the hand or a sit-out asked for while the hand is live,
  an ask or its answer, the "let others ask" setting (`mutation.seenByOthers`, over its
  `withoutPrivate`) — moves `hiddenCommits` with it, and everything that leaves the server (views,
  Unchanged, `since`, the realtime message, the results' guard) carries `room-doc.publicSeq`, seq
  less those, so no browser reads their timing off a version; the author's own answer brings it at
  the seq held (the feed's `own` input). A write that changes another player's own view where the
  public table does not show it (`mutation.nudgesOf` over `views.nudgeKey`, both sides read at the
  commit's time — an ask's expiry written down by another pair's ask or answer, which the views
  already read as expired, nudges no one — : the player asked, the
  one who asked, a player the host sat out mid-hand) moves that player's row's `nudge` count
  (`mutation.withNudges`; private, never peopleV): the head projects it, a GET state sends the count
  it holds (`nsince`; one that names none asks after the table alone) and is read whole when it
  moved, every Unchanged and view carries the viewer's
  own, and `afterCommit` says it on their own channel (realtime, below). History rows are guarded by
  the document's own seq (`Commit.writeSeq`), which every commit moves, so an answer shown to one
  player alone is kept. A stored state `migrateState` refuses closes the
  room out of band, or answers reload when a newer deploy wrote it — on the reads too
  (`store.getRoomById` tells them apart, `room-doc.unreadRefusal`). The out-of-band fields
  (`seen`, emotes, `rt`, `lastError`) are never part of the write. `afterCommit`, in the route's
  `after()`, writes the completed hands (`lib/poker-night/hands-store`) and the accounts' results
  (`lib/poker-night/results-store`) and publishes the commit's wire view (realtime, below) when its
  public seq moved. The
  document mapping is `lib/poker-night/room-doc` (pure). Logs carry codes, seqs and messages, never
  a room, a state or a document.
- A GET or a page render never writes: only POST action, join and tick move a room, so a link
  preview, a prefetch or a loop of polls cannot deal a hand.
  `lib/poker-night/__tests__/route-guard.test.ts` holds every `app/api/poker-night/[code]/` route
  to `playerRequest`, Node and ten seconds, and no GET, file of the (play) group or route-kit to
  `mutateRoom`.
- Every room, hand and result query and index, every rate-limit key (`lib/poker-night/limits`) and
  every realtime channel carries the env (`lib/poker-night/env.envOf`: `VERCEL_ENV`, else
  development): a preview shares production's database and must never open a production table.
- The exits: every payload is one of `lib/poker-night/views`' projections or the room's views built
  on them (`room.playerViewFor`, `roomView`, `playPageView`, `room-doc.playerViewOf`,
  `views.bankDetailView`); the people (names and looks) are their own part beside the wire view.
- The lobby, `/poker-night` (a page of the Learn section, `app/(root)/poker-night/page.tsx`), composes
  `lib/poker-night/lobby-store.getLobbyView`, shaped by the pure `lib/poker-night/lobby.shapeLobby`:
  a section with nothing in it comes back null and is not drawn. A table counts as open while it is
  not closed and not idle past `TIMING.IDLE_CLOSE_MS` (its next write closes it), by one filter,
  `lobby.openRoomsFilter`, for the lists (`store.listOpenRooms`, the mirrors only) and the open-table
  cap (`store.countActiveHosted`, `LIMITS.hostOpenTables`). Friends' tables are only those whose host
  turned `showToFriends` on (off by default), hosted by `lib/friends/store.getAcceptedFriendIds`; a
  recent night (`results-store.readRecentResults`) is finished once its table closed or went idle.
  While the reader holds a seat at an open table, the Play tab opens on
  `components/poker-night/lobby/ResumeTable` ("You are seated at …", Rejoin): `lobby.resumeOf`, the
  newest of `store.listSeatedRooms` — the open tables the account has a player row at (the
  `{env, players.userId, status}` index), projected by `lobby.SEATED_PROJECTION` (the lobby's fields
  plus the players' and seats' pids and the seats' `leaving`) and kept by `lobby.holdsSeat`, so a
  watcher, a departed player or a seat on its way out is no seat; the pids never leave the server.
  Home's panel takes its tables from the same reads (### home).
- `lib/actions/poker-night.actions` is the lobby's only: `createPokerNight` (the create counter, the
  cap, `store.insertRoom` seating the host at seat 0 with the chip cap, under `lobby.profileOf` — the
  saved name and look, `lib/poker-night/prefs-store.getPokerNightPrefs` over
  `user-preferences.pokerNight`, else the first name and `avatar.avatarForUser(userId)`), then the page
  opens `/play/CODE?invite=1`; `closePokerNight` (the host's `end` through `mutateRoom`);
  `savePokerNightProfile`. The table never calls a server action, and nothing under
  `components/poker-night/` but `lobby/` imports one. My look offers the name and look a browser kept
  as a guest (`lobby.ME_STORAGE_KEY`, read with `readStoredMe` through `useSyncExternalStore`) to the
  account.
