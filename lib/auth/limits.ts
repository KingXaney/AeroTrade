// How often the sign-in-adjacent server actions may be called, and the counter keys they
// spend. better-auth's own rateLimit never runs here (see lib/better-auth/auth.ts), so these
// are the app's only limits on them; lib/auth/rate-limit.ts takeRateLimit does the counting.
//
// Import-free so the keys and the client-address reading are unit-tested like chat-limits.

export const PASSWORD_RESET_LIMIT = 3;
export const PASSWORD_RESET_WINDOW_MS = 15 * 60 * 1000;

// Sign-in is counted twice: per address, so no one can guess one account's password from
// many machines, and per client, so no one machine can walk a list of addresses. The client
// limit is the looser one — an office or a campus shares one address.
export const SIGN_IN_EMAIL_LIMIT = 10;
export const SIGN_IN_CLIENT_LIMIT = 30;
export const SIGN_IN_WINDOW_MS = 15 * 60 * 1000;

// The one answer to a refused attempt. Refused before better-auth is asked anything, so it is
// the same whether the account exists or not.
export const SIGN_IN_LIMITED_MESSAGE = 'Too many sign-in attempts. Try again in a few minutes.';

const normaliseEmail = (email: string): string => email.trim().toLowerCase();

export const passwordResetKey = (email: string): string => `pwreset:${normaliseEmail(email)}`;
export const signInEmailKey = (email: string): string => `signin:email:${normaliseEmail(email)}`;
export const signInClientKey = (ip: string): string => `signin:ip:${ip}`;

export type HeaderReader = {get(name: string): string | null};

// IPv4, IPv6 or IPv4-mapped IPv6 characters only, at most an IPv6 address's length. A value
// that is anything else ("unknown", a proxy's hostname, a padded header) names no client.
const IP_SHAPE = /^[0-9a-f.:]{2,45}$/;

const asIp = (raw: string | null | undefined): string | null => {
    const value = raw?.trim().toLowerCase() ?? '';
    return IP_SHAPE.test(value) ? value : null;
};

// The requesting client's address: the first x-forwarded-for entry (the client; later entries
// are the proxies it passed through), else x-real-ip. On Vercel both are set by the platform,
// which overwrites whatever the client sent; `next dev` sets x-forwarded-for from the socket.
// Null when neither names an address — the caller then skips the per-client limit rather than
// counting every such request against one shared key.
export const clientIpFrom = (headers: HeaderReader): string | null =>
    asIp(headers.get('x-forwarded-for')?.split(',')[0]) ?? asIp(headers.get('x-real-ip'));
