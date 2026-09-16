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
- `npm run trigger -- <brain|navigator|news|snapshots|topics|briefs>` — fire a job locally
- `scripts/qa/` — browser QA against an in-memory MongoDB (see its README)

## Where things live

- `app/` routes · `components/` UI by feature · `lib/actions/` server actions (session-derived, userId-scoped)
- `lib/news` ingest + sanitise · `lib/brain` entity graph · `lib/navigator` allocation rails · `lib/topics` followed topics
- `lib/trading` paper accounts · `lib/dashboard` widget registry/layout · `lib/theme` palettes/styles · `lib/ai` models + chat tools
- `lib/inngest/functions.ts` every scheduled job · `database/models/` Mongoose models · `types/global.d.ts` ambient domain types

## Invariants — keep these true

1. Pure modules (`lib/**` without DB/network) are unit-tested; DB-bound modules are covered by `scripts/qa`.
   Tests must never import `lib/actions/*`, `lib/better-auth/*` or `lib/dashboard/loaders.ts` (top-level DB await).
2. User text never becomes a regex except through `escapeRegExp` (`lib/topics/match.ts`).
3. User topics never write into `BrainEntity`; the navigator scores only the brain's global entities.
4. LLM output is untrusted: JSON-parse with zod and clamp; email HTML goes through `sanitizeDigestHtml`
   with an allow-list of article URLs; briefs render as plain text.
5. Colours and fonts come from the semantic theme tokens (`text-fg`, `bg-brand/10`, `var(--type-mono)`),
   never hex literals in `.tsx`.
6. `normalizeLayout` stays pure; the legacy-default migration runs only where saved layouts are read.

## Next.js 16

This version has breaking changes — APIs, conventions, and file structure may differ from
what you remember. Read the relevant guide in `node_modules/next/dist/docs/` before writing
framework-facing code (route handlers, `proxy.ts`, caching). Heed deprecation notices.

<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
