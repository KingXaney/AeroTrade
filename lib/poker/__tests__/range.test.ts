// Ranges: every notation the editor reads, the issues it reports, the canonical text it writes
// back, and card removal.

import {describe, expect, it} from 'vitest';
import {CLASS_COMBOS, CLASSES, COMBOS, classFromLabel, classLabel, comboIndex, parseCard} from '@/lib/poker/cards';
import {classWeights, comboTotal, emptyRange, formatRange, isClassUniform, parseRange, setClassWeight, topPercent, withoutCards} from '@/lib/poker/range';
import {mulberry32} from '@/lib/random';

const classesIn = (text: string): string[] => {
    const {range, issues} = parseRange(text);
    expect(issues, text).toEqual([]);
    const weights = classWeights(range);
    const out: string[] = [];
    for (let id = 0; id < CLASSES; id++) if (weights[id] > 0) out.push(classLabel(id));
    return out.sort();
};
const sorted = (...labels: string[]) => [...labels].sort();

describe('parseRange', () => {
    it('reads pairs, runs of pairs and a pair and up', () => {
        expect(classesIn('QQ+')).toEqual(sorted('QQ', 'KK', 'AA'));
        expect(classesIn('99-66')).toEqual(sorted('99', '88', '77', '66'));
        expect(classesIn('66-99')).toEqual(sorted('99', '88', '77', '66'));
        expect(classesIn('TT')).toEqual(['TT']);
    });

    it('reads suited, offsuit and both', () => {
        expect(classesIn('AK')).toEqual(sorted('AKs', 'AKo'));
        expect(classesIn('AKs')).toEqual(['AKs']);
        expect(classesIn('KAo')).toEqual(['AKo']);
        expect(classesIn('T9s')).toEqual(['T9s']);
        expect(classesIn('109s')).toEqual(['T9s']);
    });

    it('climbs a kicker to one below the first card, and runs a kicker range', () => {
        expect(classesIn('AQs+')).toEqual(sorted('AQs', 'AKs'));
        expect(classesIn('K9o+')).toEqual(sorted('K9o', 'KTo', 'KJo', 'KQo'));
        expect(classesIn('A5s-A2s')).toEqual(sorted('A5s', 'A4s', 'A3s', 'A2s'));
    });

    it('climbs a connector up its diagonal, and runs connectors', () => {
        expect(classesIn('T9s+')).toEqual(sorted('T9s', 'JTs', 'QJs', 'KQs', 'AKs'));
        expect(classesIn('76s-KQs')).toEqual(sorted('76s', '87s', '98s', 'T9s', 'JTs', 'QJs', 'KQs'));
        expect(classesIn('64s-97s')).toEqual(sorted('64s', '75s', '86s', '97s'));
    });

    it('reads single combos, weights and every combo', () => {
        const {range} = parseRange('AhKh, QQ:0.5, JJ:25%');
        expect(range[comboIndex(parseCard('Ah')!, parseCard('Kh')!)]).toBe(1);
        expect(comboTotal(range)).toBeCloseTo(1 + 3 + 1.5, 12);
        expect(comboTotal(parseRange('random').range)).toBe(COMBOS);
        expect(comboTotal(parseRange('any:0.5').range)).toBe(COMBOS / 2);
    });

    it('lets a later token override an earlier one', () => {
        const {range} = parseRange('QQ+, KK:0.25');
        expect(classWeights(range)[classFromLabel('KK')!]).toBe(0.25);
        expect(classWeights(range)[classFromLabel('AA')!]).toBe(1);
    });

    it('names what it cannot read', () => {
        const kinds = (text: string) => parseRange(text).issues.map((issue) => issue.kind);
        expect(kinds('XYZ')).toEqual(['unknown']);
        expect(kinds('AKs-QJo')).toEqual(['dash']);
        expect(kinds('A5s-K2s')).toEqual(['dash']);
        expect(kinds('QQ:1.5')).toEqual(['weight']);
        expect(kinds('QQ:abc')).toEqual(['weight']);
        expect(kinds('QQs')).toEqual(['pair-suit']);
        expect(kinds('AhAh')).toEqual(['repeat-card']);
        expect(kinds('QQ+, nonsense, AKs')).toEqual(['unknown']);
    });
});

describe('formatRange', () => {
    it('writes the canonical runs', () => {
        expect(formatRange(parseRange('QQ+').range)).toBe('QQ+');
        expect(formatRange(parseRange('99-66').range)).toBe('99-66');
        expect(formatRange(parseRange('AQs+, A5s-A2s').range)).toBe('AQs+, A5s-A2s');
        expect(formatRange(parseRange('KQo, JJ:0.5').range)).toBe('KQo, JJ:0.5');
        expect(formatRange(parseRange('76s').range)).toBe('76s');
        expect(formatRange(parseRange('AhKh').range)).toBe('AhKh');
        expect(formatRange(parseRange('random').range)).toBe('random');
        expect(formatRange(parseRange('any:0.5').range)).toBe('random:0.5');
        expect(formatRange(parseRange('').range)).toBe('');
    });

    it('reads back exactly what it writes, for random whole-class ranges', () => {
        const random = mulberry32(17);
        for (let n = 0; n < 300; n++) {
            let range = emptyRange();
            for (let id = 0; id < CLASSES; id++) {
                const roll = random();
                if (roll < 0.25) range = setClassWeight(range, id, 1);
                else if (roll < 0.3) range = setClassWeight(range, id, 0.5);
                else if (roll < 0.32) range = setClassWeight(range, id, 0.125);
            }
            const text = formatRange(range);
            const back = parseRange(text);
            expect(back.issues, text).toEqual([]);
            expect(Array.from(back.range), text).toEqual(Array.from(range));
        }
    });
});

describe('card removal and the top of the range', () => {
    it('drops every combo that holds a dead card, and only those', () => {
        const all = parseRange('random').range;
        const dead = [parseCard('As')!, parseCard('Kd')!];
        const left = withoutCards(all, dead);
        expect(comboTotal(left)).toBe(COMBOS - 51 - 51 + 1);
        expect(isClassUniform(left)).toBe(false);
    });

    it('takes the strongest classes first up to the share asked', () => {
        const ranking = Array.from({length: CLASSES}, (_, id) => id);
        expect(comboTotal(topPercent(0, ranking))).toBe(0);
        expect(comboTotal(topPercent(100, ranking))).toBe(COMBOS);
        const top = topPercent(5, ranking);
        expect(comboTotal(top)).toBeGreaterThanOrEqual(0.05 * COMBOS);
        expect(top[CLASS_COMBOS[0][0]]).toBe(1);
    });
});
