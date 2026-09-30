// Copy for the what-if lab. Every label and every diff line the nightly grid can produce is
// rendered and held to the 'copy' tier of lib/learn/banned.ts: a what-if describes a setting,
// never ranks it. The diff line prints the catalog value and the setting's value exactly.

import {describe, expect, it} from 'vitest';
import {findBanned} from '@/lib/learn/banned';
import {formatParamValue, paramChangeText, paramLabel, PARAM_LABELS, whatIfDiffLine, WHATIF_COPY} from '@/lib/learn/copy/whatif';
import {STRATEGIES, strategyBySlug} from '@/lib/strategies/catalog';
import {gridFor, paramDiff, PARAM_RANGES} from '@/lib/strategies/whatif';

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
});
