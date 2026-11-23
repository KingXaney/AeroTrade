---
paths:
  - "lib/research/**"
  - "components/research/**"
  - "docs/research/**"
  - "lib/learn/copy/research.ts"
---

# research

Contracts of this feature that a map cannot show: a part of `AGENTS.md`, kept in a file of its
own so it loads only beside the files its `paths:` name. A `### name` in the text is that
feature's file in this folder; Shared, owner and the numbered invariants are in `AGENTS.md`;
the map is `docs/MAP.md`.

- `docs/research/log.md` is the research log: every idea behind a brain's scoring, decay, sources or
  rails, the papers it rests on, how the app measures it and what would change it, numbered R1, R2, …
  (never reused or renumbered; a dropped idea is marked rejected). Read an idea's entry before moving a
  constant it names; add an entry before shipping a change that rests on research, and say
  `Research log R<n>` in a comment beside what it built. `lib/__tests__/research-log.test.ts` holds the
  log and the code to each other; `lib/__tests__/docs-map.test.ts` checks its paths.
- The signal check is how an idea is judged (R1). `lib/research/ic` is the maths (Spearman information
  coefficients per week, their mean, a Newey–West t-statistic for overlapping horizons, `icTable`);
  `lib/research/returns` the forward returns, open to open with dividends. `lib/culture/signal-check`
  measures inside the culture backtest (`simulateCulture` returns the rows; stored under
  `SIGNALS_VERSION`, whose change rebuilds the backtest) and `lib/navigator/signal-check` over the
  Navigator's weekly record. `components/research/IcTable` draws both — /culture?view=picks and
  /brain?view=navigator — neutral like every record: rows in the registry's order, no sign colour
  (invariant 12). Inside ±2 is noise; with many rows read at once the log asks ±3.
