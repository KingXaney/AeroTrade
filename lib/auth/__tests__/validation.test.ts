import {describe, expect, it, vi} from 'vitest';
import {
    EMAIL_RULE,
    MAX_EMAIL_LENGTH,
    MAX_PASSWORD_LENGTH,
    MIN_PASSWORD_LENGTH,
    PASSWORD_RULE,
    passwordResetEmail,
} from '@/lib/auth/validation';

describe('the auth form rules', () => {
    it('hold the password to the lengths better-auth enforces', () => {
        expect(MIN_PASSWORD_LENGTH).toBe(8);
        expect(MAX_PASSWORD_LENGTH).toBe(128);
        expect(PASSWORD_RULE.minLength.value).toBe(MIN_PASSWORD_LENGTH);
        expect(PASSWORD_RULE.maxLength.value).toBe(MAX_PASSWORD_LENGTH);
        expect(PASSWORD_RULE.minLength.message).toContain(String(MIN_PASSWORD_LENGTH));
        expect(PASSWORD_RULE.maxLength.message).toContain(String(MAX_PASSWORD_LENGTH));
        expect(PASSWORD_RULE.required).toBeTruthy();
    });

    it('accept an address with a domain and refuse one without', () => {
        const accepts = (value: string) => EMAIL_RULE.pattern.value.test(value);
        expect(accepts('a@b.co')).toBe(true);
        expect(accepts('first.last+tag@mail.example.com')).toBe(true);
        expect(accepts('a@b')).toBe(false);
        expect(accepts('a b@c.d')).toBe(false);
        expect(accepts('@b.co')).toBe(false);
        expect(EMAIL_RULE.required).toBeTruthy();
    });
});

// A server action's argument is whatever the client posted, whatever its type says, and the
// address a reset request names becomes a counter's key: it is read before any counter is spent.
describe('passwordResetEmail', () => {
    it('reads an address the form would accept, trimmed and lower-cased as its counter keys it', () => {
        expect(passwordResetEmail({email: 'a@b.co'})).toBe('a@b.co');
        expect(passwordResetEmail({email: '  Someone@Example.COM\t'})).toBe('someone@example.com');
        expect(passwordResetEmail({email: 'first.last+tag@mail.example.com', role: 'admin'})).toBe('first.last+tag@mail.example.com');
    });

    it('reads no address from anything but a string', () => {
        const malformed: unknown[] = [
            null, undefined, 'a@b.co', 42, [], {},
            {email: null}, {email: 42}, {email: ['a@b.co']}, {email: {toString: () => 'a@b.co'}},
        ];
        for (const input of malformed) expect(passwordResetEmail(input), String(JSON.stringify(input))).toBeNull();
    });

    it('reads none from a string the form\'s own rule refuses', () => {
        for (const email of ['', '   ', 'a@b', 'a b@c.d', '@b.co', 'no-at-sign.example.com', 'a@b.co\nc@d.co']) {
            expect(passwordResetEmail({email}), JSON.stringify(email)).toBeNull();
        }
    });

    it('takes an address of at most 254 characters and none longer', () => {
        expect(MAX_EMAIL_LENGTH).toBe(254);
        const domain = '@example.com';
        const longest = 'a'.repeat(MAX_EMAIL_LENGTH - domain.length) + domain;
        expect(longest).toHaveLength(MAX_EMAIL_LENGTH);
        expect(passwordResetEmail({email: longest})).toBe(longest);
        expect(passwordResetEmail({email: `a${longest}`})).toBeNull();
        expect(passwordResetEmail({email: `${longest} `})).toBeNull();
    });

    // The pattern backtracks on a long run of dots between two @s — quadratic in the string's
    // length — and a server action's body may be a megabyte: the length is the first thing read.
    it('never runs the pattern on a string past the limit', () => {
        const test = vi.spyOn(EMAIL_RULE.pattern.value, 'test');
        try {
            expect(passwordResetEmail({email: `a@${'.'.repeat(1_000_000)}@`})).toBeNull();
            expect(passwordResetEmail({email: `${'a'.repeat(MAX_EMAIL_LENGTH)}@example.com`})).toBeNull();
            expect(test).not.toHaveBeenCalled();
            expect(passwordResetEmail({email: 'a@b.co'})).toBe('a@b.co');
            expect(test).toHaveBeenCalledTimes(1);
        } finally {
            test.mockRestore();
        }
    });
});
