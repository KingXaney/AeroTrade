// How often one signed-in reader may send a friend request, how many of theirs may wait
// unanswered, and the counter key the action spends (lib/actions/friends.actions.ts
// sendFriendRequest). A request looks an address up among the accounts, and its answer — and the
// Sent list on /friends after it — says whether one is registered there: uncounted, one account
// could walk a list of addresses at full speed, each hit leaving a pending request and a dot on
// that person's avatar. lib/rate-limit.ts takeRateLimit does the counting.
//
// Import-free, like lib/auth/limits.ts, so the numbers and the key are unit-tested:
// lib/friends/__tests__/limits.test.ts.

// Per reader, by the hour, every call counted — a miss, a repeat and a refusal included. This is
// the bound that holds: ten leaves room for a group of friends and a typo or two.
export const FRIEND_REQUEST_LIMIT = 10;
export const FRIEND_REQUEST_WINDOW_MS = 60 * 60 * 1000;

// The most requests one reader may have waiting for an answer. It keeps one account from
// leaving a dot on many avatars at once; the reader can withdraw a request to make room, so it
// is not what bounds the lookups — the hourly counter is.
export const FRIEND_REQUESTS_PENDING_MAX = 20;

export const friendRequestKey = (userId: string): string => `friends:request:${userId}`;

// One counter step, as takeRateLimit takes it: true while `key` is within `limit` for its window.
export type TakeCounter = (key: string, limit: number, windowMs: number) => Promise<boolean>;

// One step of the reader's counter: true while they are within the hour's count.
export const withinFriendRequestLimit = (userId: string, take: TakeCounter): Promise<boolean> =>
    take(friendRequestKey(userId), FRIEND_REQUEST_LIMIT, FRIEND_REQUEST_WINDOW_MS);

// True once `pending` requests wait: no room for another. A count that is not a number names
// no room either.
export const pendingRequestsFull = (pending: number): boolean => !(pending < FRIEND_REQUESTS_PENDING_MAX);
