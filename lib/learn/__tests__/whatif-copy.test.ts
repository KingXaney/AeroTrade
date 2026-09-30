// Copy for the what-if lab. Every label and every diff line the nightly grid can produce is
// rendered and held to the 'copy' tier of lib/learn/banned.ts: a what-if describes a setting,
// never ranks it. The diff line prints the catalog value and the setting's value exactly.

import {describe, expect, it} from 'vitest';
import {findBanned} from '@/lib/learn/banned';
import {formatParamValue, paramChangeText, paramLabel, PARAM_LABELS, positionText, whatIfDiffLine, WHATIF_COPY, WHATIF_LAB} from '@/lib/learn/copy/whatif';
import {STRATEGIES, strategyBySlug} from '@/lib/strategies/catalog';
import {gridFor, labKnobs, paramDiff, PARAM_RANGES} from '@/lib/strategies/whatif';

const clean = (text: string) => {
    expect(text, text).not.toMatch(/undefined|NaN|null|\[object|Infinity/);
    expect(findBanned(text, 'copy'), text).toEqual([]);
};

describe('what-if copy', () => {
    it('labels every catalog parameter and every knob, in plain words', () => {
        for (const def of STRATEGIES) {
            for (const key of [...Object.keys(def.params), ...Object.keys(PARAM_RANGES[def.id])]) {
                expect(PARAM_LABELS[key], `${def.id}.${key}`).toBeDefined();
                clean(paramLabel(key));
            }
        }
        expect(paramLabel('unknownKey')).toBe('unknownKey');
    });

    it('prints weights as percentages and windows as whole numbers', () => {
        expect(formatParamValue(0.6)).toBe('60%');
        expect(formatParamValue(0.99)).toBe('99%');
        expect(formatParamValue(252)).toBe('252');
        expect(formatParamValue(2)).toBe('2');
    });

    it('prints the diff line as label, catalog value, arrow, setting', () => {
        expect(paramChangeText({key: 'entryRsi', from: 10, to: 5})).toBe('Entry: RSI below 10 → 5');
        expect(paramChangeText({key: 'spyWeight', from: 0.6, to: 0.8})).toBe('SPY weight: 60% → 80%');
        expect(paramChangeText({key: 'top', from: 8, to: 4})).toBe('Positions held: 8 → 4');
        expect(whatIfDiffLine([])).toBe(WHATIF_COPY.catalogSetting);
        expect(whatIfDiffLine([{key: 'entryRsi', from: 10, to: 5}, {key: 'exitSma', from: 5, to: 10}]))
            .toBe('Entry: RSI below 10 → 5 · Exit: close above SMA (days) 5 → 10');
    });

    it('renders every grid variant and every range end without advice or ranking', () => {
        let lines = 0;
        for (const def of STRATEGIES) {
            for (const variant of gridFor(def)) {
                const line = whatIfDiffLine(paramDiff(def, variant.overrides));
                clean(line);
                expect(line).toContain('→');
                lines += 1;
            }
            for (const [key, range] of Object.entries(PARAM_RANGES[def.id])) {
                for (const to of [range.min, range.max]) clean(whatIfDiffLine(paramDiff(def, {[key]: to})));
            }
        }
        expect(lines).toBeGreaterThan(20);
        expect(whatIfDiffLine(paramDiff(strategyBySlug('rsi2-mean-reversion')!, {entryRsi: 5}))).toBe('Entry: RSI below 10 → 5');
    });

    it('states the caveat and the two series plainly', () => {
        for (const text of Object.values(WHATIF_COPY)) clean(text);
        expect(WHATIF_COPY.caveat).toMatch(/same rule, different setting, same three years, in hindsight/i);
    });

    it('words the lab — heading, window, controls, empty state, chart — plainly, on every strategy', () => {
        const strings = Object.values(WHATIF_LAB).flatMap((v) => (typeof v === 'string' ? [v] : []));
        expect(strings.length).toBeGreaterThan(2);
        for (const text of strings) clean(text);
        expect(WHATIF_LAB.pending).toMatch(/computed overnight/i);
        for (const [from, to] of [['2022-09-30', '2025-09-26'], ['2023-01-03', '2026-01-02']]) clean(WHATIF_LAB.window(from, to));
        expect(WHATIF_LAB.window('2022-09-30', '2025-09-26')).toContain('2022-09-30 → 2025-09-26');
        for (const def of STRATEGIES) {
            for (const knob of labKnobs(def)) {
                for (const value of knob.positions) {
                    const text = positionText(value, value === knob.catalog);
                    clean(text);
                    expect(text).toContain(formatParamValue(value));
                    clean(WHATIF_LAB.knobAria(paramLabel(knob.key), text));
                }
            }
            for (const variant of gridFor(def)) clean(WHATIF_LAB.chartAria(whatIfDiffLine(paramDiff(def, variant.overrides))));
        }
        expect(positionText(50, true)).toBe('50 (catalog)');
        expect(positionText(0.8, false)).toBe('80%');
        clean(WHATIF_LAB.chartAria(whatIfDiffLine([])));
    });
});
