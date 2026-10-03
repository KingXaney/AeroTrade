// The hand evaluator: five to seven cards in, one integer out, a larger value winning. Import-free,
// so the worker, the page and the offline table script share it.
//
// The cards arrive as four 13-bit masks, one per suit. Every category falls out of bit arithmetic on
// them plus five small tables (8,192 entries each, built at load): a rank present in exactly two
// suits is a pair, in three a set of trips, in all four quads. Tested over all 2,598,960 five-card
// and 133,784,560 seven-card hands (lib/poker/__tests__/evaluator.test.ts).
//
// A value is category << 26 | detail, where the detail orders hands within the category.

export const CATEGORY = ['high card', 'pair', 'two pair', 'three of a kind', 'straight', 'flush', 'full house', 'four of a kind', 'straight flush'] as const;
export type HandValue = number;

const SIZE = 1 << 13;
export const POP = new Uint8Array(SIZE);
// The highest straight in a rank mask, as its top rank + 1 (the wheel, five-high, is 4); 0 for none.
const STRAIGHT = new Uint8Array(SIZE);
const TOP2 = new Uint16Array(SIZE);
const TOP3 = new Uint16Array(SIZE);
const TOP5 = new Uint16Array(SIZE);

const keepTop = (mask: number, n: number): number => {
    let out = 0;
    for (let bit = 12, kept = 0; bit >= 0 && kept < n; bit--) {
        if (mask & (1 << bit)) {
            out |= 1 << bit;
            kept++;
        }
    }
    return out;
};

for (let mask = 0; mask < SIZE; mask++) {
    let count = 0;
    for (let bit = 0; bit < 13; bit++) if (mask & (1 << bit)) count++;
    POP[mask] = count;
    TOP2[mask] = keepTop(mask, 2);
    TOP3[mask] = keepTop(mask, 3);
    TOP5[mask] = keepTop(mask, 5);
    // Five consecutive ranks, the ace (bit 12) also counting low under the two.
    const withLowAce = ((mask << 1) | (mask >> 12)) & 0x3fff;
    for (let top = 13; top >= 4; top--) {
        const run = 0x1f << (top - 4);
        if ((withLowAce & run) === run) {
            STRAIGHT[mask] = top;
            break;
        }
    }
}

const hi = (mask: number): number => 31 - Math.clz32(mask);

export const evaluateMasks = (s0: number, s1: number, s2: number, s3: number): HandValue => {
    // A flush: at most one suit can hold five of seven cards, and then no full house or quads fits.
    const flush = POP[s0] >= 5 ? s0 : POP[s1] >= 5 ? s1 : POP[s2] >= 5 ? s2 : POP[s3] >= 5 ? s3 : 0;
    if (flush) {
        const straight = STRAIGHT[flush];
        return straight ? (8 << 26) | straight : (5 << 26) | TOP5[flush];
    }
    const ranks = s0 | s1 | s2 | s3;
    const quads = s0 & s1 & s2 & s3;
    if (quads) {
        const q = hi(quads);
        return (7 << 26) | (q << 4) | hi(ranks & ~(1 << q));
    }
    const odd = s0 ^ s1 ^ s2 ^ s3;
    const two = ((s0 | s1) & (s2 | s3)) | (s0 & s1) | (s2 & s3);
    const trips = two & odd;
    const pairs = two & ~odd;
    if (trips) {
        const t = hi(trips);
        const rest = (trips & ~(1 << t)) | pairs;
        if (rest) return (6 << 26) | (t << 4) | hi(rest);
    }
    const straight = STRAIGHT[ranks];
    if (straight) return (4 << 26) | straight;
    if (trips) {
        const t = hi(trips);
        return (3 << 26) | (t << 13) | TOP2[ranks & ~(1 << t)];
    }
    if (pairs) {
        if (POP[pairs] >= 2) {
            const top = TOP2[pairs];
            return (2 << 26) | (top << 13) | (1 << hi(ranks & ~top));
        }
        return (1 << 26) | (hi(pairs) << 13) | TOP3[ranks & ~pairs];
    }
    return TOP5[ranks];
};

// Cards as rank·4 + suit (lib/poker/cards.ts), decoded here too so this module stays import-free.
export const evaluateCards = (cards: ArrayLike<number>, n = cards.length): HandValue => {
    let s0 = 0;
    let s1 = 0;
    let s2 = 0;
    let s3 = 0;
    for (let i = 0; i < n; i++) {
        const card = cards[i];
        const bit = 1 << (card >> 2);
        switch (card & 3) {
            case 0: s0 |= bit; break;
            case 1: s1 |= bit; break;
            case 2: s2 |= bit; break;
            default: s3 |= bit;
        }
    }
    return evaluateMasks(s0, s1, s2, s3);
};

export const categoryOf = (value: HandValue): number => value >>> 26;
