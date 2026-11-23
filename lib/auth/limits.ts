// How often the sign-in-adjacent server actions may be called, and the counter keys they
// spend. better-auth's own rateLimit never runs here (see lib/auth/server.ts), so these
// are the app's only limits on them; lib/rate-limit.ts takeRateLimit does the counting.
//
// Import-free so the keys, the client-address reading, the sign-in input check and the order
// sign-in's and password reset's two counters are spent in are unit-tested like chat-limits.

// A reset request is counted twice, as sign-in is: per address, so nobody's inbox is flooded,
// and per client, because the address is the caller's own to choose — a new one each time is a
// new key the per-address counter never refuses, and every key is a row in the database.
export const PASSWORD_RESET_LIMIT = 3;
export const PASSWORD_RESET_CLIENT_LIMIT = 10;
export const PASSWORD_RESET_WINDOW_MS = 15 * 60 * 1000;

// Sign-in is counted twice: per address, so no one can guess one account's password from
// many machines, and per client, so no one machine can walk a list of addresses. The client
// limit is the looser one — an office or a campus shares one address.
export const SIGN_IN_EMAIL_LIMIT = 10;
export const SIGN_IN_CLIENT_LIMIT = 30;
export const SIGN_IN_WINDOW_MS = 15 * 60 * 1000;

// Sign-up is counted per client, by the hour: each one creates an account, seeds its topics and
// queues a model-written welcome email, and its answer says whether an address already has an
// account. Ten leaves room for a household or an office behind one address.
export const SIGN_UP_CLIENT_LIMIT = 10;
export const SIGN_UP_WINDOW_MS = 60 * 60 * 1000;
export const SIGN_UP_LIMITED_MESSAGE = 'Too many sign-up attempts from this network. Try again later.';

// The one answer to a refused attempt. Refused before better-auth is asked anything, so it is
// the same whether the account exists or not.
export const SIGN_IN_LIMITED_MESSAGE = 'Too many sign-in attempts. Try again in a few minutes.';

// better-auth's answer to a wrong password, and the action's to input it cannot read.
export const SIGN_IN_INVALID_MESSAGE = 'Invalid email or password';

const normaliseEmail = (email: string): string => email.trim().toLowerCase();

export const passwordResetKey = (email: string): string => `pwreset:${normaliseEmail(email)}`;
// Counted even when no header names a client, every such request on one key: unlike sign-in's,
// the per-address counter behind it stops no one who never names an address twice. An address
// the action keys carries an @ (lib/auth/validation.ts passwordResetEmail) and this key never
// does, so the two counters cannot meet.
export const passwordResetClientKey = (ip: string | null): string => `pwreset:ip:${ip ?? 'unknown'}`;
export const signInEmailKey = (email: string): string => `signin:email:${normaliseEmail(email)}`;
export const signInClientKey = (ip: string): string => `signin:ip:${ip}`;
// Sign-in can skip its client counter when no header names a client (its per-address counter
// still holds); sign-up has no second counter, so every such request shares one key.
export const signUpClientKey = (ip: string | null): string => `signup:ip:${ip ?? 'unknown'}`;

type HeaderReader = {get(name: string): string | null};

// IPv4, IPv6 or IPv4-mapped IPv6 characters only, at most an IPv6 address's length. A value
// that is anything else ("unknown", a proxy's hostname, a padded header) names no client.
const IP_SHAPE = /^[0-9a-f.:]{2,45}$/;

const asIp = (raw: string | null | undefined): string | null => {
    const value = raw?.trim().toLowerCase() ?? '';
    return IP_SHAPE.test(value) ? value : null;
};

const firstEntry = (headers: HeaderReader, name: string): string | null =>
    asIp(headers.get(name)?.split(',')[0]);

// The requesting client's address: x-vercel-forwarded-for, else the first x-forwarded-for
// entry (the client; later entries are the proxies it passed through), else x-real-ip.
// It names the client only behind a proxy that overwrites these headers, such as Vercel —
// which also documents x-vercel-forwarded-for as the copy a proxy in front of it cannot
// overwrite, hence first. Anywhere else the client chooses its own key: Next's server fills
// x-forwarded-for from the socket only when the request carries none (`??=` in its
// base-server), so the per-address limit is the one that holds there.
// Null when no header names an address — sign-in then skips its per-client limit rather than
// counting every such request against one shared key; sign-up and password reset, which have
// no counter behind it that holds, count them on one.
export const clientIpFrom = (headers: HeaderReader): string | null =>
    firstEntry(headers, 'x-vercel-forwarded-for')
    ?? firstEntry(headers, 'x-forwarded-for')
    ?? asIp(headers.get('x-real-ip'));

// The longest address and password an account can have (lib/auth/validation.ts
// MAX_EMAIL_LENGTH and MAX_PASSWORD_LENGTH; this file imports nothing, so its test holds the
// two pairs equal).
export const SIGN_IN_EMAIL_MAX = 254;
export const SIGN_IN_PASSWORD_MAX = 128;

// A server action's argument is whatever the client posted, whatever its type says. Sign-in
// reads two strings and nothing else; anything else reads as no credentials at all. Neither is
// read past the longest one an account can have: the address becomes a counter's key, written
// whole into a unique index, and the password is hashed — and sign-in is reachable signed out.
export const signInCredentials = (input: unknown): {email: string; password: string} | null => {
    if (typeof input !== 'object' || input === null) return null;
    const {email, password} = input as {email?: unknown; password?: unknown};
    if (typeof email !== 'string' || typeof password !== 'string') return null;
    return email.length <= SIGN_IN_EMAIL_MAX && password.length <= SIGN_IN_PASSWORD_MAX ? {email, password} : null;
};

// One counter step, as takeRateLimit takes it: true while `key` is within `limit` for its window.
export type TakeCounter = (key: string, limit: number, windowMs: number) => Promise<boolean>;

// Client first, then address: a client already over its limit spends nothing of the address's
// budget, so one machine walking a list of addresses can lock out no more of them than its own
// client limit allows. A request with no client address (see clientIpFrom) is counted per
// address only.
export const withinSignInLimits = async (
    {ip, email}: {ip: string | null; email: string},
    take: TakeCounter,
): Promise<boolean> => {
    if (ip && !(await take(signInClientKey(ip), SIGN_IN_CLIENT_LIMIT, SIGN_IN_WINDOW_MS))) return false;
    return take(signInEmailKey(email), SIGN_IN_EMAIL_LIMIT, SIGN_IN_WINDOW_MS);
};

// Client first, then address, as at sign-in: a client over its limit writes no key for the
// address it names and spends nothing of that address's budget.
export const withinPasswordResetLimits = async (
    {ip, email}: {ip: string | null; email: string},
    take: TakeCounter,
): Promise<boolean> => {
    if (!(await take(passwordResetClientKey(ip), PASSWORD_RESET_CLIENT_LIMIT, PASSWORD_RESET_WINDOW_MS))) return false;
    return take(passwordResetKey(email), PASSWORD_RESET_LIMIT, PASSWORD_RESET_WINDOW_MS);
};

// The sign-up limit in force: SIGN_UP_CLIENT_LIMIT from the environment when it is a positive
// integer — the browser QA signs up a user per suite from one address and raises it — else the
// default, with a warning naming what was ignored.
export const resolveSignUpLimit = (env: Record<string, string | undefined> = process.env): {limit: number; warning?: string} => {
    const raw = env.SIGN_UP_CLIENT_LIMIT;
    if (raw === undefined || raw === '') return {limit: SIGN_UP_CLIENT_LIMIT};
    const parsed = Number(raw);
    if (Number.isInteger(parsed) && parsed >= 1) return {limit: parsed};
    return {limit: SIGN_UP_CLIENT_LIMIT, warning: `SIGN_UP_CLIENT_LIMIT="${raw}" is not a positive integer — using ${SIGN_UP_CLIENT_LIMIT}.`};
};

// One step of the client's sign-up counter: true while it is within `limit`.
export const withinSignUpLimit = ({ip}: {ip: string | null}, take: TakeCounter, limit: number = SIGN_UP_CLIENT_LIMIT): Promise<boolean> =>
    take(signUpClientKey(ip), limit, SIGN_UP_WINDOW_MS);
