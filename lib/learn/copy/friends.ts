// sendFriendRequest's own answers (lib/actions/friends.actions.ts), toasted by /friends' Add a
// Friend form. Held to the 'copy' tier by lib/learn/__tests__/friends-copy.test.ts.
//
// `sent` names nobody: the name an address is registered under is not the sender's to learn from
// a toast (the Sent list under the form shows who was reached). The two refusals come before the
// address is looked up (lib/friends/limits.ts), so neither says anything about it.

import {FRIEND_REQUESTS_PENDING_MAX} from "@/lib/friends/limits";

export const FRIEND_REQUEST_COPY = {
    sent: 'Friend request sent',
    // Past the reader's count for the hour (FRIEND_REQUEST_LIMIT).
    tooFast: 'That was a lot of friend requests in an hour. Wait a while, then send this one again.',
    // FRIEND_REQUESTS_PENDING_MAX of the reader's requests already wait; "Withdraw" is the Sent
    // list's own button.
    pendingFull: `You have ${FRIEND_REQUESTS_PENDING_MAX} friend requests waiting for an answer. Withdraw one under Sent, then send this one again.`,
} as const;
