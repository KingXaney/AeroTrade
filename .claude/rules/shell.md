---
paths:
  - "lib/shell/**"
  - "components/shell/**"
  - "app/(root)/layout.tsx"
  - "lib/learn/copy/shell.ts"
  - "scripts/qa/qa-shell.mjs"
---

# shell

Contracts of this feature that a map cannot show: a part of `AGENTS.md`, kept in a file of its
own so it loads only beside the files its `paths:` name. A `### name` in the text is that
feature's file in this folder; Shared, owner and the numbered invariants are in `AGENTS.md`;
the map is `docs/MAP.md`.

- `lib/shell/navigation` is the one nav registry. A section (`NAV_SECTIONS`) is one icon on the
  rail (`components/shell/Rail`) and one row of the mobile drawer; its pages are the tabs
  `components/shell/SectionTabs` shows above the page (none for a section of one page), and
  `match` names routes it owns that are not tabs (`/stocks/AAPL` lights Markets). Friends and
  Settings are `ACCOUNT_PAGES`, in the avatar menu. Every `href` is a page file — the test checks.
  A section or a page flagged `owner: true` (the Strategies and Brain sections; `/learn`, the
  owner's lab) is for the accounts `lib/lab/owner.isLabOwner` admits (### owner): the `(root)`
  layout decides the audience from the session and hands `navSectionsFor`/`navPagesFor` to the
  Rail, SectionTabs, the drawer and ⌘K, so anyone else has no Strategies or Brain icon and their
  Learn section begins at the games (a section left with no page is dropped too); `NAV_SECTIONS`
  stays the full registry (the Quick Links widget draws the public lists).
- The rail never widens: a name is a tooltip, a summary (Portfolio, News) a portaled hover card,
  and anything the reader must see without hovering — something new in a followed topic since
  they last opened News, a holding valued at cost, a pending friend request — is a dot on the
  icon or the avatar (invariant 8). The News card (`components/shell/NewsSidebarCard`, the pure
  `lib/shell/sidebar.toSidebarNews`) is the day's briefing headline through the reader's outlet
  filter, "since you last looked", and three topics with their newest allowed headline — never
  "0 new". The dot's stamp is `newsSeenAt` in `database/models/user-preferences.model.ts`, written
  once per visit by `components/news/NewsSeenMarker` (on `/news` and the `/topics` index) through
  `lib/actions/news-feed.actions.markNewsSeen` and read with the outlet filter by
  `lib/news/feed-store.getNewsReaderPrefs`; the stamp never revalidates — the shell clears its dot
  from `lib/shell/news-seen` (the `aero:news-seen` window event, as `lib/chat/ask` opens the chat)
  and settles on the next full load. The shell's own sentences are `lib/learn/copy/shell`.
- ⌘K (`components/shell/SearchCommand`, which takes the audience's `pages` and `owner` from the
  `(root)` layout through the Header) draws Pages, Learn, Stocks, then the topic row, and Enter
  runs the first row that can be run. `lib/shell/palette.paletteRows` decides the stock rows and
  whether the topic row can run: no stock row and a waiting (disabled) topic row until the search
  has answered for the text in the box, and still waiting when the search did not answer
  (`unavailable`, said as `SHELL_COPY.searchUnanswered`, never as "No stocks found") or the
  glossary has not landed. The topic row is keyed on waiting/ready, because cmdk selects a
  mounting row and never one that stops being disabled, and is pinned to the list's foot
  (`.search-topic` in `app/globals.css`), since as many as 25 stocks stand before it. An Enter
  pressed while the stock search is out, with no page or glossary row drawn, is kept for that
  text and opens the first stock when the search answers — a stock only, never the topic row.
  Its Learn rows are `lib/learn/where.searchGlossaryFor`: only entries the reader's /glossary
  renders.
- What every signed-in page loads first stays small: `lib/shell/__tests__/first-load.test.ts`
  walks the layouts' static imports into the client files and fails when the glossary, the chat
  panel, the markdown stack or three.js is reached without being asked for. ⌘K fetches the
  glossary (`import()`) at its trigger's first hover, focus or touch and when it opens;
  `components/chat/ChatWidget` loads the panel the same way; `lib/learn/copy/robot` imports nothing.
- The header repeats no section: logo, the one `components/shell/SearchCommand` trigger (which
  also finds pages, `searchPages`), the account menu. From md the trigger sits in the bar's true
  middle (`.header-bar` in `app/globals.css`: two equal side columns, the middle narrowing so each
  side keeps 12rem); below md it is an icon beside the account menu, a circle `--search-h` across
  that a coarse pointer presses 44px across (a transparent `::before` round it). The landing page's header
  keeps the plain `.header-wrapper`. The bar's row fills the bar
  (`.header-wrapper` height 100%, the grid's row centred), so the logo, the search and the avatar
  sit on its middle line however tall the bar is drawn, and the account button's `-mr-2` puts
  its edge as far from the right as the logo is from the left. The assistant's launcher is not in the bar:
  `components/chat/ChatWidget` floats the robot (`components/chat/RobotMascot`) fixed bottom-right
  at every width, over the page — 48px below md, so a phone's first screen keeps its own links clear
  of it, and 56px from md — and the `(root)` layout's content wrapper (`app/(root)/layout.tsx`) ends
  in `--content-pb`, room for its size, its offset and 0.75rem of air, so it never covers a page's
  last panel nor meets it as a hover grows it (with no air its top sat on the panel's edge).
- How much room the frame takes is the density tokens on `:root` in `app/globals.css` (`--header-h`,
  `--rail-w`, `--rail-tile`, `--search-h`, `--content-pt`/`-px`/`-pb`/`-max`, `--sticky-top`), each
  declared once (`lib/theme/__tests__/density.test.ts`), read by the frame's rules in the
  components layer (so a class at a call site still wins) and by the shell's own classes. An
  anchor and a sticky panel stop at `--sticky-top`, through `html { scroll-padding-top }` and
  `lg:top-(--sticky-top)`, never an offset of their own (only poker night's Hands drawer, which
  scrolls inside itself, keeps a scroll margin).
- On a phone a tab track (`.tab-track`: `components/shell/SectionTabs`, `components/primitives/Tabs`)
  is one row that scrolls sideways. `hooks/useCurrentInTrack` keeps its current tab in sight — placed
  at once on load, gliding there on a change unless motion is reduced — and names the ends of the
  row with more to scroll to in `data-edge-fade`, where the row fades out (`app/globals.css`), so a
  tab cut at the screen's edge reads as a row that goes on; the sums are `lib/shell/track-scroll`
  (`scrollToShow`, `edgeFade`). Only a row that scrolls sideways is marked: a box whose overflow
  shows (a track from md, the topics' rail from lg) never is, however far a child is drawn past its
  sides. The fade is `EDGE_FADE_REM` wide and the hook keeps that much of the row beside the current
  tab, both in rem, so a reader's own browser size moves them alike (`track-scroll`'s test holds
  the stylesheet to it).
