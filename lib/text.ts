// Small text helpers more than one feature shares: the one safe way user text becomes a regex,
// and the article dedupe key (news ingest, the per-user feed, followed topics). Pure — it imports
// nothing — so the sanitizers and client code can use it without dragging the fetch adapters
// (and through them better-auth and mongoose) into their import graph.

// Regex metacharacters must be escaped so symbols like BRK.B match literally. User text never
// becomes a regex except through this (AGENTS.md invariant 2).
export const escapeRegExp = (value: string): string => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

// Pairs with hashId below: together they form the article dedupe key, hashId(normalizeUrl(url)).
export const normalizeUrl = (url: string): string => {
    // Query strings carry tracking params (utm_*) that make identical stories look distinct.
    const withoutQuery = url.toLowerCase().split("?")[0];
    return withoutQuery.replace(/\/+$/, "");
};

// djb2 constants — named so the hash stays auditable without magic numbers inline.
const DJB2_SEED = 5381;
const DJB2_SHIFT = 5;

export const hashId = (input: string): number => {
    let hash = DJB2_SEED;
    for (let i = 0; i < input.length; i++) {
        // hash * 33 + charCode, forced into 32-bit space each step to stay deterministic.
        hash = ((hash << DJB2_SHIFT) + hash + input.charCodeAt(i)) | 0;
    }
    // >>> 0 coerces to unsigned so ids are always positive 32-bit integers, stable across runs.
    return hash >>> 0;
};

const UNITS = ['zero', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten',
    'eleven', 'twelve', 'thirteen', 'fourteen', 'fifteen', 'sixteen', 'seventeen', 'eighteen', 'nineteen'];
const TENS = ['', '', 'twenty', 'thirty', 'forty', 'fifty', 'sixty', 'seventy', 'eighty', 'ninety'];

// A whole count as prose writes it: 'eight', 'eleven', 'forty', 'forty-two'; from a hundred
// (or for anything but a whole number) the digits.
export const numberWord = (n: number): string => {
    if (!Number.isInteger(n) || n < 0 || n >= 100) return String(n);
    if (n < 20) return UNITS[n];
    const tens = TENS[Math.floor(n / 10)];
    return n % 10 === 0 ? tens : `${tens}-${UNITS[n % 10]}`;
};

// 'eight' → 'Eight', for a count that opens a sentence.
export const capitalize = (text: string): string => text.charAt(0).toUpperCase() + text.slice(1);
