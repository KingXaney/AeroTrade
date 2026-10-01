// The auth forms' field rules, in react-hook-form's shape, and the password lengths
// lib/better-auth/auth.ts enforces on the server. One copy, so a form cannot accept a password
// the server will refuse — and spend a rate-limited attempt finding that out.
//
// Import-free and client-safe: the four auth forms and the better-auth config all read it.

export const MIN_PASSWORD_LENGTH = 8;
export const MAX_PASSWORD_LENGTH = 128;

export const EMAIL_RULE = {
    required: 'Email is required',
    pattern: {value: /^[^\s@]+@[^\s@]+\.[^\s@]+$/, message: 'Enter a valid email address'},
};

export const PASSWORD_RULE = {
    required: 'Password is required',
    minLength: {value: MIN_PASSWORD_LENGTH, message: `Password must be at least ${MIN_PASSWORD_LENGTH} characters`},
    maxLength: {value: MAX_PASSWORD_LENGTH, message: `Password must be at most ${MAX_PASSWORD_LENGTH} characters`},
};
