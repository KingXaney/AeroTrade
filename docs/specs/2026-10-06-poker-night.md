# Poker night: a hold'em table you share by link

**Status:** Shipped (2026-10-07), merged from `feat/poker-night`. Phases 1 to 7 of 8: the pure
engine, the room server and its API, the playable table and lobby on polling, live updates over Ably,
looks and avatars, emotes and the table's feel, and the night's awards with the table's glossary
terms, each with its unit tests and browser QA. Live updates switch on once `ABLY_API_KEY` is set in
Production; until then every table polls. The extras (phase 8) follow.

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
recipes — a card's snap, a chip's click, a check's knock, a fold's swish, a winner's arpeggio, the
turn's chime, an emote's pop and a landing that fits the thing thrown (a splat, a pop for a rose or
confetti, a fizz, a bounce) — each at most 0.3 gain, between 40 Hz and 8 kHz and over
within 1.2 s, played at its animation's own moment on the motion token, at most once per 60 ms,
silent while the page is hidden except for the turn, and never the only cue for anything. One audio
context per page is made, and woken, inside an event a browser counts as a gesture — a click, a
touch's pointerup or touchend, a mouse press, a key, never a touch's pointerdown (iOS starts Web
Audio only in a touchend or a click) — and again whenever the browser suspends it. A phone vibrates once when the turn comes
round; the screen stays awake while the viewer sits (the Screen Wake Lock); each follows the
player's own switch. Beside the moves' keys, E opens the emotes, L the hand log, B the bank, M
turns the sounds on or off and ? lists every key (also in the top bar's menu), under the same rules
as the moves.

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
  every sound recipe within its gain, frequency and length, the 60 ms gate and the hidden page, each
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
