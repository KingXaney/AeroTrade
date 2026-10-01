import {describe, expect, it} from 'vitest';
import {
    PASSWORD_RESET_LIMIT,
    PASSWORD_RESET_WINDOW_MS,
    SIGN_IN_CLIENT_LIMIT,
    SIGN_IN_EMAIL_LIMIT,
    SIGN_IN_INVALID_MESSAGE,
    SIGN_IN_LIMITED_MESSAGE,
    SIGN_IN_WINDOW_MS,
    clientIpFrom,
    passwordResetKey,
    signInClientKey,
    signInCredentials,
    signInEmailKey,
    withinSignInLimits,
    type TakeCounter,
} from '@/lib/auth/limits';

const headersOf = (entries: Record<string, string>) => new Headers(entries);

describe('the auth limits', () => {
    it('keeps the password-reset limit as it was', () => {
        expect(PASSWORD_RESET_LIMIT).toBe(3);
        expect(PASSWORD_RESET_WINDOW_MS).toBe(15 * 60 * 1000);
        expect(passwordResetKey('  Someone@Example.COM ')).toBe('pwreset:someone@example.com');
    });

    // The per-client limit must leave room for everyone behind one address (an office, the
    // browser QA's whole run from localhost) well above what one person needs.
    it('limits sign-in per address below the per-client limit, in one 15-minute window', () => {
        expect(SIGN_IN_EMAIL_LIMIT).toBe(10);
        expect(SIGN_IN_CLIENT_LIMIT).toBe(30);
        expect(SIGN_IN_CLIENT_LIMIT).toBeGreaterThan(SIGN_IN_EMAIL_LIMIT);
        expect(SIGN_IN_WINDOW_MS).toBe(15 * 60 * 1000);
    });

    it('says the same fixed thing for every refused attempt', () => {
        expect(SIGN_IN_LIMITED_MESSAGE).toBe('Too many sign-in attempts. Try again in a few minutes.');
    });

    it('answers malformed input as it answers a wrong password', () => {
        expect(SIGN_IN_INVALID_MESSAGE).toBe('Invalid email or password');
    });
});

describe('signInEmailKey', () => {
    it('counts every spelling of one address together', () => {
        expect(signInEmailKey('someone@example.com')).toBe('signin:email:someone@example.com');
        expect(signInEmailKey('  SomeOne@Example.com\t')).toBe('signin:email:someone@example.com');
    });

    it('never shares a key with the password-reset counter or the client counter', () => {
        const email = 'a@b.co';
        expect(signInEmailKey(email)).not.toBe(passwordResetKey(email));
        expect(signInEmailKey('1.2.3.4')).not.toBe(signInClientKey('1.2.3.4'));
    });
});

describe('signInClientKey', () => {
    it('keys on the address as given', () => {
        expect(signInClientKey('203.0.113.7')).toBe('signin:ip:203.0.113.7');
        expect(signInClientKey('::1')).toBe('signin:ip:::1');
    });
});

describe('clientIpFrom', () => {
    it('reads the first entry of x-forwarded-for — the client, not the proxies after it', () => {
        expect(clientIpFrom(headersOf({'x-forwarded-for': '203.0.113.7'}))).toBe('203.0.113.7');
        expect(clientIpFrom(headersOf({'x-forwarded-for': ' 203.0.113.7 , 10.0.0.1, 10.0.0.2'}))).toBe('203.0.113.7');
    });

    it('lower-cases an IPv6 address so one client has one key', () => {
        expect(clientIpFrom(headersOf({'x-forwarded-for': '2001:DB8::1'}))).toBe('2001:db8::1');
        expect(clientIpFrom(headersOf({'x-forwarded-for': '::1'}))).toBe('::1');
        expect(clientIpFrom(headersOf({'x-forwarded-for': '::ffff:127.0.0.1'}))).toBe('::ffff:127.0.0.1');
    });

    it('falls back to x-real-ip', () => {
        expect(clientIpFrom(headersOf({'x-real-ip': '198.51.100.2'}))).toBe('198.51.100.2');
        expect(clientIpFrom(headersOf({'x-forwarded-for': '', 'x-real-ip': '198.51.100.2'}))).toBe('198.51.100.2');
    });

    // No address is not one address: lumping every such request into a shared key would let
    // one client lock everyone else out.
    it('returns null when no header names a client', () => {
        expect(clientIpFrom(headersOf({}))).toBeNull();
        expect(clientIpFrom(headersOf({'x-forwarded-for': ' , '}))).toBeNull();
    });

    it('ignores a value that is not an IP address rather than keying on it', () => {
        expect(clientIpFrom(headersOf({'x-forwarded-for': 'unknown'}))).toBeNull();
        expect(clientIpFrom(headersOf({'x-forwarded-for': 'x'.repeat(200)}))).toBeNull();
        expect(clientIpFrom(headersOf({'x-forwarded-for': 'unknown', 'x-real-ip': '198.51.100.2'}))).toBe('198.51.100.2');
    });

    // Next's own server fills x-forwarded-for only when the request carries none, so off
    // Vercel a client chooses its key; Vercel overwrites it, and documents
    // x-vercel-forwarded-for as the copy a proxy in front of Vercel cannot overwrite.
    it('reads x-vercel-forwarded-for first, then x-forwarded-for, then x-real-ip', () => {
        const all = {'x-vercel-forwarded-for': '203.0.113.9', 'x-forwarded-for': '198.51.100.7, 10.0.0.1', 'x-real-ip': '192.0.2.4'};
        expect(clientIpFrom(headersOf(all))).toBe('203.0.113.9');
        expect(clientIpFrom(headersOf({'x-forwarded-for': '198.51.100.7', 'x-real-ip': '192.0.2.4'}))).toBe('198.51.100.7');
        expect(clientIpFrom(headersOf({'x-vercel-forwarded-for': '203.0.113.9', 'x-real-ip': '192.0.2.4'}))).toBe('203.0.113.9');
    });

    it('reads x-vercel-forwarded-for as it reads x-forwarded-for, and passes over one naming no address', () => {
        expect(clientIpFrom(headersOf({'x-vercel-forwarded-for': ' 203.0.113.9 , 10.0.0.1'}))).toBe('203.0.113.9');
        expect(clientIpFrom(headersOf({'x-vercel-forwarded-for': '2001:DB8::2'}))).toBe('2001:db8::2');
        expect(clientIpFrom(headersOf({'x-vercel-forwarded-for': 'unknown', 'x-forwarded-for': '198.51.100.7'}))).toBe('198.51.100.7');
        expect(clientIpFrom(headersOf({'x-vercel-forwarded-for': '', 'x-real-ip': '192.0.2.4'}))).toBe('192.0.2.4');
    });
});

// A server action's argument is whatever the client posted, whatever its type says.
describe('signInCredentials', () => {
    it('reads two strings as posted, and nothing else from the payload', () => {
        expect(signInCredentials({email: 'A@b.co ', password: ' pw'})).toEqual({email: 'A@b.co ', password: ' pw'});
        expect(signInCredentials({email: 'a@b.co', password: 'pw', role: 'admin'})).toEqual({email: 'a@b.co', password: 'pw'});
    });

    it('reads no credentials from anything but two strings', () => {
        const malformed: unknown[] = [
            null, undefined, 'a@b.co', 42, [],
            {email: 42, password: 'pw'}, {email: ['a@b.co'], password: 'pw'}, {email: {toString: () => 'a@b.co'}, password: 'pw'},
            {email: 'a@b.co'}, {email: 'a@b.co', password: null}, {email: 'a@b.co', password: {length: 8}},
        ];
        for (const input of malformed) expect(signInCredentials(input), String(JSON.stringify(input))).toBeNull();
    });
});

// takeRateLimit's contract on one never-ending window, recording every key it is asked to spend.
const memoryCounter = () => {
    const counts = new Map<string, number>();
    const spent: [string, number, number][] = [];
    const take: TakeCounter = async (key, limit, windowMs) => {
        spent.push([key, limit, windowMs]);
        const count = (counts.get(key) ?? 0) + 1;
        counts.set(key, count);
        return count <= limit;
    };
    return {take, counts, spent};
};

describe('withinSignInLimits', () => {
    it('spends the client counter, then the address counter, each at its own limit', async () => {
        const {take, spent} = memoryCounter();
        expect(await withinSignInLimits({ip: '203.0.113.7', email: ' Owner@Example.com'}, take)).toBe(true);
        expect(spent).toEqual([
            [signInClientKey('203.0.113.7'), SIGN_IN_CLIENT_LIMIT, SIGN_IN_WINDOW_MS],
            [signInEmailKey('owner@example.com'), SIGN_IN_EMAIL_LIMIT, SIGN_IN_WINDOW_MS],
        ]);
    });

    it('counts a request with no client address against its address only', async () => {
        const {take, spent} = memoryCounter();
        expect(await withinSignInLimits({ip: null, email: 'a@b.co'}, take)).toBe(true);
        expect(spent.map(([key]) => key)).toEqual([signInEmailKey('a@b.co')]);
    });

    it('refuses an address past its limit, whichever client asks', async () => {
        const {take} = memoryCounter();
        for (let i = 0; i < SIGN_IN_EMAIL_LIMIT; i++) {
            expect(await withinSignInLimits({ip: `198.51.100.${i}`, email: 'a@b.co'}, take)).toBe(true);
        }
        expect(await withinSignInLimits({ip: '198.51.100.99', email: ' A@B.co'}, take)).toBe(false);
        expect(await withinSignInLimits({ip: null, email: 'a@b.co'}, take)).toBe(false);
    });

    it('spends nothing of an address\'s budget once the client is over its own limit', async () => {
        const {take, counts} = memoryCounter();
        const ip = '203.0.113.7';
        for (let i = 0; i < SIGN_IN_CLIENT_LIMIT; i++) {
            expect(await withinSignInLimits({ip, email: `walk${i}@example.com`}, take)).toBe(true);
        }
        for (let i = 0; i < SIGN_IN_EMAIL_LIMIT * 5; i++) {
            expect(await withinSignInLimits({ip, email: 'owner@example.com'}, take)).toBe(false);
        }
        expect(counts.has(signInEmailKey('owner@example.com'))).toBe(false);
        expect(await withinSignInLimits({ip: '198.51.100.2', email: 'owner@example.com'}, take)).toBe(true);
    });

    // The point of the order: one machine walking a list of addresses, each past its limit,
    // locks out at most as many accounts as its own budget covers.
    it('lets one client lock out no more addresses than its own limit allows', async () => {
        const {take} = memoryCounter();
        const victims = Array.from({length: 20}, (_, i) => `victim${i}@example.com`);
        for (const email of victims) {
            for (let i = 0; i <= SIGN_IN_EMAIL_LIMIT; i++) await withinSignInLimits({ip: '203.0.113.7', email}, take);
        }
        const lockedOut: string[] = [];
        for (const email of victims) {
            if (!(await withinSignInLimits({ip: '198.51.100.2', email}, take))) lockedOut.push(email);
        }
        expect(lockedOut.length).toBeGreaterThan(0);
        expect(lockedOut.length).toBeLessThanOrEqual(Math.floor(SIGN_IN_CLIENT_LIMIT / SIGN_IN_EMAIL_LIMIT));
    });
});
