// Cards, combos and the 169 classes: every combo once, every class its 6, 4 or 12 combos, and the
// labels read back.

import {describe, expect, it} from 'vitest';
import {
    CLASS_COMBOS,
    CLASS_OF_COMBO,
    CLASSES,
    COMBO_HI,
    COMBO_LO,
    COMBOS,
    cardLabel,
    classFromLabel,
    classKind,
    classLabel,
    classSize,
    comboIndex,
    comboLabel,
    parseCard,
    parseCardList,
} from '@/lib/poker/cards';

describe('cards and combos', () => {
    it('reads and writes every card', () => {
        for (let card = 0; card < 52; card++) expect(parseCard(cardLabel(card))).toBe(card);
        expect(parseCard('As')).toBe(51);
        expect(parseCard('2c')).toBe(0);
        for (const junk of ['', 'A', '1s', 'Ax', 'Ass']) expect(parseCard(junk)).toBeNull();
    });

    it('indexes every pair of cards once, either way round', () => {
        const seen = new Set<number>();
        for (let a = 0; a < 52; a++) for (let b = a + 1; b < 52; b++) {
            const i = comboIndex(a, b);
            expect(comboIndex(b, a)).toBe(i);
            expect([COMBO_HI[i], COMBO_LO[i]]).toEqual([b, a]);
            seen.add(i);
        }
        expect(seen.size).toBe(COMBOS);
        expect(Math.max(...seen)).toBe(COMBOS - 1);
        expect(comboLabel(comboIndex(parseCard('As')!, parseCard('Kh')!))).toBe('AsKh');
    });
});

describe('parseCardList', () => {
    const labels = (text: string) => {
        const out = parseCardList(text);
        return {cards: out.cards.map(cardLabel), unknown: out.unknown, repeated: out.repeated.map(cardLabel)};
    };

    it('reads cards with or without separators, a 10 as a T', () => {
        expect(labels('Ah 7c 2d').cards).toEqual(['Ah', '7c', '2d']);
        expect(labels('Ah,7c,2d').cards).toEqual(['Ah', '7c', '2d']);
        expect(labels('Ah7c2d').cards).toEqual(['Ah', '7c', '2d']);
        expect(labels('10h 10s').cards).toEqual(['Th', 'Ts']);
        expect(labels('  ').cards).toEqual([]);
    });

    it('names what is not a card and what is named twice', () => {
        expect(labels('Ah Xx 7c')).toEqual({cards: ['Ah', '7c'], unknown: ['Xx'], repeated: []});
        expect(labels('Ah7c7c Ah')).toEqual({cards: ['Ah', '7c'], unknown: [], repeated: ['7c', 'Ah']});
        expect(labels('Ah7')).toEqual({cards: [], unknown: ['Ah7'], repeated: []});
    });
});

describe('the 169 classes', () => {
    it('hold every combo once: 13 pairs of 6, 78 suited of 4, 78 offsuit of 12', () => {
        expect(CLASS_COMBOS.flat().length).toBe(COMBOS);
        const kinds = {pair: 0, suited: 0, offsuit: 0};
        for (let id = 0; id < CLASSES; id++) {
            kinds[classKind(id)]++;
            expect(CLASS_COMBOS[id], classLabel(id)).toHaveLength(classSize(id));
            for (const combo of CLASS_COMBOS[id]) expect(CLASS_OF_COMBO[combo]).toBe(id);
        }
        expect(kinds).toEqual({pair: 13, suited: 78, offsuit: 78});
    });

    it('labels each class and reads the label back', () => {
        for (let id = 0; id < CLASSES; id++) expect(classFromLabel(classLabel(id))).toBe(id);
        expect(classLabel(0)).toBe('AA');
        expect(classLabel(1)).toBe('AKs');
        expect(classLabel(13)).toBe('AKo');
        expect(classLabel(168)).toBe('22');
        for (const junk of ['AAs', 'AK', 'AKx', 'A', 'ZZ']) expect(classFromLabel(junk)).toBeNull();
    });
});
