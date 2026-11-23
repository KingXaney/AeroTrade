---
paths:
  - "lib/poker-night/**"
  - "components/poker-night/**"
  - "components/home/PokerNightChip.tsx"
  - "components/home/HomePokerNight.tsx"
  - "app/(play)/**"
  - "app/(root)/poker-night/**"
---

# poker night — the Hands guide, emotes, sounds, looks and awards

Contracts of this feature that a map cannot show: a part of `AGENTS.md`, kept in a file of its
own so it loads only beside the files its `paths:` name. A `### name` in the text is that
feature's file in this folder; Shared, owner and the numbered invariants are in `AGENTS.md`;
the map is `docs/MAP.md`.
Part 3 of 3: the rest is `.claude/rules/poker-night.md` and `.claude/rules/poker-night-table.md`.

- The Hands guide: `lib/poker-night/hands-guide` (pure) holds the ten rankings strongest first, each
  a five-card example with the cards that make it (`RANKING_EXAMPLES`), the kicker pair
  (`KICKER_EXAMPLE`) and the games (`GUIDE_GAMES`: Texas hold'em, PLO and Triple T, each with its
  glossary entry, the limit's entry when it is not no limit (PLO's `pot-limit`) and its anchor;
  `guideGames` puts the table's own first among them — `guideGameOf` of `variants.modeOf` at the
  table — after the rankings and ties in the drawer, which a player opens mid-game for the rankings;
  PLO's section draws `PLO_EXAMPLE`, one hand on one board, the five that play lifted).
  `hands-guide.test` holds every example to the evaluator. `components/poker-night/HandsGuide` draws it with no hooks, so the lobby's Hands
  tab renders it on the server and `components/poker-night/HandsDrawer` at the table (the menu's
  Hands, the H key, any viewer). A game's anchor takes its scroll margin from the caller
  (`scrollMargin`): none in the lobby, where the page's scroll padding lands it under the bar; the
  drawer, which scrolls inside itself out of that padding's reach, passes `scroll-mt-24`, the one
  offset `lib/theme/__tests__/density.test.ts` allows. Each definition is the glossary's own short,
  quoted under its `<Term>` (`hand-rankings`, `kicker`, `texas-holdem`, `omaha`, `pot-limit`, in the `poker-night` group), and
  `HANDS_COPY` says only what they do not: the copy test rejects a run of five words shared with
  them. The lobby is two views (`?tab=play|hands`, `components/primitives/Tabs` at `size="md"`); the
  Hands tab reads nothing and shows with the kill switch on, and `[data-poker-night-lobby]` marks
  Play only.
- Emotes (`lib/poker-night/emotes`, pure): thirteen reactions, sixteen phrases and ten throwables,
  each glyph one Emoji 12.0 code point kept as a number (never a glyph in a `.tsx`), each id worded
  by `EMOTE_COPY` — no free text anywhere. Seated players only (`checkEmote`); a throw needs the
  host's `throwables` and another seated player. `app/api/poker-night/[code]/emote/route.ts` writes
  out of band, never through `mutateRoom`: one conditional `findOneAndUpdate`
  (`room-doc.emoteWrite`, through `store.pushEmote`) whose filter is the sender's 1.2 s cooldown
  (`emoteAt.<pid>`, stamped with the request's arrival, `receivedAt`, so no counter is written and
  a second emote inside it is 429; the picker's cooldown starts again on the answer), whose pipeline
  gives the emote the room's next `emoteSeq`, keeps the last `KEEP.EMOTES` and counts a throw in
  `awards` for the night summary; `after()` publishes it as the channel's `emote` message.
  Browsers merge emotes by id (`feed.withEmotes`: the emote seq moves only without a gap, so a poll
  never skips one) and draw them in `components/poker-night/EmoteLayer` — lifetimes on timers
  (`EMOTE_TIMING`), at most `ON_SCREEN_CAP`, nothing older than 8 s, only the impact under reduced
  motion, muted all (`PersonalLook.muteEmotes`) or one player for the visit (`SeatMenu`). Where
  they sit is `emotes.emoteSpot` and `throwPath`'s ceiling, from `stage`'s sizes (`AVATAR_PX`,
  `SHOWN_CARD_PX`, `TABLE_TOP_ROOM`, held equal to the stylesheet): clear of a seat's turned-up cards
  and tag, under a plate along the top, never behind the top bar; an impact lands on the target's
  avatar (`stage.avatarCentre`), one per plate (a new one replaces it), with its own landing sound
  (`emotes.landingSound`), told whichever settles the screen first — the store's timer, or new
  emotes arriving the moment the throw lands (`emotes.landedBetween`).
- The table's feel (`components/poker-night/TableFeel`): sounds synthesised by Web Audio from
  `lib/poker-night/sounds`' recipes — layered, physically shaped tones and filtered noise: a card's
  swish and snap, two to four clay chips clacking, a knock, the muck's sweep, and each thing thrown its
  own landing (`HIT_SOUND_IDS`, `emotes.landingSound`: a fish's 60–180 Hz body, wet slap, falling
  squelch and droplets; a tomato's splat and drips; an egg's crack then splat; …) — each part with its
  own attack and exponential fall (`partLevel`, the player's envelope), played from a seed
  (`soundParts(id, seed)`: a cue's key, a landing's emote id through `soundSeed`, else fresh), so one
  seed is one sound on every screen and no two throws, chips or cards quite alike; the turn's chime,
  the arpeggio, the pop and the two notes of a request never vary (`FIXED_SOUNDS`). `sounds.test`
  holds every recipe over many seeds to `SOUND_LIMITS` (a part ≤ 0.35 gain, its layers together ≤ 0.75,
  40 Hz–10 kHz, ≤ 1.2 s); the parts meet in a master gain behind a gentle compressor. Each sound at its
  animation's moment on the motion token, one audio context made and resumed inside a
  gesture a browser counts (`sound-player.stayUnlocked`: click, a touch's pointerup or touchend,
  mousedown, keydown — never a touch's pointerdown — again whenever it stops running), at most
  once per 60 ms, silent while hidden but for the turn's chime; a buzz on a
  phone's turn — and, for a phone that cannot buzz, the dock's edge and "Your turn" breathing on
  `.pn-pulse` (`.pn-turn-edge`, `.pn-turn-cue`, still under either motion guard) — the screen kept
  awake while seated (`useWakeLock`), the room's keys E, L, B, M and ?
  (`keys.roomIntentForKey`, `useHotkeys`) and their list (`ShortcutsDialog`, also in the top bar's
  menu, which also turns the sounds on or off: a check, said as M says it) — each honouring the
  player's own `PersonalLook` switch.
- The table's small conveniences (P8): a move's tag stays on its plate, still, for the rest of the
  street (`reveal.streetTags` from the log tail: the last check, call, bet or raise, never a blind, a
  fold or a card thrown away; `data-tag-still`); the raise panel's − and + step a big blind
  (`bet-sizing.stepRaise`, 44 px) and it opens at the size the player last confirmed before or after the
  flop where this turn offers it — the minimum, ½ or ¾ pot, never the all-in or the pot — kept in this
  browser only (`SIZE_MEMORY_KEY`, `readSizeMemory`, `rememberSize`, `initialRaiseTo`); out of chips,
  the dock's one tap buys the whole buy-in the table allows ("Rebuy 2,000 chips", or "Ask for 2,000
  chips" where the host says yes first: `dock.rebuyTap`), "Other amount" opening the bank only when
  there is another to choose; the winner's banner is a button that opens the hand log; and for a seated
  player an open seat says "Invite" and opens the invite sheet.
- Looks (P5): every colour the table draws is a literal in `lib/poker-night/looks` — eight scenes
  (a gradient sky, an art id and an ambient loop each, `my-theme` the viewer's own palette tokens),
  eight felts, eight card backs, two faces, two suit schemes, four chip sets, the avatar colours —
  rendered to `LOOKS_CSS` (data-attribute selectors and `--pn-*` properties only, injected by the
  (play) layout and the lobby page; `looks.test` holds its CSS safety and its contrast). The DOM
  carries whitelisted ids (`sceneFor`, `feltFor`, `cardBackFor`, …); `components/poker-night/SceneArt`
  draws in `.pn-ink`/`.pn-glow` only. The host picks the scene, the felt and throwables for
  everyone (the room's settings, applied at once from the host drawer's Look section; a signed-in
  host's pick also becomes their new tables' default, `prefs-store.saveTableLook` after the
  action route answers); each player picks the rest for their own eyes (`lib/poker-night/personal`):
  kept in localStorage `aero-poker-night:me` field by field (`nextStoredMe`) the moment it changes
  at the table, laid over an account's saved look (`effectiveLook`), and saved to the account only
  from the lobby's My look (`savePokerNightProfile`, which offers what a browser changed; a save
  clears the browser's own look, `personal.afterAccountSave`, so a later save elsewhere reaches its
  tables) — /play never calls a server action. `peek` keeps the viewer's cards face down in the dock
  until pressed. A seated player's new name and look wait for the hand in play
  (`overlays.profileWaits`): My look's draft is the room's (`profileDraft`), outlasting the drawer,
  and a save mid-hand is sent by itself when the hand ends. The avatar builder edits one part at a
  time (`avatar.withPart`) and rolls only in a click handler. Whatever sits over the scene draws its
  own ground: an open seat is filled with the felt, a card that does not play dims by filter, never
  opacity.
- The night's awards (P7, `lib/poker-night/awards`, pure): `nightAwards` gives Biggest pot
  (`biggestWin`), Most hands won (`wins`), Highest stack (`peakChips`, only for a player dealt a
  hand, since a buy-in alone sets it) and Most all-ins (`allIns`) from the ledger's counters, and
  Tomato magnet and Most roses given from the throws the emote route counts in the room's private
  `awards` (`throwCountsOf` keeps only a pid, a registry throwable and a whole count). An award shows
  only when its figure is above zero; a tie names everyone, in the standings' order. Only a closed
  table's page reads them, on the server (`core.state.ledger` and `store.readNightThrows`, one
  projected findOne), and `summary.summarize` hands the page names, looks and figures — never a
  counter or an identity. `components/poker-night/NightSummary` draws them under the final counts
  and opens with a celebration (the table's `.pn-confetti` in a clipping fixed layer, from
  `awards.celebrationBits` seeded by the code, and `.pn-award-in` cards on the motion token); Copy
  summary adds a line per award (`SUMMARY_COPY.text`). The table's words — side pot, dealer button,
  small blind, minimum raise, rebuy, all in — are the glossary's `poker-night` group, homed at
  `/poker-night` (big blind and ante stay the solver's); the bank's Rebuys header is a `<Term>`, and
  the table has no `WhatTheseMean`, whose rows offer a chat /play does not mount.
