// Cards, two-card combinations and the 169 starting-hand classes, as small integers. Import-free:
// the poker worker, the page and the offline table script (Node) all load it.
//
// A card is rank·4 + suit: rank 0 is a two and 12 an ace; suits are c, d, h, s (0–3). A combo is
// the index of an unordered pair of cards, 0–1325. A class is a cell of the 13×13 grid, rows and
// columns running ace to two: pairs on the diagonal, suited hands above it, offsuit below.

export const RANKS = '23456789TJQKA';
export const SUITS = 'cdhs';
export const CARDS = 52;
export const COMBOS = 1326;
export const CLASSES = 169;

export type Card = number;

export const rankOf = (card: Card): number => card >> 2;
export const suitOf = (card: Card): number => card & 3;
export const cardLabel = (card: Card): string => `${RANKS[rankOf(card)]}${SUITS[suitOf(card)]}`;

export const parseCard = (text: string): Card | null => {
    if (text.length !== 2) return null;
    const rank = RANKS.indexOf(text[0].toUpperCase());
    const suit = SUITS.indexOf(text[1].toLowerCase());
    return rank < 0 || suit < 0 ? null : rank * 4 + suit;
};

// A list of cards as typed: "Ah 7c 2d", "Ah,7c,2d" or "Ah7c2d", a 10 read as a T. Returns the cards
// in order, the tokens that are not cards, and the cards named more than once.
export const parseCardList = (text: string): {cards: Card[]; unknown: string[]; repeated: Card[]} => {
    const cards: Card[] = [];
    const unknown: string[] = [];
    const repeated: Card[] = [];
    for (const raw of text.split(/[\s,]+/).filter(Boolean)) {
        const token = raw.split('10').join('T');
        const pieces = token.length > 2 && token.length % 2 === 0 ? token.match(/../g) ?? [] : [token];
        const parsed = pieces.map(parseCard);
        if (parsed.some((card) => card === null)) {
            unknown.push(raw);
            continue;
        }
        for (const card of parsed as Card[]) {
            if (cards.includes(card)) {
                if (!repeated.includes(card)) repeated.push(card);
            } else {
                cards.push(card);
            }
        }
    }
    return {cards, unknown, repeated};
};

// The combo index of two different cards, order ignored: hi·(hi − 1)/2 + lo.
export const comboIndex = (a: Card, b: Card): number => {
    const hi = a > b ? a : b;
    const lo = a > b ? b : a;
    return (hi * (hi - 1)) / 2 + lo;
};

export const COMBO_HI = new Uint8Array(COMBOS);
export const COMBO_LO = new Uint8Array(COMBOS);
for (let hi = 1; hi < CARDS; hi++) {
    for (let lo = 0; lo < hi; lo++) {
        const i = comboIndex(hi, lo);
        COMBO_HI[i] = hi;
        COMBO_LO[i] = lo;
    }
}

export const comboLabel = (combo: number): string => `${cardLabel(COMBO_HI[combo])}${cardLabel(COMBO_LO[combo])}`;

// Grid row/column 0 is the ace. A pair sits on the diagonal; suited is row < column.
export const classId = (row: number, col: number): number => row * 13 + col;
export const classRowCol = (id: number): [number, number] => [Math.floor(id / 13), id % 13];

const classOfCards = (a: Card, b: Card): number => {
    const ra = 12 - rankOf(a);
    const rb = 12 - rankOf(b);
    const hiRow = Math.min(ra, rb);
    const loRow = Math.max(ra, rb);
    if (ra === rb) return classId(ra, ra);
    // Suited above the diagonal (row of the higher card, column of the lower); offsuit below.
    return suitOf(a) === suitOf(b) ? classId(hiRow, loRow) : classId(loRow, hiRow);
};

export const CLASS_OF_COMBO = new Uint8Array(COMBOS);
export const CLASS_COMBOS: number[][] = Array.from({length: CLASSES}, () => []);
for (let combo = 0; combo < COMBOS; combo++) {
    const id = classOfCards(COMBO_HI[combo], COMBO_LO[combo]);
    CLASS_OF_COMBO[combo] = id;
    CLASS_COMBOS[id].push(combo);
}

export type ClassKind = 'pair' | 'suited' | 'offsuit';

export const classKind = (id: number): ClassKind => {
    const [row, col] = classRowCol(id);
    return row === col ? 'pair' : row < col ? 'suited' : 'offsuit';
};

export const classSize = (id: number): number => ({pair: 6, suited: 4, offsuit: 12})[classKind(id)];

// "AKs", "QQ", "T9o".
export const classLabel = (id: number): string => {
    const [row, col] = classRowCol(id);
    const hi = RANKS[12 - Math.min(row, col)];
    const lo = RANKS[12 - Math.max(row, col)];
    const kind = classKind(id);
    return kind === 'pair' ? `${hi}${lo}` : `${hi}${lo}${kind === 'suited' ? 's' : 'o'}`;
};

export const classFromLabel = (label: string): number | null => {
    const text = label.trim();
    const a = RANKS.indexOf(text[0]?.toUpperCase() ?? '');
    const b = RANKS.indexOf(text[1]?.toUpperCase() ?? '');
    if (a < 0 || b < 0) return null;
    const rowA = 12 - a;
    const rowB = 12 - b;
    if (a === b) return text.length === 2 ? classId(rowA, rowA) : null;
    const marker = text[2]?.toLowerCase();
    if (text.length !== 3 || (marker !== 's' && marker !== 'o')) return null;
    const hiRow = Math.min(rowA, rowB);
    const loRow = Math.max(rowA, rowB);
    return marker === 's' ? classId(hiRow, loRow) : classId(loRow, hiRow);
};
