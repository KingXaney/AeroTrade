import {describe, expect, it} from 'vitest';
import {
    PASSWORD_RESET_LIMIT,
    PASSWORD_RESET_WINDOW_MS,
    SIGN_IN_CLIENT_LIMIT,
    SIGN_IN_EMAIL_LIMIT,
    SIGN_IN_LIMITED_MESSAGE,
    SIGN_IN_WINDOW_MS,
    clientIpFrom,
    passwordResetKey,
    signInClientKey,
    signInEmailKey,
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
});
