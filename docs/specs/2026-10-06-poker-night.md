# Poker night: a hold'em table you share by link

**Status:** Shipped (2026-10-07), merged from `feat/poker-night`. Phases 1 to 7 of 8: the pure
engine, the room server and its API, the playable table and lobby on polling, live updates over Ably,
looks and avatars, emotes and the table's feel, and the night's awards with the table's glossary
terms, each with its unit tests and browser QA. Live updates switch on once `ABLY_API_KEY` is set in
Production (set on 2026-10-08); until then every table polls. The modes batch (P1–P8) shipped on
2026-10-08 from `feat/poker-night-modes` in two parts: the way home, the Hands guide and Home's panel
first, then state version 2, PLO on one to three boards, Triple T and the table's small conveniences
(below).

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
- **The pages (phase 3):** the lobby at /poker-night, a fourth page of the Learn section, and
  the table at /play/CODE, in a route group of its own: full screen, no app shell, open to guests.
  Table traffic goes through route handlers, not server actions, which run one at a time per
  client and change their ids on every deploy.
- **The engine (phase 1)** is `lib/poker-night/`, pure except `shuffle.ts`:
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
pass, signed by the server and sent back in `X-PN-Pass`, lets the polls, the ticks, the detail
reads and an emote skip the session's database read (past half its life it is answered with a fresh
one); a join or a move always reads the identity in full. A join carries an id the client makes once and
reuses on a retry, and a browser with no identity is given the guest that id names (an HMAC of it),
so a double tap or a retry after a lost answer is one guest and one row.

**Every request**, cheapest refusal first: the kill switch (`POKER_NIGHT_ENABLED=false`); the
`X-PN-Protocol` header (a custom header, so a cross-site page's request fails its preflight, and a
mismatch tells an old page to reload); for a POST, the same origin, JSON and at most 2 KiB, read
from the stream and given up past the cap; an in-memory token bucket per player (the one a valid
seat pass names, on every route, so nobody sharing the address can spend a seated player's budget;
else per address) ahead of any database call; the code; the pass or the identity; the room's head,
one projected read; the player's row. Mongo counters are spent only on a join and on unknown
codes. A join from a new identity spends its address's counter whatever the answer; the room's is
read first and spent only for a row the join made, so joins the table turns down (locked, full,
removed) cannot use it up and keep friends out. An unknown code spends the address's miss counter
on every route and on the table's page (`lib/poker-night/page-gate`), and an address past it finds
every code gone on the page, the live ones too, so nothing tells codes apart faster than the miss
counter allows.

**One way a table moves.** `mutateRoom` reads the room, plans one attempt and writes it behind a
compare-and-set on `seq`, five attempts with a jittered backoff before answering busy. A request
names its action with an id the client reuses on a retry; the room keeps the last 64 it applied,
so a double tap or a retried request is one action. The clock runs to the moment the request
arrived, then the step, then the clock to now, so a move made in time is never beaten by a timeout
that fell due while it waited in the loop. Only the actor's own request times their turn out at the
turn's own time; any other request (the leader's tick, another player's move, a join) waits a
second's slack longer, so it cannot reach the compare-and-set first and time out a move that
arrived in time and is still on its way. A refused step still lets the clock's own changes commit.
A room idle twelve hours closes on its next write. Every write moves `seq`, but one that only its
author can see — a pre-action set, changed or cleared by a player not on the clock — moves
`hiddenCommits` too, and everything that leaves the server carries the public seq, `seq` less
those (`room-doc.publicSeq`): no other browser can read when a pre-action was chosen off a
version that moved, and nothing is published for it. The setter's own answer brings the
pre-action at the seq the page holds. A stored state this deploy cannot read closes
the room — unless a newer deploy wrote it, when every route, a read included, tells the page to
reload instead. Presence
beats, realtime failures and, later, emotes are written beside the game, never through it, so
they never cost a move its race. After the response, the completed hands go to history, the
accounts' totals to their result rows and the public table to the realtime channel.

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
room, hand and result query and index, every rate-limit key and every realtime channel names the
env; a preview can never open a production table.

**Names and looks travel apart.** The people part — every row's name and look, and who was removed —
rides beside the table in responses, versioned by `peopleV`, which moves only when one of them
does; the realtime message leaves it out and stays within its budget.

## The lobby (phase 3)

**Where.** /poker-night is a page of the Learn section (`app/(root)/poker-night/page.tsx`), for
signed-in readers only: only an account starts a table. It makes one read,
`lib/poker-night/lobby-store.getLobbyView`, shaped by the pure `lib/poker-night/lobby.ts`, and a
section with nothing in it is not drawn. The /games hub carries a card for it, with no records:
poker night keeps no score. With the kill switch on (`POKER_NIGHT_ENABLED=false`), when every table route
answers 503, the lobby and an open table's page (/play/CODE) both show one sentence saying poker
night is switched off, the table's with the way back to the lobby; a closed table's summary still
shows.

**What it shows**, phone first, in this order:
- **You are seated at …**, only while the reader holds a seat at an open table: the newest such
  table, its line as the lobby's rows print it, and Rejoin. A seat held means one of the account's
  player rows sits in the table's seats and is not leaving: a watcher, a player who left and one
  whose seat empties when the hand ends get no card. The read goes through the account's player
  rows (`store.listSeatedRooms`, the newest eight open tables it has a row at) and projects only
  the lobby's fields and the seats' pids, which never leave the server.
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

**On Home.** A "Poker night" chip beside the puzzle streak links to the lobby whenever poker night
is on; while the reader holds a seat at an open table it becomes "Rejoin your table", a link
straight back to it (streamed in over the lobby's chip from the panel's own read), so a friend who
closed the table's tab is one tap from it at the top of the page. Below Home's other panels, streamed after the page paints, a Poker night panel appears only
when it has a row: "Your tables" — the tables the reader holds a seat at (Rejoin), then the ones
they host from outside a seat (Open), two at most — and "Friends' tables" to Join, two at most and
never one the reader already sits at or hosts, with links to the lobby and to the Hands guide
("Learn the hands"). With the kill switch on there is neither, and a failed read draws nothing.
No lobby write revalidates Home: it renders on every request.

**The lobby's writes** are server actions, used by the lobby only (the table talks to its routes):
`createPokerNight` (a rate limit of ten an hour, the cap, then the room with the host at seat 0
with the chip cap, under their saved name and look, else their first name and the look their
account id rolls), `closePokerNight` (the host's "end", through the same compare-and-set as every
move) and `savePokerNightProfile` (`user-preferences.pokerNight`, a sub-document with no defaults).

## Live updates (phase 4)

**When.** Only where the deployment has realtime (`lib/poker-night/channel.realtimeEnabled`): an
`ABLY_API_KEY` shaped like an Ably key, set in Vercel for Production only and restricted in the
Ably dashboard to channels `poker-night:*` with publish and subscribe, and `POKER_NIGHT_REALTIME`
not `off` (the kill switch that leaves the key in place). Previews, local servers, CI and the QA
harness have no key, so their tables poll exactly as before.

**The channel.** One per room, `poker-night:<env>:<room id>` — the env because a preview shares
production's database, the room's id because a code is what a stranger guesses. After every commit
whose public seq moved (every one but a pre-action's) the server publishes, from the route's `after()` (`store.afterCommit` through
`lib/poker-night/realtime`, `Ably.Rest` loaded on first use), one message:
`{name: 'state', id: '<room id>:<seq>', data: WireView}`. The explicit id makes a retried publish
one message. The wire view is the public table without the people (they move with `peopleV`), so
no hole card, no deck, no viewer's own part and no config ever rides on Ably, and the message,
envelope and all, stays under 4,500 bytes on the heaviest table the engine builds
(`budget.test.ts`). A publish that fails stamps the room's `rt` out of band, at most once a
minute, and for five minutes every answer the server sends says `realtimeOk: false` — a view, a
message, and an Unchanged answered from the room's head alone.

**Tokens.** `GET token` answers `{realtime: false}` without realtime, else the channel and an Ably
`TokenDetails` the server requested for the player: subscribe on that one channel only, fifteen
minutes, the player's pid as its clientId, at most twenty per player in ten minutes. No browser can
publish, enter presence or read another table. A removed player is refused like on every route and
keeps only what the channel shows everyone until their token runs out.

**The browser.** `components/poker-night/realtime-client` loads `ably/modular` — `BaseRealtime`
with the WebSocket transport and fetch, nothing else — by a dynamic `import()` when a table with
realtime connects, so it is in no other page's bundle and in /play's only as a chunk fetched then
(about 52 KB gzipped). Every message goes through the same reducer as an answer, applied only when
its seq is newer, so a message out of order or twice changes nothing. One GET state follows every
attach and re-attach, and every message after which the viewer's own part is stale
(`feed.needsPrivate`: a hand they are dealt into, their seat or role, the config, the people); a
message that shows the last hand over drops its cards at once, and one that shows a pre-action
played or cleared drops it. That read can come back older than the next message (the first actor
moved while it was out): its own part is then kept under the newer table when nothing between the
two could have changed it — the same hand, seat, config and people — and read again at once when
something could. While a move of the viewer's own is out, a message does not count their own part
as fresh (the move may have set a pre-action no message shows); the move's answer brings it. While
that part is stale the poll keeps the table's own pace rather than the 20-second safety poll, and a
message never puts off a poll already due. A first token that does not come is asked for again
after 5, 15 and 45 seconds and then every five minutes for as long as the page is open, so a table
that missed its first token goes live once the route answers again. A page hidden five minutes
lets its connection go and opens it again when it shows.

**Which transport.** `lib/poker-night/feed`'s monitor, checked every second: the channel alone,
with a safety poll every 20 seconds, while it is connected and keeping up; polls beside it for five
minutes from the last time anything looked wrong — not connected within 8 seconds, disconnected
over 10, suspended or failed, a view saying `realtimeOk: false`, or during a live hand an answer
ahead of the channel for over 3 seconds or nothing on it 5 seconds past a due time. The monitor
hears `realtimeOk` from every answer and every message and starts from the view the page holds, so
a page opened inside a failure window runs both, and an idle table's safety polls end it on time.
The top bar says "Live" only over a channel trusted alone, else "Updating every few seconds".

**Testing it without Ably.** The QA dev server (`scripts/qa/run.sh`) blanks the key and sets
`NEXT_PUBLIC_PN_RT_FAKE=1`: a page that defines `window.__PN_RT_FAKE__` takes its messages from that
object instead of Ably. A production build compiles the seam out. The poker night suite's relay is
that object for one guest's page: it reads the room from Mongo, builds the message the server
publishes (`room-doc.wireOfRoom`, the same function) and delivers it held back, out of order and
twice. Over two hands it holds the page Live, its drawn seq (`data-pn-seq`) only ever rising, one
read of its own view at each new hand and its cards there — one of those reads held until a later
message has landed, and the cards must still come with it — no unshown hole in any message; then it
stops mid-hand and the watchdog must bring the polls back within its 3 seconds.

## Looks and avatars (phase 5)

**Who chooses what.** The host chooses the room for everyone: one of eight scenes (a casino under a
chandelier, a midnight lounge, a neon city, a beach at sunset, deep space, a log cabin, a garden
party in daylight, or "my theme", which each viewer sees in their own app colours), one of eight
felts, and whether throwables fly. A pick in the host drawer's Look section is the room's settings,
applied at once — the new scene fades in, the felt is re-laid — and a signed-in host's pick also
becomes the look their next tables open with. Each player chooses the rest for their own eyes:
the card back (eight), the card face (large print, the default, or classic), a four-colour deck,
the chip colours (classic, pastel, neon, mono), and the switches for sound, vibration, keeping the
screen on, the hand's name under their cards, peek (their own cards face down in the dock until
they press on them, for a screen others can see), other players' emotes and the single-key
shortcuts.

**Where it lives.** Every colour is a literal in `lib/poker-night/looks`, rendered once to
`LOOKS_CSS` — data-attribute selectors and `--pn-*` properties only, injected by the (play) layout
and the lobby — so no component holds a colour and a test holds them all to their contrast (text
on every felt, every suit on the paper, every chip's ink) and to CSS that cannot escape its style
tag. A scene is a gradient sky plus inline SVG art drawn in the scene's two inks, with an ambient
loop (twinkling stars and bulbs, drifting haze, flickering windows and flames, rolling waves) that
both motion guards and brutalist stop. The personal look is kept in the browser
(`aero-poker-night:me`) the moment it changes at the table, field by field, and laid over an
account's saved look; the table never calls a server action, so an account saves it from the
lobby's My look, which offers whatever a browser changed — and once saved, the browser keeps none
of its own look, so a later save from another device reaches the tables it opens. Whatever sits
over the scene draws its own ground: an open seat on the rail is filled with the felt, and a card
that does not play dims without turning see-through.

**Avatars.** An emoji face (40) on a colour (12), in a frame (none, ring, double, dashed, gold,
neon), with a badge (12, or none) — one short string, `v1:fox:tangerine:ring:crown`. The builder
shows the look live, one part at a time, each choice drawn as the look with that part changed,
and rolls a random one with the dice (the badges drawn large on their own, the preview showing one
worn); the join card offers it one tap away from Roll, the table's My look saves it — a seated
player's change saved mid-hand waits, kept while the drawer is shut, and goes on the table by
itself when the hand ends — and the lobby saves it with the account.

## Emotes and the table's feel (phase 6)

**What a player can send.** From the dock's emote button (or E): thirteen reactions that rise over
the sender's plate, sixteen phrases said in a speech bubble (friendly table talk, never a verdict on
a play), and ten things to throw at another seated player — a tomato, a rose, a soda, confetti,
cake, an egg, a tennis ball, popcorn, a heart, a fish — each landing on the target's plate with its
own impact (a splat, petals, fizz, a burst, a bounce). Tapping another player's plate offers the
throws in one tap and a mute for that player for the visit. Every item is an id from
`lib/poker-night/emotes`; there is no free text, so nothing a player sends needs moderating. Each
glyph is one Emoji 12.0 code point with no joiner, skin tone or variation selector (the tennis ball
stands in for a snowball, which needs one).

**Who.** Seated players only — a watcher sends nothing. A throw needs the host's `throwables`
setting (on by default; off, the Throw tab is not offered and a direct request is 403) and another
seated player as its target.

**The write.** `POST emote` takes the seat pass like a poll and never touches the game's
compare-and-set: after the checks (who is seated and the host's setting from one projected read) it
is one conditional `findOneAndUpdate` whose filter is the sender's cooldown — their last emote at
least 1.2 seconds ago, stamped in the room's private `emoteAt` with the time the request arrived —
so a second emote inside it matches nothing and is answered 429 without any counter being written
(the picker's own cooldown starts again when the answer comes, so it never ends before the room's). Its update pipeline gives the emote
the room's next `emoteSeq`, keeps the last 20 and, for a throw, counts it in `awards` (what each
player threw and received, for the night summary). The answer is the emote as stored, so the
sender's own table draws it at once; `after()` publishes it on the channel as the `emote` message,
and polls carry it by `emoteSeq` (`GET state?esince=`).

**On the table.** A browser merges emotes by id from every source — the channel, its polls, its own
answer — and moves its emote seq only while the ones it holds run on without a gap, so a poll never
skips one the channel missed. It draws an emote only within 8 seconds of its sending, at most three
per player and 24 in all, each for its own time on a timer (never `animationend`): a reaction
1.8 s, a phrase 3.2 s, a throw 0.75 s in flight and 2.4 s on the target's avatar (`data-splat`),
one at a time on a plate, so the name and the stack beside it stay readable however often it is hit.
A reaction and a phrase sit clear of the seat's turned-up cards and its action tag, under the plate
for a seat along the top (the reaction drifting down toward the felt), and a throw's arc peaks
under the top bar. Under reduced motion only the impact shows. A player can mute every other player's emotes (My
look) or one player for the visit. A screen reader hears each one said in a polite live region.

**Sound, buzz, screen and keys.** The table's sounds are synthesised by Web Audio from short
recipes — a card's swish and snap, two to four clay chips clacking, a check's two knocks, the cards
swept into the muck, a winner's arpeggio, the turn's gentle chime, an emote's pop and a landing of
its own for each thing thrown (since P8: a fish's heavy wet slap, a tomato's juicy splat and drips,
an egg's crack then splat, a cake's muffled thud, a rose's and a heart's whoosh and pop, a soda's
clink and fizz, confetti's paper pop and rustle, popcorn popping, a tennis ball's thock and bounces)
— each a few layers of tones and filtered noise with their own attack and fall, played from a seed
so no two throws, chips or cards sound quite alike (a cue's seed is its key, a landing's the emote's
id, so every screen hears one throw alike), no part louder than 0.35 gain and the layers together
never past 0.75, between 40 Hz and 10 kHz and over within 1.2 s, behind a gentle compressor; played
at its animation's own moment on the motion token, at most once per 60 ms,
silent while the page is hidden except for the turn, and never the only cue for anything. One audio
context per page is made, and woken, inside an event a browser counts as a gesture — a click, a
touch's pointerup or touchend, a mouse press, a key, never a touch's pointerdown (iOS starts Web
Audio only in a touchend or a click) — and again whenever the browser suspends it. A phone vibrates once when the turn comes
round, and a phone that cannot buzz (an iPhone) sees the dock's edge and "Your turn" breathe
(still under either motion guard); the screen stays awake while the viewer sits (the Screen Wake
Lock); each follows the player's own switch. Beside the moves' keys, E opens the emotes, L the hand
log, B the bank, M turns the sounds on or off (as the top bar's menu does, a check) and ? lists every
key (also in the top bar's menu), under the same rules as the moves.

## The end of the night (phase 7)

**The awards.** Under the final counts, a closed table's summary shows the night's awards, each
only when its data exists and every name on a tie, in the standings' order: Biggest pot (the most
chips one hand paid a player), Most hands won, Highest stack (the most chips held between hands,
counted only for a player dealt a hand, since a buy-in alone sets it) and Most all-ins, from the
counters every ledger row keeps; Tomato magnet (the most tomatoes landed on a player) and Most
roses given, from the throws the emote route counts beside the game. Each card has a picture (one
plain code point, the throws' the same as the emote registry's), the winners' looks and names, and
the figure it was won with. `lib/poker-night/awards` decides them and is pure; the /play page reads
the counters from the closed room's state and the throws with one projected read, both on the
server, and the summary it renders carries names, looks and figures — no counter, account or guest.
"Copy summary" adds one line per award after the standings ("Most roses given: Ben and Cy, 2
roses").

**A little celebration.** A night with awards opens with the big win's confetti, thrown from under
the heading in a fixed layer that clips it (no piece widens the page at 320 px), the same pieces on
every screen from the table's code, and the award cards stepping in one after another on the motion
token. Under reduced motion, either guard, the cards stand in place and the confetti stays unseen;
brutalist plays the cards at once.

**The table's words.** Side pot, dealer button, small blind, minimum raise, rebuy and all in are
glossary entries, the `poker-night` group homed at /poker-night (the blinds' unit and the ante stay
the solver's). The bank's Rebuys header carries its definition as a tooltip; the table mounts no
chat, so it has no "What these mean", whose rows each offer the chat.

## The Hands guide

**What it shows.** The ten hand rankings, strongest first, each with its name, the name of its
example ("Full house, eights full of fours", skipped when it is the ranking's own) and five cards,
the ones that make the hand lifted and outlined; then ties and kickers, with two pairs of aces that
only the first kicker separates and the ties a kicker does not settle (playing the board, hands
exactly alike, the ace in a straight); then the games. Every definition is the glossary's own short,
quoted under its term: Hand rankings, Kicker and Texas hold'em, three more entries of the
`poker-night` group. The guide's own lines say only what those do not, and a test rejects any of
them that shares a run of five words with the entries. Every example is held to the evaluator by a
unit test: its category is its slot's, the list falls strictly, and the lifted cards are exactly
the ones that make the hand.

**Where.** The lobby has two views, kept in the URL: Play (/poker-night, everything above) and
Hands (/poker-night?tab=hands), 44 px tabs. The Hands tab reads nothing — no lobby read, so it shows
with the kill switch on too — and carries the one "What these mean" for its three terms. At the
table, the menu's Hands and the H key open the same guide in a drawer, "Hands and games", for any
viewer: the rankings first — what a player opens it for mid-game — then ties and kickers, then the
table's own game under "At this table" before any other, the cards in the viewer's own face and
colours. A kicker hand's picture names only its own pair. Only Texas hold'em is dealt today; the list of games is where the other modes join.

**On a phone.** An example's cards sit on a line of their own under the ranking's name, 34 px wide
in the narrowest list, 40 px from 248 px (a 320 px phone's drawer and lobby column) and 44 px from
288 px, measured by the list's own width (a container query), so every screen fits five without
scrolling sideways; the name moves beside the cards only where both fit.

## State version 2 (modes P4): leaving after a hand, the host's yes on buys, asks to see a hand

**One bump for the whole batch.** `STATE_VERSION` is 2, and version 2 holds every stored field
the modes need at once — a hand's own game (`variant`), one five-card run per board in `deck` and
what is out of each in `boards`, Triple T's thrown-away cards (`discards`) and its 'discard' phase,
pots paid board by board (`winners` and `shares` as one list per board), shown hands as their
cards alone — and the stored shape accepts every game and board count from now on. What this deploy
deals is `config.ENABLED` (Texas hold'em, one board): the host and the lobby are held to it
('not-open'), and a table set to a game it does not deal waits between hands until the host picks
one it does, so a rollback never closes a live table. `migrate.v1ToV2` steps a version 1 state
(the config's game, last; rebuys 'auto' as 'approve'; `leaveAfter` off; ledger times in seconds;
a request's unread time dropped; the hand's one board; each pot paid on it; shown hands as cards),
and `migrateSummary` reads a version 1 history row. `PN_PROTOCOL` is 2 and the wire view's `v` 2,
so a page left open across the deploy reloads.

**Leave after this hand.** `leave-after {on}`: dealt into a live hand, the player plays it out as
usual — not away, nothing forced, pre-actions as ever — and is cashed out once as it completes (a
buy waiting for it dropped); it can be taken back until then. It takes the place of a sit-out asked
for and of a request, and a buy or the host's approval is refused while it is set. Not in a live hand
it is leaving now: the leave a page that stays open sends, so a deal that lands first never costs the
player a blind — they play that hand out instead. Private: a hidden commit, never on the wire.

**The host's yes on buys.** Before the first hand is dealt every seat and buy lands at once. After
it, every buy but the host's own — a newcomer's first chips, a re-sit, a rebuy, a top-up — is a
request the host approves or declines in the bank; a newcomer waiting sits with nothing, is dealt
nothing and has no ledger row until the chips land, as a buy-in. A request waits until decided,
withdrawn (`withdraw`) or its player leaves — however long the host is gone: nothing lands without
the host's yes. A host gone ten minutes (unheard from for `LIMITS.hostTakeoverMs`) may be replaced by
claim-host, which only an account holder at the table can take, and the requests then wait for the
new host. A request keeps its time: its player may change its amount or take it back only
`REQUESTS.CHANGE_MS` (3 s) after the last change ('request-wait'), so a request comes and goes at most
once every few seconds; the host hears its sound at most once a player in 20 s, and a changed amount
re-words its toast silently. The host's approve names the amount it approves; one the request no
longer says is refused (`stale`). The rebuy policy is off or on ('approve'): off stops rebuys and
re-sits, never a first buy-in.

**Asks to see a hand.** Once a hand completes, a player dealt into it who folded may ask a player
whose cards were not shown (folded, or won uncontested) to see them. The player asked answers "Show
<name>" (to the one who asked alone: in their view and in their history of the hand), "Show
everyone" (a show) or "No thanks". On the server: one ask waiting per player at a time, two a hand;
one unanswered for 15 s is a no; after a no the same player may not ask the same player again for
five hands; a player who turned off "Let others ask to see my cards" cannot be asked (the setting is
kept for a seated player and one of the hand asks are about, and dropped as anyone else leaves). The
next deal ends every ask, and one still waiting is a no, with its cooldown, even with time left — the
results pause is never longer than 15 s, so otherwise an ask its player lets go by could come back
every hand — and the one who asked is told. A cooldown is never dropped
before its five hands are up: the table keeps at most twelve cooldowns and waiting asks together,
and at that cap nobody may ask ('asks-full') until some run out. Nothing ever shows a thrown-away
Triple T card.

**Who sees it, and who is told.** A pre-action, a leave after the hand, a sit-out asked for while
the hand is live, an ask, its answer and the asks setting are hidden commits: the public seq does not
move and nothing is published. A write that changes another player's own view where the table does
not show it — the player asked, the one who asked, a player the host sat out mid-hand — moves that
player's nudge count (their room row's `nudge`): a poll sends the count it holds (`nsince`) and is
read whole when it moved, and with realtime the server says it on the player's own channel
(`poker-night:<env>:<room id>:<pid>`, subscribe only, their token alone), as `{nudge}` and nothing
else. What a write changed is read at the commit's own time (`views.nudgeKey`): an ask past its
seconds reads expired whether or not a write said so, so writing that expiry down — which another
pair's ask or answer does — nudges nobody, and no one learns the moment of a private action that is
not theirs.

**At the table.** Leaving after this hand is one tap while the player holds cards — a door beside
the early choices (its word on a wide screen), a button in the seat's row while all in, the menu's
toggle; its short word "Leave after hand" — and then the dock says "Leaving after this hand" ("Last
hand" where narrow, on a row of its own under the cards on a phone on its side) with Stay, Home
carries a dot, and the menu
offers "Stay at the table" beside "Leave now". The mid-hand leave dialog offers both, "Leave after
this hand" the primary; Home's never navigates for it, since an absent player would hold the table
up. Every leave that stays on the page sends `leave-after`; when the answer shows a deal beat it,
the table says "A new hand was dealt first: you leave the table when it ends." While a result shows,
a player who went as it completed keeps a ghost of their plate (name, look, the cards they showed,
"Left"). The host's yes: the join card says it once the game has started; a seat whose chips wait
reads "Waiting for chips" on every plate, and its own dock "Waiting for the host to approve your
chips" with Cancel (taking it back is never said as the host's no); a seat that never had chips
here reads "No chips yet." with "Ask for 2,000 chips"; the host hears a short sound and gets a toast
with Approve (a 44 px action) for each new request, a dot on Bank and Host, and bank rows that say
what each request is for. The rebuy policy is Off /
On (host approves), a radio pair. Asks: another player's plate menu leads with "Ask to see their
cards", greyed with the reason when a rule stands in the way and, once asked, how it stands (the menu
opens toward the table's middle, whole on screen); the player asked gets a prompt at the foot of the
screen, over their own corner and nothing of the table (on a phone on its side, in the dock's
column), with its seconds — to the next deal when that comes first — and three 44 px answers behind
a tap shield; a hand shown to one player alone turns up on its plate for them, flagged
"Shown to you", and in their hand log; "Let others ask to see my cards" is a switch in My look, kept
with the personal look and sent to the room for the seat. In a result's pause the polls come every
1.5 s for a player dealt into the hand, since the next deal ends every ask.

**The budgets, measured.** On the heaviest table, with every private list at its longest (sixteen
asks, the cooldowns kept, a "no asks" setting for every seat and player dealt, a nudge count on every
room row): the state 14,798 bytes (16,000), what a write reads 26,806 (27,000), the whole document
29,457 (30,000), the wire view 3,787 and its message 3,856 (4,500). Version 1 measured 14,512,
26,883, 29,534, 4,331 and 4,400: ledger times in seconds and the wire's ledger as tuples pay for the
new fields, and the room remembers its last 40 action ids, from 64.

## PLO, one board (modes P5)

**The game.** `config.ENABLED` opens PLO on one board (two and three boards came with P6, Triple T
with P7). Four cards each; a hand is exactly two of them with exactly three from the board
(`hand-name.bestOmaha`, through `variants.handValue` and `bestHand` — the engine picks winners and
the page reads shown hands with the same functions), so one card of a suit in hand never makes a
flush and a board never "plays". High only: the strongest hand takes the pot. A hand keeps its own
game: the host's pick (the host drawer's Game, from the next hand) never touches a hand in play.

**Pot limit.** A bet or a raise goes at most to the current bet plus the pot after the call: every
chip committed this hand — antes, earlier streets, every bet in front of the players, the player's
own — plus what the player owes; never below the minimum raise, never past all in. At blinds 1/2
the first player in may raise to 7; facing 7, to 24; the small blind facing 7 alone, to 23; a flop
bet into 10 is at most 10 and the raise over it 40; nine antes of 1 open to 16; a short big blind (1
of 2) to 6. The minimum raise and the reopening rules (the TDA rule, the friendlier reading) are no
limit's. The all-in move is a raise only when all in is within the cap, the call when the bet faced
is the whole stack, else 'illegal'; the client offers the same moves (`snapshotFromView` sums
`SeatView.inPot` as the pot), its raise panel tops out at Pot ("Raise to 340 (pot)", key A) and
sends a raise to it — never the all-in over the cap.

**Picking and showing the game.** The lobby: "Start a table" stays one tap for Texas hold'em, and
"Start PLO" sits under it; the form under "Set it up first" and the host drawer's Game section open
with a Game choice (a card a game: its name, the cards dealt and the limit). The game is named
wherever a table is: the top bar's second line ("PLO", the code beside it from 400 px), the felt
before the first hand, the countdown between hands when the host picked another ("Next hand: PLO, in
4 s"), a toast and a screen-reader line at its first deal ("New game from this hand: Pot-limit
Omaha."), the join card's terms with "How it plays" (the Hands guide on the table's game, for a
visitor too), the invite sheet ("Game: PLO"), its share text and the link preview, and every lobby
and Home row. The lobby reads the game from the stored config (`LOBBY_PROJECTION` adds
`state.config.variant` and `boards`), a document with none reading as Texas hold'em.

**At the table, on a phone.** The dock fans four cards, each 0.6 of a card on from the one before
and turned −6°, −2°, 2°, 6° from the bottom centre, so every card's rank and suit show (140 px wide
compact, 123 tight); between hands it holds the night's game's width. It names nothing before the
flop. Another seat's four face-down cards keep the two's footprint; a turned-up four overlap at 0.56
of a card (75 px compact, 64 tight), the box the banner and the pots keep clear of
(`stage.shownHandRect` with the count, held at every phone size by `stage.test`). The deal sends
four cards round in the time two take. Three or four face down sit a whole card's width over a
compact or tight plate (`stage.SEAT_CARDS_OVER`), so their closed fan never covers the stack's
figures. The one board keeps clear of every hand of four that may turn up wherever that leaves its
cards 18 px or more (`board.handsClear`), and a hand that meets another's — a side seat's over its
plate against the top corner's under its own — moves along its row (`stage.nudgeHands`,
`SeatPlace.shownDx`), toward the middle first; on a 320 px phone with seven seats or more taken two
can still meet.

**The Hands guide.** "The games" adds Pot-limit Omaha: the `omaha` and `pot-limit` entries quoted,
one hand drawn on one board with the five that play lifted (A♥ A♣ 7♠ 3♦ on K♥ 9♥ 6♥ 2♥ J♣: no flush,
a pair of aces), and what the table does that the entries do not say.

**The budgets, measured.** PLO's heaviest table (the same table with four-card hands, its short
stacks in by pot raises): the state 14,878 bytes, the wire view 3,862 and its message 3,925; on it
the room reads 26,886 per write and 29,537 in all — every figure within its budget.

## PLO, two and three boards (modes P6)

**The game.** `config.ENABLED` opens two and three boards, PLO's alone (`refineConfig`'s `plo-only`;
a patch that names another game and no board count goes back to one, `mergeConfig`). Each board is
dealt its own run of five at the deal and every board turns together, street by street, in the
betting and in an all-in run-out. At a showdown each pot splits evenly between the boards
(`pots.splitBoards`: the odd chips to board 1, then board 2) and each board's part goes to the
strongest eligible hand on that board (`showdown`, through `variants.handValue`), an odd chip within a
board to the first winner left of the button; a part of no chips (a pot of fewer chips than boards)
names its winners and pays nothing. An uncontested hand pays one part, whatever the boards. A
player's `wins` counts once a hand and `biggestWin` is the hand's total. The wire carries each paid
pot's winners board by board (`PaidPotView.winners: number[][]`) and the page rebuilds every share
with `pots.paidParts`, the server's own split. The result shows for 3 s, 1.2 s more for each side
pot and a second for each board past the first (`config.revealMs`).

**Picking it.** Under PLO, the start form and the host drawer's Game section show "Boards": One
board, 2 boards, 3 boards, each a 44 px choice (`components/poker-night/BoardsChoice`, the choices
`lobby.boardChoices`), with what more boards do in a line under them. The game's name carries its
boards wherever it is said ("PLO · 3 boards", "Pot-limit Omaha, 3 boards").

**Where the boards go.** `stage.stageLayout(box, seats, mySeat, boards, options)` lays one board out
at the widest cards in the band round the middle (a row counting at the width that fits a pixel over
and under it too), the nearest the middle among those within `BOARD_TIE` of the widest, one under it
only when `UNDER_BIAS` nearer, and — given `options.prefer`, where the page drew it a moment ago —
the nearest that, so the dock growing a pixel never sends it across the felt and back. The seats
nobody sits in (`options.open`) are rings alone. Two or three are one block: one over another (stack), side by side (side), or cascaded — each
lower board over the foot of the one above, a card's height × `CASCADE_STEP` (0.62) down, so the
rank and corner suit (the top `INDEX_BAND`, 0.58, of a card) of every card stay in sight — each
board's numeral in a column at its left when there is room (`BOARD_LABEL`, per fit, held to the
stylesheet). The search tries every arrangement with and without the numerals at every height in the
band round the middle and keeps the widest cards (within a pixel: stack, then side, then cascade,
the numerals, nearest the middle; the numerals outright while they keep the cards 92 % of the widest,
`LABELS_SHARE`, since the banner and the log name the boards); the block lies on the felt, its rail included, and clears every
plate, bet line and button — and every hand of four that may turn up (every seat's but the seated
viewer's own, `stage.shownHandRect`), unless that alone deals the cards under 18 px where without
it they would be larger (`board.handsClear` says which). A second layout sends every seat's bet line
straight up or down first (a side seat's along its rail, a top seat's under its plate) and is kept
when it deals the boards larger and keeps its own lines clear. Where the middle deals them under
18 px the block may sit anywhere across the felt that deals them larger: on a 568 × 320 phone with
four players at eight seats, in the free half, at about 20 px rather than 14.

The spike measured every phone's seat layer at every seat count, seated and watching: 19 px or more on
every upright phone 360 px wide or more (26 up to seven seats), 16 px or more on a 320 px one (20 up
to seven seats; 17 at 320 × 568 with nine), 20 px or more on a phone on its side (26 at 844 × 390 and
24 at 667 × 375 with eight or nine seats), 60 on a desktop (66 at 1440 × 900) — pinned in
`stage.test`, the boards clear of the hands everywhere but a few of the 320 px tables and the
smallest phone on its side. There, 568 × 320, seven to nine seats leave the boards no room at all
(as one board has none at eight and nine): they are cascaded at `MULTI_BOARD_MIN` (14 px) where
they cover least of the bet lines, the hands and the dealer button (`fallbackY`), never a plate.
Three boards are not capped at any seat count: on a phone the boards sheet carries them at 44 px.

## Triple T (modes P7)

**The game.** `config.ENABLED` opens Triple T: three cards each, one board, no limit. The antes and
the blinds are posted as in Texas hold'em; then, before any betting, the hand's throw-away
(`phase` 'discard'): nobody is on the clock, the turn number moves on once (the turn a throw names,
so a throw sent for an earlier throw-away is stale even when its card is in the new hand) and one
deadline runs for everyone, the turn's seconds but never above twenty (`config.discardMs`). Every
player still in with three cards throws one away at the same time — all in from posting or not. The
last throw opens the betting on the player after the big blind (heads-up, the button), and from there
it is Texas hold'em with the two kept. A throw out of the throw-away, a second one or a card not held
is refused; one past the deadline's two seconds of grace is stale.

**The deadline.** The clock throws for everyone still to throw (flagged the clock's): the odd one out
when two match in rank (three alike: the last dealt), else the lowest — from the cards alone, no
ranking table. It counts no timeout and makes nobody away, so a slow throw never sits a player out
or folds a blind they posted. Every writer gives it the timeout slack, since the throw-away has no
actor. A player who leaves (or is removed) in it folds when they owe chips; one who owes none — the
big blind, all in — has a card thrown for them at once (flagged 'auto'). A hand everyone else left
in the throw-away is won uncontested with three cards, never shown (a show turns up all three: none
was thrown away).

**Private.** A card thrown away is stored in `Hand.discards` and in the history row, and leaves the
server only to its owner: `MeView.discard` for the hand in play, `players[].discard` in their own
history. The log line says only that a card went (`discard`, amount 0); the public view says how
many cards a seat holds face down (three, then two) and which seats are still to throw
(`HandView.toDiscard`). A throw is a visible write — the seat's count moves. A page whose seat's
count no longer matches the cards it holds (the deadline threw for it) reads its whole view
(`feed.needsPrivate`), and everyone dealt in polls at the near pace through the throw-away
(`feed.nearTurn`). Shown hands, asks answered and shows are the two kept, never the third.

**At the table, on a phone.** The dock's cards become a radio group of three ("Card to throw away"),
side by side and never overlapping, each a target of 44 px or more (158 px wide compact, 140 tight):
a tap picks a card, which rises 10 px, dims and carries an ✕; a full-width confirm under them names it
("Throw away 7♣") or says "Pick a card first"; beside them the throw-away's seconds ("Throw away one ·
12 s") and, once a card is picked, what the two kept make. Keys with the focus on the table: 1, 2 and
3 pick, Enter throws, Escape takes the pick back (the digits only while the player keeps single-key
shortcuts on); arrows move the pick and Enter on the card picked throws it. When the throw-away
starts the drawers close, the focus moves to the cards, the turn's chime and buzz sound and a screen
reader hears the three cards. With Peek on the three stay face down until pressed, and neither a
card's name nor the confirm says which card it is. Both the cards and the confirm drop a tap that
lands as they appear. Once thrown, the card flies to the table, the two kept hold three's width for
the rest of the hand, and the row says how many players the table waits for, with "Leave after this
hand" beside it. Every other plate shows three backs and "Discarding…" until its player throws (where the flag has
no room under the plate — a phone on its side at seven seats or more — a dashed ring on the plate,
`stage.flagRoom`), a third back then flying to the middle; the felt counts the throws ("Everyone throws away one card · 3
of 5 done") with the seconds inside the board's empty place — the count alone ("3 of 5 thrown away")
where the board is narrow, nothing where it is narrower still (a small phone on its side). Under reduced motion the pick is drawn in place and no card is seen
leaving.

**The Hands guide.** "The games" adds Triple T poker: its glossary entry (`triple-t`) quoted, and
what the table does that the entry does not say — the blinds first, everyone at once and nobody
seeing the cards thrown away, the timer and the rule a card is thrown by, and that it counts no
timeout.

**The budgets, measured.** Triple T's heaviest table (Texas hold'em's with nine cards thrown away
kept): the state 14,833 bytes, the wire view 3,795 and its message 3,858 — below PLO's three boards,
which the room document is measured on.

**On the felt.** One `.pn-board` a board where the stage put it (`data-pn-board-index`, each read
aloud as "Board 2: …"), the numerals as pills, empty places as the cloth's dashed outlines (filled
with the cloth in a cascade). A card that plays keeps its ring and glow but does not lift on two or
three boards, which would cover the board over it. The whole block is one button, at least 44 px
each way, that opens the boards sheet (`components/poker-night/BoardsSheet`): each board under its
name at 44 px a card, the cards that play lit at a showdown and who won the board with what. The
pots and the banner keep clear of the whole block. The seat ring takes taps on its seats alone
(`.pn-seats` passes the rest through), so the block under it keeps its own.

**The reveal.** Each street's cards turn board after board (`BOARD_TURN_GAP`); at a showdown the
cards that play light board after board (`BOARD_LIFT_STAGGER`), a hole card with the first board it
plays on (`reveal.liftBoardOf`). The banner says a line a board — "Board 2: Ana wins 600" over the
board's largest winner's hand, or its chips player by player ("Board 1: Ana 400 and you 200") —
and one line, with no hand, only when one player won every board's share of every pot ("Ana wins
every board: 1,800"; a side pot someone else took keeps the lines). Each pot's shares first fly
from its pill to each board's numeral (the board's left end without one), then each board's stream
runs from there to its winners. A pay-out that would run past the result's showing plays faster,
every time in proportion (the flights' own lengths too, `Scheduled.pace`), so it ends with it. The
hand log prints each street board by board, a shown hand's name on each board and a line for each
board's share of each pot; the screen reader hears the same. The dock names what the viewer's cards
make on each board, each kind behind its board's numeral badge and kept whole, the line breaking
only between boards, the names in full as its accessible name. Cut short, a banner line says its head
without the chips ("Board 2: Ana", "Ana wins": each seat's "+N" says them), never cutting inside a
number or a board's name; it names fewer boards before it cuts a name, and then only to a letter and
an ellipsis. The boards sheet draws the places still to come in the palette's muted ink.

**The budgets, measured.** PLO's heaviest table on three boards (every pot split three ways): the
state 15,048 bytes, the wire view 3,936 and its message 3,999. The room read 27,056 bytes, over its
27,000: the room now remembers its last 36 action ids (`KEEP.APPLIED`, from 40), so it reads 26,944
per write and 29,595 in all. The wire keeps 500 bytes to spare, so the protocol and the wire's shape
are unchanged (the compaction ladder's first step, the ledger as tuples, came with version 2).

## The table's small conveniences (modes P8)

**A move stays for the street.** Once its tag has popped, each seat's last check, call, bet or raise
stays on its plate, still, until the street ends (`reveal.streetTags`, from the log's tail; never a
blind, an ante, a fold — the plate says Folded — or a card thrown away), so a glance mid-street shows
every seat's move.

**The raise panel on a phone.** A "−" and a "+" (44 px) round the amount step a big blind at a time,
held to the legal range; the slider takes a row of its own where the dock is narrow. The panel opens
at the size the player last confirmed before the flop, or after it, when this turn offers it — the
minimum, ½ or ¾ pot, never the all-in or the pot — kept in this browser alone, never sent.

**One tap back in.** Out of chips with a rebuy allowed, the dock's one tap buys the whole buy-in the
table allows: "Rebuy 2,000 chips", or "Ask for 2,000 chips" where the host says yes first (once the
game has started, for anyone but the host, while the host is here); "Other amount" opens the bank,
only when the table allows another. A narrow dock says the figures alone and leaves "Out of chips"
to the plate.

**Small doors.** The winner's banner is a button that opens the hand log; for a seated player an
open seat says "Invite" and opens the invite sheet; the table's menu turns the sounds on or off.

**Hands turned up in a crowded column.** Where a turned-up hand of two would cover another seat's
plate, the flag under one, another hand or the board — nine seats on a 375 or 320 px phone, seven
or more on a phone on its side — every hand is placed again, each next to its own plate: along its
row, under a side seat's plate, or beside it toward the middle, whichever covers least (a plate
weighing most, then the board, the pots' band by the board, another hand, a flag), keeping one of
the pots' bands clear. Nine hands up on a 320 px phone can still leave two meeting, and the banner
then sits where the pot was, flagged. PLO's hands of four keep the row's nudge alone.

**The dock's hand name on a phone on its side** sits on a row of its own under the cards and wraps
to two lines; the longest a name gets ("Full house, threes full of sevens") fits whole at 568 × 320.

**A plate's word with no room under it.** A plate's status ("Folded", "All in", "Offline", "Waiting
for chips", "No chips yet" for a seat that never had chips — never "Out of chips") hangs under it where
it clears every other seat's plate, cards, blind's mark and word; where it has none, the plate carries
it in its stack's place (the stack stays in the plate's name), Triple T's "Discarding…" as a dashed
ring. A phone on its side, the dock in its column, seats eight two to a side column, the bottom row's
corners and one at the top, so every word hangs there; seven and nine keep the upright slots.

**After the payout.** The winner's banner keeps clear of the pots paying out and the winners' "+N"
only where that leaves room; else it is placed clear of the table alone, since both leave within a
second or two, so the long pause after a hand never leaves it over a plate.

**The join card on a phone on its side** starts under the top bar and is as tall as the screen
leaves it; its form scrolls inside and "Sit down" and "Just watch" sit at its foot, always in sight.
"How it plays" opens the Hands guide on the table's game, before the rankings.

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
Their row in the bank stays for the night. Their own cards stay theirs to see after a fold, until
the next deal, and reach the table only if they show them in the pause. A player who folds and then
leaves still reads Folded on their plate until the hand ends; their own view says they are leaving
(`MeView.next`, private), so their dock says they leave when the hand ends and offers nothing more,
and Home takes them straight home. The same private part says when a "Sit out next hand" waits, and
the dock offers to take it back.

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
such as the scene and the lock (at once), approve or decline a rebuy, remove a player, and sit
another player out (from the next deal while they are in the hand in play, at once between hands;
never the host themself). It only ever sits out: the state never says who asked for a sit-out, so a
take-back could deal in a player who asked to sit out themself — dealing a player back in is theirs
alone, with "Deal me in" while it waits and "I'm back" once it has begun. The host offers it from
the bank (a line of its own under the player's row) and from the Players list's More menu. An idle table is closed by force: a live hand is called off and
every chip in it goes back.

**Limits and defaults.** Small blind at least 1, big blind at most 100,000, an ante up to the big
blind; buy-ins between one big blind and the lower of 500 big blinds and 10 million; a turn of 15
to 120 seconds; a pause of 3 to 15 seconds. The defaults: 8 seats, blinds 10/20, 2,000 chips each,
a 30-second turn, rebuys automatic.

**What leaves the server.** Only the projections in `views.ts`, copied field by field: the deck,
other players' hole cards and pre-actions, and unshown cards in history never leave, nor does the
moment someone chose a pre-action (it moves no public seq). The client's
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
  whose clock still moves, nothing to write, a pre-action's write that nobody else's view or the
  wire tells from the one before); the document read back as the room it was made from, a commit
  writing nothing out of band, and the public seq (`seq` less `hiddenCommits`) on every read.
- **input, http, limits, bucket, env, code, names, avatar, links, results, guest-token, pass:** strict
  bodies; every error code with its status and sentence; the same-origin matrix and the capped body
  read; the buckets on an injected clock; the guest cookie and the seat pass refusing every
  tampered, expired or foreign token.
- **lobby:** empty sections hidden; closed and idle tables never listed and never under the cap;
  friends' tables without the reader's own; a night finished once closed or idle, and linked while
  its room is kept; no account id in what the page gets; every choice of the start form a config
  `checkConfig` accepts; the name and look an account starts from, and what is read of the look a
  browser kept. The navigation test keeps /poker-night under Learn and /play/CODE in no section.
- **channel, realtime, feed:** the channel names the env and the room's id, never the code; the
  token's capability is subscribe alone; realtime is on only for a key shaped like one and off by
  the kill switch; against a stand-in SDK, nothing is loaded or sent without realtime, a token is
  requested for the pid on the room's channel and handed over field by field, a commit goes out as
  the state message under its room and seq, and a failed publish is answered, never thrown; the
  monitor's every threshold, its five minutes of both, the baseline after an attach, and
  `realtimeOk` heard from messages and Unchanged answers; a message drops a finished hand's cards
  and a cleared pre-action, the whole view a message already showed still lands once for the
  viewer's own part, and one a later message overtook keeps it when nothing between could have
  changed it; the poll's pace while that part is stale; the first token's retries never end.
- **emotes, sounds, keys (phase 6):** the registries' code points, a request read only with its exact
  keys and registry ids (the route's schema agreeing), a channel message read the same way, every
  verdict of who may send what, the write's filter and pipeline (the cooldown, the seq, the ring,
  the awards), who sees what (muted, stale, their own), the on-screen caps and the timers' phases, a
  throw's path, the impacts' pieces the same on every screen and their CSS safe in a `<style>`;
  every sound recipe within its gain, its layers' mix, frequency and length over many seeds (one seed
  one sound, a landing of its own for each thing thrown), the 60 ms gate and the hidden page, each
  animation's sound at its moment; the room's keys, never a move's; the emote seq moving only
  without a gap. The browser QA sends emotes through the API (the cooldown's 429, a watcher's 409,
  throwables off 403, the awards) and between two screens (a reaction, a tomato's `data-splat` on
  the target's avatar, a mute, the pop's own tone, the reduced-motion screen drawing only the
  impact), every reaction and throw kept under the top bar, a phone woken by a tap alone, Peek, and
  a look saved mid-hand going on the table when the hand ends.
- **stage, reveal (the table's layout):** every plate, bet line, dealer button, the board and the pot
  inside the box and apart from 320 px phones to wide desktops; the winner's banner and the line
  under it (the countdown, the pause) clear of every plate and its flag, open seat, turned-up hand,
  the dealer button and the board's lit cards on 390, 375 and 320 px phones and a 1440 px desktop,
  for every seat count, button and viewer with every hand turned up: the full banner where the pot
  sat when there is room, else the compact one, else apart from its line, sized by the stylesheet's
  own paddings and line heights. The browser QA measures it at those sizes in a showdown with the
  side seats' hands up.
- **looks, avatar, personal, picker (phase 5):** a look for every scene and felt the settings allow,
  ids from outside read back as the default, never a throw; `LOOKS_CSS` the registry rendered, safe
  in a `<style>` (data-attribute selectors and `--pn-*` properties only, balanced, nothing fetched)
  and held to its contrast — text on every felt, every suit on the paper, the four-colour deck's four
  inks, a chip's ink on its face, a scene's two inks apart; the avatar's 52 code points against an
  allowlist, every spec the dice roll read back, one part changed at a time; the personal look read
  field by field, what a browser keeps laid over an account's look, and only our ids saved; the
  pickers' arrow keys.
- **awards, summary, glossary (phase 7):** each award only when its data exists, every name on a
  tie in the standings' order, a stack counted only for a player dealt a hand, a counter or a throw
  for a row the night let go of never read; the room's stored throws read only for a pid, a registry
  throwable and a whole count; the pictures one plain code point each, the throws' the emote
  registry's; the celebration the same for the same code and within its spread; from a played hand
  and an all-in run-out, the summary's awards, its clipboard lines, and no counter in what the page
  gets; every award's words over every count and name; the six table terms in the glossary with no
  currency word, their aliases resolving, and the `poker-night` group last, homed at /poker-night.
- **server guard and route guard:** no client file, and nothing under `components/`, reaches
  `shuffle.ts` or the poker-night server modules by any chain of imports, nor any of Ably but
  `ably/modular` (and that only by `import()`), which no server module reaches; every route runs
  `playerRequest` on Node within ten seconds; no GET, page or the shared checks reaches
  `mutateRoom`; no route grants a cross-origin request; and no server module logs a room, a state
  or a document. The proxy matcher test pins `/play/CODE` open and `/play`, `/players`,
  `/playground`, `/poker-night` and `/poker` gated.
- **copy:** every hand name, log line and refusal held to the no-advice list and a currency ban.
