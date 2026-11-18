# Books integrity — five ways a paper account could go silently wrong

Status: implemented 2026-11-18

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
  it (`applyFill`, which now returns the quantity it moved), and a holding of less than one share
  sells as one — on the ticket, in the sell dialog and for an automated exit.
- **When.** Three lines, because the minutes after a split's 09:30 instant are when a holding
  reads as ten shares at a tenth of the price (the strategies trade at 09:35; a reader may sell
  at 09:31):
  1. **At the fill.** An order for a symbol the account holds checks first: a stored split in
     effect is applied, and a quote more than 15% from the last stored close has Yahoo asked
     about that one symbol. If a split was applied, the order is not sent — its share count was
     sized on the old shares — and says so. If the check could not be made, it is not sent either.
  2. **The job.** `stock-splits`, weekdays 09:40 ET: every held symbol is checked, a symbol with
     a split to apply has its bars rebuilt (once per split), then every account is brought up to
     date: those holding the symbol and, for a split of the last ten days, those that traded it
     since the session before (an account that sold out in old shares still has the rest coming).
  3. **Before the snapshot.** The 16:10 job applies every outstanding split before it values
     anything, reads its accounts again, and skips an account a split reached mid-run.
- **What a reader sees.** The trade log states it once, under the table: "Fills before a split
  are shown in today's shares: NVDA 10-for-1 on Jun 10." A dividend paid before the split is
  restated the same way in the Income panel.

Known limits:

- A split is looked for while its symbol is held. A position sold out before the ex-date keeps
  its old fills in old shares (its dollars are right; only the share counts on the log are old).
- Snapshots written before a late detection are not rewritten; the job's stamp says how many
  sessions late a split was applied.
- The fill guard needs a stored close from the last week to notice a quote that looks like a
  split, and Yahoo to answer. With neither, an order in the minutes before the 09:40 job fills
  on the old shares, as it did before this change; the job then repairs the share count from the
  ledger, and the sell's realised P&L stays as booked.
- A dividend paid in the gap between a rebuilt price history and the split's application is
  credited on old shares at the new per-share amount. It needs a pay date in that gap.
- A 5-for-4 split (ratio 1.25) is told from an ordinary move by price, with 12% between the two
  readings; a first-day gap larger than that would misread one fill.

## 2. A holding that stops quoting

**Gone** means Finnhub has given the symbol no price for three sessions
(`lib/trading/gone.isGone` over the quote sheet's own `fetchedAt`; pure).

- **Valuing it.** A page values it at its newest stored close of any age, dated, as it already
  did inside seven days; a quote the sheet has not renewed in three sessions is no longer shown. The snapshot job does the same for an account whose only unpriced
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
  order is sent, and the stamp says why. A holding without a quote holds the run back unless its
  symbol is gone (section 2). A target the account does not hold has no such history, so it
  holds the run back on the week's first run only; the retry trades without it.
- A run that throws before any order was sent gives its claim back too.
- The on-demand run (enrolment, "Run AI now") is unchanged.

## Review

Three independent reviewers read the change (money maths, failure and concurrency, regressions),
each followed by a skeptic: 18 findings, 14 confirmed, 4 narrowed, none refuted. The ones that
changed the design are above: the fill guard and the wider `outstanding` (a sell in the window
between a split's instant and its application moved the wrong number of shares and a full
sell-out was never repaired), the retried and named contested write, the snapshot job's
unconditional reload, the sellable sub-share holding, the dividend restated by when its row was
written, the hold-back rule for an unheld target, the claim given back when a run throws, and
the stale quote of a gone symbol on the page. Not taken: an inclusive band for ratio 1.25 (a
trade between two rare misreadings, listed above), a per-run token on the Navigator's claim.

## Verification

- `npm run check`: lint, `tsc --noEmit`, 4,228 unit tests.
- Browser suites, on the final code: `qa-books` 43 checks, `qa-trading` 87, `qa-steady-prices`
  52, `qa-income` 30.
- Not exercised end to end: detection against Yahoo itself (the suites run with
  `STOCK_SPLIT_DETECTION=off`; the parser is tested against the payload shape, read from a live
  answer on 2026-11-17), and the weekly Navigator's gate (its decisions are unit-tested).
