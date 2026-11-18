---
paths:
  - "lib/learn/**"
  - "components/learn/**"
  - "app/(root)/glossary/**"
  - "lib/actions/learn.actions.ts"
  - "components/dashboard/widgets/learn/**"
  - "scripts/qa/qa-learn*.mjs"
---

# learn

Contracts of this feature that a map cannot show: a part of `AGENTS.md`, kept in a file of its
own so it loads only beside the files its `paths:` name. A `### name` in the text is that
feature's file in this folder; Shared, owner and the numbered invariants are in `AGENTS.md`;
the map is `docs/MAP.md`.

- `lib/learn/glossary` is every metric, news concept and rail, pure and client-safe;
  `lib/learn/banned` the one no-advice word list (invariant 12).
- `lib/learn/copy/<feature>` is every learner-facing sentence, as pure exports. A panel whose one
  `WhatTheseMean` is led by its own paragraph keeps its term list beside that paragraph —
  `LUCK_TERMS`, `HABITS_TERMS`, `TIM_TERMS` — and the paragraph says only what those definitions
  do not, held by `lib/learn/__tests__/panel-method.test.ts`. That disclosure is
  `components/learn/WhatTheseMean`; a label's definition is `components/primitives/Term`.
- `lib/learn/reasons` is the reason decoder: one ordered grammar over every string the rules,
  `planOrders` and the engine write. A round-trip test runs every rule's branches through it, so a
  reworded reason fails there, not on the page. `NAVIGATOR_GRAMMAR`/`decodeNavigatorReason` are
  the AI Navigator's own list — the two engines share the rebalance shape under different bands,
  so the caller picks — glossed from `lib/navigator/config.ts` and round-tripped over
  `scoreUniverse`/`diffToOrders`.
- `/glossary` is every definition, for every account, grouped by where the number lives
  (`components/learn/GlossaryGroups`, the frame's sentences `GLOSSARY_PAGE_COPY` in
  `lib/learn/copy/learn`); each entry's id is its key. A `/learn#term` or `/learn?tab=glossary`
  address — ⌘K, Today's lesson and the daily email handed it out while the glossary was a tab of
  `/learn` — is sent to `/glossary#term` by `components/learn/LearnRedirect` on the client, since
  the server never sees a hash. `/learn` itself is the owner's lab (### lab); any other account is
  sent to `/games`. The beginner course was removed on 2026-10-12.
- Today's lesson (`lib/learn/moments`, `lib/learn/lesson`; the
  `components/dashboard/widgets/learn/TodaysLesson` widget): a fresh moment first, from the account
  or a followed strategy's rebalance, stamped seen in `learn.lessonsSeen` by
  `lib/actions/learn.actions`; else the concept today's topic articles used, matched by equality.
  The server reads are `lib/learn/facts-store` and `lib/learn/lesson-store`; `lib/learn/missions`
  is pure.
