# AeroTrade — notes for contributors and coding agents

## What this is

A paper-trading terminal with an AI news brain (Next.js 16 App Router, React 19, TypeScript,
Tailwind v4, MongoDB/Mongoose, better-auth, Inngest, Vercel AI SDK). See README.md for the
product tour and docs/specs/ for the design documents behind the larger features.

## Commands

- `npm run check` — lint + typecheck + unit tests (what CI runs)
- `npm test` / `npm run test:watch` — vitest, node environment, `lib/**/__tests__` only
- `npm run build:check` — compile-only Next build; needs no database or keys
- `npm run dev` + `npx inngest-cli@latest dev -u http://localhost:3000/api/inngest` — app + jobs
- `npm run trigger -- <brain|navigator|news|snapshots|topics|briefs|strategies|strategies-preview|strategies-resimulate>` — fire a job locally
- `scripts/qa/` — browser QA against an in-memory MongoDB (see its README)

## Where things live

- `app/` routes · `components/` UI by feature · `lib/actions/` server actions (session-derived, userId-scoped)
- `components/primitives/` the shared surface vocabulary — `Panel`, `PageTitle`, `SectionHeading`,
  `MicroLabel`, `Badge`, `EmptyState`, `iconButton`. Hand-owned, and separate from
  `components/ui/` on purpose: that folder is the shadcn registry target and is regenerable.
- `lib/news` ingest + sanitise + the per-user feed (`feed-prefs` client-safe, `feed` pure, `feed-store` server) · `lib/brain` entity graph · `lib/navigator` allocation rails · `lib/topics` followed topics (`starters` the curated set, `seed` what a new account gets, `insert` the one write path)
- `lib/trading` paper accounts · `lib/dashboard` widget registry/layout · `lib/theme` palettes/styles · `lib/ai` models + chat tools
- `lib/strategies` the quant strategies: pure catalog/rules/engine/simulator (one `runStrategyDay` for live and backtest), `store`/`queries` server side · `lib/prices` daily bars (Yahoo first, Stooq fallback), signals, NYSE calendar
- `lib/inngest/functions.ts` every scheduled job · `database/models/` Mongoose models · `types/global.d.ts` ambient domain types

## Invariants — keep these true

1. Pure modules (`lib/**` without DB/network) are unit-tested; DB-bound modules are covered by `scripts/qa`.
   Tests must never import `lib/actions/*`, `lib/better-auth/*` or `lib/dashboard/loaders.ts` (top-level DB await).
2. User text never becomes a regex except through `escapeRegExp` (`lib/topics/match.ts`).
3. User topics never write into `BrainEntity`; the navigator scores only the brain's global entities.
4. LLM output is untrusted: JSON-parse with zod and clamp; email HTML goes through `sanitizeDigestHtml`
   with an allow-list of article URLs; briefs render as plain text.
5. Colours and fonts come from the semantic theme tokens (`text-fg`, `bg-brand/10`, `font-mono`),
   never hex literals in `.tsx`. New code uses the `font-mono` / `font-heading` utilities rather
   than `style={{fontFamily}}` — the older inline spelling is still widespread and is being retired.
6. `normalizeLayout` stays pure; the legacy-default migration runs only where saved layouts are read.
7. Framed surfaces are `<Panel>`, never a hand-rolled `bg-surface-2/40 + border` — only `.glass-panel`
   reads `--panel-bg/-border/-blur/-shadow/-radius`, so anything else silently ignores four of the
   five visual styles. `.glass-panel` is declared **outside any cascade layer**, so `rounded-*`,
   `ring-*` and `shadow-*` written next to it lose and do nothing; use `outline-*` for a ring.
8. A column, tile or caveat that is empty or identical on every row is not information — hide it
   (`visibleSignalColumns`) or state it once per panel (`describeUnpriced`, `unpricedNote`), never
   per row. Reference prose belongs in a `<details>`, above-the-fold space belongs to numbers.
9. Default topics are seeded once per account (`seedDefaultTopics`), and `topicsSeededAt` — not the
   topic count — is what makes that "once" hold: guarding on emptiness alone would resurrect the
   defaults for anyone who unfollowed everything on purpose. The same reasoning applies to any
   future onboarding default. Anything derived from the set instead (the "preinstalled" notice, via
   `isUntouchedDefaultSet`) needs no flag at all and is preferred.
10. `lib/news` reads followed-topic articles; `lib/topics` never reads the feed. Topics enter the
   feed as a pre-fetched batch in `mergeFeed`, never as a `FeedRequest`, so the Google kill switch,
   `MAX_FEED_REQUESTS` and the outage fallback are untouched — and the outage test deliberately
   ignores them, since articles read from Mongo cannot prove Google answered. Every batch, the topic
   one included, goes through `filterBySources`: a hidden outlet is hidden whichever door it uses.
   Invariant 3 still holds — nothing here writes to `BrainEntity`, and `SOURCE_CAPS.web = 0` keeps
   topic search hits out of the brain.

## Next.js 16

This version has breaking changes — APIs, conventions, and file structure may differ from
what you remember. Read the relevant guide in `node_modules/next/dist/docs/` before writing
framework-facing code (route handlers, `proxy.ts`, caching). Heed deprecation notices.

<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
