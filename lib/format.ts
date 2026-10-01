// The one home for how the app prints money and changes. Pure and client-safe — it imports
// nothing — so lib/utils and lib/strategies/views re-export from here for their importers.

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
