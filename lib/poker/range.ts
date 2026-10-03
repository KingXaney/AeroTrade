// Hand ranges: a weight from 0 to 1 on each of the 1,326 two-card combos. Parsed from the notation
// PokerStove made common and formatted back to it. The reader's text is only ever tested against
// fixed patterns, one token at a time (invariant 2).
//
//   QQ+  pairs from queens up      99-66  nines down to sixes      AK   AKs and AKo
//   AQs+ the kicker climbs to one below the ace                    A5s-A2s  a kicker run
//   76s-KQs  the suited connectors from 76s to KQs                 AhKh  one combo
//   :0.5 or :50%  a weight for the token before it                 random / any  every combo
//
// One extension: a + on a connector (76s+) climbs the connector diagonal — 76s, 87s … KQs, AKs —
// since by the kicker rule it would mean 76s alone. Later tokens override earlier ones.

import {CLASS_COMBOS, CLASS_OF_COMBO, CLASSES, COMBO_HI, COMBO_LO, COMBOS, RANKS, cardLabel, classId, comboIndex, parseCard, type Card} from "@/lib/poker/cards";

export type Range = Float64Array;

export type RangeIssueKind = 'unknown' | 'dash' | 'weight' | 'pair-suit' | 'repeat-card';
export type RangeIssue = {token: string; kind: RangeIssueKind};

export const emptyRange = (): Range => new Float64Array(COMBOS);

const rankIndex = (char: string): number => (char === '1' ? -1 : RANKS.indexOf(char.toUpperCase()));

type Hand = {hi: number; lo: number; suit: 's' | 'o' | ''};

// "AKs", "T9", "QQ" → ranks (0 = two … 12 = ace), higher first, and a suit marker.
const parseHand = (text: string): Hand | null => {
    const normalized = text.split('10').join('T');
    if (normalized.length < 2 || normalized.length > 3) return null;
    const a = rankIndex(normalized[0]);
    const b = rankIndex(normalized[1]);
    if (a < 0 || b < 0) return null;
    const marker = normalized[2]?.toLowerCase() ?? '';
    if (marker && marker !== 's' && marker !== 'o') return null;
    return {hi: Math.max(a, b), lo: Math.min(a, b), suit: marker as Hand['suit']};
};

// The classes a hand names: a pair, a suited or offsuit class, or both for "AK".
const classesOf = (hand: Hand): number[] => {
    const row = (rank: number) => 12 - rank;
    if (hand.hi === hand.lo) return [classId(row(hand.hi), row(hand.hi))];
    const suited = classId(row(hand.hi), row(hand.lo));
    const offsuit = classId(row(hand.lo), row(hand.hi));
    return hand.suit === 's' ? [suited] : hand.suit === 'o' ? [offsuit] : [suited, offsuit];
};

const expandPlus = (hand: Hand): Hand[] => {
    if (hand.hi === hand.lo) return Array.from({length: 13 - hand.hi}, (_, i) => ({...hand, hi: hand.hi + i, lo: hand.lo + i}));
    // A connector climbs its diagonal; any other hand climbs its kicker.
    if (hand.hi - hand.lo === 1) return Array.from({length: 13 - hand.hi}, (_, i) => ({...hand, hi: hand.hi + i, lo: hand.lo + i}));
    return Array.from({length: hand.hi - hand.lo}, (_, i) => ({...hand, lo: hand.lo + i}));
};

const expandDash = (a: Hand, b: Hand): Hand[] | null => {
    if (a.suit !== b.suit) return null;
    if (a.hi === a.lo && b.hi === b.lo) {
        const [from, to] = [Math.min(a.hi, b.hi), Math.max(a.hi, b.hi)];
        return Array.from({length: to - from + 1}, (_, i) => ({...a, hi: from + i, lo: from + i}));
    }
    if (a.hi === b.hi && a.hi !== a.lo && b.hi !== b.lo) {
        const [from, to] = [Math.min(a.lo, b.lo), Math.max(a.lo, b.lo)];
        return Array.from({length: to - from + 1}, (_, i) => ({...a, lo: from + i}));
    }
    if (a.hi - a.lo === b.hi - b.lo && a.hi !== a.lo) {
        const [from, to] = [Math.min(a.lo, b.lo), Math.max(a.lo, b.lo)];
        const gap = a.hi - a.lo;
        return Array.from({length: to - from + 1}, (_, i) => ({...a, hi: from + i + gap, lo: from + i}));
    }
    return null;
};

const parseWeight = (text: string): number | null => {
    const percent = text.endsWith('%');
    const body = percent ? text.slice(0, -1) : text;
    if (!/^\d+(\.\d+)?$|^\.\d+$/.test(body)) return null;
    const value = Number(body) / (percent ? 100 : 1);
    return value >= 0 && value <= 1 ? value : null;
};

export const parseRange = (text: string): {range: Range; issues: RangeIssue[]} => {
    const range = emptyRange();
    const issues: RangeIssue[] = [];
    for (const token of text.split(/[\s,]+/).filter(Boolean)) {
        const [body, weightText, extra] = token.split(':');
        const weight = weightText === undefined ? 1 : parseWeight(weightText);
        if (weight === null || extra !== undefined) {
            issues.push({token, kind: 'weight'});
            continue;
        }
        const lower = body.toLowerCase();
        if (lower === 'random' || lower === 'any') {
            range.fill(weight);
            continue;
        }
        // One combo: four characters, two cards.
        if (body.length === 4 && parseCard(body.slice(0, 2)) !== null && parseCard(body.slice(2)) !== null) {
            const a = parseCard(body.slice(0, 2)) as Card;
            const b = parseCard(body.slice(2)) as Card;
            if (a === b) issues.push({token, kind: 'repeat-card'});
            else range[comboIndex(a, b)] = weight;
            continue;
        }
        let hands: Hand[] | null = null;
        if (body.endsWith('+')) {
            const hand = parseHand(body.slice(0, -1));
            hands = hand ? expandPlus(hand) : null;
        } else if (body.includes('-')) {
            const [left, right, more] = body.split('-');
            const a = parseHand(left ?? '');
            const b = parseHand(right ?? '');
            hands = a && b && more === undefined ? expandDash(a, b) : null;
            if (a && b && !hands) {
                issues.push({token, kind: 'dash'});
                continue;
            }
        } else {
            const hand = parseHand(body);
            hands = hand ? [hand] : null;
        }
        if (!hands) {
            issues.push({token, kind: 'unknown'});
            continue;
        }
        if (hands.some((hand) => hand.hi === hand.lo && hand.suit !== '')) {
            issues.push({token, kind: 'pair-suit'});
            continue;
        }
        for (const hand of hands) for (const id of classesOf(hand)) for (const combo of CLASS_COMBOS[id]) range[combo] = weight;
    }
    return {range, issues};
};

// ---- reading and writing a range ---------------------------------------------------------------

export const comboTotal = (range: Range): number => range.reduce((sum, w) => sum + w, 0);

// The weight of each class (the mean over its combos), for the grid.
export const classWeights = (range: Range): Float64Array => {
    const out = new Float64Array(CLASSES);
    for (let id = 0; id < CLASSES; id++) {
        const combos = CLASS_COMBOS[id];
        out[id] = combos.reduce((sum, combo) => sum + range[combo], 0) / combos.length;
    }
    return out;
};

export const isClassUniform = (range: Range): boolean =>
    CLASS_COMBOS.every((combos) => combos.every((combo) => range[combo] === range[combos[0]]));

export const setClassWeight = (range: Range, id: number, weight: number): Range => {
    const next = new Float64Array(range);
    for (const combo of CLASS_COMBOS[id]) next[combo] = weight;
    return next;
};

// The range without the combos that hold a dead card (the board, the other side's fixed hand).
export const withoutCards = (range: Range, dead: readonly Card[]): Range => {
    const next = new Float64Array(range);
    const isDead = new Uint8Array(52);
    for (const card of dead) isDead[card] = 1;
    for (let combo = 0; combo < COMBOS; combo++) if (isDead[COMBO_HI[combo]] || isDead[COMBO_LO[combo]]) next[combo] = 0;
    return next;
};

export const handRange = (combo: number): Range => {
    const range = emptyRange();
    range[combo] = 1;
    return range;
};

// The strongest `pct` of hands by a ranking of the 169 classes (equity against a random hand).
export const topPercent = (pct: number, ranking: readonly number[]): Range => {
    const range = emptyRange();
    const target = (Math.max(0, Math.min(100, pct)) / 100) * COMBOS;
    let taken = 0;
    for (const id of ranking) {
        if (taken >= target - 1e-9) break;
        for (const combo of CLASS_COMBOS[id]) range[combo] = 1;
        taken += CLASS_COMBOS[id].length;
    }
    return range;
};

const weightSuffix = (w: number): string => {
    if (w >= 1) return '';
    return `:${Number(w.toFixed(3))}`;
};

// The canonical text of a range: "random" for every combo at one weight; else whole classes as runs
// (TT+, 99-66, A2s+, K9o-K6o), grouped by weight, then any class whose combos differ, combo by combo.
export const formatRange = (range: Range): string => {
    // Every combo at one weight is a random hand, at that weight.
    if (range[0] > 0 && range.every((w) => w === range[0])) return `random${weightSuffix(range[0])}`;
    const tokens: string[] = [];
    const classW = classWeights(range);
    const uniform = CLASS_COMBOS.map((combos) => combos.every((combo) => range[combo] === range[combos[0]]));
    const weights = [...new Set(Array.from(classW).filter((w, id) => uniform[id] && w > 0).map((w) => Number(w.toFixed(3))))].sort((a, b) => b - a);
    const has = (id: number, w: number) => uniform[id] && Number(classW[id].toFixed(3)) === w;
    for (const w of weights) {
        // Pairs, from aces down, as runs.
        let run: number[] = [];
        const flushPairs = () => {
            if (run.length === 0) return;
            const top = run[0];
            const bottom = run[run.length - 1];
            const label = (rank: number) => `${RANKS[rank]}${RANKS[rank]}`;
            tokens.push(`${top === 12 && run.length > 1 ? `${label(bottom)}+` : run.length === 1 ? label(top) : `${label(top)}-${label(bottom)}`}${weightSuffix(w)}`);
            run = [];
        };
        for (let rank = 12; rank >= 0; rank--) {
            const id = classId(12 - rank, 12 - rank);
            if (has(id, w)) run.push(rank);
            else flushPairs();
        }
        flushPairs();
        // Non-pairs: for each first rank, the kicker runs, suited then offsuit.
        for (const suit of ['s', 'o'] as const) {
            for (let first = 12; first >= 1; first--) {
                let kickers: number[] = [];
                const flushKickers = () => {
                    if (kickers.length === 0) return;
                    const top = kickers[0];
                    const bottom = kickers[kickers.length - 1];
                    const label = (kicker: number) => `${RANKS[first]}${RANKS[kicker]}${suit}`;
                    tokens.push(`${top === first - 1 && kickers.length > 1 ? `${label(bottom)}+` : kickers.length === 1 ? label(top) : `${label(top)}-${label(bottom)}`}${weightSuffix(w)}`);
                    kickers = [];
                };
                for (let kicker = first - 1; kicker >= 0; kicker--) {
                    const id = suit === 's' ? classId(12 - first, 12 - kicker) : classId(12 - kicker, 12 - first);
                    if (has(id, w)) kickers.push(kicker);
                    else flushKickers();
                }
                flushKickers();
            }
        }
    }
    for (let combo = 0; combo < COMBOS; combo++) {
        if (uniform[CLASS_OF_COMBO[combo]] || range[combo] <= 0) continue;
        tokens.push(`${cardLabel(COMBO_HI[combo])}${cardLabel(COMBO_LO[combo])}${weightSuffix(range[combo])}`);
    }
    return tokens.join(', ');
};
