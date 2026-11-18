---
paths:
  - "app/(root)/settings/**"
  - "components/settings/**"
  - "lib/settings/**"
  - "lib/theme/**"
  - "components/theme/**"
  - "lib/actions/appearance.actions.ts"
  - "lib/actions/preferences.actions.ts"
---

# settings

Contracts of this feature that a map cannot show: a part of `AGENTS.md`, kept in a file of its
own so it loads only beside the files its `paths:` name. A `### name` in the text is that
feature's file in this folder; Shared, owner and the numbered invariants are in `AGENTS.md`;
the map is `docs/MAP.md`.

- `/settings` shows one section at a time (`?tab=`), each reading only its own data. The daily
  email's `/settings#notifications` is sent to its section by
  `components/settings/SettingsHashRedirect`, as `/learn#term` is by `components/learn/LearnRedirect`.

- `lib/theme/store` is the saved theme's read and its cookie mirror.
