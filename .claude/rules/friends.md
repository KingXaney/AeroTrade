---
paths:
  - "lib/friends/**"
  - "components/friends/**"
  - "app/(root)/friends/**"
  - "lib/actions/friends.actions.ts"
  - "lib/learn/copy/friends.ts"
  - "database/models/friendship.model.ts"
---

# friends

Contracts of this feature that a map cannot show: a part of `AGENTS.md`, kept in a file of its
own so it loads only beside the files its `paths:` name. A `### name` in the text is that
feature's file in this folder; Shared, owner and the numbered invariants are in `AGENTS.md`;
the map is `docs/MAP.md`.

- `lib/actions/friends.actions.sendFriendRequest` spends `lib/friends/limits.withinFriendRequestLimit`
  (10 an hour per reader, key `friends:request:<userId>`, every call counted) and refuses while
  `pendingRequestsFull` (20 of the reader's own requests pending), both before
  `lib/friends/store.findUserByEmail`, so neither refusal says anything of the address. Its
  sentences are `FRIEND_REQUEST_COPY` in `lib/learn/copy/friends`, and the sent answer never
  names the address's account.
- The hit and miss answers and the Sent list still say whether an address is registered: the
  counter bounds the lookups, it does not end them.
