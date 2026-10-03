# A useful News card, add/remove on Topics, a robot launcher, and "messages left"

**Date:** 2026-10-03
**Status:** Implemented — `afeaf71` (the News card and what "new" means), `48b6f61` (the manage view), `b683869` (the robot launcher), `5b2f949` (the chat's usage caption), with the fixes `c9ef9c4`, `976ccbc`, `3325267`, `273212e`. Amends [UX revamp](2026-10-02-ux-revamp.md) (the chat button leaves the header) and [Followed topics](2026-08-29-followed-topics.md) (a topic can be removed from the index).

## Context

Four complaints from the owner the day after the revamp shipped, and what was behind each:

- **The News hover card was bland and said thousands of articles were unread.** `unseenCountFor` counted every stored article of a topic the reader had never opened — up to 60 a day for the 30 days the `TopicArticle` TTL keeps — and only a topic's own page stamped it seen. The card was titled "Topics", linked to `/topics` under the News icon, and showed a count and three names: no headline, no briefing, no time.
- **Removing or adding topics was slow.** Removal lived only on a topic's own page (kebab → confirm → redirect); the starters appeared only after unfollowing everything.
- **The chat button sat top-right beside the account menu**, where the revamp had put it to stop it covering the last panel's corner. The owner wanted it bottom-right again, as a friendly robot that tells tips on the Topics page — above all that the chat can build a topics list from the reader's interests, which its `followTopic` tool already made true.
- **Nothing showed what was left of the AI allowance**: three fixed windows (30/hour, 60/day per reader, 200/day shared) were visible only when they refused.

Decisions taken with the owner: the robot **is** the chat button; **no premium tiers, no credits and no Brain lock** (asked and withdrawn in the same conversation); the chat **shows how many messages are left** against the existing limits, the shared budget included.

## What shipped

**News.** Two stamps with two meanings. `Topic.lastSeenAt` still means "the reader opened this topic" (and still drives the first-week step); a new no-default `newsSeenAt` on the preferences document means "the reader last opened News", stamped on `/news` and the `/topics` index and cleared in place on the rail through a window event, not a refresh. The per-topic count is bounded at the source: articles published after the reader's last look at that topic, counting back at most 24 hours (the daily email's window), counted to 100 at most and printed as "99+". The card leads with the day's briefing headline when it passes the reader's outlet filter, says when they last looked, and lists three topics with their newest allowed headline and a "N new" badge only when N > 0. The dot — on the rail and now in the mobile drawer — means a followed topic has an article newer than that look, and a hidden outlet never lights it.

**Topics.** `/topics?edit=1` is the manage view: one row per followed topic with Edit (the shell's one composer, which now stays on the page) and an immediate Remove whose toast carries Undo (a re-create under the same slug and keyword set); chips for the starters and the brain's suggestions not yet followed, followed in one batch; the 16-slot count and cap. No stored state — the view is the URL plus what the set itself implies. The topic page's own confirmation is unchanged.

**The robot.** The launcher is an inline-SVG robot in `currentColor`, 56px, fixed bottom-right at every width (the content wrapper gained bottom padding so it covers no panel), bobbing, blinking and tilting on hover by CSS keyframes alone — each class in both reduced-motion guards, the loops stopped by name in brutalist. On the topics pages, while the panel is closed, it speaks: a chrome-surface bubble 15 s after arrival, 12 s on screen (held while the reader hovers or focuses it), the next 90 s later, none twice in a browser session, the lead tip ("tell me what you're into…") first and the rest in the day's order. "Try it" prefills the composer through the same door as "Ask in chat" and sends nothing.

**The chat.** A read-only `peekRateLimit` beside `takeRateLimit`, a pure `lib/chat/usage` over the three windows, a GET route the panel reads on open and after every reply or refusal, and a caption under the header: the reader's day allowance and the shared budget always, the hour only while it is the wall and low, one "resets in" clause. It never spends: the exact-count assertions of the chat-tutor suite hold with it in place.

## Deliberately not done

- Home's Topics widget still prints each topic's latest headline without the outlet filter (the loader has no preferences read); the card closes that gap for itself only.
- The composer's and empty state's pre-existing inline labels stay where they are; the browser QA pins them exactly.
- Server truth for the News dot mid-session (`router.refresh()` from the marker) — the window event is enough and costs no second render.

## Verification

`npm run check` (166 files / 1,895 tests), `npm run build:check`, and the 14 browser-QA suites (every page at 1440 and 390), with a visual sweep diffed against the pre-change baseline. The implementation ran as four branches in parallel worktrees, each reviewed adversarially before the merge.
