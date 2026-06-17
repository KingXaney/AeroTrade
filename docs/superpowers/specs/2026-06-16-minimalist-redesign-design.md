# Minimalist Redesign — Design Spec

**Date:** 2026-06-16
**Status:** Approved (via visual-companion brainstorming)

## Context

The app's "Cyber-Fin" theme layers too many effects at once — glass blur, an 8s
shimmer sweep, a particle-canvas background, button/card glows, and four accent
colors (cyan, purple, pink, coral) — so every screen feels busy and nothing reads
as primary. Several pages are also over-dense (Markets stacks 5 live widgets; Trade
stacks 6 blocks; Dashboard is four 600px market iframes). The user wants a **bold
redesign that stays dark but feels refined (Linear/Vercel-style), with the same
functionality.**

Chosen directions (visual companion):
- **Visual style: A · Quiet Cyber** — single cyan accent, flat surfaces, no blur/shimmer/glow.
- **Markets: Tabbed** — one widget at a time.
- **Trade: Trade-focused** — chart + order + quick-sell strip; full holdings/history live on /portfolio.
- **Dashboard: Personalized** — user's portfolio/watchlist/friends first, then one market widget + news.

## A. Global style pass ("Quiet Cyber")

Mostly centralized in [app/globals.css](../../../app/globals.css) so every consumer updates at once; no features change.

- **Remove ambient motion/effects:** delete `ParticleBackground` from the root layout; neutralize `.shimmer`, `.animate-glow`, `.node-pulse`; remove glass `backdrop-filter` blur and cyan `box-shadow` glows (buttons, news hover, search dialog, watchlist btn).
- **Flatten surfaces** to 3 levels: page `#0a0c0f`, card `#14171b`, raised `#1a1e23`, single hairline border `rgba(255,255,255,.06)`. Redefine `.glass-panel` in place to this flat treatment (instantly updates all consumers).
- **One accent:** cyan (`#7df4ff`) only; coral (`#ffb4ab`) reserved for sell/negative; purple/pink demoted. Update `PortfolioSidebarCard` violet → cyan.
- **Typography:** mono only for numbers/tickers/eyebrow labels; Sora headings; Hanken body; sentence case; much less UPPERCASE + letter-spacing.
- **Rhythm:** one spacing scale (4/8/16/24/32), ~4 font sizes, subtle 150ms hover only; keep `prefers-reduced-motion`.

## B. Markets → Tabbed
Persistent ticker; tab bar Stocks / Heatmap / Crypto / Forex; only the active widget mounts (client tab state). Keeps the already-fixed crypto widget (`screener.js`).

## C. Trade → Trade-focused
Chart + Order Entry are the page, plus a compact open-positions quick-sell strip. Remove `AccountSummary`, full `PositionsTable`, and `TradeHistory` from /trade (they live on /portfolio). Keep symbol context slim; drop the standalone symbol-info widget.

## D. Dashboard → Personalized
Top row: Portfolio snapshot (`getPortfolio`), Watchlist movers (`getStocksWithData`), Friends rank (`getLeaderboard`). Below: one market widget (heatmap) + news. Reuses existing server functions; replaces the four 600px iframes.

## Preserved / out of scope
- All functionality stays (trading, watchlist, alerts, friends, search, chat, email). Routes unchanged.
- No changes to data models, auth, or the Inngest/email work; server actions unchanged except dashboard composition.

## Phasing
A (global tokens) → B (Markets) → C (Trade) → D (Dashboard). Verify build + lint after each phase.
