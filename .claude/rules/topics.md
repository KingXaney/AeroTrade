---
paths:
  - "lib/topics/**"
  - "components/topics/**"
  - "app/(root)/topics/**"
  - "lib/actions/topics.actions.ts"
  - "lib/jobs/functions/topics.ts"
  - "lib/learn/copy/topics.ts"
  - "scripts/qa/qa-topics*.mjs"
---

# topics

Contracts of this feature that a map cannot show: a part of `AGENTS.md`, kept in a file of its
own so it loads only beside the files its `paths:` name. A `### name` in the text is that
feature's file in this folder; Shared, owner and the numbered invariants are in `AGENTS.md`;
the map is `docs/MAP.md`.

- `lib/topics/starters` is the curated set, `lib/topics/seed` what a new account gets (once —
  invariant 9), `lib/topics/insert` the one write path.
- `lib/topics/feed-key` is the key both topics pages give `TopicFeed`, so a refresh with a new
  first page remounts it.
- `lib/topics/rail.sortTopicsForRail` is the order of the /topics rail and the Topics widget.
- The rail (`components/topics/TopicRail`) gives a topic two lines from lg — its name, whole up to two
  lines, then the age of its newest article beside its count — since one line in a rail a sixth of
  the column cut every name to a few letters. Its topics scroll inside it when they run taller than
  the window under the bar, All topics and New topic in sight above and below, so the rail, which
  sticks, never hides its last ones (the cap is 16). On a phone it is a row of chips that is its own
  scroller — the panel clips (`.glass-panel`) — kept on the current topic, its ends fading where there
  are more (`hooks/useCurrentInTrack`). From lg nothing fades: the rail does not scroll sideways, and
  its topics reach 4px past its sides only as room for a row's focus ring, which a fade cut off.
- What "new" means on every topic badge is `lib/topics/config.unseenFloor`: articles published
  after the reader last opened the topic, counting back at most `UNSEEN_WINDOW_HOURS` (24, the
  daily email's window), counted to `UNSEEN_COUNT_CAP` + 1 at most and printed through
  `lib/format.formatCapped` ("99+"). `Topic.lastSeenAt` means only "the reader opened this topic":
  `components/topics/TopicSeenMarker` stamps it on every topic view, and `lib/learn/facts-store`
  reads it as the first-week step; the News dot has its own stamp (shell).
- `/topics?edit=1` is the manage view: `components/topics/TopicsManager` over the `manage` kind of
  `lib/topics/page-store.getTopicsPageView` (returned before the merged feed and the inline fetch,
  so a round of editing never runs a search), shaped by `lib/topics/manage` (`offeredTopics` hides
  the starters and brain suggestions already followed, by slug; `slotsLeft` the 16-topic cap;
  `topicToInput` what Undo re-creates). Rows keep their stored order; Edit opens the shell's one
  composer, which stays on the page (`TopicsShell` `stayOnSave`); Remove is immediate and its
  toast's Undo calls `createTopic` from the row's own fields (a re-create under a new id, same slug
  and keyword set); starters follow through `followStarterTopics`, one first-run event for the
  batch. Removing the last topic lands on the empty state (invariant 9). The topic page's own
  confirmation, `components/topics/UnfollowTopicDialog`, is unchanged. `components/topics/TopicChips`
  is the one starter chip, keyed by slug, that the empty state and the manage view share.
- Nothing on the manage view calls `router.refresh()`: every topics action revalidates `/topics`,
  and a revalidating action re-renders the current URL in its own response (Next's server-actions
  guide), so a refresh on top would render the view twice.
