---
paths:
  - "lib/stocks/**"
  - "components/stocks/**"
  - "app/(root)/stocks/**"
  - "app/(root)/watchlist/**"
  - "lib/actions/watchlist.actions.ts"
---

# stocks

Contracts of this feature that a map cannot show: a part of `AGENTS.md`, kept in a file of its
own so it loads only beside the files its `paths:` name. A `### name` in the text is that
feature's file in this folder; Shared, owner and the numbered invariants are in `AGENTS.md`;
the map is `docs/MAP.md`.

- `lib/stocks/key-numbers` states the stock page's feed figures as sentences that say what each
  divides: only the metric names it lists become rows; a missing or non-finite figure hides its
  row; its source line states the fetches' cache from `lib/prices/config`'s
  `FINANCIALS_REVALIDATE_SECONDS`/`PROFILE_REVALIDATE_SECONDS`.
- `lib/stocks/rules-see` is "What the rules see": each watching strategy's stored row, read by
  `lib/strategies/learn/board-narration.readBoardRow`; shared dates and values stated once.
- `components/stocks/KeyNumbers` and `components/stocks/RulesSee` are one disclosure each.
