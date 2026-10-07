// Trust by source: what the outlet a piece came from says about it before any model label is
// read. Pure. A press-release wire carries the company speaking for itself, whatever the model
// called the piece, so its nature is settled here; an outlet that is mostly commentary weighs a
// share of its importance. Matched case-insensitively on the stored outlet name and on the
// article's URL host, so Finnhub's "PRNewswire", an RSS feed's "PR Newswire" and a
// prnewswire.com link all read the same. Anything unlisted is trusted in full and keeps the
// model's label.

import {COMMENTARY_IMPORTANCE_SHARE, type Nature} from "@/lib/brain/config";

export type SourceTrust = {
    // What the piece's importance is multiplied by.
    importanceShare: number;
    // A nature the outlet settles, or null to keep the model's label.
    nature: Nature | null;
};

// Wires that distribute companies' own announcements.
export const PRESS_RELEASE_OUTLETS: readonly RegExp[] = [
    /\bpr ?newswire\b/i, /\bbusiness ?wire\b/i, /\bglobe ?newswire\b/i, /\baccess ?wire\b/i, /\bnewsfile/i, /\bpr ?web\b/i, /\bein ?presswire\b/i,
];

// Outlets whose pieces are mostly commentary: analysis, outlooks, lists of names to watch.
export const COMMENTARY_OUTLETS: readonly RegExp[] = [
    /\bmotley ?fool\b/i, /\bfool\.com\b/i, /\bseeking ?alpha\b/i, /\binvestor ?place\b/i, /\bzacks\b/i, /\btip ?ranks\b/i,
    /\bsimply ?wall ?st\b/i, /\bguru ?focus\b/i, /\b24\/?7 ?wall ?st\b/i,
];

const NEUTRAL: SourceTrust = {importanceShare: 1, nature: null};

const hostOf = (url: string): string => {
    try {
        return new URL(url).hostname.toLowerCase();
    } catch {
        return '';
    }
};

// The outlet name, the URL host, and the host with its dots as spaces ("prnewswire com"), so
// one pattern reads a name and a domain alike.
const spellings = (source: string, url: string): string[] => {
    const host = hostOf(url);
    return [source, host, host.replace(/\./g, ' ')].filter((text) => text.length > 0);
};

const matches = (patterns: readonly RegExp[], texts: readonly string[]): boolean =>
    patterns.some((pattern) => texts.some((text) => pattern.test(text)));

export const sourceTrust = (source: string, url = ''): SourceTrust => {
    const texts = spellings(source, url);
    if (matches(PRESS_RELEASE_OUTLETS, texts)) return {importanceShare: 1, nature: 'company'};
    if (matches(COMMENTARY_OUTLETS, texts)) return {importanceShare: COMMENTARY_IMPORTANCE_SHARE, nature: null};
    return NEUTRAL;
};
