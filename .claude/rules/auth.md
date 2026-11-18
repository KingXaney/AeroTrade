---
paths:
  - "lib/auth/**"
  - "lib/account/**"
  - "components/auth/**"
  - "app/(auth)/**"
  - "app/(reset)/**"
  - "lib/actions/auth.actions.ts"
  - "lib/actions/account.actions.ts"
  - "lib/rate-limit.ts"
  - "components/settings/AccountSection.tsx"
  - "lib/learn/copy/account.ts"
  - "scripts/qa/qa-auth.mjs"
  - "scripts/qa/qa-account.mjs"
---

# auth

Contracts of this feature that a map cannot show: a part of `AGENTS.md`, kept in a file of its
own so it loads only beside the files its `paths:` name. A `### name` in the text is that
feature's file in this folder; Shared, owner and the numbered invariants are in `AGENTS.md`;
the map is `docs/MAP.md`.

- `lib/auth/session` is the one session read: `getSessionUser` (the shell's User),
  `getCurrentUserId` (actions and routes), `getCurrentUser` (an action that gates on who the person
  is — the owner's lab — reads the email through it), `requireUserId` (pages — signed out redirects
  to /sign-in), `requireUser` (a page that shows the owner more), `requireOwner` (the owner's own
  pages — anyone else is sent Home) and `getOwnerUserId` (the owner's actions and routes — anyone
  else reads as signed out).
- The server actions keep their own rate limits — better-auth's `rateLimit` never runs on this
  app's `auth.api.*` path — all counted by `lib/rate-limit.takeRateLimit`, the one Mongo counter.
  `lib/rate-limit.peekRateLimit` is its read-only pair — one `findOne`, never a write, null once
  the window has passed — for anything that shows a window without spending it.
- `lib/auth/limits` is import-free: the password-reset and sign-in limits and their counter keys.
  `clientIpFrom` reads `x-vercel-forwarded-for`, then `x-forwarded-for`, then `x-real-ip`, which
  name the client only behind a proxy that overwrites them, such as Vercel.
- Sign-in: `signInCredentials` is read before any counter is spent; `withinSignInLimits` spends the
  counter it is handed in order — the client address, then the lower-cased email — skipping the
  client key when no header names one.
- Sign-up: `withinSignUpLimit` is one per-client counter by the hour, every request no header names
  a client for on one shared key, at `resolveSignUpLimit` — `SIGN_UP_CLIENT_LIMIT` from the
  environment (the browser QA raises it), else 10.
- `lib/auth/validation` (import-free) holds the auth forms' email and password rules and the
  password lengths `lib/auth/server.ts` enforces.
- Settings › Account (`components/settings/AccountSection`, `lib/actions/account.actions`, limits
  and keys in `lib/account/limits`, sentences `ACCOUNT_COPY` in `lib/learn/copy/account`): both
  actions take the account's password and are counted per account before it is looked at.
  `changeMyPassword` is TWO library calls, `changePassword` without `revokeOtherSessions` and then
  `revokeOtherSessions`: the library's own flag deletes every session and issues a new one, and
  the action's response would re-render the page on the old cookie and send the reader away.
  `deleteMyAccount` asks for the account's own address typed back (`confirmsDeletion`) and its
  password, and calls the library's `deleteUser`, whose `beforeDelete` (`lib/auth/server.ts`) runs
  `lib/account/delete-store.deleteUserData` before the user, its credentials and its sessions
  go: a cascade that fails leaves the account in place. The page is then left by a full load.
- `lib/account/user-data` (import-free) sorts EVERY model: a reader's own data and under which
  field (`USER_DATA`, in deletion order: whatever trades in their accounts, the books, the rest,
  the preferences last), or not and why (`NOT_USER_DATA`). `lib/account/__tests__/user-data.test.ts`
  fails when a model file is in neither, so a collection added later cannot be left behind by a
  deletion without someone deciding so. The system's own owners (`system:*`, `global`) are never
  deleted under.
- `lib/auth/sign-up-profile.signUpProfile` checks that country, goal, risk tolerance and industry
  are options the form offers, read before any counter is spent; only those four answers reach the
  welcome event, whose prompt `lib/email/prompts.buildWelcomePrompt` fills through a replacer function.
