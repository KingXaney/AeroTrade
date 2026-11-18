---
paths:
  - "lib/chat/**"
  - "components/chat/**"
  - "app/api/chat/**"
  - "lib/learn/copy/chat.ts"
  - "lib/learn/copy/robot.ts"
  - "scripts/qa/qa-chat*.mjs"
---

# chat

Contracts of this feature that a map cannot show: a part of `AGENTS.md`, kept in a file of its
own so it loads only beside the files its `paths:` name. A `### name` in the text is that
feature's file in this folder; Shared, owner and the numbered invariants are in `AGENTS.md`;
the map is `docs/MAP.md`.

- `lib/chat/explain` shapes what `explainTerm` hands the model, with `lib/chat/learner-hooks` its
  per-metric account reads. `decodeQuotedReason` reads a quoted reason with the strategies' grammar
  or the Navigator's — a `writer` hint first, the other only for what the first leaves whole; with
  no hint a shape both read comes back read both ways.
- `lib/chat/quant-strategies` shapes what `getQuantStrategies` hands it: the leaderboard rows read
  through `getStrategyLeaderboard`, or one strategy's latest run from
  `lib/strategies/page-store.getLatestRun`, with each reason decoded with its def and the board cut
  to its top rows. `lib/chat/culture-brain` is the culture brain's twin for `getCultureBrain`
  (see culture).
- `components/chat/ChatWidget` mounts the one launcher — the robot, aria-label "Open Aero-AI
  Assistant", the QA's handle — and, on `/topics` pages only while the panel is closed, its speech
  bubble `components/chat/RobotTipBubble`. The tips are `lib/learn/copy/robot` (`ROBOT_TIPS`: the
  lead tip first, the rest in the day's order, none twice in a browser session —
  `lib/chat/robot-tips`, sessionStorage `aero-robot:shown`, never an `aero-chat:` key); a tip the
  reader is on — the pointer resting on it, focus inside it — is not taken away
  (`lib/chat/robot-tips.ROBOT_TIP_HOLD_MS`), and the launcher takes the focus a leaving bubble still
  holds; "Try it" prefills the composer through `lib/chat/ask.askAdvisor` and sends nothing, so a
  tip's prompt is chat input and held to the advice tier like a chip. The robot moves by CSS keyframes only
  (`.robot-bob`, `.robot-eyes`, `.robot-antenna`, `.robot-tip-in` in `app/globals.css`), each
  listed in both reduced-motion guards; brutalist stops the loops by name because the zeroed tokens
  do not stop a keyframe. No SMIL, no WAAPI: the sweep's STILL css and the guards stop only CSS.
- The panel's usage caption is `lib/chat/usage` (pure: the three windows as {used, limit, left,
  resetsAt}, the window that refuses next, and the caption's clauses) over
  `lib/chat/usage-store.readChatUsage`, served by `app/api/chat/usage/route.ts` and read by
  `components/chat/useChatUsage` on open and after each reply or refusal. It peeks through
  `peekRateLimit` and never spends: a refused request and an opened panel leave every count
  exactly where `app/api/chat/route.ts`'s `takeRateLimit` calls put it. The caption is a `<div>`
  carrying `data-chat-usage`, never a `<p>`: `scripts/qa/qa-chat-tutor.mjs` reads the panel's
  error copy from its `<p>` elements. Its sentences are `CHAT_USAGE_COPY` in `lib/learn/copy/chat`
  — the day and shared clauses always, the hour clause only while the hour is the wall and low,
  one "resets in" for the warned window else the day's, and none before a window has opened
  (invariant 8). "Messages", not model calls: one message may spend up to five model steps.
