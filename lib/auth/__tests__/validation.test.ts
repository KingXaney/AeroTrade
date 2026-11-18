import {describe, expect, it, vi} from 'vitest';
import {
    EMAIL_RULE,
    FULL_NAME_INVALID_MESSAGE,
    FULL_NAME_RULE,
    MAX_EMAIL_LENGTH,
    MAX_FULL_NAME_LENGTH,
    MAX_PASSWORD_LENGTH,
    MIN_FULL_NAME_LENGTH,
    MIN_PASSWORD_LENGTH,
    PASSWORD_RULE,
    passwordResetEmail,
    signUpName,
} from '@/lib/auth/validation';
import {findBanned} from '@/lib/learn/banned';

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

// The name sign-up is given heads the welcome email — mailed, from the app's own sender, to an
// address nobody has verified — and is shown wherever a name is. A server action's argument is
// whatever the client posted: the name is read before any counter is spent.
describe('signUpName', () => {
    it('reads a name the form would accept, trimmed', () => {
        expect(signUpName('Ada Lovelace')).toBe('Ada Lovelace');
        expect(signUpName('  Ada Lovelace\t\n')).toBe('Ada Lovelace');
        expect(signUpName('Ng')).toBe('Ng');
    });

    it('reads a name in any script, with the marks its letters are written with', () => {
        const names = [
            'José Álvarez', 'José Álvarez', 'Zoë Brontë', 'Søren Kierkegaard', 'Nguyễn Thị Minh',
            'Ελένη Παπαδοπούλου', 'Алексей Иванов', '李小龙', '山田　太郎', '김민준',
            'प्रिया शर्मा', 'สุดา ศิริพร', 'محمد علي', 'דוד לוי',
        ];
        for (const name of names) expect(signUpName(name), name).toBe(name);
    });

    it('takes an apostrophe as typed or as a phone sets it, a hyphen, and a full stop that ends a word or an initial', () => {
        const names = [
            "Conan O'Brien", 'Conan O’Brien', "Jeanne d'Arc", 'Jean-Luc Picard', 'Mary-Kate Olsen',
            'Martin Luther King Jr.', 'John Q. Public', 'J. R. R. Tolkien', 'J.K. Rowling', 'J.R.R. Tolkien', 'St. John',
        ];
        for (const name of names) expect(signUpName(name), name).toBe(name);
    });

    it('reads no name from anything but a string', () => {
        const malformed: unknown[] = [null, undefined, 42, true, [], ['Ada Lovelace'], {}, {toString: () => 'Ada Lovelace'}];
        for (const input of malformed) expect(signUpName(input), String(JSON.stringify(input))).toBeNull();
    });

    it('takes 2 to 60 characters once trimmed, no fewer and no more', () => {
        expect(MIN_FULL_NAME_LENGTH).toBe(2);
        expect(MAX_FULL_NAME_LENGTH).toBe(60);
        for (const name of ['', ' ', '   \t\n', 'A', ' A ']) expect(signUpName(name), JSON.stringify(name)).toBeNull();
        const longest = 'a'.repeat(MAX_FULL_NAME_LENGTH);
        expect(signUpName(longest)).toBe(longest);
        expect(signUpName(`  ${longest}  `)).toBe(longest);
        expect(signUpName(`${longest}a`)).toBeNull();
        expect(signUpName('a'.repeat(1_000_000))).toBeNull();
    });

    it('reads none from a name carrying an address, a digit, markup or a line break', () => {
        const refused = [
            'Ada http://example.com', 'Ada https://example.com/prize', 'ada@example.com', 'Ada: claim now', 'Ada/Bob',
            'Ada 555 0100', 'Agent 47', 'Ada <b>Lovelace</b>', 'Ada & Bob', 'Ada, Bob', 'Ada!', 'Ada?', 'Ada_Lovelace',
            'Ada (Lovelace)', '"Ada"', 'Ada\nLovelace', 'Ada\tLovelace', 'Ada​Lovelace', 'Ada‮Lovelace', 'Ada 🚀',
        ];
        for (const name of refused) expect(signUpName(name), JSON.stringify(name)).toBeNull();
    });

    // Letters and full stops alone spell a web address, and a mail client links one it finds in a
    // heading. A full stop followed at once by two letters — or by a letter and its mark, as a
    // domain's ending in another script begins — is the middle of an address, never the end of a
    // word or an initial.
    it('reads none from a name whose full stop begins a domain', () => {
        const refused = [
            'example.com', 'www.example.com', 'Visit www.example.com now', 'Claim at prize.example today', 'a.co',
            'Ada.Lovelace', 'пример.рф', 'example.भारत', 'example.ćom',
        ];
        for (const name of refused) expect(signUpName(name), JSON.stringify(name)).toBeNull();
    });
});

describe('FULL_NAME_RULE', () => {
    it('is the rule sign-up reads the name with, and answers with its one sentence', () => {
        expect(FULL_NAME_RULE.required).toBeTruthy();
        for (const name of ['Ada Lovelace', '  Ada Lovelace ', "Conan O'Brien", 'J.K. Rowling', '李小龙']) {
            expect(FULL_NAME_RULE.validate(name), name).toBe(true);
        }
        for (const name of ['A', '   ', 'a'.repeat(MAX_FULL_NAME_LENGTH + 1), 'www.example.com', 'Agent 47', 42, null, undefined]) {
            expect(FULL_NAME_RULE.validate(name), String(JSON.stringify(name))).toBe(FULL_NAME_INVALID_MESSAGE);
            expect(signUpName(name)).toBeNull();
        }
    });

    it('says the lengths it holds a name to, in words the no-advice list passes', () => {
        expect(FULL_NAME_INVALID_MESSAGE).toContain(`${MIN_FULL_NAME_LENGTH} to ${MAX_FULL_NAME_LENGTH}`);
        expect(findBanned(FULL_NAME_INVALID_MESSAGE)).toEqual([]);
        expect(findBanned(FULL_NAME_RULE.required)).toEqual([]);
    });
});
