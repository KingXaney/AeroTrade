---
paths:
  - "lib/poker-night/**"
  - "components/poker-night/**"
  - "components/home/PokerNightChip.tsx"
  - "components/home/HomePokerNight.tsx"
  - "app/(play)/**"
  - "scripts/qa/qa-poker-night*.mjs"
---

# poker night — the table

Contracts of this feature that a map cannot show: a part of `AGENTS.md`, kept in a file of its
own so it loads only beside the files its `paths:` name. A `### name` in the text is that
feature's file in this folder; Shared, owner and the numbered invariants are in `AGENTS.md`;
the map is `docs/MAP.md`.
Part 2 of 3: the rest is `.claude/rules/poker-night.md` and `.claude/rules/poker-night-extras.md`.

- The table, `/play/CODE` (`app/(play)/play/[code]`, a route group with none of the app's shell):
  its layout settles the address before anything streams — a 307 to the canonical code, a real 404
  for one that names no table (`app/(play)/play/not-found.tsx`) — and the page renders
  `components/poker-night/PokerNightRoom` (the viewer's view, or a visitor's table behind the join
  card), once closed `NightSummary`, and with the kill switch on the lobby's note. The layout, the
  page and its metadata read the room only through `lib/poker-night/page-gate.readTablePage` (once
  per request): a code that names no table spends the address's miss counter, as on the routes, and
  an address past it reads every code as gone, so no one learns which codes exist faster than the
  counter allows. It talks to the route handlers only, through
  `components/poker-night/table-api`, the seat pass on every request that may carry it (on a move it
  only names the player's own rate bucket).
- `components/poker-night/useTableFeed` runs `lib/poker-night/feed` (pure): `feedReducer` applies a
  view only when it is newer; `nextPollDelay` paces the polls; `createTicker` (over `tickerStep`)
  decides when the clock's tick goes — one out at a time, at most `TICK_RETRIES` more per due time on
  a doubling backoff, armed again only by a new due time or role or once the poll gets through after
  failures, never by an answer that lands meanwhile. A visitor polls nothing; the join card reads the
  page again every `VISITOR_REFRESH_MS`, so a removed, locked or full card learns it opened.
- Realtime (Ably) is on only where `lib/poker-night/channel.realtimeEnabled` says so: an
  `ABLY_API_KEY` shaped like one (Production only in Vercel, the key restricted to channels
  `poker-night:*` with publish and subscribe) and `POKER_NIGHT_REALTIME` not `off`; everywhere
  else — previews, local servers, the QA harness (run.sh blanks the key), CI — the table polls. The
  channel is `poker-night:<env>:<room id>`, never the code; the server publishes, in `afterCommit`
  for every commit whose public seq moved, `{name: 'state', id: <room>:<seq>, data: WireView}` —
  the public wire view without the people, so
  no hole card, deck, viewer's part or config — through `lib/poker-night/realtime` (`Ably.Rest`,
  built on first use, `serverExternalPackages` in `next.config.ts`); `budget.test.ts` holds the
  message, envelope and all, to `WIRE_BUDGET_BYTES` (4,500). A failed publish stamps the room's
  `rt` out of band (`store.markRealtimeFailure`, at most once a minute) and every answer says
  `realtimeOk: false` for five minutes — a view, a message, and an Unchanged too (the head reads
  `rt.failAt`). GET token (`app/api/poker-night/[code]/token/route.ts`)
  answers `{realtime: false}`, or the channel and an Ably `TokenDetails` — subscribe only, 15 minutes,
  the pid as clientId, a Mongo counter of 20 per 10 minutes per player — so no browser publishes or
  enters presence. `components/poker-night/realtime-client` loads `ably/modular` (`BaseRealtime`,
  `WebSocketTransport`, `FetchRequest`) by `import()` only when a table goes live, and never gives up
  on a first token (`feed.tokenRetryDelay`: 5, 15 and 45 s, then every five minutes); `useTableFeed`
  feeds each wire into the same reducer by seq, reads the whole view once after every (re)attach and
  whenever `feed.needsPrivate` says the viewer's own part went stale (a GET state's `since` is how
  far that part is known fresh, `FeedState.privateSeq`, which a wire carries on only while no move of
  the viewer's own is out), and lets the connection go after five minutes hidden. A whole view that
  comes back older than a message keeps its own part under the newer table when nothing between could
  have changed it (`feed.graftPrivate`: the same hand, seat, config and people), else is read again
  (`feed.readAgain`); while the part is stale the poll keeps the table's own pace (`feed.pollPace`),
  and a change to the table never puts off a poll already due. `feed.monitorStep`/`transportOf`
  choose the transport — the channel alone with a 20 s safety poll, both for `BOTH_FOR_MS` once it
  stalls (`transportPolicy`, `watchdogTripped`; `realtimeOk` taken from every answer and message, and
  from the page's own view at the start), polls
  alone without realtime — shown as `data-pn-mode` (Live only over a connected channel trusted alone)
  and `data-pn-transport`, beside `data-pn-seq` (the seq drawn). What goes on the channel is
  `lib/poker-night/room-doc.wireOfRoom` of the committed room. Each player also has a channel of
  their own, `poker-night:<env>:<room id>:<pid>` (`channel.privateChannelName`; the token's
  capability names both, `TokenReply.private`), on which `afterCommit` publishes only
  `{name: 'nudge', data: {nudge}}` (`realtime.publishNudge`) when a commit nudged them; the feed
  (`FeedState.nudge`/`knownNudge`, `isBehind`) reads their view then, and `needsPrivate` also asks
  for it as the hand they were dealt completes (who they may ask). `isWire` takes version 2 only
  and `http.PN_PROTOCOL` is 2, so a page left open across the deploy reloads. The QA seam: a dev
  server with
  `NEXT_PUBLIC_PN_RT_FAKE=1` (run.sh only) lets a page that defines `window.__PN_RT_FAKE__` take its
  messages from it — `qa-poker-night`'s relay builds them with `wireOfRoom` from Mongo and delivers
  them held back, out of order and twice; a production build compiles the seam out.
- The animations are `lib/poker-night/events.diffViews` (ids keyed by the hand number and the log's
  length, so each fires once) on `lib/poker-night/choreography`'s timeline, drawn by CSS keyframes
  from custom properties (`--pn-at`, `--pn-dur` in `--motion-base` units; a flight's `--pn-dx` /
  `--pn-dy` from `lib/poker-night/stage`) and exposed as `data-anim`: no SMIL, no Web Animations,
  every class in both reduced-motion guards
  (`lib/theme/__tests__/motion-guards.test.ts`). Opacity never sits on a turning card (a fold turns
  the inner `.pn-fold-turn`). The one thing a timer moves is a winner's stack counting up, formatted
  text on the same token (`components/poker-night/CountUp`).
- The winner's banner and the line under it (the next deal's countdown, the pause) go where
  `lib/poker-night/stage.bannerPlan` finds room (`stage.resultBannerPlan` at the table: clear of the
  pots paying out and the winners' "+N" too where that leaves room, else of the table alone, since
  both leave within a second or two — never over a plate for the long pause after a hand), clear of every plate and its status flag, open seat,
  turned-up hand (`stage.shownHandRect`), the dealer button and the board with its lit cards' lift:
  the full banner with the line under it nearest the board on the pot's side, then its other side,
  then the felt's empty bands; then the compact banner (a line a winner, no avatar, wrapped when
  narrow); then each apart from the line; then cut short. Cut short, a line keeps its head whole, or
  says it without the chips (`BannerLine.short`: "Board 2: Ana", "Ana wins", the seat's "+N" saying the
  chips; `BannerPlan.short`), never cutting inside a number or a board's name: the plan names fewer
  winners — fewer boards — before a name is cut, and then only to a letter and an ellipsis. A line
  with no room is not drawn (the top bar says a pause too), and only when no banner fits does it name
  fewer winners. Both are drawn
  top-anchored in a wrap exactly the width found, never wider, from `reveal.bannerLines`' words and
  `stage.BANNER`'s sizes, which `stage.test` holds to the stylesheet and clears at 390, 375 and
  320 px phones and a 1440 px desktop for every seat count and button; `qa-poker-night` measures it
  there in a showdown with the side seats' hands up. While the pots pay out under it, it also keeps
  clear of their pills and of the winners' "+N" as it rises (`stage.winPopRect`); it comes in where it
  lands, growing from its middle (`.pn-banner-drop`), so on its way in it covers nothing its place
  does not.
- PLO's two and three boards (P6; `config.ENABLED.boards` 3, PLO alone): each board its own run,
  every board turned together; each pot split evenly between the boards (`pots.splitBoards`, the odd
  chips to board 1, then 2) and each board's part to its strongest eligible hand; the wire sends each
  paid pot's winners board by board and the page rebuilds the shares with `pots.paidParts`.
  `stage.stageLayout`'s fourth argument lays them out as one block (`stage.board`, each board in
  `stage.boards`) — stacked, side by side or cascaded (`CASCADE_STEP` leaves every card's index
  band, `INDEX_BAND`, in sight), each board's numeral at its left where there is room and it
  costs the cards no more than 8 % (`BOARD_LABEL`, held to the stylesheet; `LABELS_SHARE`) — on the felt and clear of every plate, bet line and
  button, and of every hand of four that may turn up unless that alone deals the cards under 18 px
  (`board.handsClear`); a second layout sending the bet lines along the rails is kept when it deals
  them larger; where the middle deals them under 18 px, anywhere across the felt that deals them
  larger (`board.x`, the felt's free half). The stage knows the seats nobody sits in
  (`StageOptions.open`, TableScreen's empty seats but a gone player's ghost): a ring alone, no plate,
  bet line, button or hand there, so on a 568 × 320 phone with four players at eight seats the boards
  move into the free half (about 20 px, not 14). The floors the spike measured are pinned in
  `stage.test` (16 px on a 320 px phone, 19 on a wider one, 20 on one on its side); on a 568 × 320
  phone with seven to nine seats taken nothing fits, and `fallbackY` puts them at `MULTI_BOARD_MIN`
  where they cover least, never a plate. The block is one 44 px button to
  `components/poker-night/BoardsSheet` (44 px cards); the seat ring (`.pn-seats`) takes taps on its
  seats alone. A lit card never lifts on two or three boards. The reveal's `BoardLook`,
  `liftBoardOf` and `scoopOf`: cards light board after board; the banner says a line a board, and
  one line only when one player won every board's share of every pot. The choreography turns each
  street board by board, flies each pot's shares to the boards' numerals (`stage.boardAnchor`)
  before each board's stream, and plays a pay-out that would outlast the result's `revealMs`
  faster, in proportion (`Scheduled.pace` scales the flights). The dock says each board's kind
  behind its numeral's badge (`dock.boardStrengths`, `components/poker-night/HandStrength`,
  `.pn-board-num`), each board's part whole on its line and the line breaking only between boards;
  the hand log and the announcer board by board; the boards' count is picked under PLO by
  `components/poker-night/BoardsChoice`. The boards sheet draws the places still to come in the
  palette's muted ink (`.pn-sheet-board .pn-slot`: it is portaled out of the room, where no felt is set).
- One board (`stage.stageLayout`, `placeBoards`): the widest cards in the band round the middle,
  at every pixel from it, a row counting at the width that fits a pixel over and under it too; among
  those within `BOARD_TIE` of the widest the nearest the middle, one under it only when
  `UNDER_BIAS` nearer — and, given `StageOptions.prefer` (where TableScreen drew it a moment ago, kept
  as a share of the height for the layout it belongs to), the nearest that, so the dock's line wrapping
  a pixel never sends the board across the felt and back. A dealer button sits beside its bet line on
  the side away from the middle, half a pixel (`EDGE`) past touching, so a floating hair never moves
  it. In PLO (`StageOptions.handSize` 4) the board keeps clear of every hand of four that may turn up
  wherever that leaves its cards 18 px or more (`board.handsClear`); Texas hold'em's and Triple T's
  board is laid out as before. A hand turned up that meets another's moves along its row
  (`SeatPlace.shownDx`, `--pn-shown-dx`; `stage.nudgeHands`, `stage.handsMeet` allowing a lit card's
  lift under the hand over it): side and bottom seats placed first, then the top row, toward the middle
  first, else the other way, clear of every plate (and, two cards, the board placed first) — or the
  hand it meets moves instead. Where that still leaves a hand of two over another seat's plate, the
  flag under one (sized as "Out of chips"), another hand or the board — a crowded column of side seats:
  nine on a 375 or 320 px phone, seven or more on one on its side — `stage.placeHands` places every
  hand again (`SeatPlace.shownDy`, `--pn-shown-dy`), a seat at a time round again until none moves and
  then two that still meet together, at the place covering least (`HAND_WEIGHT`: a plate, the board, a
  pots' band, another hand, a flag): along its row, on its plate's other side (under a side seat's) or
  beside it toward the middle — always next to its own plate — and keeps one of the pots' bands by the
  board (`potBands`) clear, so the pots keep a place; never its own plate. Nine hands up on a 320 px
  phone or eight on the smallest phone on its side can still leave two meeting (the banner then sits
  where the pot was, flagged); PLO's four keep the row nudge alone. The emotes' spot reads a hand moved
  under its plate (`emotes.emoteSpot`).
- A plate's status word (`lib/poker-night/plate.plateStatus`: "Folded", "All in", "Offline",
  "Waiting for chips", "No chips yet" for a seat that never had chips here — never "Out of chips" —
  …) hangs under it where `stage.flagRoom` finds room clear of every other seat's plate (an open
  seat's ring), its cards face down, its blind's mark and its flag, every seat's word weighed
  (`SeatRing`); where it has none (`stage.flagsOnPlate`: a crowded column on a phone on its side,
  the widest word on a 320 px one), the plate carries it — Triple T's "Discarding…" as a dashed ring
  (`data-pn-mark="discarding"`, the felt's count and the backs saying who is still to throw), any
  other word in the stack's place, the name beside the avatar (`data-status-on="plate"`,
  `.pn-plate-status`; the stack stays in the plate's accessible name). A squat box — a phone on its
  side, the dock in its column (`layout.isSquat`) — seats eight two to a side column
  (`layout.SQUAT_SLOTS`), so every word hangs there; seven and nine keep the portrait slots, whose
  hands, pots and banner find room where no squat placement leaves them all.
  Three or four cards face down (Triple T's, PLO's) start a whole card's width over a compact or tight
  plate (`stage.SEAT_CARDS_OVER`, `seatCardsRect`'s count, `PotSeen.backs`), above the stack's figures
  that their closed fan would cover; `qa-poker-night-modes`' `tableLayout` counts flags over other
  seats and figures under their fan.
- The pots go where `lib/poker-night/stage.potPlan` finds room on the felt inside its rail
  (`stage.feltSpan`), never over a card (the board's and its lift, a seat's face-down pair, a turned-up
  hand), a plate, its flag or blind's mark, an open seat, the dealer button, a bet line out at the size
  ChipStack draws it (`stage.betLineSize`, an all-in's pulse included) or a winner's "+N": every pot
  its own pill in full ("Main pot 600", "Side pot 1: 1,350") in a row, then short (`FELT_COPY`: "Main
  600", "Side 1: 1,350", counts as a plate prints them), then in rows, then the last side pots
  gathered ("2 more: 5,050"), every pot in one pill last ("4 pots: 6,250") — the nearest to the board
  over it, under it or beside it, the fuller words weighing in their favour. It keeps clear of what
  shows now (`PotSeen.now`, which TableScreen reads off the view) and, where that is near enough, of
  what may yet show — every seated hand but the viewer's turned up, every bet line — so the pills hold
  their place and move only when something lands where they are. With no room for that on the felt
  it lets a "+N" rise over a pill, then leaves the felt, and only where nine seats crowd the smallest
  phone on its side does it cover anything: the least, a flag or a bet line before a card, a plate or
  the board (the plan's `keeps`, `clear` and `felt`, the page's `data-pn-pot-*`). Each pill is drawn
  at the plan's size (`.pn-pot-pill`, `stage.POT_PILL`, held by `stage.test` for one pot to four at
  every seat count on the phones upright and on their side and the desktop); the sweep lands in their
  middle and each pot's chips stream from its own pill (`stage.potCentre`). `qa-poker-night-modes`
  builds three pots and measures every pill against every card, plate, bet line, "+N", the dealer
  button and the banner.
- The table's single-key shortcuts (`lib/poker-night/keys`) act only with the focus on the table,
  and only while the player keeps them on (My look, `PersonalLook.shortcuts` in this browser); Enter
  on a focused button is that button's. A host removes a player only by a press held for two seconds
  (`components/poker-night/HoldToConfirm`), never a typed name, and lets them back in from the host
  drawer.
- The way out: Home in the top bar, and the way back wherever a guest can land (the join card, the
  summary, `error.tsx`, `not-found.tsx`, the kill switch), is `components/poker-night/HomeLink` —
  `/` by a full page load (the landing page for a guest through `proxy.ts`), never `/poker-night`,
  which sends a guest to sign in. A seated player's Home and Leave go through `LeaveDialog`, read on
  every render from `lib/poker-night/overlays.leavePlan`, so a deal that lands while it is open makes
  it the mid-hand one, which offers both ways: "Leave now" (`leave`) and "Leave after this hand"
  (`leave-after`, the primary, which never navigates — from Home too). Every leave that keeps the
  player on the page — the dock's Leave, the dialog's between-hands Leave — is `leave-after`, sent
  through `components/poker-night/useLeaveAfter`, which toasts how it landed (a deal that beat it to
  the table, `overlays.leaveAfterLanded`: "A new hand was dealt first …"); only "Leave now" and Home's
  "Leave and go" send `leave`. The dock offers Sit out and Leave whenever the viewer is not playing a
  hand (`dock.sitOut`/`leave`, the pause after a showdown they reached included) — one tap unless
  `leaveTapAsks` — and after leaving a left panel (`leftState`). What the viewer's own seat does when
  the hand ends is `MeView.next` ('leave', 'leave-after', 'sit-out'; private, never on the wire),
  since a folded or all-in plate keeps reading so: once they left now the dock says they leave when
  it ends and offers nothing more, and Home goes straight home (`overlays.homeAsks`, `leftNow`);
  while they leave after the hand the dock says "Leaving after this hand" ("Last hand" in a narrow
  dock) with Stay in place of who the table waits for (hidden on their own turn), Home carries a dot
  and the menu offers "Stay at the table" beside "Leave now"; while a "Sit out next hand"
  waits, the dock says so and offers "Deal me in" (`dock.takeBack`, a sit-in). A row that takes
  another's place under the thumb (the action bar, the early choices — keyed by `dock.preRowKey`, the
  hand and its choices — and the seat's controls) drops pointer taps for `keys.TAP_SHIELD_MS`
  (`useTapShield`, `data-pn-armed`). A folded hand stays its player's to see, dimmed, until the next
  deal (`me.hole` is kept; `dock.mucked`), and reaches the table only by "Show my cards" (a
  secondary button after Sit out). The host sits another player out — from the bank's row (a line of
  its own under it) or the host drawer's More menu, one hook (`components/poker-night/useHostSitOut`)
  over the map `TableOverlays` keeps — with the engine's host op `sit-out` (from the next deal in a
  live hand, at once between hands). It only ever sits out: the state never says who asked, so a
  take-back could deal in a player who asked to sit out themself; dealing a player back in is theirs
  alone. The player's page tells the host's from its own (`overlays.rememberSitOut` over the seat's
  state and `me.next`, with this browser's `SIT_OUT_ASK_KEY` note for another tab or a reload). A
  complete hand's `HandResultView.gone` names the seats whose player went since the deal, read
  through `reveal.playerAt`, so a result never names the wrong player — nor tells someone who took a
  winner's seat in the pause that they won (`reveal.viewerSeatIn`).
- Leave after this hand, at the table: one tap while the viewer holds cards in the hand in play
  (`overlays.leaveAfterOf`, `dock.leaveAfter`) — a door beside the early choices (`Dock`'s
  `LeaveAfterToggle`, its word "Leave after hand", `TABLE_COPY.leaveAfterShort`, in a wide dock,
  shielded with them; `.pn-pre-row` puts it on a row of its own in a dock of 18rem or less, a phone
  on its side), a button in the seat's row while all in (the same short word), the menu's toggle —
  and, once folded, the break's Leave. "Last hand" is only the state's word, beside the cards with
  Stay; in a dock of 18rem or less that line (`.pn-dock-line`: the seconds, who the table waits
  for, the note, the hand's name) takes a row of its own under the cards. An early choice's label
  breaks after its slash (`PreActions`), never spilling over the next button. The seat empties as
  the hand completes; while its result shows, a seat whose player went keeps a ghost of their plate
  (`SeatRing`'s `GhostSeat` from `HandResultView.gone`: the name, the look, the cards they showed,
  "Left"; never a menu or "Sit here"), which the pots and the banner keep clear of (`TableScreen`).
- The host's yes, at the table: the join card says it once the first hand is dealt
  (`JoinView.needsApproval`, `JOIN_COPY.approvalNote`); a seat whose chips wait reads "Waiting for
  chips" on every plate (the public `requests`) and its dock "Waiting for the host to approve your
  chips" with Cancel (`withdraw`; `dock.waitingChips`), as the bank does, however long the host is
  gone (no way round them: `overlays.buyAsksHost`). A Cancel (marked as it is sent,
  `overlay-requests.markOwnWithdraw`) or a leave is never said as the host's no
  (`overlays.requestEnded`: 'withdrawn'). A seat that never had chips here reads "No chips yet."
  with one tap, "Ask for 2,000 chips" (`bank.buyOptions`' `first`), never "Out of chips" or a
  top-up. The host sees a toast with Approve for each new request and hears a short sound (`sounds`
  'request') at most once a player in `REQUEST_SOUND_MS` (`components/poker-night/AskPrompt`'s
  `RequestWatch`, `overlays.requestAlerts`); a request whose amount changed is said again in its
  toast's place, silently, its Approve naming the new amount; a dot on Bank and Host, and the bank's
  rows say what each is for (`overlays.requestKind`: to sit down, a rebuy, a top-up). The bank's
  figures keep a gap at their left; under 22rem (a 320 px phone's drawer, a container query) the
  Rebuys column gives way to a count under each name (`BANK_COPY.rebuysCount`). A table toast's
  action is a 44 px target (`overlay-kit.TOAST_ACTION`). The rebuy policy is Off / On (host
  approves) in the start form and the host drawer (`components/poker-night/RebuyChoice`, a radio pair
  over `ChoiceGroup`, whose chosen ring is drawn inside the option, so a panel's edge never cuts it).
- Asks, at the table: another player's seat menu leads with "Ask to see their cards"
  (`overlays.askOffer` over `canAsk`, `askBlocked` and the viewer's own `asks`): offered, greyed with
  its reason, or how the viewer's ask of them stands — read at the server's time, so an ask that ran
  out frees the rest with no write; the menu opens toward the table's middle (`stage.menuSide`), whole
  on screen. The player asked sees `AskPrompt` at the foot of the screen, over their own corner and
  nothing of the table — no other plate, turned-up hand, board, pot or banner (`.pn-ask-wrap`: over
  the dock, under the thumb; on a phone on its side, in the dock's column) — while one waits
  (`overlays.askToAnswer`): who asks, its seconds, which run to the next deal when that comes first
  (`overlays.askEndsAt`), "Show Ana" / "Show everyone" / "No thanks", 44 px behind a tap shield, and a
  short sound ('ask'). A hand shown to the viewer alone turns up on its plate for them ("Shown to
  you", `Seat`'s `privateCards`) and in the hand log ("Shown to you: Ana held …", `hand-log`'s
  `seenLines` from `shownToMe` until the history row has it); `AskWatch`, mounted for every joined
  viewer, toasts how each of their asks ended (`overlays.askNews`), the next deal ending one first
  included ('dealt'). "Let others ask to see my cards" is a switch of the personal look
  (`PersonalLook.allowAsks`, saved with an account), which `PokerNightRoom` sends as `allow-asks`
  whenever the seat lacks it (the room forgets it for a player without a seat). Through a result's
  pause the polls come every 1.5 s for a player dealt into the hand (`feed.askWindow`), since the
  next deal ends every ask.
