// The unsubscribe link's signature.

import {describe, expect, it} from 'vitest';
import {unsubscribeLinks, unsubscribeSecret, unsubscribeToken, verifyUnsubscribeToken} from '@/lib/email/unsubscribe';

const SECRET = 'a-test-secret-of-enough-length-000';

describe('the unsubscribe token', () => {
    it('verifies for the user it was made for, and for nobody else', () => {
        const token = unsubscribeToken('user-1', SECRET);
        expect(verifyUnsubscribeToken('user-1', token, SECRET)).toBe(true);
        expect(verifyUnsubscribeToken('user-2', token, SECRET)).toBe(false);
        expect(verifyUnsubscribeToken('user-1', token, 'another-secret-of-enough-length-00')).toBe(false);
    });

    it('refuses anything that is not a short string, and everything without a secret', () => {
        const token = unsubscribeToken('user-1', SECRET);
        expect(verifyUnsubscribeToken('user-1', token, null)).toBe(false);
        expect(verifyUnsubscribeToken(['user-1'], token, SECRET)).toBe(false);
        expect(verifyUnsubscribeToken('user-1', {$ne: ''}, SECRET)).toBe(false);
        expect(verifyUnsubscribeToken('', token, SECRET)).toBe(false);
        expect(verifyUnsubscribeToken('user-1', 'x'.repeat(500), SECRET)).toBe(false);
        expect(verifyUnsubscribeToken('user-1', `${token}x`, SECRET)).toBe(false);
    });

    it('is not the raw secret and does not change between calls', () => {
        const token = unsubscribeToken('user-1', SECRET);
        expect(token).not.toContain(SECRET);
        expect(token).toBe(unsubscribeToken('user-1', SECRET));
        expect(token).toMatch(/^[A-Za-z0-9_-]{43}$/);
    });
});

describe('unsubscribeLinks', () => {
    it('gives the page a reader opens and the endpoint a mail client posts to', () => {
        const links = unsubscribeLinks('https://app.example.com/', 'user-1', SECRET);
        const token = unsubscribeToken('user-1', SECRET);
        expect(links).toEqual({
            page: `https://app.example.com/unsubscribe?u=user-1&t=${token}`,
            oneClick: `https://app.example.com/api/email/unsubscribe?u=user-1&t=${token}`,
        });
    });

    it('is nothing without a secret or a user', () => {
        expect(unsubscribeLinks('https://app.example.com', 'user-1', null)).toBeNull();
        expect(unsubscribeLinks('https://app.example.com', '', SECRET)).toBeNull();
    });

    it('reads the app\'s own secret, and none that is too short to be one', () => {
        expect(unsubscribeSecret({BETTER_AUTH_SECRET: SECRET})).toBe(SECRET);
        expect(unsubscribeSecret({BETTER_AUTH_SECRET: 'short'})).toBeNull();
        expect(unsubscribeSecret({})).toBeNull();
    });
});
