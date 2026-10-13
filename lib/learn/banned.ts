// The one list of words that turn a description into advice. Every learner-facing string
// in the app (glossary, lessons, receipts), the chat chips and the model prompts
// are held to it by a unit test, so "descriptive, never prescriptive" is enforced rather
// than reviewed.
//
// Two tiers:
//   'advice' — verdicts and instructions about what to do with money. Banned in every
//              voice, prompts included.
//   'copy'   — 'advice' plus the comparatives and imperatives a lesson must not use: a
//              bare "should", "consider", better/best/beat, an order to buy or sell.
//              Learner-facing copy is checked here; a gloss that narrates what a rule did
//              ("the rule sells when…") is checked at 'advice' only.
//
//   'lab'    — the owner's lab (lib/learn/copy/lab): unit bodies, cards and solutions. Advanced
//              ML and quant prose uses "optimal control", "best-of-n", "cheap to compute" and
//              "the loss will fall" as terms of art, so this tier keeps only the phrases that aim
//              an instruction at money or at a security. It is NOT a superset of 'advice'. The
//              lab's chrome stays at 'copy', and its prose is checked with code and maths
//              stripped first (lib/lab/prose.ts).
//
// A prohibition is not advice: a clause that begins "Never", "No", "Don't" is dropped
// before matching, so a prompt may say "Never recommend a stock" and a lesson may say
// "No fee is charged".

type BannedTier = 'advice' | 'copy' | 'lab';

export const BANNED_ADVICE: readonly RegExp[] = [
    /\bshould (i|you|we|they|one|anyone|investors?) (buy|sell|add|avoid|hold|own|invest|trim|dump|short)\b/i,
    /\byou should\b/i,
    /\bshould i\b/i,
    /\brecommend(s|ed|ing|ation|ations)?\b/i,
    /\bsuggest(s|ed|ing)? (adding|avoiding|buying|selling|holding|dumping)\b/i,
    /\b(over|under)-?valued\b/i,
    /\b(cheap|expensive|pricey|overpriced|underpriced)\b/i,
    /\b(pretty |very |quite |a )?safe (stock|bet|pick|choice|investment|place|haven)\b/i,
    /\bsmart (choice|buy|move|bet|pick)\b/i,
    /\b(good|great|bad|terrible|right|wrong) (time|moment) to (buy|sell|invest)\b/i,
    /\b(good|bad|smart|wise|great) (idea|move|bet|call)\b/i,
    /\b(buy|sell) (now|today|before|immediately|the dip)\b/i,
    /\bprice targets?\b/i,
    /\bwill (go|rise|fall|climb|drop|rally|recover|crash|bounce)( (up|down))?\b/i,
    /\bstock tips?\b/i,
    /\b(our|my) (pick|picks|top picks)\b/i,
    /\bguaranteed\b/i,
    /\bbuy (it |them )?back\b/i,
    /\bdiversify\b/i,
];

export const BANNED_COPY: readonly RegExp[] = [
    /\bshould\b/i,
    /\bconsider\b/i,
    /\b(better|best|optimal|superior|outperform(s|ed|ing)?|beat(s|en|ing)?)\b/i,
    /\btoo (much|many|concentrated|risky|little|few)\b/i,
    // An imperative at the start of a sentence: "Buy the dip" is an instruction, "Buys
    // a strong stock on a dip" is a description.
    /(^|[.!?:;]\s*)(buy|sell|hold|avoid|trim|dump)\b/i,
    /\bmistake\b/i,
];

export const BANNED_LAB: readonly RegExp[] = [
    /\b(you|we|one|investors?|traders?|readers?) should (buy|sell|short|hold|own|add|avoid|trim|dump|go long)\b/i,
    /\bshould i (buy|sell|short|hold)\b/i,
    /\bprice targets?\b/i,
    /\b(stocks?|shares?|the market|markets|prices?|this (stock|name|ticker)|the (stock|name|ticker)) (will|is going to|are going to) (go (up|down)|rise|fall|climb|drop|rally|recover|crash|bounce|double)\b/i,
    /\bguaranteed (returns?|profits?|gains?|income)\b/i,
    /\b(buy|sell|short) (now|today|the dip|before|immediately)\b/i,
    /\bstock tips?\b/i,
    /\b(our|my) (top )?picks?\b/i,
    /\brecommend(s|ed|ing)? (buying|selling|shorting|holding|owning)\b/i,
    // An order aimed at a ticker-shaped token. Case-sensitive on purpose: "sell signals" passes,
    // "sell SPY" and "long NVDA" do not. A false positive forces a reword, nothing more.
    /\b(buy|sell|short|long|overweight|underweight|accumulate) \$?[A-Z]{2,5}\b/,
];

// Leading list markers and markdown emphasis are skipped so "- **Never quote…" and
// "1. Never predict…" still read as prohibitions.
const PROHIBITION = /^[\s\-*\d.)]*(?:\*\*)?\s*(?:never|no|not|don't|do not|cannot|can't|nothing|nobody|without)\b/i;

const CLAUSE_BREAK = /(?<=[.!?;:\n])\s+|\n/;

export const stripProhibitions = (text: string): string =>
    text.split(CLAUSE_BREAK).filter((clause) => !PROHIBITION.test(clause)).join(' ');

const patternsFor = (tier: BannedTier): readonly RegExp[] =>
    tier === 'copy' ? [...BANNED_ADVICE, ...BANNED_COPY] : tier === 'lab' ? BANNED_LAB : BANNED_ADVICE;

// Every distinct banned phrase found in `text` (empty when it is clean), with
// prohibitions removed first.
export const findBanned = (text: string, tier: BannedTier = 'copy'): string[] => {
    const haystack = stripProhibitions(text);
    const hits = new Set<string>();
    for (const pattern of patternsFor(tier)) {
        const global = new RegExp(pattern.source, pattern.flags.includes('g') ? pattern.flags : `${pattern.flags}g`);
        for (const match of haystack.matchAll(global)) {
            const phrase = match[0].trim();
            if (phrase) hits.add(phrase.toLowerCase());
        }
    }
    return [...hits];
};
