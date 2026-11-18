# Books integrity — five ways a paper account could go silently wrong

Status: in progress (2026-11-17)

## Why

An audit of main on 2026-11-17 (five lenses, each finding challenged by a second reader) found
five places where an account's numbers could become wrong without anything saying so. None was
observed in production; each was read from the code and confirmed there.

| # | What happened | Where |
|---|---|---|
| 1 | A stock split was applied to the price history and never to the holding: ten shares bought at $1,200 read as 10 × $120 after a 10-for-1 split, and the 16:10 snapshot kept that −90% for good. | `lib/trading/analytics.ts`, `lib/prices/store.ts` |
| 2 | A holding Finnhub stopped quoting (a delisting, a merger, a renamed ticker) could not be sold, and the snapshot job skipped its whole account every night, so the account's chart stopped. | `lib/trading/orders.ts`, `lib/trading/snapshots.ts` |
| 3 | A fill was two writes, the account and then the trade row. A failure between them answered "Order failed" after the cash had moved; pressing Buy again doubled the position. | `lib/trading/orders.ts` |
| 4 | The snapshot job skipped accounts and the benchmark with a `console.warn`, then stamped "Snapshotted N account(s) + SPY" whatever had been written. One cron, no second pass. | `lib/jobs/functions/trading.ts` |
| 5 | The AI Navigator was the one automated trader with no market-session gate: on a Monday holiday it filled at Friday's close, and one refused quote at 10:00 cost it the week. | `lib/jobs/functions/navigator.ts` |

## 1. Splits

**The books are kept in today's shares.** A split changes how many shares a dollar of a company
is, not what the account is worth, so nothing an account earned or paid moves.

- **What a split is here.** `StockSplit` (`database/models/stock-split.model.ts`): one row per
  symbol and ex-date with the ratio as Yahoo states it (`numerator`-for-`denominator`), the
  instant it took effect (`at`, the ex-date's 09:30 ET open) and `prevClose`, the close of the
  session before it **in the new basis**, read from the same payload that carried the event.
- **Where they come from.** Yahoo's chart with `events=split`, in a call of its own
  (`lib/prices/yahoo.fetchYahooSplits`; parsing pure, the payload untrusted). The bars call is
  untouched: its comment records that `events` once drew a 429 there, so a refused split call
  costs one detection, never the price history.
- **Applying one to an account** (`lib/trading/splits-store.applySplitToAccount`): one guarded
  write that changes the position (shares × ratio, the same total cost over more shares),
  appends the split to the account's own `splits` list and bumps `splitRev`. The account's list
  is what its ledger is read with, so the stored position and the ledger always agree: there is
  no moment in which one is in new shares and the other in old.
- **Which fills are in old shares.** Those before the split's instant. A fill between the
  previous close and the end of the ex-date's session is read by its price instead: nearer
  `prevClose` it is already in new shares, nearer `prevClose × ratio` it is in old ones (ratios
  between 0.8 and 1.25 are too close to tell and go by the clock). The first new-basis fill
  fixes the account's own cut (`before`), stored with its split.
- **Reading the ledger.** `lib/trading/splits.ts` (pure) restates a fill from before the cut in
  today's shares: quantity × ratio, price ÷ ratio, the total and the realised P&L untouched.
  `lib/trading/ledger.ts` applies it to every per-account trade read (the ledger, the bounded
  history, /history's feed, the CSV), and `lib/income/store.ts` to the trades it replays, so
  receipts, lots, habits, `reconcile` and the income clock all see one basis: the one the
  rebased price history and the per-share dividends are already in.
- **Fractions.** A 3-for-2 or a reverse split can leave half a share. The holding keeps it;
  orders stay whole shares; a sell that would leave less than one share sells the fraction with
  it (`applyFill`, which now returns the quantity it moved).
- **When.** A job of its own, `stock-splits`, weekdays 09:40 ET: every held symbol is checked,
  a symbol with a new split has its bars rebuilt, then every account that traded it before the
  split is brought up to date. The 16:10 snapshot job checks again any holding whose quote sits
  more than 15% from its last stored close, before it values anything.
- **What a reader sees.** The trade log states it once, under the table: "Fills before a split
  are shown in today's shares: NVDA 10-for-1 on Jun 10." A dividend paid before the split is
  restated the same way in the Income panel.

Known limits: a split is detected for a symbol that is held when it happens, so a sold-out
position's old fills stay in old shares; snapshots already written before a late detection are
not rewritten (the job's stamp says how late a split was applied); a sell placed between the
ex-date's open and the job's 09:40 run books its realised P&L against the old average cost.

## 2. A holding that stops quoting

**Gone** means Finnhub has given the symbol no price for three sessions
(`lib/trading/gone.isGone` over the quote sheet's own `fetchedAt`; pure).

- **Valuing it.** A page values it at its newest stored close of any age, dated, as it already
  did inside seven days. The snapshot job does the same for an account whose only unpriced
  holdings are gone, and marks the row (`AccountSnapshot.atClose`), so the account's chart no
  longer stops. An unpriced holding that is not gone is an outage: the account is skipped for
  the day, as before.
- **Leaving it.** A gone holding gets one action on /portfolio, "Close at the last close": the
  whole holding sold at that stored close, the fill's reason saying so and from which day.
  This is the one place a fill is made without a live quote, and only for a symbol that has
  had none for three sessions. `executeOrder` itself is unchanged: there a missing quote stays
  missing.

This bends the rule "a fill needs Finnhub's price at that moment" on purpose, in the narrowest
form that frees a stuck account. The last close is the wrong price for a cash merger (the deal
price) and generous for a bankruptcy; the fill says which close it used.

## 3. A fill that survives its second write

- The account write now carries the trade it is about to record (`pendingFill`, with the trade
  row's id chosen in advance). The row is then inserted and the field unset
  (`lib/trading/pending-fill.settlePendingFill`): idempotent, a duplicate key means done.
- If the insert fails, the order **succeeded** and says so; the next order on the account, the
  nightly income job and the split job settle it first.
- Until then the pages show the fill anyway: every per-account trade read appends an unsettled
  `pendingFill` to what it read.
- The account write is guarded on `cash` (as before), on `splitRev` and on there being no
  unsettled fill.
- The Navigator's orders carry an idempotency key (`navigator:<userId>:<week>:<side>:<symbol>`),
  as the strategies' and the pickers' do.

## 4. A snapshot job that says what it did

- `writeSnapshots` returns what it wrote, what it valued at a stored close and what it skipped
  with the symbols that had no quote; the benchmark step's answer is kept. The stamp reads, for
  example, "3 of 5 accounts; 2 skipped, no quote for XYZ; SPY not recorded".
- A second cron at 16:40 ET writes only the accounts the first pass left without a close for
  the day, so it asks Finnhub only about those.

## 5. The Navigator waits for the market

- The weekly run trades only while the market is open; otherwise it scores, saves the week's
  targets and claims nothing. A Tuesday 10:00 ET cron tries again, and does nothing when no
  enrolment is still waiting for its week.
- A claim taken on a morning when a quote the plan needs was refused is given back before any
  order is sent, and the stamp says why. A symbol that is gone (section 2) never holds a run
  back: it is left out, as before.
- The on-demand run (enrolment, "Run AI now") is unchanged.

## Verification

To be filled in: `npm run check`, `npm run build:check`, the browser suites run and their counts.
