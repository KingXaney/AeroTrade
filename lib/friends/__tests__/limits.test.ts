import {readFileSync} from 'node:fs';
import path from 'node:path';
import {describe, expect, it} from 'vitest';
import {
    FRIEND_REQUEST_LIMIT,
    FRIEND_REQUEST_WINDOW_MS,
    FRIEND_REQUESTS_PENDING_MAX,
    friendRequestKey,
    pendingRequestsFull,
    withinFriendRequestLimit,
    type TakeCounter,
} from '@/lib/friends/limits';

// A counter that records each step it is asked for and answers as told.
const recording = (answer: boolean) => {
    const steps: {key: string; limit: number; windowMs: number}[] = [];
    const take: TakeCounter = async (key, limit, windowMs) => {
        steps.push({key, limit, windowMs});
        return answer;
    };
    return {steps, take};
};

describe('the limits on a friend request', () => {
    it('counts 10 requests a reader by the hour, and lets 20 wait unanswered', () => {
        expect(FRIEND_REQUEST_LIMIT).toBe(10);
        expect(FRIEND_REQUEST_WINDOW_MS).toBe(3_600_000);
        expect(FRIEND_REQUESTS_PENDING_MAX).toBe(20);
    });

    it('keys the counter on the reader', () => {
        expect(friendRequestKey('u1')).toBe('friends:request:u1');
        expect(friendRequestKey('u1')).not.toBe(friendRequestKey('u2'));
    });
});

describe('withinFriendRequestLimit', () => {
    it('spends one step of the reader\'s counter and answers as it does', async () => {
        const within = recording(true);
        expect(await withinFriendRequestLimit('u1', within.take)).toBe(true);
        expect(within.steps).toEqual([{key: 'friends:request:u1', limit: 10, windowMs: 3_600_000}]);

        const over = recording(false);
        expect(await withinFriendRequestLimit('u1', over.take)).toBe(false);
        expect(over.steps).toHaveLength(1);
    });
});

describe('pendingRequestsFull', () => {
    it('is full at 20 requests waiting, and not at 19', () => {
        expect(pendingRequestsFull(0)).toBe(false);
        expect(pendingRequestsFull(19)).toBe(false);
        expect(pendingRequestsFull(20)).toBe(true);
        expect(pendingRequestsFull(21)).toBe(true);
    });

    // A count that is not a number names no room: the request is refused, never let through.
    it('reads a count it cannot use as full', () => {
        expect(pendingRequestsFull(Number.NaN)).toBe(true);
    });
});

// The action cannot be imported here (invariant 1), so its source is read as text: the order it
// checks things in is what keeps a refused call from looking any address up.
describe('sendFriendRequest', () => {
    // One exported action's own text: from its declaration to the next export.
    const actionSource = (file: string, name: string): string => {
        const source = readFileSync(path.resolve(__dirname, '../../..', file), 'utf8');
        const start = source.indexOf(`export const ${name} = `);
        expect(start, `${name} in ${file}`).toBeGreaterThan(-1);
        const next = source.indexOf('\nexport const ', start + 1);
        return source.slice(start, next === -1 ? undefined : next);
    };
    const body = actionSource('lib/actions/friends.actions.ts', 'sendFriendRequest');

    it('reads the session, spends its counter, then counts the requests waiting, before it looks the address up', () => {
        const calls = [
            'getCurrentUserId(',
            'withinFriendRequestLimit(userId, takeRateLimit)',
            'FRIEND_REQUEST_COPY.tooFast',
            'countDocuments({requesterId: userId, status: \'pending\'})',
            'pendingRequestsFull(',
            'FRIEND_REQUEST_COPY.pendingFull',
            'findUserByEmail(',
        ];
        const at = calls.map((call) => body.indexOf(call));
        expect(at.every((index) => index > -1), JSON.stringify(at)).toBe(true);
        expect(at).toEqual([...at].sort((a, b) => a - b));
        // The one lookup of the address comes after both refusals.
        expect(body.split('findUserByEmail(')).toHaveLength(2);
    });

    it('answers a request it sent without the name the address is registered under', () => {
        expect(body).toContain('FRIEND_REQUEST_COPY.sent');
        expect(body).not.toMatch(/target\.(name|email)/);
    });
});
