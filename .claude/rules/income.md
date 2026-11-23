---
paths:
  - "lib/income/**"
  - "components/income/**"
  - "lib/jobs/functions/income.ts"
  - "database/models/account-income.model.ts"
  - "lib/learn/copy/income.ts"
  - "scripts/qa/qa-income.mjs"
---

# income

Contracts of this feature that a map cannot show: a part of `AGENTS.md`, kept in a file of its
own so it loads only beside the files its `paths:` name. A `### name` in the text is that
feature's file in this folder; Shared, owner and the numbered invariants are in `AGENTS.md`;
the map is `docs/MAP.md`.

- `lib/income/accrual.ts` is the only accrual clock (invariant 11). It also builds the Income
  panel's receipts: each month rebuilt to the cent from its own rows (`groupIncomeActivity`),
  `explainDividend`, `missedExDates`.
- `lib/income/store` is the nightly credit; `lib/income/page-store.getCashApy` is the one cached
  rate read, behind both the Income panel's APY and the order ticket's month of interest
  (`lib/income/accrual.interestOverDays`).
- An `AccountIncome` row is one credit, keyed by account, epoch, kind, date and symbol, and that key
  is unique (`scripts/migration-indexes.mjs`). Every sum of stored rows counts a key once
  (`lib/income/accrual.distinctIncomeRows`): before the index existed in production, two runs at
  once could each write a day's rows and the winner credited both (August and September 2026),
  which `migrate:accounts` step 4 repairs. A waiting account names what holds it back
  (`readinessOf`: the T-bill rate for a day, or a symbol's dividends).
