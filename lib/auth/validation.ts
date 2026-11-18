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
