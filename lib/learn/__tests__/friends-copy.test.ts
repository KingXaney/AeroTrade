// sendFriendRequest's own answers (lib/actions/friends.actions.ts): held to the 'copy' tier of
// lib/learn/banned.ts, and the one that says a request was sent names nobody.

import {describe, expect, it} from 'vitest';
import {findBanned} from '@/lib/learn/banned';
import {FRIEND_REQUEST_COPY} from '@/lib/learn/copy/friends';
import {FRIEND_REQUESTS_PENDING_MAX} from '@/lib/friends/limits';

describe('FRIEND_REQUEST_COPY', () => {
    it('never advises', () => {
        for (const [key, text] of Object.entries(FRIEND_REQUEST_COPY)) {
            expect(text, key).not.toMatch(/undefined|NaN|null|\[object|Infinity/);
            expect(findBanned(text, 'copy'), key).toEqual([]);
        }
    });

    // The address's registered name is not the sender's to learn from a toast.
    it('says a request was sent, and to nobody by name', () => {
        expect(FRIEND_REQUEST_COPY.sent).toBe('Friend request sent');
    });

    it('refuses a request past the hour\'s count by saying what happened and what to do next', () => {
        expect(FRIEND_REQUEST_COPY.tooFast).toBe('That was a lot of friend requests in an hour. Wait a while, then send this one again.');
    });

    it('refuses a request while the limit\'s own number of them wait, and says the way out', () => {
        expect(FRIEND_REQUESTS_PENDING_MAX).toBe(20);
        expect(FRIEND_REQUEST_COPY.pendingFull)
            .toBe('You have 20 friend requests waiting for an answer. Withdraw one under Sent, then send this one again.');
    });

    // Both refusals come before the address is looked up, so neither may say anything about it.
    it('says nothing of the address in either refusal', () => {
        for (const text of [FRIEND_REQUEST_COPY.tooFast, FRIEND_REQUEST_COPY.pendingFull]) {
            expect(text).not.toMatch(/email|address|account|user/i);
        }
    });
});
