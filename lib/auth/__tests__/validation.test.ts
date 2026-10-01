import {describe, expect, it} from 'vitest';
import {EMAIL_RULE, MAX_PASSWORD_LENGTH, MIN_PASSWORD_LENGTH, PASSWORD_RULE} from '@/lib/auth/validation';

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
