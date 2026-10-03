// The one home for how the app prints money, changes, market caps and "how long ago". Pure and
// client-safe — it imports nothing — so components and server code import it directly.

export const formatPrice = (price: number) => {
    return new Intl.NumberFormat('en-US', {
        style: 'currency',
        currency: 'USD',
        minimumFractionDigits: 2,
    }).format(price);
};

// Round first, then decide the sign and the colour, so a $3 loss on $100,000 reads "0.00%"
// in neutral rather than "-0.00%" in red. (-0).toFixed(2) is already "0.00".
export const roundPct = (value: number, digits = 2): number => Math.round(value * 10 ** digits) / 10 ** digits;

export const formatPct = (value: number | null, digits = 2): string => {
    if (value === null) return '—';
    const rounded = roundPct(value, digits);
    return `${rounded > 0 ? '+' : ''}${rounded.toFixed(digits)}%`;
};

export const formatDrawdown = (value: number | null): string => {
    if (value === null) return '—';
    const rounded = roundPct(value);
    return rounded > 0 ? `−${rounded.toFixed(2)}%` : '0.00%';
};

// A plain signed figure, such as a sentiment score, on the same rule.
export const formatSigned = (value: number, digits = 2): string => {
    const rounded = roundPct(value, digits);
    return `${rounded > 0 ? '+' : ''}${rounded.toFixed(digits)}`;
};

// A dollar change (P&L), rounded to the cent first. `|| 0` drops the -0 that rounding a tiny
// loss leaves, which Intl would print as "-$0.00".
export const formatSignedPrice = (value: number): string => {
    const cents = roundPct(value) || 0;
    return `${cents > 0 ? '+' : ''}${formatPrice(cents)}`;
};

// The colour input for getChangeColorClass: zero after rounding reads neutral.
export const signedForColor = (value: number | null): number | undefined =>
    value === null ? undefined : roundPct(value) || undefined;

// A quote's or a position's change. Blank only when there is no figure: a flat stock prints
// "0.00%" (it used to print nothing), and a sub-basis-point move never prints a signed zero.
export const formatChangePercent = (changePercent?: number | null) =>
    changePercent == null || !Number.isFinite(changePercent) ? '' : formatPct(changePercent);

export const getChangeColorClass = (changePercent?: number | null) => {
    const rounded = signedForColor(changePercent ?? null);
    if (!rounded) return 'text-fg-muted';
    return rounded > 0 ? 'text-positive' : 'text-negative';
};

// A time of day, in Eastern time and named as such: the server may run in UTC, and every time
// the app shows (fills, watchlist adds) is read in ET.
export const formatEasternTimestamp = (when: Date | number, {year = false}: {year?: boolean} = {}): string =>
    `${new Date(when).toLocaleString('en-US', {
        timeZone: 'America/New_York',
        month: 'short',
        day: 'numeric',
        ...(year ? {year: 'numeric' as const} : {}),
        hour: 'numeric',
        minute: '2-digit',
    })} ET`;

// Two readers, the unit in the name: feed items (Finnhub `datetime`, topic articles) are unix
// seconds, while our own stamps (Date#getTime, job runs, friend requests) are epoch ms. One
// seconds-only helper read a ms stamp as a date far in the future, which prints "just now".
export const formatTimeAgoMs = (epochMs: number) => {
    const diffInMs = Date.now() - epochMs;
    const diffInHours = Math.floor(diffInMs / (1000 * 60 * 60));
    const diffInMinutes = Math.floor(diffInMs / (1000 * 60));

    // Feeds stamp items seconds ahead of this server's clock; never print "-1 minute ago".
    if (diffInMinutes < 1) return 'just now';
    if (diffInHours > 24) {
        const days = Math.floor(diffInHours / 24);
        return `${days} day${days > 1 ? 's' : ''} ago`;
    } else if (diffInHours >= 1) {
        return `${diffInHours} hour${diffInHours > 1 ? 's' : ''} ago`;
    } else {
        return `${diffInMinutes} minute${diffInMinutes > 1 ? 's' : ''} ago`;
    }
};

export const formatTimeAgoSeconds = (unixSeconds: number) => formatTimeAgoMs(unixSeconds * 1000);

// How long until a stamp, for "resets in …": 'under a minute', '12m', '2h 10m', '9h'. Relative,
// not a clock time, because the chat's windows roll from their first hit rather than ending at
// an ET midnight. Takes `now` explicitly: callers render it (no Date.now() in render).
export const formatTimeUntilMs = (epochMs: number, now: number): string => {
    const ms = epochMs - now;
    if (ms < 60_000) return 'under a minute';
    const minutes = Math.floor(ms / 60_000);
    if (minutes < 60) return `${minutes}m`;
    const hours = Math.floor(minutes / 60);
    const rest = minutes % 60;
    return rest === 0 ? `${hours}h` : `${hours}h ${rest}m`;
};

// Formatted string like "$3.10T", "$900.00B", "$25.00M" or "$999999.99" (no thousands separator below a million)
export function formatMarketCapValue(marketCapUsd: number): string {
    if (!Number.isFinite(marketCapUsd) || marketCapUsd <= 0) return 'N/A';

    if (marketCapUsd >= 1e12) return `$${(marketCapUsd / 1e12).toFixed(2)}T`; // Trillions
    if (marketCapUsd >= 1e9) return `$${(marketCapUsd / 1e9).toFixed(2)}B`; // Billions
    if (marketCapUsd >= 1e6) return `$${(marketCapUsd / 1e6).toFixed(2)}M`; // Millions
    return `$${marketCapUsd.toFixed(2)}`; // Below one million, show full USD amount
}
