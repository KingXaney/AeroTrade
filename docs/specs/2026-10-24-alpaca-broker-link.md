# Alpaca broker link — mirror a brain-traded account into an Alpaca account

2026-10-24. Asked by the owner: "an option to connect my brain strategies to the Alpaca paper
trading account, with the idea that in the future I can transfer the strategy to an actual
account with money."

## What it does

The owner links ONE of their paper accounts — the one the AI Navigator trades, or one a culture
picker trades, or any account of theirs — to ONE Alpaca account. A sync sizes the Alpaca account
to the same holdings, by weight: each symbol's share of the source account's value becomes its
share of the Alpaca account's equity. Weights, not share counts, so the Alpaca account may hold
any amount of money and the strategy carries over to a live account of a different size.

The app's own paper account stays the record the brains trade; Alpaca is a mirror, executed on
Alpaca's side at Alpaca's prices, with Alpaca's own fills and fractional shares.

## Who and where

- Owner only: the accounts `BROKER_OWNER_EMAILS` names, or, when that is unset, the lab's owners
  (`LAB_OWNER_EMAILS`) — the app has one Alpaca account, keyed in the server's environment.
- Keys: `ALPACA_API_KEY_ID`, `ALPACA_API_SECRET_KEY` (Alpaca's paper keys), set in Vercel by the
  owner. They never reach a browser; the page shows the account number's last four characters.
- Mode: `ALPACA_MODE` is `paper` unless it says `live`. Live trading needs a second switch,
  `ALPACA_LIVE_ENABLED=yes`; with only one of the two, nothing is sent and the page says live
  trading is locked. Paper and live share one API (Alpaca's docs), so the switch is the base URL
  and the keys.
- The page: Settings › Broker (`/settings?tab=broker`), shown to the owner only — the connection,
  the link, the last syncs, Alpaca's positions beside the source's weights, Alpaca's recent orders.

## The sync

- When: a weekday job, `broker-sync`, at 11:15 ET — after the Navigator (Mondays 10:00) and the
  culture pickers (Mondays 10:45) — and "Sync now" on the page. Daily, so a mid-week bootstrap or
  a manual trade in the source reaches the mirror the same day; a day the weights did not move
  sends nothing.
- Only while Alpaca's clock says the market is open; otherwise a preview: the orders it would send,
  sent nothing.
- The plan (pure, `lib/broker/plan`): per symbol, target value = weight × Alpaca equity; a symbol
  the source no longer holds is sold whole; a difference under `MIRROR_MIN_ORDER_DOLLARS` or the
  drift band (`MIRROR_DRIFT_BAND` of equity) is left alone; sells first, then buys within the cash
  the sells free, less a cash buffer; a fractionable asset trades by dollars (market, day), any
  other in whole shares; a symbol Alpaca cannot trade (an OTC ADR) is skipped and said; at most
  `MIRROR_MAX_ORDERS` orders a sync.
- Idempotent: each order's `client_order_id` names the link, the day, the side and the symbol, so
  a retried sync on the same day cannot double an order (Alpaca refuses a reused id).
- Recorded: each sync (preview or executed) with its orders, outcomes and a summary line, the last
  ten kept on the link; the page reads Alpaca's own account, positions and orders live.

## Not in this change

- Several Alpaca accounts at once (one key pair; one link).
- Selling short, options, crypto, extended hours.
- Per-user keys entered in the browser.
