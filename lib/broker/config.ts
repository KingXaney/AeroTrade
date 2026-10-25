// The Alpaca link's knobs and how it reads the environment (docs/specs/2026-10-24-alpaca-broker-link.md).
// Import-free and pure: the page, the actions, the job and the tests read one rule.
//
// One Alpaca account, keyed in the server's environment; the owner links one of their paper
// accounts to it, and a sync sizes the Alpaca account to that account's weights. Paper unless
// two separate switches both say live: ALPACA_MODE=live and ALPACA_LIVE_ENABLED=yes.

export const ALPACA_PAPER_URL = 'https://paper-api.alpaca.markets';
export const ALPACA_LIVE_URL = 'https://api.alpaca.markets';

// A difference smaller than this many dollars, or than this share of the Alpaca account's equity,
// is left alone: the mirror follows the source's trades, not its daily drift.
export const MIRROR_MIN_ORDER_DOLLARS = 25;
export const MIRROR_DRIFT_BAND = 0.02;
// The cash the buys always leave, as a share of equity: room for a fill a cent above the quote.
export const MIRROR_CASH_BUFFER = 0.01;
// Orders one sync may send at most.
export const MIRROR_MAX_ORDERS = 20;
// Syncs kept on the link, newest first.
export const MIRROR_SYNCS_KEPT = 10;

type Env = Readonly<Record<string, string | undefined>>;

export type AlpacaMode = 'paper' | 'live';

export type AlpacaSettings = {
    configured: boolean;
    mode: AlpacaMode;
    // Where requests go; null when nothing may be sent.
    baseUrl: string | null;
    // Why nothing may be sent: no keys, or live asked for without its second switch.
    blocked: 'no-keys' | 'live-locked' | null;
};

const filled = (value: string | undefined): boolean => typeof value === 'string' && value.trim().length > 0;

export const alpacaSettings = (env: Env = process.env): AlpacaSettings => {
    const mode: AlpacaMode = (env.ALPACA_MODE ?? '').trim().toLowerCase() === 'live' ? 'live' : 'paper';
    if (!filled(env.ALPACA_API_KEY_ID) || !filled(env.ALPACA_API_SECRET_KEY)) return {configured: false, mode, baseUrl: null, blocked: 'no-keys'};
    if (mode === 'live') {
        return env.ALPACA_LIVE_ENABLED === 'yes'
            ? {configured: true, mode, baseUrl: ALPACA_LIVE_URL, blocked: null}
            : {configured: true, mode, baseUrl: null, blocked: 'live-locked'};
    }
    // ALPACA_BASE_URL points paper mode at a stand-in (the browser QA's stub); live never reads it.
    const override = (env.ALPACA_BASE_URL ?? '').trim().replace(/\/+$/, '');
    return {configured: true, mode, baseUrl: override || ALPACA_PAPER_URL, blocked: null};
};

// The keys, for the server's client alone.
export const alpacaKeys = (env: Env = process.env): {keyId: string; secret: string} =>
    ({keyId: (env.ALPACA_API_KEY_ID ?? '').trim(), secret: (env.ALPACA_API_SECRET_KEY ?? '').trim()});

const emailsOf = (value: string | undefined): string[] =>
    (value ?? '').split(',').map((email) => email.trim().toLowerCase()).filter((email) => email.length > 0);

// Who may link Alpaca: BROKER_OWNER_EMAILS, else the lab's owners (the app's one owner).
export const brokerOwnerEmails = (env: Env = process.env): string[] => {
    const own = emailsOf(env.BROKER_OWNER_EMAILS);
    return own.length > 0 ? own : emailsOf(env.LAB_OWNER_EMAILS);
};

export const isBrokerOwner = (email: string | null | undefined, env: Env = process.env): boolean =>
    typeof email === 'string' && email.trim().length > 0 && brokerOwnerEmails(env).includes(email.trim().toLowerCase());
