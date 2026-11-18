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
// written with: 2 to 60 characters once trimmed, of letters in any script with the marks they
// carry (\p{M}: no Devanagari or Thai name is written without them), spaces, an apostrophe as
// typed or as a phone sets it, hyphens, and a full stop that ends a word or an initial. So no
// digit, @, / or : — and no full stop followed at once by two letters, or by a letter and its
// mark: that is the middle of a web address, which letters and full stops alone can spell and a
// mail client would link.
export const MIN_FULL_NAME_LENGTH = 2;
export const MAX_FULL_NAME_LENGTH = 60;
export const FULL_NAME_INVALID_MESSAGE = `Name must be ${MIN_FULL_NAME_LENGTH} to ${MAX_FULL_NAME_LENGTH} characters: letters, spaces, apostrophes, hyphens, and full stops that end a word or an initial.`;
const FULL_NAME_PATTERN = /^(?:[\p{L}\p{M}\p{Zs}'’-]|\.(?!\p{L}[\p{L}\p{M}]))+$/u;

// The name a sign-up gives, trimmed — what the account and the welcome email are handed. A server
// action's argument is whatever the client posted, whatever its type says: anything but a string
// that trims to such a name is no name. The length is read before the pattern.
export const signUpName = (input: unknown): string | null => {
    if (typeof input !== 'string') return null;
    const name = input.trim();
    if (name.length < MIN_FULL_NAME_LENGTH || name.length > MAX_FULL_NAME_LENGTH) return null;
    return FULL_NAME_PATTERN.test(name) ? name : null;
};

// The form's rule is the action's own reading, so the two cannot disagree about a name.
export const FULL_NAME_RULE = {
    required: 'Full name is required',
    validate: (value: unknown): true | string => signUpName(value) !== null || FULL_NAME_INVALID_MESSAGE,
};
