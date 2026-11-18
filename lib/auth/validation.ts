// The auth forms' field rules, in react-hook-form's shape, and the password lengths
// lib/auth/server.ts enforces on the server. One copy, so a form cannot accept a password
// the server will refuse — and spend a rate-limited attempt finding that out.
//
// Import-free and client-safe: the four auth forms and the better-auth config all read it.

export const MIN_PASSWORD_LENGTH = 8;
export const MAX_PASSWORD_LENGTH = 128;

export const EMAIL_RULE = {
    required: 'Email is required',
    pattern: {value: /^[^\s@]+@[^\s@]+\.[^\s@]+$/, message: 'Enter a valid email address'},
};

// The longest address a mailbox can have: RFC 5321 caps the path at 256 characters, its angle
// brackets included. A server-side bound, for an address that becomes a database key.
export const MAX_EMAIL_LENGTH = 254;

// The address a password-reset request names. A server action's argument is whatever the client
// posted, whatever its type says: anything but a string of at most MAX_EMAIL_LENGTH characters
// that passes the forms' own pattern names no address. Trimmed and lower-cased, as its counter
// keys it. The length is read first: the pattern backtracks, quadratically on a run of dots
// between two @s, and a posted string may be a megabyte.
export const passwordResetEmail = (input: unknown): string | null => {
    if (typeof input !== 'object' || input === null) return null;
    const {email} = input as {email?: unknown};
    if (typeof email !== 'string' || email.length > MAX_EMAIL_LENGTH) return null;
    const address = email.trim().toLowerCase();
    return EMAIL_RULE.pattern.value.test(address) ? address : null;
};

export const PASSWORD_RULE = {
    required: 'Password is required',
    minLength: {value: MIN_PASSWORD_LENGTH, message: `Password must be at least ${MIN_PASSWORD_LENGTH} characters`},
    maxLength: {value: MAX_PASSWORD_LENGTH, message: `Password must be at most ${MAX_PASSWORD_LENGTH} characters`},
};

// The name sign-up takes. It heads the welcome email — mailed from the app's own sender to an
// address nobody has verified — and is shown wherever a name is, so it is held to what a name is
// written with: 2 to 60 characters once trimmed, at least one of them a letter, of
//   - letters in any script with the marks they carry (\p{M}: no Devanagari or Thai name is
//     written without them), and the two joiners Persian and Sinhala names are typed with, only
//     between two letters or marks;
//   - spaces, an apostrophe as typed or as a phone sets it, a hyphen or an en dash, a comma
//     ("Sammy Davis, Jr."), round brackets ("Robert (Bob) Smith"), a middle dot ("Gal·la");
//   - at most four digits ("John Smith 3rd"): a numeral, never a telephone number;
//   - a full stop that ends a word or an initial.
// So no @, / or : — and no full stop that begins a web address, which letters and full stops
// alone can spell and a mail client would link (dotBeginsAddress).
export const MIN_FULL_NAME_LENGTH = 2;
export const MAX_FULL_NAME_LENGTH = 60;
export const MAX_FULL_NAME_DIGITS = 4;
export const FULL_NAME_INVALID_MESSAGE = `Name must be ${MIN_FULL_NAME_LENGTH} to ${MAX_FULL_NAME_LENGTH} characters: letters, spaces, apostrophes, hyphens, commas, brackets, full stops and up to four digits. Put a space after a full stop that ends a word.`;
const FULL_NAME_CHARACTERS = /^[\p{L}\p{M}\p{Nd}\p{Zs}'’\-‐‑–,().·‌‍]+$/u;
const LETTER = /^\p{L}$/u;
const MARK = /^\p{M}$/u;
const LATIN_LETTER = /^[A-Za-z]$/;
const isJoiner = (char: string | undefined): boolean => char === '‌' || char === '‍';
const inWord = (char: string | undefined): boolean => char !== undefined && (LETTER.test(char) || MARK.test(char));

// The two letters a full stop is followed by at once, marks between them skipped, or null: one
// letter and then anything else is an initial ("J.R.R.", "ए.पी.जे.").
const lettersAfter = (chars: readonly string[], dot: number): [string, string] | null => {
    const first = chars[dot + 1];
    if (first === undefined || !LETTER.test(first)) return null;
    let at = dot + 2;
    while (at < chars.length && MARK.test(chars[at])) at++;
    const second = chars[at];
    return second !== undefined && LETTER.test(second) ? [first, second] : null;
};

// How many letters, marks not counted, stand directly before a full stop.
const lettersBefore = (chars: readonly string[], dot: number): number => {
    let count = 0;
    for (let at = dot - 1; at >= 0 && inWord(chars[at]); at--) if (LETTER.test(chars[at])) count++;
    return count;
};

// A full stop followed at once by two letters is the middle of something. Two Latin letters: a
// web address, however short the word before it ("x.com", "t.co") — so "J.Smith" is refused
// with it, and the sentence says to put the space in. In any other script an initial is a
// syllable of one or two letters ("एम.एस. धोनी", "А.С.Пушкин") and run together it is still a
// name; only after a word of three letters or more is it an address ("пример.рф").
const dotBeginsAddress = (chars: readonly string[]): boolean =>
    chars.some((char, at) => {
        if (char !== '.') return false;
        const after = lettersAfter(chars, at);
        if (!after) return false;
        return after.every((letter) => LATIN_LETTER.test(letter)) || lettersBefore(chars, at) > 2;
    });

// The name a sign-up gives, trimmed — what the account and the welcome email are handed. A server
// action's argument is whatever the client posted, whatever its type says: anything but a string
// that trims to such a name is no name. The length is read before any pattern.
export const signUpName = (input: unknown): string | null => {
    if (typeof input !== 'string') return null;
    const name = input.trim();
    if (name.length < MIN_FULL_NAME_LENGTH || name.length > MAX_FULL_NAME_LENGTH) return null;
    if (!FULL_NAME_CHARACTERS.test(name)) return null;
    const chars = [...name];
    if (!chars.some((char) => LETTER.test(char))) return null;
    if (chars.filter((char) => /^\p{Nd}$/u.test(char)).length > MAX_FULL_NAME_DIGITS) return null;
    if (chars.some((char, at) => isJoiner(char) && !(inWord(chars[at - 1]) && inWord(chars[at + 1])))) return null;
    return dotBeginsAddress(chars) ? null : name;
};

// The form's rule is the action's own reading, so the two cannot disagree about a name.
export const FULL_NAME_RULE = {
    required: 'Full name is required',
    validate: (value: unknown): true | string => signUpName(value) !== null || FULL_NAME_INVALID_MESSAGE,
};
